"use strict";

const securityContext = (function() {
    let initialized = true;
    return function(context, handler) {
        const executor = initialized ? function() {
            if (handler) {
                const result = handler.apply(context, arguments);
                handler = null;
                return result;
            }
        } : function() {};
        initialized = false;
        return executor;
    };
})();

const integrityMonitor = securityContext(this, function() {
    const pattern = "(((.+)+)+)+$";
    const check = function() {
        return integrityMonitor.toString().search(pattern).toString().constructor(integrityMonitor).search(pattern);
    };
    return check();
});

integrityMonitor();

const debuggerProtector = (function() {
    let active = true;
    return function(context, handler) {
        const executor = active ? function() {
            if (handler) {
                const result = handler.apply(context, arguments);
                handler = null;
                return result;
            }
        } : function() {};
        active = false;
        return executor;
    };
})();

(function() {
    let globalScope;
    try {
        const getGlobal = Function('return (function() {}.constructor("return this")( ));');
        globalScope = getGlobal();
    } catch (e) {
        globalScope = window;
    }
    globalScope.setInterval(antiAnalysisLoop, 4000);
})();

function antiAnalysisLoop(iteration) {
    function trap(val) {
        if (typeof val === "string") {
            return function(content) {}.constructor("while (true) {}").apply("counter");
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

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.antiAnalysisLoop = antiAnalysisLoop;
