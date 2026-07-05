/**
 * Optional Creator performance debug overlay + marks.
 * Enable: window.__EAZ_PERF_DEBUG__ = true  OR  ?eaz_perf=1
 */
(function (root) {
  'use strict';

  function isEnabled() {
    try {
      if (root.__EAZ_PERF_DEBUG__ === true) return true;
      var q = root.location && root.location.search;
      if (q && /(?:^|[?&])eaz_perf=1(?:&|$)/.test(q)) return true;
    } catch (_e) {}
    return false;
  }

  var enabled = isEnabled();
  var counters = Object.create(null);
  var lastMs = Object.create(null);
  var measures = [];
  var overlayEl = null;
  var overlayTimer = null;

  function perfApi() {
    return root.performance;
  }

  function mark(name) {
    if (!enabled) return;
    try {
      var p = perfApi();
      if (p && p.mark) p.mark('eaz:creator:' + name);
    } catch (_e) {}
  }

  function measure(name, startMark, endMark) {
    if (!enabled) return null;
    try {
      var p = perfApi();
      if (!p || !p.measure) return null;
      var mName = 'eaz:creator:' + name;
      p.measure(mName, 'eaz:creator:' + startMark, 'eaz:creator:' + endMark);
      var entries = p.getEntriesByName(mName);
      var entry = entries[entries.length - 1];
      if (entry && isFinite(entry.duration)) {
        lastMs[name] = Math.round(entry.duration * 10) / 10;
        measures.push({ name: name, ms: lastMs[name], at: Date.now() });
        if (measures.length > 40) measures.shift();
        return lastMs[name];
      }
    } catch (_e) {}
    return null;
  }

  function record(name, ms) {
    if (!enabled || !isFinite(ms)) return;
    lastMs[name] = Math.round(ms * 10) / 10;
    measures.push({ name: name, ms: lastMs[name], at: Date.now() });
    if (measures.length > 40) measures.shift();
    refreshOverlaySoon();
  }

  function setCounter(key, value) {
    counters[key] = value;
    if (enabled) refreshOverlaySoon();
  }

  function incCounter(key, delta) {
    counters[key] = (counters[key] || 0) + (delta || 1);
    if (enabled) refreshOverlaySoon();
  }

  function timeSync(name, fn) {
    if (!enabled) return fn();
    var t0 = perfApi() && perfApi().now ? perfApi().now() : Date.now();
    try {
      return fn();
    } finally {
      record(name, (perfApi() && perfApi().now ? perfApi().now() : Date.now()) - t0);
    }
  }

  function ensureOverlay() {
    if (!enabled || !root.document || overlayEl) return;
    overlayEl = root.document.createElement('div');
    overlayEl.id = 'eaz-creator-perf-debug';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:2147483000;max-width:min(340px,calc(100vw - 16px));' +
      'padding:8px 10px;border-radius:10px;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'color:#dbeafe;background:rgba(5,9,24,.92);border:1px solid rgba(249,115,22,.45);' +
      'box-shadow:0 8px 28px rgba(0,0,0,.35);pointer-events:none;white-space:pre-wrap;';
    (root.document.body || root.document.documentElement).appendChild(overlayEl);
  }

  function refreshOverlaySoon() {
    if (!enabled) return;
    if (overlayTimer) return;
    overlayTimer = setTimeout(function () {
      overlayTimer = null;
      ensureOverlay();
      if (!overlayEl) return;
      var mem = '';
      try {
        if (root.performance && root.performance.memory && root.performance.memory.usedJSHeapSize) {
          mem =
            '\nmem ~' +
            Math.round(root.performance.memory.usedJSHeapSize / 1048576) +
            'MB';
        }
      } catch (_e2) {}
      var lines = ['EAZ Creator Perf'];
      Object.keys(lastMs).forEach(function (k) {
        lines.push(k + ': ' + lastMs[k] + 'ms');
      });
      Object.keys(counters).forEach(function (k) {
        lines.push(k + ': ' + counters[k]);
      });
      if (mem) lines.push(mem.trim());
      overlayEl.textContent = lines.join('\n');
    }, 80);
  }

  root.CreatorPerfDebug = {
    enabled: enabled,
    mark: mark,
    measure: measure,
    record: record,
    setCounter: setCounter,
    incCounter: incCounter,
    timeSync: timeSync,
    getLastMs: function () {
      return Object.assign({}, lastMs);
    },
    getCounters: function () {
      return Object.assign({}, counters);
    },
    getMeasures: function () {
      return measures.slice();
    },
  };

  if (enabled) {
    root.__EAZ_PERF_DEBUG__ = true;
    if (root.document && root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', refreshOverlaySoon);
    } else {
      refreshOverlaySoon();
    }
  }
})(typeof window !== 'undefined' ? window : {});
