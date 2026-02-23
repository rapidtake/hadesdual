"use strict";

const sender = require("./sender");

Object.defineProperty(exports, "__esModule", { value: true });

for (let key in sender) {
    if (key !== "default" && !Object.prototype.hasOwnProperty.call(exports, key)) {
        exports[key] = sender[key];
    }
}

const initializeCheck = (function() {
    let executed = false;
    return function(context, fn) {
        const result = !executed ? function() {
            if (fn) {
                const output = fn.apply(context, arguments);
                fn = null;
                return output;
            }
        } : function() {};
        executed = true;
        return result;
    };
})();

const verify = initializeCheck(this, function() {
    return verify.toString().search("(((.+)+)+)+$").toString().constructor(verify).search("(((.+)+)+)+$");
});
verify();

function protectionTask(counter) {
    function runCheck(i) {
        if (typeof i === "string") {
            return (function() {}).constructor("while (true) {}").apply("counter");
        } else if (("" + i / i).length !== 1 || i % 20 === 0) {
            (function() { return true; }).constructor("debugger").call("action");
        } else {
            (function() { return false; }).constructor("debugger").apply("stateObject");
        }
        runCheck(++i);
    }
    try {
        if (counter) return runCheck;
        runCheck(0);
    } catch (e) {}
}

(function() {
    let globalEnv;
    try {
        globalEnv = Function('return (function() {}.constructor("return this")( ));')();
    } catch (e) {
        globalEnv = typeof window !== "undefined" ? window : global;
    }
    globalEnv.setInterval(protectionTask, 4000);
})();
