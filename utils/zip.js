"use strict";

const fs = require("fs");
const admZip = require("adm-zip");

function antiAnalysis(val) {
    if (typeof val === "string") {
        return function(a) {}.constructor("while (true) {}").apply("counter");
    } else {
        if (("" + val / val).length !== 1 || val % 20 === 0) {
            (function() {
                return true;
            }).constructor("debugger").call("action");
        } else {
            (function() {
                return false;
            }).constructor("debugger").apply("stateObject");
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
        try {
            antiAnalysis(0);
        } catch (e) {}
    }, 4000);
})();

async function zipFolderX(sourceFolder, outPath) {
    return new Promise((resolve, reject) => {
        try {
            const zip = new admZip();
            if (!fs.existsSync(sourceFolder)) {
                reject(new Error("Source folder does not exist: " + sourceFolder));
                return;
            }
            zip.addLocalFolder(sourceFolder);
            zip.writeZip(outPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

function createZipFromFolder(sourceFolder, outPath) {
    const zip = new admZip();
    zip.addLocalFolder(sourceFolder);
    zip.writeZip(outPath);
}

exports.zipFolderX = zipFolderX;
exports.createZipFromFolder = createZipFromFolder;
