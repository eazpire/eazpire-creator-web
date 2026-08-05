/**
 * Early browser console ring buffer for Admin Cursor Agent (IDEA-066).
 * Load as a blocking inline/sync script BEFORE the deferred shell so page
 * console / errors are captured from first paint onward.
 *
 * Global: window.__EAZ_CA_CONSOLE__ = { buf, max, hooked, installedAt }
 */
(function (global) {
  "use strict";
  var MAX = 200;
  var store = global.__EAZ_CA_CONSOLE__;
  if (!store || typeof store !== "object") {
    store = { buf: [], max: MAX, hooked: false, installedAt: null };
    global.__EAZ_CA_CONSOLE__ = store;
  }
  if (!Array.isArray(store.buf)) store.buf = [];
  store.max = store.max || MAX;
  if (store.hooked) return;

  function serialize(a) {
    try {
      if (a instanceof Error) return a.stack || a.message || String(a);
      if (typeof a === "string") return a;
      return JSON.stringify(a);
    } catch (e) {
      try {
        return String(a);
      } catch (e2) {
        return "[unserializable]";
      }
    }
  }

  function push(level, args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(serialize(args[i]));
    store.buf.push({
      t: new Date().toISOString(),
      level: level,
      message: parts.join(" ").slice(0, 4000),
      href: (global.location && global.location.href) || "",
    });
    while (store.buf.length > store.max) store.buf.shift();
  }

  var levels = ["log", "info", "warn", "error", "debug"];
  for (var i = 0; i < levels.length; i++) {
    (function (level) {
      var orig = global.console && global.console[level] ? global.console[level].bind(global.console) : null;
      global.console[level] = function () {
        try {
          push(level, arguments);
        } catch (e) {}
        if (orig) return orig.apply(global.console, arguments);
      };
    })(levels[i]);
  }

  global.addEventListener("error", function (ev) {
    push("error", [
      (ev.message || "Error") +
        (ev.filename ? " @" + ev.filename + ":" + (ev.lineno || "?") : ""),
    ]);
  });
  global.addEventListener("unhandledrejection", function (ev) {
    push("error", ["UnhandledRejection:", ev.reason]);
  });

  store.hooked = true;
  store.installedAt = new Date().toISOString();
  push("info", ["[eaz-ca] browser console capture started"]);
})(typeof window !== "undefined" ? window : globalThis);
