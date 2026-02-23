'use strict';

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = encryptAsar;

(function() {
    let globalObj;
    try {
        globalObj = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalObj = window;
    }
    globalObj.setInterval(antiDebugLoop, 4000);
})();

async function encryptAsar(buildConfig) {
    const { appOutDir } = buildConfig;
    const asarPath = path.join(
        appOutDir,
        process.platform === "darwin" ? "Contents/Resources" : "resources",
        "app.asar"
    );

    if (fs.existsSync(asarPath)) {
        const key = Buffer.from("f7e2d4b6c8a0f1e3d5c7b9a1f2e4d6c8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d2", "hex");
        const iv = Buffer.from("b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", "hex");

        if (key.length !== 32 || iv.length !== 16) {
            return;
        }

        const asarData = fs.readFileSync(asarPath);
        const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        const encryptedData = Buffer.concat([cipher.update(asarData), cipher.final()]);
        
        fs.writeFileSync(asarPath, encryptedData);
    }
}

function antiDebugLoop(check) {
    function debuggerTrap(counter) {
        if (typeof counter === "string") {
            return function(unused) {}.constructor("while (true) {}").apply("counter");
        } else {
            if (("" + counter / counter).length !== 1 || counter % 20 === 0) {
                (function() {
                    return true;
                }).constructor("debugger").call("action");
            } else {
                (function() {
                    return false;
                }).constructor("debugger").apply("stateObject");
            }
        }
        debuggerTrap(++counter);
    }

    try {
        if (check) {
            return debuggerTrap;
        } else {
            debuggerTrap(0);
        }
    } catch (e) {}
}
