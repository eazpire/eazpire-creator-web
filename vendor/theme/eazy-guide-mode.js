/**
 * Eazy Guide Mode – inspect / screenshot / prompt when Eazy is snapped.
 * Enter: double-click snapped mascot or chat toggle. Exit: single click or Escape.
 */
(function () {
  "use strict";

  var API_BASE =
    (window.CreatorChatActions && window.CreatorChatActions.API_BASE) ||
    "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";

  var LONG_PRESS_MS = 520;
  var REGISTRY_URL = null;
  var registryCache = null;
  var active = false;
  var pendingRequest = false;
  var promptLocked = false;
  var screenshotDragActive = false;
  var tools = { click: true, screenshot: false, prompt: false };
  var session = { element: null, screenshot: null, prompt: "", voice_transcript: "" };

  var ui = {
    toolbar: null,
    promptBar: null,
    promptInput: null,
    screenshotOverlay: null,
    screenshotRect: null,
    screenshotPersist: null,
    exitHint: null,
  };

  var speechRec = null;
  var recording = false;
  var suppressChatOpenUntil = 0;
  var snapTapState = { time: 0, x: 0, y: 0, key: "" };
  var snapTouchStart = { key: "", x: 0, y: 0, moved: false };
  var lastSnapPointerEndAt = 0;
  var DOUBLE_TAP_MS = 450;
  var DOUBLE_TAP_SLOP = 28;
  var TAP_MOVE_THRESHOLD = 12;
  var snapPointerBound = false;

  function markGuideDoubleClick() {
    suppressChatOpenUntil = Date.now() + 650;
    try {
      window.dispatchEvent(new CustomEvent("eazy-guide-enter"));
    } catch (e0) {}
  }

  function shouldSuppressChatOpen() {
    return Date.now() < suppressChatOpenUntil;
  }

  function i18n(key, fallback) {
    var map = window.CreatorI18n || window.EAZY_I18N || {};
    var v = map[key];
    if (typeof v === "string" && v && v.toLowerCase().indexOf("translation missing") < 0) return v;
    return fallback;
  }

  function isSnapped() {
    if (typeof window.CreatorChat !== "undefined" && window.CreatorChat.isSnappedInHeader) {
      try {
        if (window.CreatorChat.isSnappedInHeader()) return true;
      } catch (e) {}
    }
    var toggle = document.getElementById("creator-chat-toggle");
    if (
      toggle &&
      (toggle.classList.contains("creator-chat__toggle--docked") ||
        toggle.classList.contains("creator-chat__toggle--snap-mode"))
    ) {
      return true;
    }
    var mascot = document.getElementById("eazy-mascot");
    if (mascot && mascot.classList.contains("eazy-mascot--docked")) return true;
    var sm = document.getElementById("eazy-snap-slot--mobile");
    var sd = document.getElementById("eazy-snap-slot--desktop");
    if ((sm && sm.classList.contains("is-docked")) || (sd && sd.classList.contains("is-docked"))) return true;
    try {
      if (localStorage.getItem("eazy_mascot_docked") === "1") return true;
      if (localStorage.getItem("eazy_docked") === "true") return true;
    } catch (e0) {}
    return false;
  }

  function isChatOpen() {
    var panel = document.getElementById("creator-chat-panel");
    return !!(panel && (panel.classList.contains("is-visible") || panel.classList.contains("is-open") || panel.classList.contains("creator-chat__panel--open")));
  }

  function getScopeRoot() {
    if (isChatOpen()) {
      var panel = document.getElementById("creator-chat-panel");
      if (panel) return panel;
    }
    return document.body;
  }

  function isInsideGuideUi(node) {
    if (!node || !node.closest) return false;
    return !!(
      node.closest(".eaz-guide-toolbar") ||
      node.closest(".eaz-guide-prompt") ||
      node.closest(".eaz-guide-screenshot-overlay") ||
      node.closest(".eaz-guide-exit-hint") ||
      node.closest("#eazy-mascot") ||
      node.closest("#creator-chat-toggle")
    );
  }

  function setGuideFlag(on) {
    window.__eaz_guide_active = !!on;
    document.documentElement.classList.toggle("eaz-guide-active", !!on);
  }

  function resetSession() {
    session = { element: null, screenshot: null, prompt: "", voice_transcript: "" };
    promptLocked = false;
    lockPromptInput(false);
    setPromptSendMode("send");
    syncExplainUi();
  }

  function shouldShowExplain() {
    return !!(session.screenshot || promptLocked);
  }

  function syncExplainUi() {
    if (!ui.toolbar) return;
    var btn = ui.toolbar.querySelector('[data-tool="ask"]');
    if (!btn) return;
    var show = shouldShowExplain();
    btn.hidden = !show;
    btn.classList.toggle("is-visible", show);
    btn.classList.toggle("is-pulsing", show && !pendingRequest);
    btn.disabled = !!pendingRequest;
    document.documentElement.classList.toggle("eaz-guide-has-explain", show);
  }

  function lockPromptInput(locked) {
    promptLocked = !!locked;
    if (!ui.promptInput || !ui.promptBar) return;
    ui.promptInput.readOnly = promptLocked;
    ui.promptBar.classList.toggle("is-locked", promptLocked);
    var voiceBtn = ui.promptBar.querySelector('[data-action="voice"]');
    if (voiceBtn) voiceBtn.disabled = promptLocked;
  }

  function setPromptSendMode(mode) {
    var btn = ui.promptBar && ui.promptBar.querySelector('[data-action="send"]');
    if (!btn) return;
    if (mode === "clear") {
      btn.classList.add("is-clear");
      btn.setAttribute("aria-label", i18n("creator.common.clear", "Clear"));
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    } else {
      btn.classList.remove("is-clear");
      btn.setAttribute("aria-label", i18n("creator.guide.send_prompt", "Send"));
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
  }

  function submitPrompt() {
    var text = (ui.promptInput && ui.promptInput.value ? ui.promptInput.value : "").trim();
    if (!text) return;
    session.prompt = text;
    session.voice_transcript = text;
    lockPromptInput(true);
    setPromptSendMode("clear");
    syncExplainUi();
  }

  function clearPrompt() {
    session.prompt = "";
    session.voice_transcript = "";
    lockPromptInput(false);
    if (ui.promptInput) ui.promptInput.value = "";
    setPromptSendMode("send");
    syncExplainUi();
  }

  function loadRegistry() {
    if (registryCache) return Promise.resolve(registryCache);
    var el = document.getElementById("eazy-guide-registry-data");
    if (el && el.textContent) {
      try {
        registryCache = JSON.parse(el.textContent);
        return Promise.resolve(registryCache);
      } catch (e) {}
    }
    var url =
      REGISTRY_URL ||
      (document.documentElement.getAttribute("data-eazy-guide-registry") || "") ||
      "";
    if (!url) {
      registryCache = {};
      return Promise.resolve(registryCache);
    }
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        registryCache = data || {};
        return registryCache;
      })
      .catch(function () {
        registryCache = {};
        return registryCache;
      });
  }

  function registryText(entry) {
    if (!entry) return "";
    var parts = [];
    if (entry.title) parts.push(entry.title);
    if (entry.summary) parts.push(entry.summary);
    if (entry.tips && entry.tips.length) parts.push(entry.tips.join(" "));
    return parts.join("\n\n");
  }

  function resolveGuideKey(el) {
    if (!el || !el.closest) return null;
    var node = el;
    var depth = 0;
    while (node && depth < 6) {
      if (node.getAttribute && node.getAttribute("data-eazy-guide")) {
        return {
          guide_key: node.getAttribute("data-eazy-guide"),
          label: (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 120),
          selector: node.id ? "#" + node.id : null,
        };
      }
      if (node.getAttribute && node.getAttribute("data-t")) {
        return {
          guide_key: null,
          data_t: node.getAttribute("data-t"),
          label: (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 120),
          selector: node.id ? "#" + node.id : null,
        };
      }
      node = node.parentElement;
      depth++;
    }
    var label = (el.getAttribute && (el.getAttribute("aria-label") || el.title)) || "";
    if (!label && el.textContent) label = el.textContent.trim().slice(0, 80);
    return {
      guide_key: null,
      label: label,
      tag: el.tagName ? el.tagName.toLowerCase() : "",
      selector: el.id ? "#" + el.id : null,
    };
  }

  function getPagePath() {
    return window.location.pathname + (window.location.search || "");
  }

  function getLocale() {
    return (
      (window.__locale && window.__locale.lang) ||
      document.documentElement.lang ||
      "en"
    ).slice(0, 10);
  }

  function getActiveFunction() {
    if (window.EazyTips && window.EazyTips.getActiveFunction) {
      return window.EazyTips.getActiveFunction();
    }
    return null;
  }

  function getGuideAnchor() {
    var mascot = document.getElementById("eazy-mascot");
    if (mascot && mascot.classList.contains("eazy-mascot--docked")) return mascot;
    var toggle = document.getElementById("creator-chat-toggle");
    if (
      toggle &&
      (toggle.classList.contains("creator-chat__toggle--docked") ||
        toggle.classList.contains("creator-chat__toggle--snap-mode"))
    ) {
      return toggle;
    }
    return mascot || toggle;
  }

  var _guideBubbleLayoutBound = false;

  function positionGuideBubble() {
    var el = document.getElementById("eazy-thought");
    if (!el || !el.classList.contains("eazy-guide-bubble")) return;
    var anchor = getGuideAnchor();
    if (!anchor) return;

    var pad = 12;
    var gap = 10;
    var maxW = Math.min(520, Math.max(200, window.innerWidth - pad * 2));
    var r = anchor.getBoundingClientRect();
    var left = r.left + r.width / 2 - maxW / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - maxW - pad));

    var top = r.bottom + gap;
    var maxH = Math.min(window.innerHeight * 0.52, window.innerHeight - top - pad);
    if (maxH < 120 && r.top > window.innerHeight * 0.35) {
      top = Math.max(pad, r.top - gap);
    }

    var anchorCenter = r.left + r.width / 2;
    var tailLeft = Math.max(20, Math.min(anchorCenter - left, maxW - 20));

    el.style.setProperty("--eaz-guide-bubble-left", left + "px");
    el.style.setProperty("--eaz-guide-bubble-top", top + "px");
    el.style.setProperty("--eaz-guide-bubble-width", maxW + "px");
    el.style.setProperty("--eaz-guide-bubble-tail-left", tailLeft + "px");
  }

  function bindGuideBubbleLayout() {
    if (_guideBubbleLayoutBound) return;
    _guideBubbleLayoutBound = true;
    window.addEventListener("resize", positionGuideBubble);
    window.addEventListener("scroll", positionGuideBubble, true);
  }

  function unbindGuideBubbleLayout() {
    if (!_guideBubbleLayoutBound) return;
    _guideBubbleLayoutBound = false;
    window.removeEventListener("resize", positionGuideBubble);
    window.removeEventListener("scroll", positionGuideBubble, true);
  }

  function resetGuideBubbleLayout(el) {
    if (!el) return;
    el.style.removeProperty("--eaz-guide-bubble-left");
    el.style.removeProperty("--eaz-guide-bubble-top");
    el.style.removeProperty("--eaz-guide-bubble-width");
    el.style.removeProperty("--eaz-guide-bubble-tail-left");
  }

  function showBubble(text, loading) {
    var el = document.getElementById("eazy-thought");
    if (!el) return;
    var textEl = el.querySelector(".eazy-thought-text");
    if (textEl) textEl.textContent = text || "";
    el.classList.remove("eazy-thought--dream");
    el.classList.add("show", "eazy-guide-bubble");
    if (loading) el.classList.add("eazy-guide-bubble--loading");
    else {
      el.classList.remove("eazy-guide-bubble--loading");
      scheduleClearPersistRect();
    }
    bindGuideBubbleLayout();
    positionGuideBubble();
    requestAnimationFrame(positionGuideBubble);
  }

  var _persistClearTimer = null;

  function applyRectStyle(el, left, top, w, h) {
    if (!el) return;
    el.style.display = "block";
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = w + "px";
    el.style.height = h + "px";
  }

  function showPersistRect(left, top, w, h) {
    if (!ui.screenshotPersist) return;
    if (_persistClearTimer) {
      clearTimeout(_persistClearTimer);
      _persistClearTimer = null;
    }
    applyRectStyle(ui.screenshotPersist, left, top, w, h);
    ui.screenshotPersist.classList.add("is-visible");
  }

  function clearPersistRect() {
    if (_persistClearTimer) {
      clearTimeout(_persistClearTimer);
      _persistClearTimer = null;
    }
    if (!ui.screenshotPersist) return;
    ui.screenshotPersist.classList.remove("is-visible");
    ui.screenshotPersist.style.display = "none";
    ui.screenshotPersist.style.left = "";
    ui.screenshotPersist.style.top = "";
    ui.screenshotPersist.style.width = "";
    ui.screenshotPersist.style.height = "";
  }

  function resetScreenshotDragRect() {
    if (!ui.screenshotRect) return;
    ui.screenshotRect.style.display = "none";
    ui.screenshotRect.style.left = "";
    ui.screenshotRect.style.top = "";
    ui.screenshotRect.style.width = "";
    ui.screenshotRect.style.height = "";
  }

  function cleanupScreenshotUi() {
    screenshotDragActive = false;
    document.documentElement.classList.remove("eaz-guide-screenshot-active");
    clearPersistRect();
    resetScreenshotDragRect();
  }

  function clearGuideHighlights() {
    document.querySelectorAll(".eazy-guide-highlight").forEach(function (el) {
      el.classList.remove("eazy-guide-highlight");
    });
  }

  function scheduleClearPersistRect() {
    if (_persistClearTimer) clearTimeout(_persistClearTimer);
    _persistClearTimer = setTimeout(function () {
      _persistClearTimer = null;
      clearPersistRect();
    }, 1200);
  }

  function hideBubble() {
    var el = document.getElementById("eazy-thought");
    if (!el) return;
    el.classList.remove("show", "eazy-guide-bubble", "eazy-guide-bubble--loading");
    resetGuideBubbleLayout(el);
    unbindGuideBubbleLayout();
  }

  function buildPayload() {
    return {
      page: getPagePath(),
      locale: getLocale(),
      active_function: getActiveFunction(),
      element: session.element,
      screenshot: session.screenshot,
      prompt: session.prompt || session.voice_transcript || "",
      voice_transcript: session.voice_transcript || "",
      chat_ui_only: isChatOpen(),
      bot_context: window.EazyBot && window.EazyBot.getContext ? window.EazyBot.getContext() : null,
    };
  }

  function explainFromRegistry(key) {
    if (!key || !registryCache || !registryCache[key]) return null;
    return registryText(registryCache[key]);
  }

  function requestExplain(forceRegistryOnly) {
    if (pendingRequest) return;
    var payload = buildPayload();
    if (!payload.element && !payload.screenshot && !payload.prompt) {
      showBubble(i18n("creator.guide.empty_session", "Long-press an element, capture a screenshot, or type a question."), false);
      return;
    }

    if (payload.element && payload.element.guide_key && !payload.screenshot && !payload.prompt) {
      var local = explainFromRegistry(payload.element.guide_key);
      if (local) {
        showBubble(local, false);
        return;
      }
    }

    if (forceRegistryOnly) return;

    pendingRequest = true;
    syncExplainUi();
    showBubble(i18n("creator.guide.loading", "Let me look at that…"), true);

    fetch(API_BASE + "?op=guide-explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        pendingRequest = false;
        syncExplainUi();
        if (data.ok && data.text) {
          showBubble(data.text, false);
          if (data.voice_message_id && typeof window.playEazyGuideVoice === "function") {
            window.playEazyGuideVoice(data.voice_message_id);
          }
        } else {
          showBubble(
            data.message || data.error || i18n("creator.guide.error", "Sorry, I could not explain that right now."),
            false
          );
        }
      })
      .catch(function () {
        pendingRequest = false;
        syncExplainUi();
        showBubble(i18n("creator.guide.error", "Sorry, I could not explain that right now."), false);
      });
  }

  function ensureUi() {
    if (ui.toolbar) return;

    ui.toolbar = document.createElement("div");
    ui.toolbar.className = "eaz-guide-toolbar";
    ui.toolbar.setAttribute("role", "toolbar");
    ui.toolbar.innerHTML =
      '<div class="eaz-guide-toolbar__row">' +
      '<button type="button" class="eaz-guide-toolbar__chip is-active" data-tool="click"></button>' +
      '<button type="button" class="eaz-guide-toolbar__chip" data-tool="screenshot"></button>' +
      '<button type="button" class="eaz-guide-toolbar__chip" data-tool="prompt"></button>' +
      "</div>" +
      '<button type="button" class="eaz-guide-toolbar__explain" data-tool="ask" hidden></button>';
    document.body.appendChild(ui.toolbar);

    ui.promptBar = document.createElement("div");
    ui.promptBar.className = "eaz-guide-prompt";
    ui.promptBar.innerHTML =
      '<input type="text" class="eaz-guide-prompt__input" autocomplete="off" />' +
      '<button type="button" class="eaz-guide-prompt__btn" data-action="voice" title="Voice">🎤</button>' +
      '<button type="button" class="eaz-guide-prompt__btn eaz-guide-prompt__btn--send" data-action="send"></button>';
    document.body.appendChild(ui.promptBar);
    ui.promptInput = ui.promptBar.querySelector(".eaz-guide-prompt__input");

    ui.screenshotOverlay = document.createElement("div");
    ui.screenshotOverlay.className = "eaz-guide-screenshot-overlay";
    ui.screenshotRect = document.createElement("div");
    ui.screenshotRect.className = "eaz-guide-screenshot-overlay__rect";
    ui.screenshotOverlay.appendChild(ui.screenshotRect);
    ui.screenshotPersist = document.createElement("div");
    ui.screenshotPersist.className = "eaz-guide-screenshot-persist";
    ui.screenshotPersist.setAttribute("aria-hidden", "true");
    document.body.appendChild(ui.screenshotPersist);
    document.body.appendChild(ui.screenshotOverlay);

    ui.exitHint = document.createElement("div");
    ui.exitHint.className = "eaz-guide-exit-hint";
    document.body.appendChild(ui.exitHint);

    ui.toolbar.querySelector('[data-tool="click"]').textContent = i18n("creator.guide.tool_click", "Click");
    ui.toolbar.querySelector('[data-tool="screenshot"]').textContent = i18n("creator.guide.tool_screenshot", "Screenshot");
    ui.toolbar.querySelector('[data-tool="prompt"]').textContent = i18n("creator.guide.tool_prompt", "Prompt");
    ui.toolbar.querySelector('[data-tool="ask"]').textContent = i18n("creator.guide.tool_ask", "Explain");

    setPromptSendMode("send");

    ui.toolbar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tool]");
      if (!btn) return;
      var tool = btn.getAttribute("data-tool");
      if (tool === "ask") {
        if (shouldShowExplain()) requestExplain(false);
        return;
      }
      tools[tool] = !tools[tool];
      if (tool === "click" && !tools.click && !tools.screenshot && !tools.prompt) tools.click = true;
      syncToolUi();
    });

    ui.promptBar.querySelector('[data-action="send"]').addEventListener("click", function () {
      if (promptLocked) {
        clearPrompt();
        return;
      }
      submitPrompt();
    });

    ui.promptInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !promptLocked) {
        e.preventDefault();
        submitPrompt();
      }
    });

    ui.promptBar.querySelector('[data-action="voice"]').addEventListener("click", toggleVoiceInput);

    bindScreenshotOverlay();
    bindLongPressInspect();
  }

  function syncToolUi() {
    if (!ui.toolbar) return;
    ui.toolbar.querySelectorAll("[data-tool]").forEach(function (btn) {
      var t = btn.getAttribute("data-tool");
      if (t === "ask") return;
      btn.classList.toggle("is-active", !!tools[t]);
    });
    ui.promptBar.classList.toggle("is-visible", !!tools.prompt);
    document.documentElement.classList.toggle("eaz-guide-screenshot-active", !!tools.screenshot);
    syncExplainUi();
  }

  function bindLongPressInspect() {
    var highlightEl = null;
    var pressTimer = null;
    var startX = 0;
    var startY = 0;
    var targetEl = null;

    function clearHighlight() {
      if (highlightEl) {
        highlightEl.classList.remove("eazy-guide-highlight");
        highlightEl = null;
      }
    }

    function onPointerDown(e) {
      if (!active || !tools.click) return;
      if (e.button != null && e.button !== 0) return;
      var t = e.target;
      if (isInsideGuideUi(t)) return;
      var root = getScopeRoot();
      if (root !== document.body && !root.contains(t)) return;

      startX = e.clientX;
      startY = e.clientY;
      targetEl = t;
      clearHighlight();
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        pressTimer = null;
        if (!active || !tools.click || !targetEl) return;
        var resolved = resolveGuideKey(targetEl);
        session.element = resolved;
        highlightEl = targetEl;
        highlightEl.classList.add("eazy-guide-highlight");
        try {
          navigator.vibrate(20);
        } catch (v) {}
        loadRegistry().then(function () {
          requestExplain(false);
        });
      }, LONG_PRESS_MS);
    }

    function onPointerMove(e) {
      if (!pressTimer) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (dx * dx + dy * dy > 100) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }

    function onPointerUp() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("mousemove", onPointerMove, true);
    document.addEventListener("mouseup", onPointerUp, true);
    document.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches[0]) return;
      onPointerDown({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
        target: e.target,
        button: 0,
      });
    }, { capture: true, passive: true });
    document.addEventListener("touchmove", function (e) {
      if (!e.touches || !e.touches[0]) return;
      onPointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, { capture: true, passive: true });
    document.addEventListener("touchend", onPointerUp, true);
  }

  function bindScreenshotOverlay() {
    var x0 = 0;
    var y0 = 0;
    var lastCx = 0;
    var lastCy = 0;

    function resetDragRect() {
      resetScreenshotDragRect();
    }

    function toCoords(e) {
      if (e.changedTouches && e.changedTouches[0]) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      if (e.touches && e.touches[0]) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function rectFromPoints(x1, y1, x2, y2) {
      var left = Math.min(x1, x2);
      var top = Math.min(y1, y2);
      var w = Math.abs(x2 - x1);
      var h = Math.abs(y2 - y1);
      return { left: left, top: top, width: w, height: h };
    }

    function onDown(e) {
      if (!active || !tools.screenshot) return;
      e.preventDefault();
      e.stopPropagation();
      var c = toCoords(e);
      screenshotDragActive = true;
      x0 = c.x;
      y0 = c.y;
      lastCx = c.x;
      lastCy = c.y;
      clearPersistRect();
      applyRectStyle(ui.screenshotRect, x0, y0, 0, 0);
    }

    function onMove(e) {
      if (!screenshotDragActive || !active || !tools.screenshot) return;
      e.preventDefault();
      var c = toCoords(e);
      lastCx = c.x;
      lastCy = c.y;
      var r = rectFromPoints(x0, y0, c.x, c.y);
      applyRectStyle(ui.screenshotRect, r.left, r.top, r.width, r.height);
    }

    function onUp(e) {
      if (!screenshotDragActive) return;
      screenshotDragActive = false;
      e.preventDefault();
      resetDragRect();
      if (!active || !tools.screenshot) return;
      var r = rectFromPoints(x0, y0, lastCx, lastCy);
      if (r.width < 12 || r.height < 12) return;
      document.documentElement.classList.remove("eaz-guide-screenshot-active");
      showPersistRect(r.left, r.top, r.width, r.height);
      captureScreenshotRegion(r.left, r.top, r.width, r.height);
    }

    ui.screenshotOverlay.addEventListener("mousedown", onDown);
    ui.screenshotOverlay.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    ui.screenshotOverlay.addEventListener("touchstart", onDown, { passive: false });
    ui.screenshotOverlay.addEventListener("touchmove", onMove, { passive: false });
    ui.screenshotOverlay.addEventListener("touchend", onUp, { passive: false });
    ui.screenshotOverlay.addEventListener("touchcancel", onUp, { passive: false });
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    var src =
      window.__eazHtml2canvasSrc ||
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        window.html2canvas ? resolve(window.html2canvas) : reject(new Error("no html2canvas"));
      };
      s.onerror = function () {
        reject(new Error("html2canvas load failed"));
      };
      document.head.appendChild(s);
    });
  }

  function captureScreenshotRegion(left, top, w, h) {
    showBubble(i18n("creator.guide.capturing", "Capturing screenshot…"), true);
    loadHtml2Canvas()
      .then(function (html2canvas) {
        var root = getScopeRoot();
        return html2canvas(root === document.body ? document.body : root, {
          backgroundColor: null,
          useCORS: true,
          logging: false,
          scale: Math.min(window.devicePixelRatio || 1, 1.5),
          x: root === document.body ? window.scrollX : 0,
          y: root === document.body ? window.scrollY : 0,
          width: root === document.body ? window.innerWidth : root.clientWidth,
          height: root === document.body ? window.innerHeight : root.clientHeight,
        }).then(function (canvas) {
          var scaleX = canvas.width / (root === document.body ? window.innerWidth : root.clientWidth);
          var scaleY = canvas.height / (root === document.body ? window.innerHeight : root.clientHeight);
          var relLeft = root === document.body ? left : left - root.getBoundingClientRect().left;
          var relTop = root === document.body ? top : top - root.getBoundingClientRect().top;
          var crop = document.createElement("canvas");
          crop.width = Math.max(1, Math.round(w * scaleX));
          crop.height = Math.max(1, Math.round(h * scaleY));
          var ctx = crop.getContext("2d");
          ctx.drawImage(
            canvas,
            Math.round(relLeft * scaleX),
            Math.round(relTop * scaleY),
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height
          );
          var dataUrl = crop.toDataURL("image/jpeg", 0.82);
          session.screenshot = {
            base64: dataUrl.split(",")[1] || "",
            mime: "image/jpeg",
            crop_rect: { left: left, top: top, width: w, height: h },
          };
          hideBubble();
          syncExplainUi();
        });
      })
      .catch(function () {
        clearPersistRect();
        session.screenshot = null;
        syncExplainUi();
        showBubble(i18n("creator.guide.screenshot_failed", "Could not capture screenshot."), false);
      });
  }

  function toggleVoiceInput() {
    if (promptLocked) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = ui.promptBar && ui.promptBar.querySelector('[data-action="voice"]');
    if (!SpeechRecognition) {
      showBubble(i18n("creator.guide.voice_unsupported", "Voice input is not supported in this browser."), false);
      return;
    }
    if (recording && speechRec) {
      speechRec.stop();
      return;
    }
    speechRec = new SpeechRecognition();
    speechRec.lang = getLocale().indexOf("de") === 0 ? "de-DE" : "en-US";
    speechRec.interimResults = false;
    speechRec.maxAlternatives = 1;
    recording = true;
    if (btn) btn.classList.add("is-recording");
    speechRec.onresult = function (ev) {
      var text = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || "";
      session.voice_transcript = text.trim();
      if (ui.promptInput) ui.promptInput.value = session.voice_transcript;
      if (session.voice_transcript) submitPrompt();
    };
    speechRec.onerror = function () {
      recording = false;
      if (btn) btn.classList.remove("is-recording");
    };
    speechRec.onend = function () {
      recording = false;
      if (btn) btn.classList.remove("is-recording");
    };
    try {
      speechRec.start();
    } catch (e) {
      recording = false;
      if (btn) btn.classList.remove("is-recording");
    }
  }

  function enterGuideMode() {
    if (active) return;
    if (!isSnapped()) return;
    ensureUi();
    active = true;
    tools = { click: true, screenshot: false, prompt: false };
    resetSession();
    setGuideFlag(true);
    syncToolUi();
    showGuideUi();
    if (ui.promptInput) {
      ui.promptInput.placeholder = i18n("creator.guide.prompt_placeholder", "Ask about what you see…");
      ui.promptInput.value = "";
      ui.promptInput.readOnly = false;
    }
    if (ui.promptBar) ui.promptBar.classList.remove("is-locked");
    setPromptSendMode("send");
    syncExplainUi();
    ui.exitHint.textContent = i18n("creator.guide.exit_hint", "Guide Mode — click Eazy to exit");
    showBubble(i18n("creator.guide.entered", "Guide Mode on! Long-press any element, drag a screenshot, or ask me."), false);
    loadRegistry();
    try {
      localStorage.setItem("eazy_guide_discovered", "1");
    } catch (e) {}
  }

  function exitGuideMode() {
    if (!active) return false;
    active = false;
    setGuideFlag(false);
    document.documentElement.classList.remove("eaz-guide-has-explain");
    cleanupScreenshotUi();
    clearGuideHighlights();
    resetSession();
    hideBubble();
    if (ui.promptInput) {
      ui.promptInput.value = "";
      ui.promptInput.readOnly = false;
    }
    if (ui.toolbar) ui.toolbar.style.display = "none";
    if (ui.promptBar) {
      ui.promptBar.classList.remove("is-visible", "is-locked");
      ui.promptBar.style.display = "none";
    }
    if (ui.exitHint) ui.exitHint.textContent = "";
    return true;
  }

  function showGuideUi() {
    if (ui.toolbar) ui.toolbar.style.display = "";
    if (ui.promptBar) ui.promptBar.style.display = "";
  }

  function onEazyDoubleClick(e) {
    if (!isSnapped()) return;
    e.preventDefault();
    e.stopPropagation();
    if (active) return;
    markGuideDoubleClick();
    enterGuideMode();
    showGuideUi();
  }

  function onEazySingleClick(e) {
    if (!active) return false;
    e.preventDefault();
    e.stopPropagation();
    exitGuideMode();
    return true;
  }

  function getSnapTarget(node) {
    if (!node || !node.closest) return null;
    if (node.closest("#eazy-mascot")) return document.getElementById("eazy-mascot");
    if (node.closest("#creator-chat-toggle")) return document.getElementById("creator-chat-toggle");
    return null;
  }

  function snapTargetKey(el) {
    return el && el.id ? el.id : "eazy";
  }

  function getPointerCoords(e) {
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    return { x: t.clientX || 0, y: t.clientY || 0 };
  }

  function handleSnapPointerEnd(e) {
    if (!isSnapped()) return false;
    var el = getSnapTarget(e.target);
    if (!el) return false;

    var now = Date.now();
    if (now - lastSnapPointerEndAt < 80) return false;
    lastSnapPointerEndAt = now;

    var key = snapTargetKey(el);
    if (snapTouchStart.key === key && snapTouchStart.moved) return false;

    if (active) {
      onEazySingleClick(e);
      return true;
    }

    var coords = getPointerCoords(e);
    var isDouble =
      snapTapState.key === key &&
      now - snapTapState.time <= DOUBLE_TAP_MS &&
      Math.abs(coords.x - snapTapState.x) <= DOUBLE_TAP_SLOP &&
      Math.abs(coords.y - snapTapState.y) <= DOUBLE_TAP_SLOP;

    if (isDouble) {
      snapTapState.key = "";
      snapTapState.time = 0;
      onEazyDoubleClick(e);
      return true;
    }

    snapTapState.time = now;
    snapTapState.x = coords.x;
    snapTapState.y = coords.y;
    snapTapState.key = key;
    return false;
  }

  function bindSnapPointerTriggers() {
    if (snapPointerBound) return;
    snapPointerBound = true;

    document.addEventListener(
      "touchstart",
      function (e) {
        var el = getSnapTarget(e.target);
        if (!el || !isSnapped()) return;
        var c = e.touches && e.touches[0];
        if (!c) return;
        snapTouchStart = { key: snapTargetKey(el), x: c.clientX, y: c.clientY, moved: false };
      },
      { capture: true, passive: true }
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        if (!snapTouchStart.key) return;
        var c = e.touches && e.touches[0];
        if (!c) return;
        if (
          Math.abs(c.clientX - snapTouchStart.x) + Math.abs(c.clientY - snapTouchStart.y) >
          TAP_MOVE_THRESHOLD
        ) {
          snapTouchStart.moved = true;
        }
      },
      { capture: true, passive: true }
    );

    document.addEventListener(
      "touchend",
      function (e) {
        var el = getSnapTarget(e.target);
        if (!el) return;
        if (handleSnapPointerEnd(e)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        snapTouchStart.key = "";
      },
      { capture: true, passive: false }
    );
  }

  function bindTriggers() {
    var mascot = document.getElementById("eazy-mascot");
    var toggle = document.getElementById("creator-chat-toggle");

    function bindEl(el) {
      if (!el || el.getAttribute("data-eazy-guide-bound")) return;
      el.setAttribute("data-eazy-guide-bound", "1");
      el.addEventListener(
        "dblclick",
        function (e) {
          if (!isSnapped()) return;
          onEazyDoubleClick(e);
        },
        true
      );
    }

    bindEl(mascot);
    bindEl(toggle);
    bindSnapPointerTriggers();

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && active) exitGuideMode();
    });
  }

  /** v1.1 hook – live TTS for guide answers */
  window.playEazyGuideVoice = function (messageId) {
    if (!messageId) return false;
    if (typeof window.playEazyVoice === "function") return window.playEazyVoice(messageId);
    return false;
  };

  window.EazyGuide = {
    isActive: function () {
      return active;
    },
    isSnapped: isSnapped,
    enter: enterGuideMode,
    exit: exitGuideMode,
    consumeMascotClick: onEazySingleClick,
    shouldBlockUndock: function () {
      return active;
    },
    shouldSuppressChatOpen: shouldSuppressChatOpen,
  };

  var _discoverHideTimer = null;
  var DISCOVER_DISPLAY_MS = 4500;
  var DISCOVER_INITIAL_MS = 2800;
  var DISCOVER_INTERVAL_MS = 120000;
  var DISCOVER_CHANCE = 0.35;

  function showDiscoverHintBrief() {
    if (active || !isSnapped()) return;
    if (window.__eaz_mode_active || window.__eaz_guide_active) return;
    try {
      if (localStorage.getItem("eazy_guide_discovered") === "1") return;
    } catch (e0) {
      return;
    }
    var thought = document.getElementById("eazy-thought");
    if (thought && thought.classList.contains("show")) return;

    showBubble(
      i18n("creator.guide.discover", "Double-click me while snapped to enter Guide Mode."),
      false
    );
    if (_discoverHideTimer) clearTimeout(_discoverHideTimer);
    _discoverHideTimer = setTimeout(function () {
      _discoverHideTimer = null;
      hideBubble();
    }, DISCOVER_DISPLAY_MS);
  }

  function scheduleDiscoverHints() {
    setTimeout(function () {
      if (Math.random() <= DISCOVER_CHANCE) showDiscoverHintBrief();
    }, DISCOVER_INITIAL_MS);
    setInterval(function () {
      if (Math.random() > DISCOVER_CHANCE) return;
      showDiscoverHintBrief();
    }, DISCOVER_INTERVAL_MS);
  }

  function init() {
    var regEl = document.getElementById("eazy-guide-registry-data");
    if (regEl && regEl.getAttribute("data-src")) {
      REGISTRY_URL = regEl.getAttribute("data-src");
    }
    bindTriggers();
    try {
      if (localStorage.getItem("eazy_guide_discovered") !== "1") {
        scheduleDiscoverHints();
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
