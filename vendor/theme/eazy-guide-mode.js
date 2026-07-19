/**
 * Eazy Guide Mode – inspect / screenshot / prompt when Eazy is snapped.
 * Enter: double-click snapped mascot or chat toggle. Exit: single click or Escape.
 */
(function () {
  "use strict";

  if (window.__eazGuideModeInit) return;
  window.__eazGuideModeInit = true;

  var API_BASE =
    (window.CreatorChatActions && window.CreatorChatActions.API_BASE) ||
    "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";

  var REGISTRY_URL = null;
  var registryCache = null;
  var active = false;
  var pendingRequest = false;
  var promptLocked = false;
  var screenshotDragActive = false;
  var tools = { click: true, screenshot: false };
  var GUIDE_UI_VERSION = "3";
  var session = { element: null, screenshot: null, prompt: "", voice_transcript: "" };
  var selectedHighlightEl = null;
  var suppressExitUntil = 0;
  var freezeBound = false;
  var EXIT_SUPPRESS_MS = 1200;

  var ui = {
    dock: null,
    selectionBar: null,
    selectionMedia: null,
    selectionTitle: null,
    selectionMeta: null,
    selectionClear: null,
    toolbar: null,
    promptAsk: null,
    promptInput: null,
    screenshotOverlay: null,
    screenshotRect: null,
    screenshotPersist: null,
    exitHint: null,
  };

  var speechRec = null;
  var recording = false;
  var suppressChatOpenUntil = 0;
  var thoughtHomeParent = null;
  var thoughtHomeNext = null;
  var bubblePages = [];
  var bubblePageIndex = 0;
  var bubbleSwipe = { x: 0, y: 0, active: false };
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

  function shouldSuppressExit() {
    return Date.now() < suppressExitUntil;
  }

  function markExitSuppressed() {
    suppressExitUntil = Date.now() + EXIT_SUPPRESS_MS;
    suppressChatOpenUntil = Math.max(suppressChatOpenUntil, suppressExitUntil);
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
      node.closest(".eaz-guide-dock") ||
      node.closest(".eaz-guide-toolbar") ||
      node.closest(".eaz-guide-prompt") ||
      node.closest(".eaz-guide-selection") ||
      node.closest(".eaz-guide-screenshot-overlay") ||
      node.closest(".eaz-guide-exit-hint") ||
      // Speech bubble (close, pager, body) must never trigger inspect/freeze
      node.closest("#eazy-thought") ||
      node.closest(".eazy-guide-bubble") ||
      node.closest(".eaz-guide-bubble__shell") ||
      node.closest("[data-guide-bubble-close]") ||
      node.closest("[data-guide-bubble-prev]") ||
      node.closest("[data-guide-bubble-next]") ||
      node.closest("[data-guide-bubble-dot]") ||
      node.closest("[data-guide-bubble-pager]") ||
      node.closest("#eazy-mascot") ||
      node.closest("#creator-chat-toggle")
    );
  }

  function getCreatorScreen() {
    var desk = document.querySelector(".creator-desktop-stage__panel.is-active[data-desktop-screen]");
    if (desk) return String(desk.getAttribute("data-desktop-screen") || "").toLowerCase() || null;
    var mobile = document.querySelector("#creatorMobileApp .creator-screen.is-active[data-screen]");
    if (mobile) {
      var idx = String(mobile.getAttribute("data-screen") || "");
      var map = { "0": "dashboard", "1": "generator", "2": "creations", "3": "marketing", "4": "automations" };
      return map[idx] || null;
    }
    return null;
  }

  function selectionTitleFromSession() {
    if (session.screenshot && session.screenshot.base64) {
      return i18n("creator.guide.selection_screenshot", "Screenshot");
    }
    if (session.element && session.element.guide_key && registryCache && registryCache[session.element.guide_key]) {
      return registryCache[session.element.guide_key].title || session.element.guide_key;
    }
    if (session.element && session.element.label) return String(session.element.label).slice(0, 80);
    return "";
  }

  function hasSelection() {
    return !!(session.element || (session.screenshot && session.screenshot.base64));
  }

  function syncSelectionUi() {
    if (!ui.selectionBar) return;
    var title = selectionTitleFromSession();
    var meta = getCreatorScreen() || "";
    var show = hasSelection();

    // Selection + prompt live in one bar; always visible while Guide Mode is on.
    ui.selectionBar.removeAttribute("hidden");
    ui.selectionBar.classList.add("is-visible");
    ui.selectionBar.classList.toggle("has-selection", show);

    if (ui.selectionTitle) {
      ui.selectionTitle.textContent = show
        ? title || i18n("creator.guide.selection_empty", "Selection")
        : i18n("creator.guide.selection_hint", "Select something, then ask…");
    }
    if (ui.selectionMeta) {
      ui.selectionMeta.textContent = show && meta ? meta.charAt(0).toUpperCase() + meta.slice(1) : "";
      ui.selectionMeta.hidden = !(show && meta);
    }

    var mediaHtml = "";
    if (session.screenshot && session.screenshot.base64) {
      var mime = session.screenshot.mime || "image/jpeg";
      mediaHtml =
        '<img class="eaz-guide-selection__thumb" alt="" src="data:' +
        mime +
        ";base64," +
        session.screenshot.base64 +
        '" />';
    } else if (show) {
      mediaHtml = '<span class="eaz-guide-selection__icon" aria-hidden="true">◎</span>';
    }
    if (ui.selectionMedia) ui.selectionMedia.innerHTML = mediaHtml;
    if (ui.selectionClear) ui.selectionClear.hidden = !show;

    document.documentElement.classList.toggle("eaz-guide-has-selection", show);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clearSelection() {
    session.element = null;
    session.screenshot = null;
    clearGuideHighlights();
    clearPersistRect();
    syncSelectionUi();
    syncExplainUi();
  }

  function setSelectedHighlight(el) {
    clearGuideHighlights();
    selectedHighlightEl = el || null;
    if (selectedHighlightEl && selectedHighlightEl.classList) {
      selectedHighlightEl.classList.add("eazy-guide-highlight");
    }
  }

  function findInteractiveTarget(node) {
    if (!node || !node.closest) return node;
    var hit = node.closest(
      "button, a, [role='button'], [data-eazy-guide], [data-desktop-switch], [data-goto], [data-nav], [data-mkt-parent], [data-mkt-child], [data-open-settings], [data-open-sales-modal], [data-creator-terms-trigger], [data-demo-switch], [data-tab], [data-maintab], [data-statusfilter], [data-promo-tab], [data-automations-add], [data-limit], input, textarea, select, canvas[role='button'], .creator-creations-card, .eaz-creator-promotions-card, .creator-journey-trigger, .creator-todo-item, .creator-desktop-header__balance, .creator-header__balance"
    );
    return hit || node;
  }

  function setGuideMascotFacing(on) {
    var mascot = document.getElementById("eazy-mascot");
    var inner = mascot && mascot.querySelector(".eazy-mascot__inner");
    if (inner) inner.classList.toggle("eazy-mascot__inner--look-left", !!on);
    if (mascot) mascot.classList.toggle("eazy-mascot--guide-face-left", !!on);
  }

  function setGuideFlag(on) {
    window.__eaz_guide_active = !!on;
    document.documentElement.classList.toggle("eaz-guide-active", !!on);
    setGuideMascotFacing(!!on);
  }

  function resetSession() {
    session = { element: null, screenshot: null, prompt: "", voice_transcript: "" };
    promptLocked = false;
    lockPromptInput(false);
    setPromptSendMode("send");
    syncExplainUi();
  }

  function shouldShowExplain() {
    return false;
  }

  function syncExplainUi() {
    document.documentElement.classList.toggle("eaz-guide-has-explain", !!promptLocked);
    if (ui.promptInput) ui.promptInput.disabled = !!pendingRequest;
    var sendBtn = ui.selectionBar && ui.selectionBar.querySelector('[data-action="send"]');
    if (sendBtn) sendBtn.disabled = !!pendingRequest && !promptLocked;
    var voiceBtn = ui.selectionBar && ui.selectionBar.querySelector('[data-action="voice"]');
    if (voiceBtn) voiceBtn.disabled = !!promptLocked || !!pendingRequest;
  }

  function lockPromptInput(locked) {
    promptLocked = !!locked;
    if (!ui.promptInput || !ui.promptAsk) return;
    ui.promptInput.readOnly = promptLocked;
    ui.promptAsk.classList.toggle("is-locked", promptLocked);
    var voiceBtn = ui.promptAsk.querySelector('[data-action="voice"]');
    if (voiceBtn) voiceBtn.disabled = promptLocked;
  }

  function setPromptSendMode(mode) {
    var btn =
      (ui.promptAsk && ui.promptAsk.querySelector('[data-action="send"]')) ||
      (ui.selectionBar && ui.selectionBar.querySelector('[data-action="send"]'));
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
    if (!text || pendingRequest) return;
    session.prompt = text;
    session.voice_transcript = text;
    lockPromptInput(true);
    setPromptSendMode("clear");
    syncExplainUi();
    requestExplain(false);
  }

  function clearPrompt() {
    session.prompt = "";
    session.voice_transcript = "";
    lockPromptInput(false);
    if (ui.promptInput) ui.promptInput.value = "";
    setPromptSendMode("send");
    syncExplainUi();
  }

  function resolveRegistryUrl() {
    if (REGISTRY_URL) return REGISTRY_URL;
    var el = document.getElementById("eazy-guide-registry-data");
    if (el && el.getAttribute("data-src")) return el.getAttribute("data-src");
    var attr = document.documentElement.getAttribute("data-eazy-guide-registry") || "";
    if (attr) return attr;
    if (window.CreatorPortalThemeBridge && typeof window.CreatorPortalThemeBridge.assetUrl === "function") {
      return window.CreatorPortalThemeBridge.assetUrl("eazy-guide-registry.json");
    }
    return "/vendor/theme/eazy-guide-registry.json";
  }

  function loadRegistry() {
    if (registryCache) return Promise.resolve(registryCache);
    var el = document.getElementById("eazy-guide-registry-data");
    if (el && el.textContent && el.textContent.trim()) {
      try {
        registryCache = JSON.parse(el.textContent);
        return Promise.resolve(registryCache);
      } catch (e) {}
    }
    var url = resolveRegistryUrl();
    REGISTRY_URL = url;
    return fetch(url, { credentials: "same-origin" })
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

  function registryPages(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.pages) && entry.pages.length) {
      return entry.pages
        .map(function (p) {
          return {
            category: String((p && p.category) || "Info").trim() || "Info",
            body: String((p && p.body) || "").trim(),
          };
        })
        .filter(function (p) {
          return p.body;
        });
    }
    var pages = [];
    if (entry.summary) pages.push({ category: "Overview", body: String(entry.summary) });
    if (entry.tips && entry.tips.length) {
      entry.tips.forEach(function (tip, i) {
        pages.push({
          category: entry.tips.length > 1 ? "Tip " + (i + 1) : "Tip",
          body: String(tip),
        });
      });
    }
    if (!pages.length && entry.title) pages.push({ category: "Overview", body: String(entry.title) });
    return pages;
  }

  function pagesFromPlainText(text) {
    var raw = String(text || "").trim();
    if (!raw) return [];
    // Prefer numbered sections from the short guide prompt shape.
    var numbered = raw.split(/\n(?=\d+\)\s)/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
    if (numbered.length > 1) {
      return numbered.map(function (body, i) {
        var m = body.match(/^\d+\)\s*([\s\S]*)$/);
        return {
          category: i === 0 ? "Answer" : "Step " + (i + 1),
          body: m ? m[1].trim() : body,
        };
      });
    }
    var chunks = raw.split(/\n{2,}/).map(function (s) {
      return s.trim();
    }).filter(Boolean);
    if (chunks.length <= 1) {
      return [{ category: "Answer", body: raw }];
    }
    return chunks.map(function (body, i) {
      return { category: i === 0 ? "Answer" : "More", body: body };
    });
  }

  function pageHtml(page, loading) {
    if (loading) {
      return (
        '<div class="eaz-guide-bubble__page">' +
        '<div class="eaz-guide-bubble__loading"><span class="eaz-guide-bubble__spinner"></span>' +
        '<span class="eaz-guide-bubble__body">' +
        escapeHtml((page && page.body) || "") +
        "</span></div></div>"
      );
    }
    return (
      '<div class="eaz-guide-bubble__page">' +
      (page && page.category
        ? '<div class="eaz-guide-bubble__category">' + escapeHtml(page.category) + "</div>"
        : "") +
      '<div class="eaz-guide-bubble__body">' +
      escapeHtml((page && page.body) || "") +
      "</div></div>"
    );
  }

  function resolveGuideKey(el) {
    if (!el || !el.closest) return null;
    var node = el;
    var depth = 0;
    while (node && depth < 10) {
      if (node.getAttribute && node.getAttribute("data-eazy-guide")) {
        var rawLabel = (node.getAttribute("aria-label") || "").trim();
        if (!rawLabel) {
          var titleNode = node.querySelector && node.querySelector(".cmkt-card__title, .creator-container__title, [data-t]");
          rawLabel = ((titleNode && titleNode.textContent) || node.textContent || "").trim().slice(0, 120);
        }
        return {
          guide_key: node.getAttribute("data-eazy-guide"),
          label: rawLabel.slice(0, 120),
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
    var maxW = Math.min(340, Math.max(220, window.innerWidth - pad * 2));
    var r = anchor.getBoundingClientRect();
    // Bubble sits down-left of Eazy; tail on top-right points up to the mascot.
    var left = r.left + r.width * 0.55 - maxW;
    left = Math.max(pad, Math.min(left, window.innerWidth - maxW - pad));

    el.style.setProperty("--eaz-guide-bubble-width", maxW + "px");
    var bubbleH = Math.max(el.offsetHeight || 0, 96);
    var top = r.bottom + gap;
    if (top + bubbleH > window.innerHeight - pad) {
      top = Math.max(pad, r.top - bubbleH - gap);
    }

    var anchorCenter = r.left + r.width / 2;
    var tailLeft = Math.max(maxW * 0.72, Math.min(anchorCenter - left, maxW - 22));

    el.style.setProperty("--eaz-guide-bubble-left", left + "px");
    el.style.setProperty("--eaz-guide-bubble-top", top + "px");
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

  function ensureGuideThoughtEl() {
    var el = document.getElementById("eazy-thought");
    if (!el) {
      el = document.createElement("div");
      el.id = "eazy-thought";
      el.className = "eazy-thought";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    } else if (el.parentElement !== document.body) {
      // Chat toggle is often display:none while the mascot is docked — reparent so the bubble can show.
      thoughtHomeParent = el.parentElement;
      thoughtHomeNext = el.nextSibling;
      document.body.appendChild(el);
    }

    if (!el.querySelector(".eaz-guide-bubble__shell")) {
      el.innerHTML =
        '<div class="eaz-guide-bubble__shell">' +
        '<button type="button" class="eaz-guide-bubble__close" data-guide-bubble-close aria-label="' +
        escapeHtml(i18n("creator.guide.close", "Close")) +
        '">×</button>' +
        '<div class="eaz-guide-bubble__viewport" data-guide-bubble-viewport>' +
        '<div class="eaz-guide-bubble__track" data-guide-bubble-track></div>' +
        "</div>" +
        '<div class="eaz-guide-bubble__pager" data-guide-bubble-pager hidden>' +
        '<button type="button" class="eaz-guide-bubble__nav" data-guide-bubble-prev aria-label="' +
        escapeHtml(i18n("creator.guide.prev_page", "Previous")) +
        '">‹</button>' +
        '<div class="eaz-guide-bubble__dots" data-guide-bubble-dots></div>' +
        '<button type="button" class="eaz-guide-bubble__nav" data-guide-bubble-next aria-label="' +
        escapeHtml(i18n("creator.guide.next_page", "Next")) +
        '">›</button>' +
        "</div>" +
        "</div>" +
        '<span class="eazy-thought-tail eaz-guide-bubble__tail" aria-hidden="true"></span>';
      bindGuideBubbleControls(el);
    }
    return el;
  }

  function restoreGuideThoughtEl() {
    var el = document.getElementById("eazy-thought");
    if (!el || !thoughtHomeParent) return;
    try {
      if (thoughtHomeNext && thoughtHomeNext.parentNode === thoughtHomeParent) {
        thoughtHomeParent.insertBefore(el, thoughtHomeNext);
      } else {
        thoughtHomeParent.appendChild(el);
      }
    } catch (e0) {}
    thoughtHomeParent = null;
    thoughtHomeNext = null;
  }

  function bindGuideBubbleControls(el) {
    if (!el || el.getAttribute("data-guide-bubble-bound") === "1") return;
    el.setAttribute("data-guide-bubble-bound", "1");

    function isBubbleControl(target) {
      return !!(
        target &&
        target.closest &&
        (target.closest("[data-guide-bubble-close]") ||
          target.closest("[data-guide-bubble-prev]") ||
          target.closest("[data-guide-bubble-next]") ||
          target.closest("[data-guide-bubble-dot]") ||
          target.closest("[data-guide-bubble-pager]"))
      );
    }

    function onBubbleControlPointer(e) {
      // Capture phase on controls only — keep page text scrollable.
      if (!isBubbleControl(e.target)) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }

    el.addEventListener("pointerdown", onBubbleControlPointer, true);
    el.addEventListener("touchstart", onBubbleControlPointer, { capture: true, passive: false });
    el.addEventListener(
      "click",
      function (e) {
        if (e.target.closest("[data-guide-bubble-close]")) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          hideBubble();
          return;
        }
        if (e.target.closest("[data-guide-bubble-prev]")) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          setBubblePage(bubblePageIndex - 1);
          return;
        }
        if (e.target.closest("[data-guide-bubble-next]")) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          setBubblePage(bubblePageIndex + 1);
          return;
        }
        var dot = e.target.closest("[data-guide-bubble-dot]");
        if (dot) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
          setBubblePage(parseInt(dot.getAttribute("data-guide-bubble-dot"), 10) || 0);
        }
      },
      true
    );

    var viewport = el.querySelector("[data-guide-bubble-viewport]");
    if (!viewport) return;
    viewport.addEventListener(
      "touchstart",
      function (e) {
        var t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        bubbleSwipe = { x: t.clientX, y: t.clientY, active: true };
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchend",
      function (e) {
        if (!bubbleSwipe.active) return;
        var t = e.changedTouches && e.changedTouches[0];
        bubbleSwipe.active = false;
        if (!t) return;
        var dx = t.clientX - bubbleSwipe.x;
        var dy = t.clientY - bubbleSwipe.y;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) setBubblePage(bubblePageIndex + 1);
        else setBubblePage(bubblePageIndex - 1);
      },
      { passive: true }
    );
  }

  function setBubblePage(index) {
    if (!bubblePages.length) return;
    bubblePageIndex = Math.max(0, Math.min(bubblePages.length - 1, index));
    var el = document.getElementById("eazy-thought");
    if (!el) return;
    var track = el.querySelector("[data-guide-bubble-track]");
    var page = bubblePages[bubblePageIndex] || { category: "", body: "" };
    var loading = el.classList.contains("eazy-guide-bubble--loading");
    // Render one page at a time so pagination always swaps content (no CSS carousel glitches).
    if (track) {
      track.style.transform = "";
      track.innerHTML = pageHtml(page, loading && bubblePageIndex === 0 && bubblePages.length === 1);
    }
    var dots = el.querySelectorAll("[data-guide-bubble-dots] button");
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.toggle("is-active", i === bubblePageIndex);
    }
    var prev = el.querySelector("[data-guide-bubble-prev]");
    var next = el.querySelector("[data-guide-bubble-next]");
    if (prev) prev.disabled = bubblePageIndex <= 0;
    if (next) next.disabled = bubblePageIndex >= bubblePages.length - 1;
    positionGuideBubble();
  }

  function renderBubblePages(el, pages, loading) {
    var track = el.querySelector("[data-guide-bubble-track]");
    var pager = el.querySelector("[data-guide-bubble-pager]");
    var dots = el.querySelector("[data-guide-bubble-dots]");
    if (!track) return;

    bubblePages = pages && pages.length ? pages : [{ category: "", body: "" }];
    bubblePageIndex = 0;

    if (dots) {
      dots.innerHTML =
        bubblePages.length > 1
          ? bubblePages
              .map(function (_, i) {
                return (
                  '<button type="button" class="eaz-guide-bubble__dot' +
                  (i === 0 ? " is-active" : "") +
                  '" data-guide-bubble-dot="' +
                  i +
                  '" aria-label="Page ' +
                  (i + 1) +
                  '"></button>'
                );
              })
              .join("")
          : "";
    }
    if (pager) pager.hidden = loading || bubblePages.length <= 1;
    if (loading) {
      track.innerHTML = pageHtml(bubblePages[0], true);
      return;
    }
    setBubblePage(0);
  }

  function showBubble(textOrPages, loading) {
    var el = ensureGuideThoughtEl();
    if (!el) return;
    var pages = Array.isArray(textOrPages) ? textOrPages : pagesFromPlainText(textOrPages);
    if (!pages.length && loading) {
      pages = [{ category: "", body: String(textOrPages || "") }];
    }
    el.classList.remove("eazy-thought--dream");
    el.classList.add("show", "eazy-guide-bubble");
    if (loading) el.classList.add("eazy-guide-bubble--loading");
    else {
      el.classList.remove("eazy-guide-bubble--loading");
      scheduleClearPersistRect();
    }
    renderBubblePages(el, pages, !!loading);
    bindGuideBubbleLayout();
    positionGuideBubble();
    requestAnimationFrame(positionGuideBubble);
  }

  function showRegistryBubble(entry, selectionLabel) {
    var pages = registryPages(entry);
    if (!pages.length) return false;
    var label = String(selectionLabel || "").trim();
    var heading = label || (entry && entry.title) || "";
    if (heading && pages[0]) {
      var overviewBody = pages[0].body;
      if (label && entry && entry.title && label.toLowerCase() !== String(entry.title).toLowerCase()) {
        overviewBody = overviewBody + "\n\nSelected: " + label;
      }
      pages = [{ category: heading, body: overviewBody }].concat(pages.slice(1));
    }
    showBubble(pages, false);
    return true;
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
    bubblePages = [];
    bubblePageIndex = 0;
    resetGuideBubbleLayout(el);
    unbindGuideBubbleLayout();
    restoreGuideThoughtEl();
  }

  function buildPayload() {
    return {
      page: getPagePath(),
      locale: getLocale(),
      active_function: getActiveFunction(),
      creator_screen: getCreatorScreen(),
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
    return registryCache[key];
  }

  function requestExplain(forceRegistryOnly) {
    if (pendingRequest) return;
    var payload = buildPayload();
    if (!payload.element && !payload.screenshot && !payload.prompt) {
      showBubble(i18n("creator.guide.empty_session", "Tap an element, capture a screenshot, or type a question."), false);
      return;
    }

    // Click tips: prefer predefined registry pages. Prompt/screenshot use LLM.
    if (!payload.prompt && payload.element && payload.element.guide_key && !payload.screenshot) {
      var localEntry = explainFromRegistry(payload.element.guide_key);
      if (localEntry && showRegistryBubble(localEntry, payload.element.label)) {
        return;
      }
      if (forceRegistryOnly) {
        showBubble(
          i18n("creator.guide.no_tip", "I don’t have a short tip for this yet — ask me in the prompt field."),
          false
        );
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
        if (data.ok) {
          if (data.source === "registry" && data.guide_key) {
            var regEntry = explainFromRegistry(data.guide_key);
            if (regEntry && showRegistryBubble(regEntry, payload.element && payload.element.label)) {
              return;
            }
          }
          if (Array.isArray(data.pages) && data.pages.length) {
            showBubble(data.pages, false);
          } else if (data.text) {
            showBubble(data.text, false);
          } else {
            showBubble(
              data.message || data.error || i18n("creator.guide.error", "Sorry, I could not explain that right now."),
              false
            );
          }
          if (data.voice_message_id && typeof window.playEazyGuideVoice === "function") {
            window.playEazyGuideVoice(data.voice_message_id);
          }
          return;
        }
        showBubble(
          data.message || data.error || i18n("creator.guide.error", "Sorry, I could not explain that right now."),
          false
        );
      })
      .catch(function () {
        pendingRequest = false;
        syncExplainUi();
        showBubble(i18n("creator.guide.error", "Sorry, I could not explain that right now."), false);
      });
  }

  function ensureUi() {
    if (ui.dock && ui.dock.getAttribute("data-guide-ui") === GUIDE_UI_VERSION) return;
    if (ui.dock && ui.dock.parentNode) {
      try {
        ui.dock.parentNode.removeChild(ui.dock);
      } catch (e0) {}
    }
    ui.dock = null;

    ui.dock = document.createElement("div");
    ui.dock.className = "eaz-guide-dock";
    ui.dock.setAttribute("data-guide-ui", GUIDE_UI_VERSION);
    ui.dock.innerHTML =
      '<div class="eaz-guide-selection is-visible">' +
      '<div class="eaz-guide-selection__row">' +
      '<div class="eaz-guide-selection__media"></div>' +
      '<div class="eaz-guide-selection__text">' +
      '<span class="eaz-guide-selection__title"></span>' +
      '<span class="eaz-guide-selection__meta" hidden></span>' +
      "</div>" +
      '<div class="eaz-guide-selection__tools" role="toolbar" aria-label="Guide tools">' +
      '<button type="button" class="eaz-guide-toolbar__chip is-active" data-tool="click"></button>' +
      '<button type="button" class="eaz-guide-toolbar__chip" data-tool="screenshot"></button>' +
      "</div>" +
      '<button type="button" class="eaz-guide-selection__clear" data-action="clear-selection" aria-label="Clear" hidden>×</button>' +
      "</div>" +
      '<div class="eaz-guide-selection__ask">' +
      '<input type="text" class="eaz-guide-prompt__input" autocomplete="off" />' +
      '<button type="button" class="eaz-guide-prompt__btn" data-action="voice" title="Voice">🎤</button>' +
      '<button type="button" class="eaz-guide-prompt__btn eaz-guide-prompt__btn--send" data-action="send"></button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(ui.dock);

    ui.selectionBar = ui.dock.querySelector(".eaz-guide-selection");
    ui.selectionMedia = ui.dock.querySelector(".eaz-guide-selection__media");
    ui.selectionTitle = ui.dock.querySelector(".eaz-guide-selection__title");
    ui.selectionMeta = ui.dock.querySelector(".eaz-guide-selection__meta");
    ui.selectionClear = ui.dock.querySelector('[data-action="clear-selection"]');
    ui.promptAsk = ui.dock.querySelector(".eaz-guide-selection__ask");
    ui.promptInput = ui.dock.querySelector(".eaz-guide-prompt__input");
    ui.toolbar = ui.dock.querySelector(".eaz-guide-selection__tools");

    if (!ui.screenshotOverlay) {
      ui.screenshotOverlay = document.createElement("div");
      ui.screenshotOverlay.className = "eaz-guide-screenshot-overlay";
      ui.screenshotRect = document.createElement("div");
      ui.screenshotRect.className = "eaz-guide-screenshot-overlay__rect";
      ui.screenshotOverlay.appendChild(ui.screenshotRect);
      document.body.appendChild(ui.screenshotOverlay);
    }
    if (!ui.screenshotPersist) {
      ui.screenshotPersist = document.createElement("div");
      ui.screenshotPersist.className = "eaz-guide-screenshot-persist";
      ui.screenshotPersist.setAttribute("aria-hidden", "true");
      document.body.appendChild(ui.screenshotPersist);
    }
    if (!ui.exitHint) {
      ui.exitHint = document.createElement("div");
      ui.exitHint.className = "eaz-guide-exit-hint";
      document.body.appendChild(ui.exitHint);
    }

    if (ui.toolbar) {
      var clickChip = ui.toolbar.querySelector('[data-tool="click"]');
      var shotChip = ui.toolbar.querySelector('[data-tool="screenshot"]');
      if (clickChip) clickChip.textContent = i18n("creator.guide.tool_click", "Click");
      if (shotChip) shotChip.textContent = i18n("creator.guide.tool_screenshot", "Screenshot");
      ui.toolbar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-tool]");
        if (!btn) return;
        var tool = btn.getAttribute("data-tool");
        if (tool === "click") {
          tools.click = true;
          tools.screenshot = false;
        } else if (tool === "screenshot") {
          tools.screenshot = true;
          tools.click = false;
        }
        syncToolUi();
      });
    }

    setPromptSendMode("send");
    if (ui.promptInput) {
      ui.promptInput.placeholder = i18n("creator.guide.prompt_placeholder", "Ask about what you see…");
    }

    ui.selectionClear.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
    });

    ui.promptAsk.querySelector('[data-action="send"]').addEventListener("click", function () {
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

    ui.promptAsk.querySelector('[data-action="voice"]').addEventListener("click", toggleVoiceInput);

    bindScreenshotOverlay();
  }

  function syncToolUi() {
    if (!tools.click && !tools.screenshot) tools.click = true;
    if (tools.click && tools.screenshot) tools.screenshot = false;
    var root = ui.toolbar || ui.dock;
    if (root) {
      root.querySelectorAll("[data-tool]").forEach(function (btn) {
        var t = btn.getAttribute("data-tool");
        btn.classList.toggle("is-active", !!tools[t]);
      });
    }
    document.documentElement.classList.toggle("eaz-guide-screenshot-active", !!tools.screenshot);
    syncSelectionUi();
    syncExplainUi();
  }

  function inspectTarget(rawTarget) {
    if (!active || !tools.click || tools.screenshot) return;
    var target = findInteractiveTarget(rawTarget);
    if (!target || isInsideGuideUi(target)) return;
    var root = getScopeRoot();
    if (root !== document.body && !root.contains(target)) return;

    var resolved = resolveGuideKey(target);
    session.element = resolved;
    session.screenshot = null;
    clearPersistRect();
    if (promptLocked) clearPrompt();
    setSelectedHighlight(target);
    try {
      navigator.vibrate(15);
    } catch (v) {}
    syncSelectionUi();
    loadRegistry().then(function () {
      syncSelectionUi();
      requestExplain(false);
    });
  }

  function bindGuideInteractionFreeze() {
    if (freezeBound) return;
    freezeBound = true;

    function blockAndInspect(e) {
      if (!active) return;
      if (tools.screenshot) return;
      var t = e.target;
      if (isInsideGuideUi(t)) return;
      if (getSnapTarget(t)) return;

      // Freeze navigation/actions, then explain selection.
      // Important: do NOT preventDefault on pointerdown — that cancels the click event.
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      if (tools.click && (e.type === "click" || e.type === "touchend")) {
        inspectTarget(t);
      }
    }

    document.addEventListener("click", blockAndInspect, true);
    document.addEventListener("touchend", blockAndInspect, { capture: true, passive: false });
    document.addEventListener(
      "auxclick",
      function (e) {
        if (!active || tools.screenshot) return;
        if (isInsideGuideUi(e.target) || getSnapTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
    document.addEventListener(
      "submit",
      function (e) {
        if (!active) return;
        if (isInsideGuideUi(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );

    // Mobile/Android: no hover — briefly highlight the interactive target under the finger.
    var touchFocusEl = null;
    function clearTouchFocus() {
      if (touchFocusEl) {
        touchFocusEl.classList.remove("eazy-guide-touch-focus");
        touchFocusEl = null;
      }
    }
    document.addEventListener(
      "pointerdown",
      function (e) {
        if (!active || tools.screenshot) return;
        if (e.pointerType === "mouse") return;
        if (isInsideGuideUi(e.target) || getSnapTarget(e.target)) return;
        clearTouchFocus();
        var target = findInteractiveTarget(e.target);
        if (!target) return;
        touchFocusEl = target;
        target.classList.add("eazy-guide-touch-focus");
      },
      true
    );
    document.addEventListener(
      "pointerup",
      function () {
        clearTouchFocus();
      },
      true
    );
    document.addEventListener(
      "pointercancel",
      function () {
        clearTouchFocus();
      },
      true
    );
  }

  var screenshotOverlayBound = false;

  function bindScreenshotOverlay() {
    if (screenshotOverlayBound) return;
    screenshotOverlayBound = true;
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
          session.element = null;
          clearGuideHighlights();
          if (promptLocked) clearPrompt();
          syncSelectionUi();
          syncExplainUi();
          // Immediate answer from vision/LLM; prompt remains for follow-up questions.
          requestExplain(false);
        });
      })
      .catch(function () {
        clearPersistRect();
        session.screenshot = null;
        syncSelectionUi();
        syncExplainUi();
        showBubble(i18n("creator.guide.screenshot_failed", "Could not capture screenshot."), false);
      });
  }

  function toggleVoiceInput() {
    if (promptLocked) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = ui.promptAsk && ui.promptAsk.querySelector('[data-action="voice"]');
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
    if (active) {
      showGuideUi();
      return;
    }
    if (!isSnapped()) return;
    ensureUi();
    active = true;
    markExitSuppressed();
    markGuideDoubleClick();
    tools = { click: true, screenshot: false };
    resetSession();
    setGuideFlag(true);
    syncToolUi();
    showGuideUi();
    if (ui.promptInput) {
      ui.promptInput.placeholder = i18n("creator.guide.prompt_placeholder", "Ask about what you see…");
      ui.promptInput.value = "";
      ui.promptInput.readOnly = false;
    }
    if (ui.promptAsk) ui.promptAsk.classList.remove("is-locked");
    setPromptSendMode("send");
    syncSelectionUi();
    syncExplainUi();
    if (ui.exitHint) {
      ui.exitHint.textContent = i18n("creator.guide.exit_hint", "Guide Mode — click Eazy to exit");
    }
    showBubble(
      [
        {
          category: "Guide Mode",
          body: i18n(
            "creator.guide.entered",
            "Guide Mode on! Tap a control for a tip, or ask me about your selection."
          ),
        },
      ],
      false
    );
    loadRegistry().then(function () {
      syncSelectionUi();
    });
    try {
      localStorage.setItem("eazy_guide_discovered", "1");
    } catch (e) {}
  }

  function exitGuideMode() {
    if (!active) return false;
    if (shouldSuppressExit()) return false;
    active = false;
    setGuideFlag(false);
    document.documentElement.classList.remove("eaz-guide-has-explain");
    document.documentElement.classList.remove("eaz-guide-has-selection");
    cleanupScreenshotUi();
    clearGuideHighlights();
    resetSession();
    hideBubble();
    if (ui.promptInput) {
      ui.promptInput.value = "";
      ui.promptInput.readOnly = false;
    }
    if (ui.dock) {
      ui.dock.style.removeProperty("display");
      ui.dock.style.removeProperty("visibility");
    }
    if (ui.promptAsk) ui.promptAsk.classList.remove("is-locked");
    if (ui.selectionBar) {
      ui.selectionBar.classList.remove("has-selection");
    }
    if (ui.exitHint) ui.exitHint.textContent = "";
    return true;
  }

  function showGuideUi() {
    ensureUi();
    if (!ui.dock) return;
    if (!document.body.contains(ui.dock)) document.body.appendChild(ui.dock);
    if (ui.exitHint && !document.body.contains(ui.exitHint)) document.body.appendChild(ui.exitHint);
    if (ui.screenshotOverlay && !document.body.contains(ui.screenshotOverlay)) {
      document.body.appendChild(ui.screenshotOverlay);
    }
    if (ui.screenshotPersist && !document.body.contains(ui.screenshotPersist)) {
      document.body.appendChild(ui.screenshotPersist);
    }
    ui.dock.style.removeProperty("display");
    ui.dock.style.removeProperty("visibility");
    ui.dock.hidden = false;
  }

  function onEazyDoubleClick(e) {
    if (!isSnapped()) return;
    e.preventDefault();
    e.stopPropagation();
    if (active) {
      showGuideUi();
      return;
    }
    enterGuideMode();
  }

  function onEazySingleClick(e) {
    if (!active) return false;
    if (shouldSuppressExit()) return true;
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
    shouldSuppressExit: shouldSuppressExit,
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
    REGISTRY_URL = resolveRegistryUrl();
    bindGuideInteractionFreeze();
    bindTriggers();
    loadRegistry().catch(function () {});
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
