"use strict";

const fs = require("fs");
const path = require("path");
const constants = require("../config/constants");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

function getPasswordsX() {
    if (fs.existsSync(constants.wordlistFilePath)) {
        const content = fs.readFileSync(constants.wordlistFilePath, "utf-8");
        return content.split(/\r?\n/).filter(Boolean);
    } else {
        return constants.defaultPasswords;
    }
}

function antiDebug(counter) {
    function debuggerCheck(val) {
        if (typeof val === "string") {
            return function() {}.constructor("while (true) {}").apply("counter");
        } else if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
        debuggerCheck(++val);
    }

    try {
        if (counter) {
            return debuggerCheck;
        } else {
            debuggerCheck(0);
        }
    } catch (e) {}
}
(function selfDefending() {
    const checkFunc = function() {
        const regex1 = new RegExp("function *\\( *\\)");
        const regex2 = new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)", "i");
        const initAction = antiDebug("init");
        if (!regex1.test(initAction + "chain") || !regex2.test(initAction + "input")) {
            initAction("0");
        } else {
            antiDebug();
        }
    };
    
    setInterval(checkFunc, 4000);
})();

exports.sleep = sleep;
exports.ensureDirectoryExistence = ensureDirectoryExistence;
exports.getPasswordsX = getPasswordsX;
