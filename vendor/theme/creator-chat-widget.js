/**
 * Creator Chat Widget - AI Assistent UI
 * Handles panel toggle, messages, rate limit, API calls
 */

(function () {
  "use strict";

  const API_BASE = window.CreatorChatActions ? window.CreatorChatActions.API_BASE : "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  function i18n(key, fallback) {
    var v =
      window.CreatorI18n && window.CreatorI18n[key] != null && window.CreatorI18n[key] !== ""
        ? window.CreatorI18n[key]
        : fallback;
    if (typeof v !== "string") return v !== undefined ? v : fallback;
    var lc = v.toLowerCase();
    if (
      lc.indexOf("translation missing") >= 0 ||
      lc.indexOf("traduction manquante") >= 0 ||
      lc.indexOf("übersetzung fehlt") >= 0
    )
      return fallback;
    return v;
  }

  /* ── Eazy Voice (TTS audio playback) ── */
  var _eazyVoiceMap = {};
  var _eazyVoiceLoaded = false;
  var _eazyVoiceAudio = null;

  function loadEazyVoiceMap() {
    if (_eazyVoiceLoaded) return;
    _eazyVoiceLoaded = true;
    fetch(API_BASE + "?op=eazy-voice")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.audio) _eazyVoiceMap = data.audio;
      })
      .catch(function () {});
  }

  function _setEazySpeaking(on) {
    var msgs = document.querySelectorAll(".creator-chat__msg--assistant");
    var last = msgs.length ? msgs[msgs.length - 1] : null;
    if (last) {
      if (on) last.classList.add("eazy-speaking");
      else last.classList.remove("eazy-speaking");
    }
    var toggle = document.getElementById("creator-chat-toggle");
    if (toggle) {
      if (on) toggle.classList.add("eazy-speaking");
      else toggle.classList.remove("eazy-speaking");
    }
  }

  function isWindowVisiblyActive() {
    if (document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return true;
  }

  function playEazyVoice(messageId) {
    if (window.__eaz_mode_active) return false;
    if (window.EazySettings && !window.EazySettings.get("audio_enabled")) return false;
    if (!isWindowVisiblyActive()) return false;
    if (isEazySnappedInHeader()) return false;
    var entry = _eazyVoiceMap[messageId];
    if (!entry || !entry.audio_url) return false;
    try {
      if (_eazyVoiceAudio) {
        _eazyVoiceAudio.pause();
        _eazyVoiceAudio = null;
        _setEazySpeaking(false);
      }
      _eazyVoiceAudio = new Audio(entry.audio_url);
      var vol = window.EazySettings ? window.EazySettings.get("audio_volume") : 75;
      _eazyVoiceAudio.volume = Math.max(0, Math.min(1, vol / 100));
      _setEazySpeaking(true);
      _eazyVoiceAudio.addEventListener("ended", function () { _setEazySpeaking(false); });
      _eazyVoiceAudio.addEventListener("pause", function () { _setEazySpeaking(false); });
      _eazyVoiceAudio.addEventListener("error", function () { _setEazySpeaking(false); });
      _eazyVoiceAudio.play().catch(function () { _setEazySpeaking(false); });
      return true;
    } catch (e) { _setEazySpeaking(false); return false; }
  }
  window.playEazyVoice = playEazyVoice;

  let messages = [];
  let sessionId = null;
  let conversationId = null;
  let conversationLoaded = false;
  let rateLimit = { remaining: 30, limit: 30, reset_at: 0, reset_in: 0 };
  let limitReached = false;
  let resetTimerInterval = null;

  /* ── Tab / Multi-conversation state ── */
  var _tabs = [];
  var _tabsLoaded = false;
  var CHAT_GREETING_SESSION_KEY = "creator_chat_greeted_conv_v1";
  var CHAT_GUEST_GREETING_SESSION_KEY = "creator_chat_guest_greeted_v1";

  function uid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getSessionId() {
    if (!sessionId) sessionId = uid();
    return sessionId;
  }

  function isEazySnappedInHeader() {
    var toggle = document.getElementById("creator-chat-toggle");
    if (toggle && (toggle.classList.contains("creator-chat__toggle--docked") || toggle.classList.contains("creator-chat__toggle--snap-mode"))) {
      return true;
    }
    var mascot = document.getElementById("eazy-mascot");
    if (mascot && mascot.classList.contains("eazy-mascot--docked")) return true;
    var sm = document.getElementById("eazy-snap-slot--mobile");
    var sd = document.getElementById("eazy-snap-slot--desktop");
    if ((sm && sm.classList.contains("is-docked")) || (sd && sd.classList.contains("is-docked"))) return true;
    if (document.body && document.body.classList.contains("eazy-header-docked")) return true;
    try {
      if (localStorage.getItem("eazy_mascot_docked") === "1") return true;
      if (localStorage.getItem("eazy_docked") === "true") return true;
    } catch (e) {}
    return false;
  }

  function readSessionGreetingMap() {
    try {
      var raw = sessionStorage.getItem(CHAT_GREETING_SESSION_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function hasSessionGreetingForConversation(convId) {
    if (!convId) return false;
    var map = readSessionGreetingMap();
    return map[convId] === 1;
  }

  function markSessionGreetingForConversation(convId) {
    if (!convId) return;
    var map = readSessionGreetingMap();
    map[convId] = 1;
    try { sessionStorage.setItem(CHAT_GREETING_SESSION_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function hasGuestGreetingInSession() {
    try { return sessionStorage.getItem(CHAT_GUEST_GREETING_SESSION_KEY) === "1"; } catch (e) { return false; }
  }

  function markGuestGreetingInSession() {
    try { sessionStorage.setItem(CHAT_GUEST_GREETING_SESSION_KEY, "1"); } catch (e) {}
  }

  var _convMergeTriggered = false;

  function isGuestUser() {
    return !!window.__EAZY_GUEST;
  }

  function getUserId() {
    var realId;
    if (window.EazyBot && window.EazyBot.getUserId) {
      realId = window.EazyBot.getUserId();
    } else if (window.__EAZ_OWNER_ID) {
      realId = String(window.__EAZ_OWNER_ID);
    }

    if (realId) {
      tryMergeWidgetAnon(realId);
      return realId;
    }

    try {
      var id = localStorage.getItem("eazy_user_id");
      if (id) return id;
      id = uid();
      localStorage.setItem("eazy_user_id", id);
      return id;
    } catch (e) { return uid(); }
  }

  function tryMergeWidgetAnon(customerId) {
    if (_convMergeTriggered) return;
    var anonId;
    try { anonId = localStorage.getItem("eazy_user_id"); } catch (e) { return; }
    if (!anonId || anonId === customerId) {
      try { localStorage.setItem("eazy_user_id", customerId); } catch (e) {}
      return;
    }
    _convMergeTriggered = true;
    fetch(API_BASE + "?op=eazy-conv&merge=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ anon_id: anonId, customer_id: customerId })
    }).then(function () {
      try { localStorage.setItem("eazy_user_id", customerId); } catch (e) {}
    }).catch(function () {});
  }

  function getPagePath() {
    return window.location.pathname || "/";
  }

  function getLocale() {
    return (document.documentElement && document.documentElement.lang) || "en";
  }

  /* ── Product Context (from product page DOM) ── */
  function getProductContext() {
    if (!(window.location.pathname || "").startsWith("/products/")) return null;
    var el = document.querySelector('[data-product-json], script[type="application/json"][data-product-json]');
    if (el) {
      try {
        var p = JSON.parse(el.textContent);
        return { title: (p.title || "").slice(0, 120), type: p.type || null, vendor: p.vendor || null, price: p.price, handle: p.handle };
      } catch (e) {}
    }
    var titleMeta = document.querySelector('meta[property="og:title"]');
    var priceMeta = document.querySelector('meta[property="og:price:amount"]');
    return {
      title: titleMeta ? titleMeta.getAttribute("content") : null,
      price: priceMeta ? priceMeta.getAttribute("content") : null,
      handle: (window.location.pathname || "").replace("/products/", "").split("?")[0]
    };
  }

  /* ── Cart Polling ── */
  var _cartData = null;
  var _cartTimer = null;

  function fetchCart() {
    fetch("/cart.json").then(function (r) { return r.json(); }).then(function (data) {
      _cartData = {
        item_count: data.item_count || 0,
        total_price: ((data.total_price || 0) / 100).toFixed(2),
        currency: data.currency || "EUR",
        items: (data.items || []).slice(0, 5).map(function (i) {
          return { title: i.title, quantity: i.quantity, price: ((i.price || 0) / 100).toFixed(2), variant_title: i.variant_title || null };
        })
      };
    }).catch(function () {});
  }

  function startCartPolling() {
    fetchCart();
    _cartTimer = setInterval(fetchCart, 30000);
  }

  function stopCartPolling() {
    if (_cartTimer) clearInterval(_cartTimer);
    _cartTimer = null;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Design Ready Choice Phrases ── */
  var CHOICE_GENERATE = [
    i18n("chat_choice_generate_1", "Let's get started!"),
    i18n("chat_choice_generate_2", "Alright, go for it!"),
    i18n("chat_choice_generate_3", "Let's do it!"),
    i18n("chat_choice_generate_4", "Work your magic, Eazy!"),
    i18n("chat_choice_generate_5", "Let's go!"),
    i18n("chat_choice_generate_6", "Launch it!"),
    i18n("chat_choice_generate_7", "Show me some magic!"),
    i18n("chat_choice_generate_8", "Run it, Eazy!"),
    i18n("chat_choice_generate_9", "Full speed ahead!"),
    i18n("chat_choice_generate_10", "Let's do this!")
  ];
  var CHOICE_ADJUST = [
    i18n("chat_choice_adjust_1", "I am not done yet"),
    i18n("chat_choice_adjust_2", "Hold on, one more tweak"),
    i18n("chat_choice_adjust_3", "I want to adjust a bit more"),
    i18n("chat_choice_adjust_4", "Quick step back, please"),
    i18n("chat_choice_adjust_5", "Let me review once more"),
    i18n("chat_choice_adjust_6", "Almost there, not yet"),
    i18n("chat_choice_adjust_7", "Just one small thing..."),
    i18n("chat_choice_adjust_8", "I have another idea"),
    i18n("chat_choice_adjust_9", "Wait, something is missing"),
    i18n("chat_choice_adjust_10", "One final polish!")
  ];
  var CHOICE_CANCEL = [
    i18n("chat_choice_cancel_1", "I changed my mind"),
    i18n("chat_choice_cancel_2", "Not in the mood right now"),
    i18n("chat_choice_cancel_3", "I will try again later"),
    i18n("chat_choice_cancel_4", "Not today, Eazy"),
    i18n("chat_choice_cancel_5", "Maybe another time"),
    i18n("chat_choice_cancel_6", "I need inspiration first"),
    i18n("chat_choice_cancel_7", "Taking a break for today"),
    i18n("chat_choice_cancel_8", "No, let's skip it"),
    i18n("chat_choice_cancel_9", "My brain says no"),
    i18n("chat_choice_cancel_10", "It was just a test")
  ];

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ── Generation Animation State ── */
  var GEN_QUOTES = [
    i18n("chat_gen_quote_1", "Your masterpiece will be ready in a few seconds!"),
    i18n("chat_gen_quote_2", "Da Vinci is getting to work..."),
    i18n("chat_gen_quote_3", "Picasso would be impressed!"),
    i18n("chat_gen_quote_4", "Michelangelo rolled up his sleeves."),
    i18n("chat_gen_quote_5", "Banksy would approve!"),
    i18n("chat_gen_quote_6", "Van Gogh picked up the brush..."),
    i18n("chat_gen_quote_7", "Andy Warhol could not do it better!"),
    i18n("chat_gen_quote_8", "Frida Kahlo nods in approval."),
    i18n("chat_gen_quote_9", "Monet is already mixing colors..."),
    i18n("chat_gen_quote_10", "Rembrandt is studying your draft."),
    i18n("chat_gen_quote_11", "Salvador Dali calls this beautifully surreal!"),
    i18n("chat_gen_quote_12", "Keith Haring is dancing with joy!"),
    i18n("chat_gen_quote_13", "Bob Ross: 'Happy little design!'"),
    i18n("chat_gen_quote_14", "Basquiat vibes with your style."),
    i18n("chat_gen_quote_15", "Klimt is bringing out the gold.")
  ];
  var GEN_DONE_QUOTES = [
    i18n("chat_gen_done_quote_1", "Ta-da! Your design is ready!"),
    i18n("chat_gen_done_quote_2", "Voila - a masterpiece!"),
    i18n("chat_gen_done_quote_3", "Done! Even Picasso applauds."),
    i18n("chat_gen_done_quote_4", "Your design is fresh out of the oven!")
  ];
  var _genActiveJobId = null;
  var _genStartTime = null;
  var _genTimerInterval = null;
  var _genBubbleInterval = null;
  var _genLastQuoteIdx = -1;
  var GEN_PERSIST_KEY = "eazy_gen_active";
  var GEN_COMPLETE_KEY = "eazy_gen_complete";
  var _genCompletedJobId = null;

  function pickGenQuote() {
    var idx;
    do { idx = Math.floor(Math.random() * GEN_QUOTES.length); } while (idx === _genLastQuoteIdx && GEN_QUOTES.length > 1);
    _genLastQuoteIdx = idx;
    playEazyVoice("gen_quote_" + (idx + 1));
    return GEN_QUOTES[idx];
  }

  var _rateFlashTimer = null;

  function flashRateLimit() {
    var el = document.getElementById("creator-chat-rate-limit");
    if (!el) return;
    if (_genActiveJobId) return;
    if (_rateFlashTimer) clearTimeout(_rateFlashTimer);
    el.classList.add("is-visible");
    _rateFlashTimer = setTimeout(function () {
      el.classList.remove("is-visible");
      _rateFlashTimer = null;
    }, 3000);
  }

  function updateRateLimitUI(rl) {
    if (!rl) return;
    rateLimit = rl;
    const remaining = Math.max(0, rl.remaining);
    const limit = rl.limit || 30;

    const remainingEl = document.getElementById("creator-chat-remaining");
    const limitEl = document.getElementById("creator-chat-limit");
    const barEl = document.getElementById("creator-chat-bar-fill");
    const timerEl = document.getElementById("creator-chat-reset-timer");

    if (remainingEl) remainingEl.textContent = remaining;
    if (limitEl) limitEl.textContent = limit;

    const pct = limit > 0 ? (remaining / limit) * 100 : 0;
    if (barEl) {
      barEl.style.width = pct + "%";
      barEl.classList.remove("creator-chat__rate-fill--low", "creator-chat__rate-fill--empty");
      if (pct <= 10) barEl.classList.add("creator-chat__rate-fill--empty");
      else if (pct <= 30) barEl.classList.add("creator-chat__rate-fill--low");
    }

    let secs = rl.reset_in || (rl.reset_at ? Math.max(0, rl.reset_at - Math.floor(Date.now() / 1000)) : 0);
    function tick() {
      if (secs <= 0) {
        if (timerEl) timerEl.textContent = "0:00";
        return;
      }
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      if (timerEl) timerEl.textContent = m + ":" + String(s).padStart(2, "0");
      secs--;
    }
    tick();
    if (resetTimerInterval) clearInterval(resetTimerInterval);
    resetTimerInterval = setInterval(tick, 1000);
  }

  function setLimitReached(reached, resetAt, resetIn) {
    limitReached = !!reached;
    window.__CREATOR_CHAT_LIMIT_REACHED = limitReached;
    try {
      if (limitReached) sessionStorage.setItem("creator_chat_limit_reached", "1");
      else sessionStorage.removeItem("creator_chat_limit_reached");
    } catch (e) {}
    if (limitReached) {
      window.__CREATOR_CHAT_RESET_AT = resetAt;
      window.__CREATOR_CHAT_RESET_IN = resetIn;
      document.body.classList.add("creator-chat-limit-reached");
      window.dispatchEvent(new CustomEvent("creator-chat-limit-reached", { detail: { reset_at: resetAt, reset_in: resetIn } }));
    } else {
      window.__CREATOR_CHAT_LIMIT_REACHED = false;
      document.body.classList.remove("creator-chat-limit-reached");
    }
  }

  function showLimitModal(resetAt, resetIn) {
    const modal = document.getElementById("creator-chat-limit-modal");
    const resetSpan = document.getElementById("creator-chat-limit-reset");
    if (!modal || !resetSpan) return;

    let secs = resetIn || (resetAt ? Math.max(0, resetAt - Math.floor(Date.now() / 1000)) : 0);
    function tick() {
      if (secs <= 0) {
        resetSpan.textContent = "0:00";
        return;
      }
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      resetSpan.textContent = m + ":" + String(s).padStart(2, "0");
      secs--;
    }
    tick();
    const iv = setInterval(tick, 1000);
    document.getElementById("creator-chat-limit-ok").addEventListener("click", function closeLimitModal() {
      clearInterval(iv);
      modal.setAttribute("aria-hidden", "true");
    }, { once: true });

    modal.setAttribute("aria-hidden", "false");
  }

  /* ── Persist message to EAZY_DB (fire-and-forget) ── */
  function persistMessage(role, content, msgType) {
    if (!conversationId) return;
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        user_id: userId,
        conversation_id: conversationId,
        role: role,
        content: content,
        message_type: msgType || "system"
      })
    }).catch(function () {});
  }

  var EAZY_AVATAR_HTML = '<div class="creator-chat__avatar">'
    + '<svg viewBox="0 0 128 128" aria-hidden="true">'
    + '<defs><linearGradient id="chat-av-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a2a"/><stop offset="1" stop-color="var(--chat-accent, #f97316)"/></linearGradient></defs>'
    + '<path d="M30 62c0-26 20-44 44-44 22 0 38 16 38 38 0 25-19 44-44 44-5 0-10-.8-14.5-2.2l-16.5 9.2 5.8-16.8C35.7 83 30 73.2 30 62Z" fill="url(#chat-av-grad)"/>'
    + '<path d="M56 39c-15 6-24 20-24 35 0 19 16 34 36 34 20 0 36-16 36-36 0-21-17-38-38-38-4.3 0-8.4.7-10 .9Z" fill="#fff"/>'
    + '<circle cx="72" cy="58" r="5.5" fill="var(--chat-accent, #f97316)"/>'
    + '<circle cx="90" cy="50" r="4.5" fill="var(--chat-accent, #f97316)"/>'
    + '<ellipse class="eazy-av-mouth" cx="79" cy="72" rx="6" ry="4.5" fill="var(--chat-accent, #f97316)"/>'
    + '<circle cx="50" cy="28" r="7" fill="url(#chat-av-grad)"/>'
    + '</svg></div>';

  function toEnglishUiText(text) {
    if (!text || typeof text !== "string") return text;
    var out = text;
    var replacements = [
      [/Alles klar! Ich bin weiterhin hier, wenn du Hilfe brauchst\./g, "All good! I am still here if you need help."],
      [/Fehler beim Laden/g, "Error loading"],
      [/Fehler beim Speichern/g, "Error saving"],
      [/Fehler beim Löschen/g, "Error deleting"],
      [/Fehler beim Übertragen/g, "Error transferring"],
      [/Unbekannter Fehler/g, "Unknown error"],
      [/Auf welche Produkte möchtest du veröffentlichen\?/g, "Which products do you want to publish to?"],
      [/Alle Produkte/g, "All products"],
      [/Produkte auswählen/g, "Select products"],
      [/Produkt wirklich löschen\?/g, "Delete this product?"],
      [/Zum Warenkorb hinzugefügt!/g, "Added to cart!"],
      [/Zum Warenkorb/g, "To cart"],
      [/In den Warenkorb/g, "Add to cart"],
      [/Aus Favoriten entfernt\./g, "Removed from favorites."],
      [/zu Favoriten hinzugefügt!/g, "added to favorites!"],
      [/Zu Favoriten/g, "To favorites"],
      [/Öffentlich/g, "Public"],
      [/Privat/g, "Private"],
      [/Speichern/g, "Save"],
      [/Abbrechen/g, "Cancel"],
      [/Schließen/g, "Close"],
      [/Zurück/g, "Back"],
      [/Weiter/g, "Next"],
      [/Wird gelöscht\.\.\./g, "Deleting..."]
    ];
    for (var i = 0; i < replacements.length; i++) out = out.replace(replacements[i][0], replacements[i][1]);
    return out;
  }

  function appendMessage(role, content, opts) {
    if (window.__eaz_mode_active) return null;
    opts = opts || {};
    var container = document.getElementById("creator-chat-messages");
    if (!container) return null;
    removeTypingIndicator();
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--" + role;
    var html = "";
    if (role === "assistant") {
      html += EAZY_AVATAR_HTML;
      content = toEnglishUiText(content);
    }
    html += '<div class="creator-chat__bubble creator-chat__bubble--' + role + '">' + escapeHtml(content).replace(/\n/g, "<br>") + '</div>';
    msg.innerHTML = html;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    if (opts.persist !== false && !opts.skipPersist) {
      persistMessage(role, content, opts.msgType || "system");
    }
    messages.push({ role: role, content: content });
    return msg;
  }

  function showTypingIndicator() {
    if (window.__eaz_mode_active) return;
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    if (document.getElementById("creator-chat-typing")) return;
    var el = document.createElement("div");
    el.id = "creator-chat-typing";
    el.className = "creator-chat__msg creator-chat__msg--assistant creator-chat__typing";
    el.innerHTML = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant"><span class="creator-chat__typing-dot"></span><span class="creator-chat__typing-dot"></span><span class="creator-chat__typing-dot"></span></div>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function removeTypingIndicator() {
    var el = document.getElementById("creator-chat-typing");
    if (el) el.remove();
  }

  /* ── Interactive Action Buttons in chat messages ── */
  function appendActionMessage(text, buttons) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    removeTypingIndicator();
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += escapeHtml(toEnglishUiText(text)).replace(/\n/g, "<br>");
    html += '<div class="creator-chat__actions">';
    buttons.forEach(function (btn) {
      html += '<button class="creator-chat__action-btn" data-action="' + escapeHtml(btn.action) + '"'
        + (btn.params ? ' data-params="' + escapeHtml(JSON.stringify(btn.params)) + '"' : '')
        + '>' + escapeHtml(toEnglishUiText(btn.label)) + '</button>';
    });
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btnEl) {
      btnEl.addEventListener("click", function () {
        var action = this.getAttribute("data-action");
        var params = {};
        try { params = JSON.parse(this.getAttribute("data-params") || "{}"); } catch (e) {}

        var actionsDiv = msg.querySelector(".creator-chat__actions");
        if (actionsDiv) {
          actionsDiv.innerHTML = '<span class="creator-chat__action-chosen">' + escapeHtml(this.textContent) + '</span>';
        }

        handleActionButton(action, params);
      });
    });

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function handleActionButton(action, params) {
    if (action === "connect_support") {
      activateSupportMode(params.reason || "");
    } else if (action === "cancel_support") {
      appendMessage("assistant", "Alright! I am still here if you need help.");
    } else if (action === "support_survey_solved") {
      supportSurveyData.solved = !!params.value;
      appendMessage("user", params.value ? i18n("support_yes", "Yes") : i18n("support_no", "No"), { skipPersist: true });
      supportSurveyStep = "rating";
      appendSupportStarRating();
    } else if (action === "support_survey_feedback") {
      appendMessage("user", params.value ? i18n("support_yes", "Yes") : i18n("support_no", "No"), { skipPersist: true });
      if (params.value) {
        supportSurveyStep = "feedback_text";
        appendMessage("assistant", i18n("chat_support_feedback_prompt", "Please write your message below."), { skipPersist: true });
      } else {
        submitSupportSurvey(null);
      }
    } else if (window.CreatorChatActions) {
      window.CreatorChatActions.execute(action, params);
    }
  }

  /* ── Show Options (A/B/C/D conversational choices) ── */
  function renderShowOptions(text, optionsData) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    removeTypingIndicator();
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += escapeHtml(text).replace(/\n/g, "<br>");
    html += '<div class="creator-chat__flow-options">';
    var opts = optionsData.options || [];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      html += '<button type="button" class="creator-chat__flow-option-btn" data-value="' + escapeHtml(o.value) + '">';
      html += '<span class="creator-chat__flow-option-key">' + escapeHtml(o.key.toUpperCase()) + '</span>';
      html += '<span class="creator-chat__flow-option-label">' + escapeHtml(o.label) + '</span>';
      html += '</button>';
    }
    if (optionsData.allow_custom) {
      html += '<button type="button" class="creator-chat__flow-option-btn creator-chat__flow-option-btn--custom" data-value="__custom__">';
      html += '<span class="creator-chat__flow-option-key">D</span>';
      html += '<span class="creator-chat__flow-option-label">Custom choice</span>';
      html += '</button>';
    }
    html += '</div></div>';
    msg.innerHTML = html;

    var isImageSelection = !!optionsData._imageUploadSelection;
    var isPublishProductSelection = !!optionsData._publishProductSelection;
    msg.querySelectorAll(".creator-chat__flow-option-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-value");
        var chosenLabel = btn.querySelector(".creator-chat__flow-option-label");
        var optionsDiv = msg.querySelector(".creator-chat__flow-options");
        if (optionsDiv) {
          optionsDiv.innerHTML = '<span class="creator-chat__action-chosen">' + escapeHtml(chosenLabel ? chosenLabel.textContent : val) + '</span>';
        }
        if (isImageSelection && val && val !== "__custom__") {
          startChatFunction(val);
          return;
        }
        if (isPublishProductSelection) {
          if (val === "__all_products__") {
            doPublish(_publishSelectedDesignId, ["all"]);
          } else if (val === "__select_products__") {
            loadProductGridForPublish();
          }
          return;
        }
        if (val === "__custom__") {
          var input = document.getElementById("creator-chat-input");
          if (input) { input.focus(); input.placeholder = i18n("chatEnterSelection", "Enter your selection..."); }
        } else if (val && val.indexOf("pc-") === 0) {
          handlePromoSubAction(val);
        } else if (val && val.indexOf("gc-") === 0) {
          handleGiftCardSubAction(val);
        } else {
          sendMessage(chosenLabel ? chosenLabel.textContent : val);
        }
      });
    });

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Confirm Flow (Start / Discuss / Cancel) ── */
  function renderConfirmFlow(text, flowParams) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    removeTypingIndicator();
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += escapeHtml(text).replace(/\n/g, "<br>");
    html += '<div class="creator-chat__flow-confirm">';
    html += '<button type="button" class="creator-chat__flow-confirm-btn creator-chat__flow-confirm-btn--go" data-choice="go">Start</button>';
    html += '<button type="button" class="creator-chat__flow-confirm-btn creator-chat__flow-confirm-btn--discuss" data-choice="discuss">Discuss again</button>';
    html += '<button type="button" class="creator-chat__flow-confirm-btn creator-chat__flow-confirm-btn--cancel" data-choice="cancel">Cancel</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__flow-confirm-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var choice = btn.getAttribute("data-choice");
        var confirmDiv = msg.querySelector(".creator-chat__flow-confirm");
        var chosenLabel = btn.textContent;
        if (confirmDiv) {
          confirmDiv.innerHTML = '<span class="creator-chat__action-chosen">' + escapeHtml(chosenLabel) + '</span>';
        }
        if (choice === "go") {
          executeFlowFunction(flowParams.function_id, flowParams.collected_params);
        } else if (choice === "discuss") {
          sendMessage("I want to change something again.");
        } else if (choice === "cancel") {
          appendMessage("assistant", i18n("chatCancelledWhatNext", "Alright, cancelled! What would you like to do instead?"));
        }
      });
    });

    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Scrollable Inline Grid (designs, products, etc.) ── */
  function renderChatGrid(config) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var items = config.items || [];
    var mode = config.mode || "single";
    var emptyText = config.emptyText || i18n("chatNoEntriesFound", "No entries found.");
    var selected = {};

    var wrapper = document.createElement("div");
    wrapper.className = "creator-chat__inline-grid";

    if (!items.length) {
      wrapper.innerHTML = '<div class="creator-chat__inline-grid__empty">' + escapeHtml(emptyText) + '</div>';
      container.appendChild(wrapper);
      container.scrollTop = container.scrollHeight;
      return;
    }

    var scroll = document.createElement("div");
    scroll.className = "creator-chat__inline-grid__scroll";
    var grid = document.createElement("div");
    grid.className = "creator-chat__inline-grid__grid";

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var card = document.createElement("div");
      card.className = "creator-chat__inline-grid__item";
      card.setAttribute("data-grid-id", it.id || i);
      var html = '';
      if (it.image_url) {
        html += '<img class="creator-chat__inline-grid__img" src="' + escapeHtml(it.image_url) + '" alt="" loading="lazy">';
      }
      if (it.badge) {
        html += '<span class="creator-chat__inline-grid__badge">' + escapeHtml(it.badge) + '</span>';
      }
      if (mode === "multi") {
        html += '<span class="creator-chat__inline-grid__check"></span>';
      }
      if (it.label) {
        html += '<span class="creator-chat__inline-grid__label">' + escapeHtml(it.label) + '</span>';
      }
      card.innerHTML = html;
      grid.appendChild(card);
    }
    scroll.appendChild(grid);
    wrapper.appendChild(scroll);

    if (mode === "multi") {
      var bar = document.createElement("div");
      bar.className = "creator-chat__inline-grid__confirm-bar";
      bar.innerHTML = '<span class="creator-chat__inline-grid__count">' + i18n("chatSelectedCount", "0 selected") + '</span>' +
        '<button type="button" class="creator-chat__inline-grid__confirm-btn" disabled>' + i18n("chatConfirm", "Confirm") + '</button>';
      wrapper.appendChild(bar);
    }

    wrapper.addEventListener("click", function (e) {
      var item = e.target.closest(".creator-chat__inline-grid__item");
      if (!item) return;
      var gid = item.getAttribute("data-grid-id");

      if (mode === "single") {
        wrapper.querySelectorAll(".creator-chat__inline-grid__item--selected").forEach(function (el) {
          el.classList.remove("creator-chat__inline-grid__item--selected");
        });
        item.classList.add("creator-chat__inline-grid__item--selected");
        selected = {};
        selected[gid] = true;
        var selItem = null;
        for (var s = 0; s < items.length; s++) {
          if (String(items[s].id || s) === gid) { selItem = items[s]; break; }
        }
        if (config.onSelect) config.onSelect([selItem]);
      } else {
        item.classList.toggle("creator-chat__inline-grid__item--selected");
        if (selected[gid]) { delete selected[gid]; } else { selected[gid] = true; }
        var cnt = Object.keys(selected).length;
        var countEl = wrapper.querySelector(".creator-chat__inline-grid__count");
        var confirmBtnEl = wrapper.querySelector(".creator-chat__inline-grid__confirm-btn");
        if (countEl) countEl.textContent = cnt + " " + i18n("chatSelectedSuffix", "selected");
        if (confirmBtnEl) confirmBtnEl.disabled = cnt === 0;
      }
    });

    if (mode === "multi") {
      var cBtn = wrapper.querySelector(".creator-chat__inline-grid__confirm-btn");
      if (cBtn) {
        cBtn.addEventListener("click", function () {
          var ids = Object.keys(selected);
          var result = items.filter(function (it, idx) { return selected[String(it.id || idx)]; });
          cBtn.disabled = true;
          cBtn.textContent = i18n("chatConfirmed", "Confirmed") + " \u2713";
          wrapper.querySelectorAll(".creator-chat__inline-grid__item").forEach(function (el) {
            el.style.pointerEvents = "none";
          });
          if (config.onConfirm) config.onConfirm(result);
        });
      }
    }

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Stats Message (formatted key-value display) ── */
  function renderStatsMessage(text, data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    removeTypingIndicator();
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += escapeHtml(text).replace(/\n/g, "<br>");
    if (data && data.stats) {
      html += '<div class="creator-chat__stats-grid">';
      for (var i = 0; i < data.stats.length; i++) {
        var s = data.stats[i];
        html += '<div class="creator-chat__stats-item">';
        html += '<span class="creator-chat__stats-value">' + escapeHtml(String(s.value)) + '</span>';
        html += '<span class="creator-chat__stats-label">' + escapeHtml(s.label) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    msg.innerHTML = html;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Interests Panel (categorized toggleable chips) ── */
  function renderInterestsPanel(data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var categories = data.categories || [];
    var selectedIds = {};
    (data.selected_ids || []).forEach(function (id) { selectedIds[id] = true; });

    var wrapper = document.createElement("div");
    wrapper.className = "creator-chat__inline-interests";

    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c];
      var sec = document.createElement("div");
      sec.className = "creator-chat__interests-cat";
      sec.innerHTML = '<div class="creator-chat__interests-cat-title">' + escapeHtml(cat.label) + '</div>';
      var chips = document.createElement("div");
      chips.className = "creator-chat__interests-chips";
      var items = cat.interests || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "creator-chat__interests-chip" + (selectedIds[it.id] ? " creator-chat__interests-chip--active" : "");
        chip.setAttribute("data-interest-id", it.id);
        chip.textContent = it.name;
        chips.appendChild(chip);
      }
      sec.appendChild(chips);
      wrapper.appendChild(sec);
    }

    var footer = document.createElement("div");
    footer.className = "creator-chat__interests-footer";
    footer.innerHTML = '<div class="creator-chat__interests-add">' +
      '<input type="text" class="creator-chat__interests-add-input" placeholder="Neue Interesse hinzuf\u00fcgen\u2026" maxlength="50">' +
      '<button type="button" class="creator-chat__interests-add-btn" disabled>Vorschlagen</button>' +
      '</div>' +
      '<button type="button" class="creator-chat__interests-save-btn" disabled>Best\u00e4tigen</button>';
    wrapper.appendChild(footer);

    wrapper.addEventListener("click", function (e) {
      var chip = e.target.closest(".creator-chat__interests-chip");
      if (!chip) return;
      var iid = chip.getAttribute("data-interest-id");
      chip.classList.toggle("creator-chat__interests-chip--active");
      if (selectedIds[iid]) { delete selectedIds[iid]; } else { selectedIds[iid] = true; }
      var saveBtn = wrapper.querySelector(".creator-chat__interests-save-btn");
      if (saveBtn) saveBtn.disabled = false;
    });

    var addInput = wrapper.querySelector(".creator-chat__interests-add-input");
    var addBtn = wrapper.querySelector(".creator-chat__interests-add-btn");
    if (addInput && addBtn) {
      addInput.addEventListener("input", function () {
        addBtn.disabled = !addInput.value.trim();
      });
      addBtn.addEventListener("click", function () {
        var term = addInput.value.trim();
        if (!term) return;
        addBtn.disabled = true;
        addBtn.textContent = "\u2026";
        sendMessage("Interesse hinzuf\u00fcgen: " + term);
        addInput.value = "";
        addBtn.textContent = "Vorschlagen";
      });
    }

    var saveBtn = wrapper.querySelector(".creator-chat__interests-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        saveBtn.disabled = true;
        saveBtn.textContent = "Wird gespeichert\u2026";
        var ids = Object.keys(selectedIds).map(function (id) { return parseInt(id, 10); }).filter(function (n) { return !isNaN(n); });
        fetch(API_BASE + "?op=set-user-interests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ owner_id: getUserId(), interest_ids: ids }),
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          saveBtn.textContent = i18n("chatSaved", "Saved") + " \u2713";
          wrapper.querySelectorAll(".creator-chat__interests-chip").forEach(function (el) {
            el.style.pointerEvents = "none";
          });
          appendMessage("assistant", i18n("chatInterestsUpdated", "Your interests were updated!") + " " + ids.length + " " + i18n("chatInterestsSavedSuffix", "interests saved."));
        })
        .catch(function () {
          saveBtn.textContent = i18n("chatErrorRetry", "Error - retry");
          saveBtn.disabled = false;
        });
      });
    }

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Execute a function from the conversational flow ── */
  function executeFlowFunction(functionId, params) {
    if (functionId === "generate-design") {
      _designData = {
        target_product: params.target_product || "all",
        design_type: params.design_type || "classic",
        prompt: params.prompt || "",
        image_url: params.image_url || _pendingUploadImage || null,
        ratio: params.ratio || "portrait",
        content_type: params.content_type || "design-text",
        background: params.background || { mode: "transparent" },
        language: params.language || { mode: "as-design" },
        styles: params.styles || [],
        design_colors: params.design_colors || []
      };
      _pendingUploadImage = null;
      appendMessage("assistant", i18n("chatGenerationStarting", "Great! Eazy is starting the generation now..."));
      setTimeout(function () { animateEazyBounceToInput(); }, 400);
    } else if (functionId === "publish") {
      appendMessage("assistant", i18n("chatPublishingStarting", "Publishing is starting..."));
      setTimeout(function () { animateEazyBounceToInput(); }, 400);
    } else if (functionId === "interests" || functionId === "community" || functionId === "my-creations"
               || functionId === "my-products" || functionId === "active-jobs" || functionId === "favorites"
               || functionId === "gift-cards" || functionId === "promo-codes"
               || functionId === "my-orders" || functionId === "product-search"
               || functionId === "browse-shop" || functionId === "size-ai"
               || functionId === "wardrobe"
               || functionId === "my-mockups" || functionId === "hero-images"
               || functionId === "creator-image" || functionId === "creator-settings"
               || functionId === "balance" || functionId === "level"
               || functionId === "mentor-support") {
      startChatFunction(functionId);
    } else {
      appendMessage("assistant", i18n("chatFunctionSoonPrefix", "The function") + " \"" + escapeHtml(functionId) + "\" " + i18n("chatFunctionSoonSuffix", "will be available soon!"));
    }
  }

  /* ── Support Mode ── */
  var supportMode = false;
  var supportSurveyActive = false;
  var supportSurveyStep = null;
  var supportSurveyData = { solved: null, rating: null, feedback: null };
  var supportAgentOnline = false;
  var supportPollTimer = null;
  var lastSupportMsgId = 0;
  var _convSupportMeta = { mode: "ai", support_status: null, support_first_reply_at: null };
  var SUPPORT_AGENT_NAME = i18n("support_agent_name", "Tobias");

  function isLiveSupportActive() {
    return supportMode && _convSupportMeta.support_status !== "resolved" && _convSupportMeta.support_status !== "closed";
  }

  function syncConvSupportMeta(conv) {
    if (!conv) return;
    _convSupportMeta.mode = conv.mode || "ai";
    _convSupportMeta.support_status = conv.support_status || null;
    _convSupportMeta.support_first_reply_at = conv.support_first_reply_at || null;
    if (_convSupportMeta.support_first_reply_at) supportAgentOnline = true;
  }

  function markTabSupportMode(active) {
    for (var i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === conversationId) {
        _tabs[i].mode = active ? "support" : "ai";
        _tabs[i].support_status = active ? (_tabs[i].support_status || "open") : "closed";
      }
    }
  }

  function applySupportChrome() {
    var titleEl = document.querySelector(".creator-chat__title");
    var backBtn = document.getElementById("creator-chat-back-to-eazy");
    var floatEl = document.getElementById("creator-chat-support-float");
    var agentNameEl = document.getElementById("creator-chat-support-agent-name");

    if (titleEl) {
      titleEl.textContent = isLiveSupportActive()
        ? i18n("chatSupportTitle", "Live Support")
        : i18n("chatAssistantTitle", "Eazpire Assistant");
    }
    if (backBtn) {
      backBtn.style.display = (supportMode && !supportSurveyActive) ? "none" : (supportMode ? "" : "none");
    }
    if (agentNameEl) agentNameEl.textContent = SUPPORT_AGENT_NAME;
    if (floatEl) floatEl.hidden = !(supportAgentOnline && isLiveSupportActive());
    renderTabs();
  }

  function restoreSupportFromServer(conv) {
    if (!conv || conv.mode !== "support") return;
    syncConvSupportMeta(conv);
    if (conv.support_status === "closed") return;
    if (conv.support_status === "resolved") {
      if (!supportSurveyActive) startSupportSurvey();
      return;
    }
    supportMode = true;
    markTabSupportMode(true);
    applySupportChrome();
    startSupportPolling();
  }

  function activateSupportMode(reason) {
    if (supportMode && isLiveSupportActive()) return;
    supportMode = true;
    supportAgentOnline = false;
    _convSupportMeta.mode = "support";
    _convSupportMeta.support_status = "open";
    markTabSupportMode(true);
    applySupportChrome();

    appendMessage("assistant", i18n("chatSupportConnected", "You are now connected to support. Write your message and we will reply as soon as possible."));

    if (conversationId) {
      fetch(API_BASE + "?op=eazy-conv&support=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: getUserId(),
          conversation_id: conversationId,
          role: "system",
          content: i18n("chatSupportRequestPrefix", "Support request: ") + (reason || i18n("chatUserWantsSupport", "User wants to speak to support")),
          message_type: "support"
        })
      }).catch(function () {});
    }

    startSupportPolling();
  }

  function deactivateSupportMode() {
    if (supportSurveyActive) return;
    supportMode = false;
    supportAgentOnline = false;
    _convSupportMeta.mode = "ai";
    _convSupportMeta.support_status = null;
    _convSupportMeta.support_first_reply_at = null;
    stopSupportPolling();
    markTabSupportMode(false);
    applySupportChrome();
    appendMessage("assistant", i18n("chatBackToEazy", "You are connected with Eazy again. How can I help you?"));
  }

  function onSupportEndedByAgent() {
    supportMode = false;
    supportAgentOnline = false;
    _convSupportMeta.support_status = "resolved";
    applySupportChrome();
    startSupportSurvey();
  }

  function startSupportSurvey() {
    if (supportSurveyActive) return;
    supportSurveyActive = true;
    supportSurveyStep = "solved";
    supportSurveyData = { solved: null, rating: null, feedback: null };
    appendMessage("assistant", i18n("support_survey_solved", "Could we solve your problem?"), { skipPersist: true });
    appendActionMessage("", [
      { label: i18n("support_yes", "Yes"), action: "support_survey_solved", params: { value: true } },
      { label: i18n("support_no", "No"), action: "support_survey_solved", params: { value: false } }
    ]);
  }

  function appendSupportStarRating() {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    removeTypingIndicator();
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += escapeHtml(i18n("support_survey_rating", "How satisfied were you with the support?"));
    html += '<div class="creator-chat__support-stars">';
    for (var s = 1; s <= 5; s++) {
      html += '<button type="button" class="creator-chat__support-star" data-rating="' + s + '" aria-label="' + s + ' stars">★</button>';
    }
    html += "</div></div>";
    msg.innerHTML = html;
    msg.querySelectorAll(".creator-chat__support-star").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var rating = parseInt(this.getAttribute("data-rating"), 10);
        supportSurveyData.rating = rating;
        supportSurveyStep = "feedback_ask";
        msg.querySelectorAll(".creator-chat__support-star").forEach(function (b) { b.disabled = true; });
        this.classList.add("is-selected");
        appendMessage("user", rating + " / 5", { skipPersist: true });
        appendMessage("assistant", i18n("support_survey_feedback_ask", "Would you like to tell us anything else?"), { skipPersist: true });
        appendActionMessage("", [
          { label: i18n("support_yes", "Yes"), action: "support_survey_feedback", params: { value: true } },
          { label: i18n("support_no", "No"), action: "support_survey_feedback", params: { value: false } }
        ]);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function submitSupportSurvey(extraFeedback) {
    if (extraFeedback) supportSurveyData.feedback = extraFeedback;
    fetch(API_BASE + "?op=eazy-support-survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        user_id: getUserId(),
        conversation_id: conversationId,
        solved: supportSurveyData.solved,
        rating: supportSurveyData.rating,
        feedback: supportSurveyData.feedback
      })
    }).catch(function () {});
    finishSupportSurvey();
  }

  function finishSupportSurvey() {
    supportSurveyActive = false;
    supportSurveyStep = null;
    supportMode = false;
    supportAgentOnline = false;
    _convSupportMeta.mode = "ai";
    _convSupportMeta.support_status = "closed";
    markTabSupportMode(false);
    applySupportChrome();
    appendMessage("assistant", i18n("support_survey_thanks", "Thank you for your feedback! You can chat with Eazy again now."), { skipPersist: true });
  }

  function handleSupportSurveyInput(text) {
    if (supportSurveyStep !== "feedback_text") return false;
    var trimmed = String(text || "").trim();
    if (!trimmed) return true;
    appendMessage("user", trimmed, { skipPersist: true });
    submitSupportSurvey(trimmed);
    return true;
  }

  function startSupportPolling() {
    stopSupportPolling();
    supportPollTimer = setInterval(pollSupportMessages, 5000);
  }

  function stopSupportPolling() {
    if (supportPollTimer) { clearInterval(supportPollTimer); supportPollTimer = null; }
  }

  function pollSupportMessages() {
    if (!conversationId) return;
    if (!supportMode && !supportSurveyActive && _convSupportMeta.mode !== "support") return;
    fetch(API_BASE + "?op=eazy-conv&user_id=" + encodeURIComponent(getUserId()) + "&conv_id=" + encodeURIComponent(conversationId) + "&after=" + lastSupportMsgId, {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        if (data.conversation) {
          var prevStatus = _convSupportMeta.support_status;
          syncConvSupportMeta(data.conversation);
          if (data.conversation.support_first_reply_at) {
            supportAgentOnline = true;
            applySupportChrome();
          }
          if (prevStatus !== "resolved" && data.conversation.support_status === "resolved" && !supportSurveyActive) {
            onSupportEndedByAgent();
          }
        }
        if (!data.messages) return;
        data.messages.forEach(function (m) {
          if (m.role === "support" && m.id > lastSupportMsgId) {
            supportAgentOnline = true;
            applySupportChrome();
            appendMessage("assistant", m.content, { skipPersist: true });
            lastSupportMsgId = m.id;
          }
        });
      })
      .catch(function () {});
  }

  function sendSupportMessage(text) {
    if (!text.trim() || !conversationId) return;
    if (isGuestUser()) return;

    var input = document.getElementById("creator-chat-input");
    var sendBtn = document.getElementById("creator-chat-send");
    if (input) { input.value = ""; input.disabled = true; }
    if (sendBtn) sendBtn.disabled = true;

    appendMessage("user", text, { skipPersist: true });

    fetch(API_BASE + "?op=eazy-conv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        user_id: getUserId(),
        conversation_id: conversationId,
        role: "user",
        content: text,
        message_type: "support"
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          appendMessage("assistant", i18n("chatMessageNotSent", "Message could not be sent. Please try again."));
        }
      })
      .catch(function () {
        appendMessage("assistant", i18n("chat_network_error_retry", "Network error. Please try again."));
      })
      .finally(function () {
        if (input) { input.disabled = false; input.focus(); }
        if (sendBtn) sendBtn.disabled = false;
      });
  }

  var _flowOverridePending = null;

  function sendMessage(text) {
    if (!text.trim() || limitReached) return;
    if (isGuestUser()) return;
    if (window.EazyTips) window.EazyTips.onUserActivity();

    if (_pendingGiftCardApply) {
      appendMessage("user", text);
      applyGiftCardCode(text.trim());
      return;
    }

    if (_pendingGiftCardAI) {
      var gcId = _pendingGiftCardAI;
      _pendingGiftCardAI = null;
      appendMessage("user", text);
      triggerGiftCardAI(gcId, text.trim());
      return;
    }

    if (supportSurveyActive && handleSupportSurveyInput(text)) return;
    if (supportMode) { sendSupportMessage(text); return; }

    if (_stepHistory && _stepHistory.length > 0 && !_flowOverridePending) {
      _flowOverridePending = text;
      appendActionMessage(i18n("chat_flow_override_prompt", "You are currently in a function selection flow. Do you want to continue via chat instead?"), [
        { label: i18n("chat_flow_override_yes", "Yes, continue via chat"), action: "__flow_override_yes__", params: {} },
        { label: i18n("chat_flow_override_no", "No, continue selection"), action: "__flow_override_no__", params: {} }
      ]);
      var origHandle = handleActionButton;
      var tempHandler = function (action) {
        if (action === "__flow_override_yes__") {
          var savedText = _flowOverridePending;
          _flowOverridePending = null;
          _stepHistory.forEach(function (s) { if (s.el && s.el.parentNode) s.el.remove(); });
          _stepHistory = [];
          _activeStepEl = null;
          clearDesignState();
          sendMessage(savedText);
        } else if (action === "__flow_override_no__") {
          _flowOverridePending = null;
        }
      };
      var overrideButtons = document.querySelectorAll('[data-action="__flow_override_yes__"], [data-action="__flow_override_no__"]');
      overrideButtons.forEach(function (btn) {
        btn.removeEventListener("click", btn._clk);
        btn.addEventListener("click", function () {
          var act = this.getAttribute("data-action");
          var actionsDiv = this.closest(".creator-chat__actions");
          if (actionsDiv) actionsDiv.innerHTML = '<span class="creator-chat__action-chosen">' + escapeHtml(this.textContent) + '</span>';
          tempHandler(act);
        });
      });
      return;
    }
    _flowOverridePending = null;

    const input = document.getElementById("creator-chat-input");
    const sendBtn = document.getElementById("creator-chat-send");

    if (input) { input.value = ""; input.disabled = true; }
    if (sendBtn) sendBtn.disabled = true;

    appendMessage("user", text, { skipPersist: true });
    updateTabPreview(conversationId, text);
    showTypingIndicator();

    const payload = {
      messages: messages,
      user_id: getUserId(),
      conversation_id: conversationId || null,
      context: {
        page: getPagePath(),
        locale: getLocale(),
        session_id: getSessionId(),
        customer: window.__EAZ_CUSTOMER_CONTEXT || null,
        bot_context: (window.EazyBot && window.EazyBot.getContext) ? window.EazyBot.getContext() : null,
        product: getProductContext(),
        cart: _cartData
      },
    };

    fetch(API_BASE + "?op=chat-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        removeTypingIndicator();

        if (data.rate_limit) {
          updateRateLimitUI(data.rate_limit);
          flashRateLimit();
          if (data.rate_limit.remaining > 0) setLimitReached(false);
        }

        if (data.ok && data.text) {
          if (data.action && data.action.action === "connect_support") {
            var cleanText = data.text.replace(/\[ACTION:.*?\]/g, "").trim();
            appendActionMessage(cleanText || i18n("chatConnectSupportQuestion", "Do you want to be connected with support?"), [
              { label: i18n("chatYesConnect", "Yes, please connect"), action: "connect_support", params: data.action.params || {} },
              { label: i18n("chatNoThanks", "No, thanks"), action: "cancel_support", params: {} }
            ]);
            messages.push({ role: "assistant", content: cleanText || data.text });
          } else if (data.action && data.action.action === "show_options") {
            renderShowOptions(data.text, data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "confirm_flow") {
            renderConfirmFlow(data.text, data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_grid") {
            appendMessage("assistant", data.text);
            var gp = data.action.params || {};
            gp.onSelect = function (items) { handleGridSelection(gp.grid_type, items); };
            gp.onConfirm = function (items) { handleGridConfirm(gp.grid_type, items); };
            renderChatGrid(gp);
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_interests") {
            appendMessage("assistant", data.text);
            renderInterestsPanel(data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_stats") {
            renderStatsMessage(data.text, data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_creator_images") {
            appendMessage("assistant", data.text);
            renderCreatorImages(data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_settings_panel") {
            appendMessage("assistant", data.text);
            renderSettingsPanel(data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_balance_panel") {
            appendMessage("assistant", data.text);
            renderBalancePanel(data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "show_level_panel") {
            appendMessage("assistant", data.text);
            renderLevelPanel(data.action.params || {});
            messages.push({ role: "assistant", content: data.text });
          } else if (data.action && data.action.action === "switch_view") {
            appendMessage("assistant", data.text, { skipPersist: true });
            var targetView = data.action.params && data.action.params.view;
            if (targetView) switchView(targetView);
          } else {
            appendMessage("assistant", data.text, { skipPersist: true });
            if (data.action && window.CreatorChatActions) {
              window.CreatorChatActions.execute(data.action.action, data.action.params || {});
            }
          }
        } else if (data.error === "rate_limit") {
          setLimitReached(true, data.rate_limit && data.rate_limit.reset_at, data.rate_limit && data.rate_limit.reset_in);
          appendMessage("assistant", i18n("chatLimitReachedHour", "Your chat quota for this hour is used up. You can use support chat via the icon at the bottom right."));
          showLimitModal(data.rate_limit && data.rate_limit.reset_at, data.rate_limit && data.rate_limit.reset_in);
        } else {
          appendMessage("assistant", data.message || i18n("chatGenericErrorRetry", "An error occurred. Please try again later."));
        }
      })
      .catch(function (e) {
        removeTypingIndicator();
        console.error("[CreatorChat] Send error:", e);
        appendMessage("assistant", i18n("chatNetworkErrorRetryLater", "Network error. Please try again later."));
      })
      .finally(function () {
        if (input) { input.disabled = false; input.focus(); }
        if (sendBtn) sendBtn.disabled = false;
      });
  }

  function fetchRateLimit() {
    fetch(API_BASE + "?op=chat-rate-limit", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.rate_limit) updateRateLimitUI(data.rate_limit);
      })
      .catch(function () {});
  }

  function showBackdrop() {
    var bd = document.getElementById("creator-chat-backdrop");
    if (bd) {
      bd.style.display = "";
      void bd.offsetHeight;
      bd.classList.add("creator-chat__backdrop--visible");
      bd.setAttribute("aria-hidden", "false");
    }
  }
  function hideBackdrop() {
    var bd = document.getElementById("creator-chat-backdrop");
    if (bd) {
      bd.classList.remove("creator-chat__backdrop--visible");
      bd.setAttribute("aria-hidden", "true");
      setTimeout(function() {
        if (!bd.classList.contains("creator-chat__backdrop--visible")) bd.style.display = "none";
      }, 300);
    }
  }

  function playHintAnimation() {
    try { if (sessionStorage.getItem("creator_chat_hint_shown") === "1") return; } catch (e) {}
    var panel = document.getElementById("creator-chat-panel");
    if (!panel) return;
    setTimeout(function () {
      panel.classList.add("creator-chat__panel--hinting");
      setTimeout(function () {
        panel.classList.remove("creator-chat__panel--hinting");
      }, 1200);
      try { sessionStorage.setItem("creator_chat_hint_shown", "1"); } catch (e) {}
    }, 350);
  }

  function showBotGreeting(options) {
    if (window.__eaz_mode_active) return;
    var bot = window.EazyBot;
    if (!bot) return;
    var opts = options || {};
    var convId = opts.conversationId || conversationId;
    if (hasSessionGreetingForConversation(convId)) return;
    var msg = bot.pickMessage("chat_open");
    if (!msg) return;
    appendMessage("assistant", msg.text, { msgType: "greeting" });
    playEazyVoice(msg.id);
    bot.logMessageShown("chat_open", msg.id, bot.getContext());
    bot.incrementOpen();
    markSessionGreetingForConversation(convId);
  }

  var _guestLoginTexts = [
    { id: "guest_login_1", text: i18n("chat_guest_login_1", "Hey! I am Eazy, your personal assistant. Sign in to use all my features - I can help with designs, outfits, gift cards and much more!") },
    { id: "guest_login_2", text: i18n("chat_guest_login_2", "Psst... exclusive features are waiting behind login! Create designs, build outfits, discover gift cards - and I will guide you through everything.") },
    { id: "guest_login_3", text: i18n("chat_guest_login_3", "Want to see what I can do? Log in and be amazed! Design generator, outfit suggestions, personal recommendations - there is something for everyone.") },
    { id: "guest_login_4", text: i18n("chat_guest_login_4", "I have many cool things ready for you! But first, I need you on the other side of login. Come on, it only takes 10 seconds!") },
    { id: "guest_login_5", text: i18n("chat_guest_login_5", "Imagine your own design on a product. Or an outfit that fits you perfectly. All that and more is waiting after login!") },
    { id: "guest_login_6", text: i18n("chat_guest_login_6", "I am getting bored here alone! Sign in and let's find your next favorite outfit, create a design, or redeem a gift card together.") }
  ];

  var _guestFunctionTexts = [
    { id: "guest_fn_1", text: i18n("chat_guest_function_1", "Nice choice! This feature is waiting for you behind login. Sign in and start right away!") },
    { id: "guest_fn_2", text: i18n("chat_guest_function_2", "Great pick! But this feature is available only for signed-in users. Log in - it takes just a moment!") },
    { id: "guest_fn_3", text: i18n("chat_guest_function_3", "Hey, this is one of my favorite features! Log in and I will show you what it can do.") },
    { id: "guest_fn_4", text: i18n("chat_guest_function_4", "Almost there! Just log in quickly, then we can really get started.") },
    { id: "guest_fn_5", text: i18n("chat_guest_function_5", "This feature is really cool - but I can only show it to signed-in users. Come to the other side!") },
    { id: "guest_fn_6", text: i18n("chat_guest_function_6", "You have great taste! Sign in quickly and we will start with this feature right away.") }
  ];

  function _pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function _appendGuestMessage(msgObj) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var btnLabel = (window.EAZY_I18N && window.EAZY_I18N.loginRequiredBtn) || i18n("chat_sign_in_now", "Sign in now");
    var sf = (typeof window !== "undefined" && window.__EAZ_STOREFRONT_ORIGIN ? String(window.__EAZ_STOREFRONT_ORIGIN).replace(/\/$/, "") : "") || window.location.origin;
    var returnTo = sf + window.location.pathname + window.location.search + window.location.hash;
    var loginUrl = "/account/login?return_url=" + encodeURIComponent(returnTo);
    var msgEl = appendMessage("assistant", msgObj.text, { msgType: "greeting", skipPersist: true });
    if (msgEl) {
      var bubble = msgEl.querySelector(".creator-chat__bubble");
      if (bubble) {
        var btnWrap = document.createElement("div");
        btnWrap.style.cssText = "text-align:center;margin-top:12px;";
        var btn = document.createElement("a");
        btn.href = loginUrl;
        btn.className = "creator-chat__login-gate-btn";
        btn.textContent = btnLabel;
        btnWrap.appendChild(btn);
        bubble.appendChild(btnWrap);
      }
    }
    playEazyVoice(msgObj.id);
  }

  function showGuestGreeting() {
    if (window.__eaz_mode_active) return;
    if (hasGuestGreetingInSession()) return;
    var container = document.getElementById("creator-chat-messages");
    if (container && container.children.length > 0) return;
    _appendGuestMessage(_pickRandom(_guestLoginTexts));
    markGuestGreetingInSession();
  }

  function showGuestFunctionPrompt() {
    _appendGuestMessage(_pickRandom(_guestFunctionTexts));
  }

  function renderConversationMessages(data) {
    if (data.messages && data.messages.length > 0) {
      var container = document.getElementById("creator-chat-messages");
      if (container && container.children.length === 0) {
        data.messages.forEach(function (m) {
          renderSingleMessage(m);
        });
      }
    }
  }

  var _PROACTIVE_MSG_RE = /^(?:Design|Veröffentlichung|Hero-Bild|Publishing|Hero image) (?:(?:ist fertig! Schau in den Jobs-Tab|fehlgeschlagen\. Prüfe die Details)|(?:is done! Check the Jobs tab|failed\. Check details))/;

  function renderSingleMessage(m) {
    var content = m.content || "";

    if (m.role === "assistant" && _PROACTIVE_MSG_RE.test(content)) {
      messages.push({ role: m.role, content: content });
      return;
    }

    var designResultMatch = content.match(/^DESIGN_RESULT:(.+):(.*)$/);
    if (designResultMatch) {
      var drUrl = designResultMatch[1] === "none" ? null : designResultMatch[1];
      var drQuote = designResultMatch[2] || null;
      showDesignResult(drUrl, drQuote, true);
      messages.push({ role: m.role, content: content });
      return;
    }

    var designMatchLegacy = content.match(/(https?:\/\/[^\s]+\/(generated|preview)\.[a-z]+)/i);
    if (designMatchLegacy && m.role === "assistant") {
      var legacyQuote = content.replace(designMatchLegacy[0], "").trim();
      showDesignResult(designMatchLegacy[1], legacyQuote || null, true);
      messages.push({ role: m.role, content: content });
      return;
    }

    var designMatch = content.match(/^Design erstellt: (https?:\/\/.+)$/);
    if (designMatch) {
      showDesignResult(designMatch[1], null, true);
      messages.push({ role: m.role, content: content });
      return;
    }

    if (content === "[Bild hochgeladen]" && m.role === "user") {
      appendMessage(m.role, "\uD83D\uDCF7 Bild hochgeladen", { skipPersist: true });
    } else {
      appendMessage(m.role, content, { skipPersist: true });
    }
  }

  function syncActiveMessages() {
    if (!conversationId || !_panelOpen) return;
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&user_id=" + encodeURIComponent(userId) + "&conv_id=" + encodeURIComponent(conversationId), {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.messages) return;
        var serverMsgs = data.messages;
        if (serverMsgs.length <= messages.length) return;
        var newMsgs = serverMsgs.slice(messages.length);
        newMsgs.forEach(function (m) {
          renderSingleMessage(m);
        });
        var container = document.getElementById("creator-chat-messages");
        if (container) container.scrollTop = container.scrollHeight;
      })
      .catch(function () {});
  }

  /**
   * Load conversation history from EAZY_DB via API.
   * Uses auto_create=0 so no new chat is created if none active.
   */
  function loadConversation(callback) {
    if (conversationLoaded && conversationId) {
      if (callback) callback();
      return;
    }

    var userId = getUserId();
    var page = encodeURIComponent(getPagePath());
    fetch(API_BASE + "?op=eazy-conv&user_id=" + encodeURIComponent(userId) + "&page=" + page + "&auto_create=0", {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.conversation) {
          conversationId = data.conversation.id;
          renderConversationMessages(data);
          conversationLoaded = true;
          restoreSupportFromServer(data.conversation);
        } else if (data.ok && !data.conversation) {
          // No active chat exists — create one
          createNewChat();
        }
      })
      .catch(function (e) {
        console.warn("[CreatorChat] Conv load error:", e);
      })
      .finally(function () {
        if (callback) callback();
      });
  }

  /* ── Portal Animation Helpers ── */
  function createPortal(cx, cy, size) {
    var el = document.createElement("div");
    el.className = "eazy-portal";
    el.style.cssText = "position:fixed;z-index:99998;pointer-events:none;"
      + "left:" + (cx - size / 2) + "px;top:" + (cy - size / 2) + "px;"
      + "width:" + size + "px;height:" + size + "px;";

    var crack1 = document.createElement("div"); crack1.className = "eazy-portal__crack eazy-portal__crack--1";
    var crack2 = document.createElement("div"); crack2.className = "eazy-portal__crack eazy-portal__crack--2";
    var crack3 = document.createElement("div"); crack3.className = "eazy-portal__crack eazy-portal__crack--3";
    var crack4 = document.createElement("div"); crack4.className = "eazy-portal__crack eazy-portal__crack--4";
    var hole = document.createElement("div"); hole.className = "eazy-portal__hole";
    var ring = document.createElement("div"); ring.className = "eazy-portal__ring";
    el.appendChild(crack1); el.appendChild(crack2); el.appendChild(crack3); el.appendChild(crack4);
    el.appendChild(ring); el.appendChild(hole);
    document.body.appendChild(el);
    return el;
  }

  function removePortal(el, delay) {
    if (!el) return;
    setTimeout(function () {
      el.classList.add("eazy-portal--closing");
      setTimeout(function () { el.remove(); }, 400);
    }, delay || 0);
  }

  function createGhost(source) {
    var rect = source.getBoundingClientRect();
    var ghost = source.cloneNode(true);
    ghost.id = "";
    ghost.removeAttribute("aria-expanded");
    ghost.className = "eazy-portal__ghost";
    ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;"
      + "left:" + rect.left + "px;top:" + rect.top + "px;"
      + "width:" + rect.width + "px;height:" + rect.height + "px;"
      + "border-radius:50%;";
    document.body.appendChild(ghost);
    return { el: ghost, rect: rect };
  }

  function animateEazyJumpIn(toggle, sendBtn) {
    if (!toggle || !sendBtn) return;
    var tRect = toggle.getBoundingClientRect();
    var tCx = tRect.left + tRect.width / 2;
    var tCy = tRect.top + tRect.height / 2;

    toggle.style.opacity = "0";
    toggle.style.pointerEvents = "none";
    sendBtn.style.opacity = "0";

    // Portal 1: entry (on page where Eazy is, slightly above)
    var portalSize = Math.max(tRect.width, tRect.height) * 2.2;
    var entryPortal = createPortal(tCx, tCy - 10, portalSize);

    // Ghost Eazy
    var g = createGhost(toggle);

    // Phase 1: Eazy shrinks + dives into portal
    requestAnimationFrame(function () {
      g.el.classList.add("eazy-portal__ghost--dive-in");
      g.el.style.left = (tCx - tRect.width / 2) + "px";
      g.el.style.top = (tCy - tRect.height / 2 - 10) + "px";
    });

    // Phase 2: close entry portal, open exit portal, Eazy emerges
    setTimeout(function () {
      removePortal(entryPortal, 0);

      var sRect = sendBtn.getBoundingClientRect();
      var sCx = sRect.left + sRect.width / 2;
      var sCy = sRect.top + sRect.height / 2;
      var exitSize = Math.max(sRect.width, sRect.height) * 2.2;
      var exitPortal = createPortal(sCx, sCy, exitSize);

      // Reposition ghost at exit
      g.el.classList.remove("eazy-portal__ghost--dive-in");
      g.el.style.transition = "none";
      g.el.style.left = (sCx - sRect.width / 2) + "px";
      g.el.style.top = (sCy - sRect.height / 2) + "px";
      g.el.style.width = sRect.width + "px";
      g.el.style.height = sRect.height + "px";

      requestAnimationFrame(function () {
        g.el.classList.add("eazy-portal__ghost--emerge");
      });

      setTimeout(function () {
        sendBtn.style.transition = "opacity 0.15s ease";
        sendBtn.style.opacity = "1";
        g.el.remove();
        removePortal(exitPortal, 100);
        setTimeout(function () { sendBtn.style.transition = ""; }, 200);
      }, 700);
    }, 800);
  }

  function animateEazyJumpOut(toggle, sendBtn) {
    if (!toggle || !sendBtn) return;
    var sRect = sendBtn.getBoundingClientRect();
    var sCx = sRect.left + sRect.width / 2;
    var sCy = sRect.top + sRect.height / 2;

    sendBtn.style.opacity = "0";

    var exitSize = Math.max(sRect.width, sRect.height) * 2.2;
    var entryPortal = createPortal(sCx, sCy, exitSize);

    var ghost = document.createElement("div");
    ghost.className = "eazy-portal__ghost";
    var svgEl = sendBtn.querySelector("svg");
    if (svgEl) ghost.innerHTML = svgEl.outerHTML;
    ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;"
      + "left:" + sRect.left + "px;top:" + sRect.top + "px;"
      + "width:" + sRect.width + "px;height:" + sRect.height + "px;"
      + "border-radius:50%;display:flex;align-items:center;justify-content:center;";
    if (ghost.querySelector("svg")) ghost.querySelector("svg").style.cssText = "width:100%;height:100%;";
    document.body.appendChild(ghost);

    requestAnimationFrame(function () {
      ghost.classList.add("eazy-portal__ghost--dive-in");
    });

    setTimeout(function () {
      removePortal(entryPortal, 0);
      ghost.remove();

      var tRect = toggle.getBoundingClientRect();
      var tCx = tRect.left + tRect.width / 2;
      var tCy = tRect.top + tRect.height / 2;
      var portalSize = Math.max(tRect.width, tRect.height) * 2.2;
      var exitPortal = createPortal(tCx, tCy, portalSize);

      var ghost2 = toggle.cloneNode(true);
      ghost2.id = "";
      ghost2.removeAttribute("aria-expanded");
      ghost2.className = "eazy-portal__ghost";
      ghost2.style.cssText = "position:fixed;z-index:99999;pointer-events:none;"
        + "left:" + tRect.left + "px;top:" + tRect.top + "px;"
        + "width:" + tRect.width + "px;height:" + tRect.height + "px;"
        + "border-radius:50%;";
      document.body.appendChild(ghost2);

      requestAnimationFrame(function () {
        ghost2.classList.add("eazy-portal__ghost--emerge");
      });

      setTimeout(function () {
        toggle.style.opacity = "";
        toggle.style.pointerEvents = "";
        ghost2.remove();
        removePortal(exitPortal, 100);
        sendBtn.style.opacity = "";
      }, 700);
    }, 600);
  }

  var _syncTimer = null;
  var _panelOpen = false;
  var _outsideCloseBound = false;
  var _activeUploadJobs = {};

  function isInsideEazyChatUI(node) {
    var root = document.getElementById("creator-chat-root");
    return !!(node instanceof Node && root && root.contains(node));
  }

  function markEazyManualClose() {
    try { sessionStorage.setItem("creator_chat_manual_close", "1"); } catch (e) {}
  }

  function bindPanelCloseButtons() {
    document.querySelectorAll("#creator-chat-close, .creator-chat__panel-close").forEach(function (closeBtn) {
      if (closeBtn.dataset.panelCloseBound === "1") return;
      closeBtn.dataset.panelCloseBound = "1";
      closeBtn.addEventListener("click", function () {
        markEazyManualClose();
        closePanel();
      });
    });
  }

  function handleOutsidePanelPointerDown(e) {
    if (!_panelOpen || window.__eaz_mode_active || window.__eaz_guide_active) return;
    if (!(e.target instanceof Node)) return;
    if (isInsideEazyChatUI(e.target)) return;
    markEazyManualClose();
    closePanel();
  }

  function bindOutsidePanelClose() {
    if (_outsideCloseBound) return;
    document.addEventListener("pointerdown", handleOutsidePanelPointerDown, true);
    _outsideCloseBound = true;
  }

  function unbindOutsidePanelClose() {
    if (!_outsideCloseBound) return;
    document.removeEventListener("pointerdown", handleOutsidePanelPointerDown, true);
    _outsideCloseBound = false;
  }

  function isUploadJobId(jobId) {
    return /^upload[_-]/i.test(String(jobId || ""));
  }

  function isUploadJobItem(job) {
    if (!job) return false;
    var id = job.job_id || job.id || "";
    if (isUploadJobId(id)) return true;
    var action = String(job.action || "").toLowerCase();
    return action === "upload-design" || action === "upload";
  }

  function setEazyUploadState(active) {
    var on = !!active;
    var toggle = document.getElementById("creator-chat-toggle");
    var mascot = document.getElementById("eazy-mascot");
    if (toggle) toggle.classList.toggle("creator-chat__toggle--uploading", on);
    if (mascot) mascot.classList.toggle("eazy-mascot--uploading", on);
  }

  function refreshEazyUploadStateFromJobs() {
    var hasMarkedUploadJobs = Object.keys(_activeUploadJobs).length > 0;
    var hasActiveUploadJobs = Array.isArray(_jobsData) && _jobsData.some(isUploadJobItem);
    setEazyUploadState(hasMarkedUploadJobs || hasActiveUploadJobs);
  }

  function openPanel() {
    const panel = document.getElementById("creator-chat-panel");
    const toggle = document.getElementById("creator-chat-toggle");
    const sendBtn = document.getElementById("creator-chat-send");
    if (panel) { panel.style.display = ''; void panel.offsetWidth; }
    if (panel) panel.classList.add("creator-chat__panel--open");
    if (panel) panel.setAttribute("aria-hidden", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("creator-chat-open");
    _panelOpen = true;
    updateMobileViewportMetrics();
    try { document.body.dispatchEvent(new CustomEvent("creator-chat-open")); } catch (e) {}
    if (window.__EAZ_DEFER_EAZY_VOICE__) {
      window.__EAZ_DEFER_EAZY_VOICE__ = false;
      loadEazyVoiceMap();
    }
    bindOutsidePanelClose();
    showBackdrop();
    fetchRateLimit();
    playHintAnimation();
    setTimeout(showDrawerHint, 600);

    setTimeout(function () { animateEazyJumpIn(toggle, sendBtn); }, 150);

    if (isGuestUser()) {
      showGuestGreeting();
    } else {
      loadConversation(function () {
        if (!conversationLoaded || messages.length === 0) {
          showBotGreeting({ conversationId: conversationId });
        }
        resumeDesignFlowIfSaved();
        resumeGenProgress();
        loadTabList();
        syncActiveMessages();

        if (_genCompletedJobId) {
          setTimeout(animateEazyToNotifications, 600);
        }
      });
    }

    startSyncPolling();
    startCartPolling();
    loadNotifications();
    if (getUserId()) startNotifPolling();
    loadActiveJobs();
    stripNotificationsFromChat();
    setTimeout(function () {
      applySidebarPreferenceForDesktop();
    }, 0);
  }

  function closePanel() {
    const panel = document.getElementById("creator-chat-panel");
    const toggle = document.getElementById("creator-chat-toggle");
    const sendBtn = document.getElementById("creator-chat-send");

    if (toggle) { toggle.style.opacity = ""; toggle.style.pointerEvents = ""; }

    animateEazyJumpOut(toggle, sendBtn);

    if (_eazyDocked && toggle) {
      var boomDelay = 600 + 500;
      setTimeout(function () {
        toggle.classList.remove("creator-chat__toggle--dock-flash");
        void toggle.offsetWidth;
        toggle.classList.add("creator-chat__toggle--dock-flash");
        setTimeout(function () { toggle.classList.remove("creator-chat__toggle--dock-flash"); }, 1500);
      }, boomDelay);
    }

    if (panel) panel.classList.remove("creator-chat__panel--open");
    if (panel) panel.setAttribute("aria-hidden", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("creator-chat-open");
    _panelOpen = false;
    if (panel) {
      panel.style.bottom = "";
      panel.style.height = "";
      panel.style.maxHeight = "";
    }
    updateMobileViewportMetrics();
    unbindOutsidePanelClose();
    hideBackdrop();
    stopSyncPolling();
    stopCartPolling();
    stopNotifPolling();
    stopJobsPolling();
    closeSidebar();
    try { document.body.dispatchEvent(new CustomEvent("creator-chat-close")); } catch (e) {}
  }

  /* ── Live Sync Polling ── */
  function startSyncPolling() {
    stopSyncPolling();
    _syncTimer = setInterval(function () {
      if (document.hidden || !_panelOpen) return;
      loadTabList(function () {
        if (conversationId && _tabs.length > 0) {
          var stillActive = _tabs.some(function (t) { return t.id === conversationId; });
          if (!stillActive) {
            switchToConversation(_tabs[0].id);
            return;
          }
        }
      });
      syncActiveMessages();
    }, 5000);
  }

  function stopSyncPolling() {
    if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  }

  /* Resize-Logik: Desktop = vw-Breite, Mobile = vh-Höhe. localStorage persisted. */
  var DESKTOP_MIN_VW = 20;
  var DESKTOP_MAX_VW = 80;
  var DESKTOP_DEFAULT_VW = 40;
  var MOBILE_MIN_VH = 20;
  var MOBILE_MAX_VH = 95;
  var MOBILE_DEFAULT_VH = 90;
  var MOBILE_SNAPS = [30, 50, 95];
  var DRAG_THRESHOLD = 6;

  function isMobile() { return window.innerWidth < 750; }

  function getStoredWidth() {
    try {
      var v = parseInt(localStorage.getItem("creator_chat_width_vw"), 10);
      return isNaN(v) ? DESKTOP_DEFAULT_VW : Math.max(DESKTOP_MIN_VW, Math.min(DESKTOP_MAX_VW, v));
    } catch (e) { return DESKTOP_DEFAULT_VW; }
  }

  function getStoredMobileHeight() {
    try {
      var v = parseInt(localStorage.getItem("creator_chat_mobile_height"), 10);
      return isNaN(v) ? MOBILE_DEFAULT_VH : Math.max(MOBILE_MIN_VH, Math.min(MOBILE_MAX_VH, v));
    } catch (e) { return MOBILE_DEFAULT_VH; }
  }

  function getChatRoot() {
    return document.getElementById("creator-chat-root") || document.documentElement;
  }

  function setWidth(vw) {
    var v = Math.max(DESKTOP_MIN_VW, Math.min(DESKTOP_MAX_VW, Math.round(vw)));
    getChatRoot().style.setProperty("--chat-width", v + "vw");
    try { localStorage.setItem("creator_chat_width_vw", String(v)); } catch (e) {}
  }

  function setMobileHeight(vh) {
    var v = Math.max(MOBILE_MIN_VH, Math.min(MOBILE_MAX_VH, Math.round(vh)));
    getChatRoot().style.setProperty("--chat-mobile-height", v + "dvh");
    try { localStorage.setItem("creator_chat_mobile_height", String(v)); } catch (e) {}
  }

  function updateMobileViewportMetrics() {
    if (window.innerWidth >= 750) return;
    var vv = window.visualViewport;
    var h = vv ? Math.round(vv.height) : window.innerHeight;
    getChatRoot().style.setProperty("--chat-viewport-height", h + "px");
  }

  function snapToNearest(value) {
    var best = MOBILE_SNAPS[0];
    var bestDist = Math.abs(value - best);
    for (var i = 1; i < MOBILE_SNAPS.length; i++) {
      var d = Math.abs(value - MOBILE_SNAPS[i]);
      if (d < bestDist) { best = MOBILE_SNAPS[i]; bestDist = d; }
    }
    return best;
  }

  function animateToSize(panel, targetVw, targetVh) {
    if (!panel) return;
    panel.classList.add("creator-chat__panel--animating");
    if (isMobile()) {
      setMobileHeight(targetVh);
    } else {
      setWidth(targetVw);
    }
    setTimeout(function () { panel.classList.remove("creator-chat__panel--animating"); }, 450);
  }

  var DESKTOP_EXPANDED_VW = 80;

  function updateResizeArrow() {
    var handle = document.getElementById("creator-chat-resize-handle");
    if (!handle) return;
    var cur = getStoredWidth();
    if (cur >= DESKTOP_EXPANDED_VW - 2) {
      handle.classList.add("creator-chat__resize-handle--expanded");
    } else {
      handle.classList.remove("creator-chat__resize-handle--expanded");
    }
  }

  function toggleDesktopWidth() {
    var panel = document.getElementById("creator-chat-panel");
    var cur = getStoredWidth();
    var target = cur >= DESKTOP_EXPANDED_VW - 2 ? DESKTOP_DEFAULT_VW : DESKTOP_EXPANDED_VW;
    animateToSize(panel, target, 0);
    setTimeout(updateResizeArrow, 50);
  }

  function initResize() {
    setWidth(getStoredWidth());
    setMobileHeight(getStoredMobileHeight());
    updateMobileViewportMetrics();
    updateResizeArrow();

    var handle = document.getElementById("creator-chat-resize-handle");
    var panel = document.getElementById("creator-chat-panel");
    if (!handle || isMobile()) return;

    /* --- Mouse: click to toggle, drag to resize --- */
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var startX = e.clientX;
      var startW = getStoredWidth();
      var dragging = false;

      function move(ev) {
        var dx = Math.abs(ev.clientX - startX);
        if (!dragging && dx > DRAG_THRESHOLD) {
          dragging = true;
        }
        if (dragging) {
          setWidth(startW + ((startX - ev.clientX) / window.innerWidth) * 100);
          updateResizeArrow();
        }
      }

      function stop() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", stop);
        if (!dragging) {
          toggleDesktopWidth();
        }
      }

      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
    });

    /* --- Touch on desktop (e.g. Surface): drag to resize, tap to toggle --- */
    handle.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches.length) return;
      e.preventDefault();
      var startX = e.touches[0].clientX;
      var startW = getStoredWidth();
      var dragging = false;

      function onTouchMove(ev) {
        if (!ev.touches || !ev.touches.length) return;
        var dx = Math.abs(ev.touches[0].clientX - startX);
        if (!dragging && dx > DRAG_THRESHOLD) {
          dragging = true;
        }
        if (dragging) {
          ev.preventDefault();
          setWidth(startW + ((startX - ev.touches[0].clientX) / window.innerWidth) * 100);
          updateResizeArrow();
        }
      }

      function onTouchEnd() {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
        if (!dragging) {
          toggleDesktopWidth();
        }
      }

      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
      document.addEventListener("touchcancel", onTouchEnd);
    }, { passive: false });
  }

  /* ── Icon Drag: frei verschiebbar + Header Snap ── */
  var ICON_DRAG_THRESHOLD = 8;
  var LONG_PRESS_MS = 300;
  var SNAP_DISTANCE = 50;
  var SNAP_NEAR_DISTANCE = 60;
  var _iconDragged = false;
  var _iconSyncTimer = null;
  var _eazyDocked = false;

  function isMobileIcon() { return window.innerWidth < 750; }

  function getIconStorageKey() {
    return isMobileIcon() ? "eazy_icon_mobile" : "eazy_icon_desktop";
  }

  function isDocked() { return _eazyDocked; }

  function getSavedIconPos() {
    try {
      var raw = localStorage.getItem(getIconStorageKey());
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveIconPos(xPct, yPct) {
    var data = { x: Math.round(xPct * 100) / 100, y: Math.round(yPct * 100) / 100 };
    try { localStorage.setItem(getIconStorageKey(), JSON.stringify(data)); } catch (e) {}
    scheduleSyncIconPos();
  }

  function saveDockState(docked) {
    _eazyDocked = docked;
    try { localStorage.setItem("eazy_docked", docked ? "true" : "false"); } catch (e) {}
    scheduleSyncIconPos();
  }

  function applyIconPos(btn, pos) {
    if (!btn || !pos) return;
    var x = Math.max(0, Math.min(95, pos.x));
    var y = Math.max(0, Math.min(95, pos.y));
    btn.style.left = x + "vw";
    btn.style.top = y + "vh";
    btn.style.right = "auto";
    btn.style.bottom = "auto";
    btn.style.removeProperty("--eazy-icon-right");
    btn.style.removeProperty("--eazy-icon-bottom");
  }

  function isNewLayout() {
    // Check for new shop layout: either .eaz-layout-new exists or html.eaz-switched is active
    if (document.documentElement.classList.contains('eaz-switched')) {
      return true;
    }
    var el = document.querySelector(".eaz-layout-new");
    return el && el.offsetWidth > 0;
  }

  function getHeaderSlot() {
    if (isNewLayout()) {
      var topbarSlot = document.getElementById("eazy-topbar-slot");
      if (topbarSlot) return topbarSlot;
    }
    return document.getElementById("eazy-header-slot");
  }

  function getSnapTarget() {
    if (isNewLayout()) {
      return document.getElementById("eazy-topbar-slot");
    }
    var isCreator = !!document.querySelector(".header--creator");
    var isMobile = window.innerWidth < 750;
    if (isMobile && !isCreator) return document.querySelector(".search-action");
    if (isMobile && isCreator) {
      var d = document.querySelector("header-drawer, .header__drawer");
      return d ? (d.querySelector(".header__icon--menu") || d) : null;
    }
    return document.querySelector(".header-logo");
  }

  function positionSlotAtTarget(slot) {
    if (!slot) return;
    if (isNewLayout()) return;
    var target = getSnapTarget();
    if (!target) return;
    var r = target.getBoundingClientRect();
    var slotSize = isMobileIcon() ? 40 : 48;
    slot.style.left = (r.right + 8) + "px";
    slot.style.top = (r.top + r.height / 2 - slotSize / 2) + "px";
  }

  function positionDockedMobile(btn) {
    var target = getSnapTarget();
    if (!target) return;
    var r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    var size = isMobileIcon() ? 34 : 40;
    btn.style.setProperty("left", (r.right + 6) + "px", "important");
    btn.style.setProperty("top", (r.top + r.height / 2 - size / 2) + "px", "important");
    btn.style.setProperty("right", "auto", "important");
    btn.style.setProperty("bottom", "auto", "important");
  }

  function positionDockedDesktop(btn) {
    var size = 40;
    var logo = document.querySelector(".header-logo");
    if (logo) {
      var r = logo.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        btn.style.setProperty("left", (r.right + 4) + "px", "important");
        btn.style.setProperty("top", (r.top + r.height / 2 - size / 2) + "px", "important");
        btn.style.setProperty("right", "auto", "important");
        btn.style.setProperty("bottom", "auto", "important");
        return;
      }
    }
    var target = getSnapTarget();
    if (!target) return;
    var r2 = target.getBoundingClientRect();
    if (r2.width === 0 && r2.height === 0) return;
    btn.style.setProperty("left", (r2.right + 8) + "px", "important");
    btn.style.setProperty("top", (r2.top + r2.height / 2 - size / 2) + "px", "important");
    btn.style.setProperty("right", "auto", "important");
    btn.style.setProperty("bottom", "auto", "important");
  }

  var _dockRetries = 0;
  function dockEazy(btn, manual) {
    if (!btn) return;

    var isMobile = isMobileIcon();

    if (isNewLayout()) {
      var topbarSlot = document.getElementById("eazy-topbar-slot");
      if (!topbarSlot) { if (_dockRetries < 10) { _dockRetries++; setTimeout(function () { dockEazy(btn, manual); }, 300); } return; }
      _dockRetries = 0;
      _eazyDocked = true;
      btn.classList.add("creator-chat__toggle--docked", "creator-chat__toggle--docked-mobile");
      btn.style.cssText = "";
      topbarSlot.classList.add("is-docked");
      topbarSlot.appendChild(btn);
      saveDockState(true);
      if (manual) {
        var topbar = document.getElementById("eazTopbar");
        if (topbar) { topbar.classList.remove("eazy-header-quake"); void topbar.offsetWidth; topbar.classList.add("eazy-header-quake"); setTimeout(function () { topbar.classList.remove("eazy-header-quake"); }, 600); }
        try { navigator.vibrate(40); } catch (e) {}
        btn.classList.remove("creator-chat__toggle--dock-flash"); void btn.offsetWidth; btn.classList.add("creator-chat__toggle--dock-flash"); setTimeout(function () { btn.classList.remove("creator-chat__toggle--dock-flash"); }, 1500);
      }
      markEazyIconReady();
      return;
    }

    var target = getSnapTarget();

    if (!target || (target.getBoundingClientRect().width === 0)) {
      if (_dockRetries < 10) {
        _dockRetries++;
        setTimeout(function () { dockEazy(btn, manual); }, 300);
      }
      return;
    }
    _dockRetries = 0;

    _eazyDocked = true;
    btn.classList.add("creator-chat__toggle--docked");
    btn.style.cssText = "";

    if (isMobile) {
      var panel = document.getElementById("creator-chat-panel");
      var parent = panel ? panel.parentNode : document.body;
      if (panel) { parent.insertBefore(btn, panel); } else { document.body.appendChild(btn); }
      btn.classList.add("creator-chat__toggle--docked-mobile");
      positionDockedMobile(btn);
    } else {
      btn.classList.remove("creator-chat__toggle--docked-mobile");
      document.body.classList.add("eazy-header-docked");
      btn.classList.add("creator-chat__toggle--docked-mobile");
      positionDockedDesktop(btn);
    }

    saveDockState(true);
    markEazyIconReady();

    if (manual) {
      var headerEl = document.getElementById("header-component");
      if (headerEl) {
        headerEl.classList.remove("eazy-header-quake");
        void headerEl.offsetWidth;
        headerEl.classList.add("eazy-header-quake");
        setTimeout(function () { headerEl.classList.remove("eazy-header-quake"); }, 600);
      }
      try { navigator.vibrate(40); } catch (e) {}

      btn.classList.remove("creator-chat__toggle--dock-flash");
      void btn.offsetWidth;
      btn.classList.add("creator-chat__toggle--dock-flash");
      setTimeout(function () { btn.classList.remove("creator-chat__toggle--dock-flash"); }, 1500);
    }
  }

  function undockEazy(btn) {
    var panel = document.getElementById("creator-chat-panel");
    if (!btn) return;
    _eazyDocked = false;
    btn.classList.remove("creator-chat__toggle--docked", "creator-chat__toggle--docked-mobile");
    btn.style.cssText = "";
    removeHeaderSpacer();
    document.body.classList.remove("eazy-header-docked");
    var topbarSlot = document.getElementById("eazy-topbar-slot");
    if (topbarSlot) topbarSlot.classList.remove("is-docked");
    var parent = panel ? panel.parentNode : document.body;
    if (panel) {
      parent.insertBefore(btn, panel);
    } else {
      document.body.appendChild(btn);
    }
    var pos = getSavedIconPos();
    if (pos) {
      applyIconPos(btn, pos);
    } else {
      btn.style.right = "20px";
      btn.style.bottom = "20px";
      btn.style.left = "auto";
      btn.style.top = "auto";
    }
    saveDockState(false);
  }

  function markEazyIconReady() {
    try {
      document.documentElement.classList.add("eazy-icon-ready");
    } catch (e) {}
  }

  function restoreIconPos(btn) {
    try {
      var docked = localStorage.getItem("eazy_docked");
      if (docked === "true") {
        dockEazy(btn);
        return;
      }
    } catch (e) {}
    var pos = getSavedIconPos();
    if (pos) applyIconPos(btn, pos);
    markEazyIconReady();
  }

  function scheduleSyncIconPos() {
    if (_iconSyncTimer) clearTimeout(_iconSyncTimer);
    _iconSyncTimer = setTimeout(function () {
      _iconSyncTimer = null;
      syncIconPosToServer();
    }, 3000);
  }

  function syncIconPosToServer() {
    var userId = null;
    if (window.EazyBot && window.EazyBot.getUserId) userId = window.EazyBot.getUserId();
    if (!userId) return;

    var desktop = null;
    var mobile = null;
    try {
      var dRaw = localStorage.getItem("eazy_icon_desktop");
      if (dRaw) desktop = JSON.parse(dRaw);
      var mRaw = localStorage.getItem("eazy_icon_mobile");
      if (mRaw) mobile = JSON.parse(mRaw);
    } catch (e) {}

    var prefs = { icon_position: {} };
    if (desktop) prefs.icon_position.desktop = desktop;
    if (mobile) prefs.icon_position.mobile = mobile;
    prefs.eazy_docked = isDocked();

    fetch(API_BASE + "?op=eazy-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, preferences: prefs })
    }).catch(function () {});
  }

  function loadIconPosFromServer(btn) {
    var userId = null;
    if (window.EazyBot && window.EazyBot.getUserId) userId = window.EazyBot.getUserId();
    if (!userId) return;

    var hasLocal = getSavedIconPos();
    var hasDockedLocal = false;
    try { hasDockedLocal = localStorage.getItem("eazy_docked") !== null; } catch (e) {}
    if (hasLocal && hasDockedLocal) return;

    fetch(API_BASE + "?op=eazy-memory&user_id=" + encodeURIComponent(userId), { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.memory || !data.memory.preferences) return;
        try {
          var prefs = typeof data.memory.preferences === "string" ? JSON.parse(data.memory.preferences) : data.memory.preferences;
          if (prefs.eazy_docked === true && !_eazyDocked) {
            try { localStorage.setItem("eazy_docked", "true"); } catch (e) {}
            dockEazy(btn);
            return;
          }
          if (!prefs.icon_position) return;
          var key = isMobileIcon() ? "mobile" : "desktop";
          var pos = prefs.icon_position[key];
          if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
            try { localStorage.setItem(getIconStorageKey(), JSON.stringify(pos)); } catch (e) {}
            applyIconPos(btn, pos);
          }
        } catch (e) {}
      })
      .catch(function () {});
  }

  function updateDockedPosition(btn) {
    if (!_eazyDocked || !btn) return;
    if (isNewLayout()) return;
    if (btn.classList.contains("creator-chat__toggle--docked-mobile")) {
      if (isMobileIcon()) {
        positionDockedMobile(btn);
      } else {
        positionDockedDesktop(btn);
      }
    }
  }

  function distToSlot(cx, cy) {
    var slot = getHeaderSlot();
    if (!slot || !slot.classList.contains("is-active")) return Infinity;
    var r = slot.getBoundingClientRect();
    if (r.width === 0) return Infinity;
    var sx = r.left + r.width / 2;
    var sy = r.top + r.height / 2;
    return Math.sqrt(Math.pow(cx - sx, 2) + Math.pow(cy - sy, 2));
  }

  function insertHeaderSpacer() {
    removeHeaderSpacer();
    if (isMobileIcon()) return;
    if (isNewLayout()) return;
    var logo = document.querySelector(".header-logo");
    if (!logo || !logo.parentNode) return;
    var sp = document.createElement("div");
    sp.id = "eazy-snap-spacer";
    sp.style.cssText = "width:48px;height:48px;flex-shrink:0;";
    logo.parentNode.insertBefore(sp, logo.nextSibling);
  }

  function removeHeaderSpacer() {
    var sp = document.getElementById("eazy-snap-spacer");
    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
  }

  function initIconDrag(btn) {
    if (!btn) {
      console.warn("[CreatorChat] initIconDrag called without button element");
      return;
    }
    restoreIconPos(btn);
    loadIconPosFromServer(btn);

    var startX, startY, startLeft, startTop, dragging;
    var longPressTimer = null;
    var snapModeActive = false;
    var lastCx = 0, lastCy = 0;

    function pxToVw(px) { return (px / window.innerWidth) * 100; }
    function pxToVh(px) { return (px / window.innerHeight) * 100; }

    function activateSnapMode() {
      snapModeActive = true;
      btn.classList.add("creator-chat__toggle--snap-mode");

      var targetSize = isMobileIcon() ? 34 : 40;
      var currentSize = btn.offsetWidth || 56;
      var scaleFactor = targetSize / currentSize;
      btn.style.transform = "scale(" + scaleFactor.toFixed(3) + ")";

      insertHeaderSpacer();

      var slot = getHeaderSlot();
      if (slot) {
        slot.classList.add("is-active");
        slot.classList.remove("is-near");
        positionSlotAtTarget(slot);
      }
      try { navigator.vibrate(30); } catch (e) {}
    }

    function deactivateSnapMode() {
      snapModeActive = false;
      btn.classList.remove("creator-chat__toggle--snap-mode");
      btn.style.transform = "";
      removeHeaderSpacer();
      var slot = getHeaderSlot();
      if (slot) {
        slot.classList.remove("is-active", "is-near");
        slot.style.removeProperty("--snap-glow");
        slot.style.removeProperty("left");
        slot.style.removeProperty("top");
      }
    }

    function onDragMove(cx, cy) {
      lastCx = cx;
      lastCy = cy;
      var dx = cx - startX;
      var dy = cy - startY;

      if (!dragging && (Math.abs(dx) > ICON_DRAG_THRESHOLD || Math.abs(dy) > ICON_DRAG_THRESHOLD)) {
        dragging = true;
        _iconDragged = true;
        btn.classList.add("creator-chat__toggle--dragging");
        if (_wasDocked && _eazyDocked) {
          var r = btn.getBoundingClientRect();
          undockEazy(btn);
          btn.style.left = r.left + "px";
          btn.style.top = r.top + "px";
          btn.style.right = "auto";
          btn.style.bottom = "auto";
          startLeft = r.left;
          startTop = r.top;
        }
        if (!snapModeActive && longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }

      if (dragging) {
        var newLeft = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, startLeft + dx));
        var newTop = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight, startTop + dy));
        btn.style.left = newLeft + "px";
        btn.style.top = newTop + "px";
        btn.style.right = "auto";
        btn.style.bottom = "auto";

        if (snapModeActive) {
          var d = distToSlot(cx, cy);
          var slot = getHeaderSlot();
          if (slot) {
            slot.classList.toggle("is-near", d < SNAP_NEAR_DISTANCE);
            var glowRange = SNAP_NEAR_DISTANCE * 2;
            var intensity = Math.max(0, Math.min(1, 1 - (d / glowRange)));
            slot.style.setProperty("--snap-glow", intensity);
          }
        }
      }
    }

    function onDragEnd() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      if (snapModeActive && dragging) {
        var d = distToSlot(lastCx, lastCy);
        if (d < SNAP_DISTANCE) {
          dockEazy(btn, true);
        } else if (_eazyDocked) {
          undockEazy(btn);
        } else {
          var rect = btn.getBoundingClientRect();
          var xPct = pxToVw(rect.left);
          var yPct = pxToVh(rect.top);
          saveIconPos(xPct, yPct);
          applyIconPos(btn, { x: xPct, y: yPct });
        }
        deactivateSnapMode();
      } else if (dragging) {
        if (_eazyDocked) {
          undockEazy(btn);
        } else {
          var rect2 = btn.getBoundingClientRect();
          var xPct2 = pxToVw(rect2.left);
          var yPct2 = pxToVh(rect2.top);
          saveIconPos(xPct2, yPct2);
          applyIconPos(btn, { x: xPct2, y: yPct2 });
        }
      }

      if (snapModeActive) deactivateSnapMode();
      btn.classList.remove("creator-chat__toggle--dragging");
      setTimeout(function () { _iconDragged = false; }, 50);
    }

    var _wasDocked = false;
    function startDrag(cx, cy) {
      startX = cx;
      startY = cy;
      var rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      dragging = false;
      snapModeActive = false;
      lastCx = cx;
      lastCy = cy;
      _wasDocked = _eazyDocked;

      longPressTimer = setTimeout(function () {
        longPressTimer = null;
        activateSnapMode();
      }, LONG_PRESS_MS);
    }

    btn.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      startDrag(e.clientX, e.clientY);

      function move(ev) { onDragMove(ev.clientX, ev.clientY); }
      function stop() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", stop);
        onDragEnd();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
    });

    btn.addEventListener("touchstart", function (e) {
      if (!e.touches || !e.touches.length) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY);

      function onTouchMove(ev) {
        if (!ev.touches || !ev.touches.length) return;
        ev.preventDefault();
        onDragMove(ev.touches[0].clientX, ev.touches[0].clientY);
      }
      function onTouchEnd() {
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchEnd);
        onDragEnd();
      }
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd);
      document.addEventListener("touchcancel", onTouchEnd);
    }, { passive: false });

    window.addEventListener("resize", function () {
      updateDockedPosition(btn);
    });
  }

  let openDelayedId = null;

  function togglePanel() {
    if (limitReached) {
      showLimitModal(rateLimit.reset_at, rateLimit.reset_in);
      return;
    }
    const panel = document.getElementById("creator-chat-panel");
    const toggle = document.getElementById("creator-chat-toggle");
    const isOpen = panel && panel.classList.contains("creator-chat__panel--open");
    if (isOpen) {
      markEazyManualClose();
      if (openDelayedId) { clearTimeout(openDelayedId); openDelayedId = null; }
      closePanel();
    } else {
      if (toggle && toggle.classList.contains("creator-chat__toggle--custom-icon") && window.innerWidth >= 750) {
        if (openDelayedId) return;
        openDelayedId = setTimeout(function () {
          openDelayedId = null;
          openPanel();
        }, 1000);
      } else {
        openPanel();
      }
    }
  }

  function init() {
    const root = document.getElementById("creator-chat-root");
    if (!root) return;

    // Real browser reload/new open should re-enable auto-open logic.
    // Internal navigation in same tab keeps sessionStorage and should remain blocked.
    try {
      var navEntries = (performance && typeof performance.getEntriesByType === "function")
        ? performance.getEntriesByType("navigation")
        : [];
      var navType = navEntries && navEntries[0] ? navEntries[0].type : "";
      if (navType === "reload") {
        sessionStorage.removeItem("creator_chat_manual_close");
      }
    } catch (e) {}

    try {
      if (sessionStorage.getItem("creator_chat_limit_reached") === "1") {
        limitReached = true;
        window.__CREATOR_CHAT_LIMIT_REACHED = true;
        document.body.classList.add("creator-chat-limit-reached");
      }
    } catch (e) {}

    var toggleBtn = document.getElementById("creator-chat-toggle");
    if (!toggleBtn) {
      console.warn("[CreatorChat] Toggle button not found");
      return;
    }
    var lastToggle = 0;
    var _snapToggleTimer = null;
    window.addEventListener("eazy-guide-enter", function () {
      if (_snapToggleTimer) {
        clearTimeout(_snapToggleTimer);
        _snapToggleTimer = null;
      }
    });
    function doToggle() {
      if (_iconDragged) return;
      if (window.EazyGuide && window.EazyGuide.shouldSuppressChatOpen && window.EazyGuide.shouldSuppressChatOpen()) return;
      if (window.EazyGuide && window.EazyGuide.isActive && window.EazyGuide.isActive()) {
        window.EazyGuide.exit();
        return;
      }
      var now = Date.now();
      if (now - lastToggle < 400) return;

      if (isEazySnappedInHeader()) {
        if (_snapToggleTimer) clearTimeout(_snapToggleTimer);
        _snapToggleTimer = setTimeout(function () {
          _snapToggleTimer = null;
          if (window.EazyGuide && window.EazyGuide.shouldSuppressChatOpen && window.EazyGuide.shouldSuppressChatOpen()) return;
          if (window.EazyGuide && window.EazyGuide.isActive && window.EazyGuide.isActive()) return;
          lastToggle = Date.now();
          togglePanel();
        }, 450);
        return;
      }

      lastToggle = now;
      togglePanel();
    }
    toggleBtn.addEventListener("click", function () {
      doToggle();
    });
    toggleBtn.addEventListener("touchend", function (e) {
      if (_iconDragged) return;
      e.preventDefault();
      doToggle();
    }, { passive: false });

    initIconDrag(toggleBtn);
    markEazyIconReady();
    bindPanelCloseButtons();

    var backBtn = document.getElementById("creator-chat-back-to-eazy");
    if (backBtn) backBtn.addEventListener("click", deactivateSupportMode);

    var backdrop = document.getElementById("creator-chat-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", function () {
        markEazyManualClose();
        closePanel();
      });
    }

    var sendBtn = document.getElementById("creator-chat-send");
    var lastSend = 0;

    function playEazyClickAnim(type) {
      sendBtn.classList.remove("eazy-click-send", "eazy-click-idle", "creator-chat__mascot--talking");
      void sendBtn.offsetWidth;
      sendBtn.classList.add(type);
      sendBtn.addEventListener("animationend", function handler() {
        sendBtn.classList.remove(type);
        sendBtn.removeEventListener("animationend", handler);
      });
    }

    function doSend() {
      var now = Date.now();
      if (now - lastSend < 400) return;
      var input = document.getElementById("creator-chat-input");
      if (!input) return;
      if (!input.value.trim()) {
        playEazyClickAnim("eazy-click-idle");
        if (window.EazyTips) window.EazyTips.onEmptySendClick();
        return;
      }
      lastSend = now;
      playEazyClickAnim("eazy-click-send");
      sendMessage(input.value.trim());
    }
    sendBtn.addEventListener("click", function (e) {
      if (e.pointerType === "touch") return;
      doSend();
    });
    sendBtn.addEventListener("touchend", function (e) {
      e.preventDefault();
      doSend();
    }, { passive: false });

    var inputEl = document.getElementById("creator-chat-input");
    inputEl.addEventListener("input", function () {
      if (sendBtn.classList.contains("creator-chat__mascot-send")) {
        if (this.value.trim().length > 0) {
          sendBtn.classList.add("creator-chat__mascot--talking");
        } else {
          sendBtn.classList.remove("creator-chat__mascot--talking");
        }
      }
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (this.value.trim()) {
          playEazyClickAnim("eazy-click-send");
          sendMessage(this.value.trim());
        }
      }
    });

    window.addEventListener("creator-chat-limit-reached", function (e) {
      setLimitReached(true, e.detail && e.detail.reset_at, e.detail && e.detail.reset_in);
      if (e.detail && (e.detail.reset_at || e.detail.reset_in)) {
        showLimitModal(e.detail.reset_at, e.detail.reset_in);
      }
    });

    // Upload/save jobs started outside the chat flow (e.g. creator upload modal)
    // should still appear live in "Active jobs" with the same polling UX.
    window.addEventListener("creatorSaveJobStarted", function (e) {
      var jobId = e && e.detail && (e.detail.jobId || e.detail.job_id) ? String(e.detail.jobId || e.detail.job_id) : "";
      if (jobId) {
        _saveActiveJobId = jobId;
        try { localStorage.setItem(SAVE_PERSIST_KEY, JSON.stringify({ jobId: jobId, ts: Date.now() })); } catch (_) {}
        if (isUploadJobId(jobId)) {
          _activeUploadJobs[jobId] = true;
          refreshEazyUploadStateFromJobs();
        }
      }

      loadActiveJobs();
      if (!_panelOpen) openPanel();
      switchView("jobs");
      startJobsPolling();
      if (typeof animateEazyToActiveJobs === "function") setTimeout(animateEazyToActiveJobs, 600);
    });

    // Upload completion should refresh unread notifications in Eazy tab.
    window.addEventListener("creator-upload-finished", function (e) {
      var finishedJobId = e && e.detail && e.detail.jobId ? String(e.detail.jobId) : "";
      if (finishedJobId && _activeUploadJobs[finishedJobId]) {
        delete _activeUploadJobs[finishedJobId];
      }
      refreshEazyUploadStateFromJobs();
      loadNotifications();
      loadActiveJobs();
      if (_panelOpen) {
        // switchView("notifications"); // Notifications view removed
        switchView("chat"); // Switch to chat instead
      }
    });

    // Creator area mascot click should open this chat panel.
    window.addEventListener("eazy-mascot-click", function () {
      if (window.EazyGuide && window.EazyGuide.shouldSuppressChatOpen && window.EazyGuide.shouldSuppressChatOpen()) return;
      if (window.EazyGuide && window.EazyGuide.isActive && window.EazyGuide.isActive()) return;
      if (!_panelOpen) openPanel();
      switchView("chat");
    });

    initResize();
    updateRateLimitUI({ remaining: 30, limit: 30, reset_at: 0, reset_in: 0 });
    initDrawer();
    initTabs();
    initSidebar();
    try {
      var eazSp = new URLSearchParams(window.location.search);
      var artifactToken =
        eazSp.get("artifact_token") ||
        (eazSp.get("eazy") === "artifacts" || eazSp.get("eazy") === "artifacts-mint"
          ? eazSp.get("t") || eazSp.get("token")
          : null);
      var isMintPage = eazSp.get("eazy") === "artifacts-mint";
      if (isMintPage && artifactToken) {
        (function waitMintPage(attempts) {
          if (window.EazArtifactsMintPage && typeof window.EazArtifactsMintPage.open === "function") {
            window.EazArtifactsMintPage.open(String(artifactToken).trim());
            return;
          }
          if (attempts > 80) return;
          setTimeout(function () {
            waitMintPage(attempts + 1);
          }, 100);
        })(0);
      } else if (artifactToken) {
        try {
          sessionStorage.setItem("eaz_pending_artifact_token", String(artifactToken).trim());
        } catch (eStoreToken) {}
      }
      if (!isMintPage && (eazSp.get("eazy") === "artifacts" || artifactToken)) {
        openPanel();
        switchView("artifacts");
        (function waitArtifactsClaim(attempts) {
          if (window.EazArtifactsClaim && typeof window.EazArtifactsClaim.consumePending === "function") {
            window.EazArtifactsClaim.consumePending();
            return;
          }
          if (attempts > 80) return;
          setTimeout(function () {
            waitArtifactsClaim(attempts + 1);
          }, 100);
        })(0);
      }
    } catch (eazUrlErr) {}
    window.addEventListener("creatorJobCompleted", function (ev) {
      var job = ev && ev.detail && ev.detail.job;
      var isGenerate = job && job.action !== "save" && !job.saving;
      var isHero = job && job.action === "hero-generate";
      var isVideo = job && job.action === "video-generate";
      if (isGenerate && _panelOpen && (isHero || isVideo || _activeView === "jobs")) {
        loadNotifications();
        setTimeout(function () {
          _notifFeedScope = "user";
          switchView("notifications");
          renderNotificationsInView();
        }, 800);
      }
    });
    initMobileKeyboard();
    initUploadModal();
    initChatUpload();
    if (window.EazyFunctions) window.EazyFunctions.init();
    var pathInit = window.location.pathname || "";
    var onShopHomeInit = pathInit === "/" || pathInit === "";
    // Shop homepage: defer voice map until panel open (saves a network hop on first paint).
    if (onShopHomeInit) {
      window.__EAZ_DEFER_EAZY_VOICE__ = true;
    } else {
      loadEazyVoiceMap();
    }

    setTimeout(resumeGenCompleted, 1500);

    // Auto-open: on real page load, if user did not manually close this session, open chat when there are active jobs or unread notifications
    setTimeout(function () {
      try {
        if (sessionStorage.getItem("creator_chat_manual_close") === "1") return;
        var ownerId = getUserId();
        if (!ownerId) return;
        var path = window.location.pathname || "";
        var onCreatorDashboard =
          path.indexOf("/pages/creator-dashboard") !== -1 ||
          path.indexOf("/pages/creator-overview") !== -1;
        var onShopHome = path === "/" || path === "";
        // Shop homepage: skip auto-open network storm (list-jobs + notif count) — user opens chat manually.
        if (onShopHome) return;

        // Restore active save job: after reload, show jobs view so user can see save progress
        try {
          var stored = localStorage.getItem(SAVE_PERSIST_KEY);
          if (stored) {
            var parsed = JSON.parse(stored);
            var persistJobId = parsed && parsed.jobId ? String(parsed.jobId) : "";
            var persistTs = parsed && typeof parsed.ts === "number" ? parsed.ts : 0;
            if (persistJobId && persistTs && (Date.now() - persistTs) < 900000) {
              _saveActiveJobId = persistJobId;
              if (!_panelOpen) openPanel();
              switchView("jobs");
              startJobsPolling();
              loadActiveJobs();
              return;
            }
          }
        } catch (_) {}

        var notifPromise = fetch(API_BASE + "?op=get-notification-count&owner_id=" + encodeURIComponent(ownerId), { credentials: "include" })
          .then(function (r) { return r.json(); })
          .then(function (d) { return (d && typeof d.unread_count === "number") ? d.unread_count : 0; })
          .catch(function () { return 0; });
        var jobsPromise = onCreatorDashboard
          ? Promise.resolve(0)
          : fetch(API_BASE + "?op=list-jobs&owner_id=" + encodeURIComponent(ownerId) + "&limit=20", { credentials: "include" })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var items = d.items || d.jobs || [];
                return items.filter(function (j) { return !j.done || j.saving; }).length;
              })
              .catch(function () { return 0; });
        Promise.all([notifPromise, jobsPromise]).then(function (res) {
          var unreadCount = res[0];
          var activeCount = res[1];
          if (!onCreatorDashboard && activeCount > 0) {
            if (!_panelOpen) openPanel();
            switchView("jobs");
          } else if (unreadCount > 0) {
            if (!_panelOpen) openPanel();
            switchView("notifications");
          }
        });
      } catch (e) {}
    }, 800);
  }

  /* ══════════════════════════════════════════════════════════════════
   *  TAB BAR (multi-conversation tabs)
   * ══════════════════════════════════════════════════════════════════ */

  function formatTabLabel(conv) {
    if (conv.preview) return conv.preview;
    if (conv.summary) return conv.summary;
    try {
      var d = new Date(conv.started_at || conv.last_message_at);
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "Chat";
    }
  }

  function renderTabs() {
    var container = document.getElementById("creator-chat-tabs");
    if (!container) return;
    container.innerHTML = "";

    _tabs.forEach(function (conv) {
      var isSupportTab = conv.id === conversationId && (supportMode || conv.mode === "support") && conv.support_status !== "closed" && _convSupportMeta.support_status !== "closed" && _convSupportMeta.support_status !== "resolved";
      var tab = document.createElement("button");
      tab.className = "creator-chat__tab" + (conv.id === conversationId ? " is-active" : "") + (isSupportTab ? " creator-chat__tab--support" : "");
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", conv.id === conversationId ? "true" : "false");
      tab.setAttribute("data-conv-id", conv.id);
      tab.title = formatTabLabel(conv);

      var label = document.createElement("span");
      var baseLabel = formatTabLabel(conv);
      label.textContent = isSupportTab
        ? (i18n("support_tab_prefix", "Live Support:") + " " + baseLabel.replace(/^Live Support:\s*/i, ""))
        : baseLabel;
      tab.appendChild(label);

      var closeBtn = document.createElement("button");
      closeBtn.className = "creator-chat__tab-close";
      closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l6 6M8 2L2 8"/></svg>';
      closeBtn.title = i18n("chatCloseTitle", "Close chat");
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeTab(conv.id);
      });
      tab.appendChild(closeBtn);

      tab.addEventListener("click", function () {
        if (conv.id !== conversationId) {
          switchToConversation(conv.id);
        }
      });

      container.appendChild(tab);
    });

    var scroll = document.getElementById("creator-chat-tabs-scroll");
    if (scroll) {
      var activeTab = container.querySelector(".is-active");
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
  }

  function loadTabList(callback) {
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&user_id=" + encodeURIComponent(userId) + "&list=1&status=active", {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.conversations) {
          _tabs = data.conversations;
          if (_tabs.length === 0 && conversationId) {
            _tabs = [{ id: conversationId, status: "active", message_count: 0, preview: "Neuer Chat" }];
          }
          _tabsLoaded = true;
          renderTabs();
        }
      })
      .catch(function () {})
      .finally(function () { if (callback) callback(); });
  }

  function switchToConversation(convId) {
    conversationId = convId;
    conversationLoaded = false;
    messages = [];

    var container = document.getElementById("creator-chat-messages");
    if (container) container.innerHTML = "";

    clearDesignState();
    renderTabs();

    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&user_id=" + encodeURIComponent(userId) + "&conv_id=" + encodeURIComponent(convId), {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.conversation) {
          conversationId = data.conversation.id;
          renderConversationMessages(data);
          conversationLoaded = true;
          renderTabs();
          stripNotificationsFromChat();
          restoreSupportFromServer(data.conversation);
        }
      })
      .catch(function (e) {
        console.warn("[CreatorChat] Switch conv error:", e);
      });
  }

  function createNewChat() {
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&new=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.conversation) {
          conversationId = data.conversation.id;
          conversationLoaded = true;
          messages = [];

          var container = document.getElementById("creator-chat-messages");
          if (container) container.innerHTML = "";

          clearDesignState();

          _tabs.unshift({
            id: data.conversation.id,
            status: "active",
            started_at: data.conversation.started_at,
            message_count: 0,
            preview: "Neuer Chat"
          });
          renderTabs();
          showBotGreeting({ conversationId: data.conversation.id });
          stripNotificationsFromChat();
        }
      })
      .catch(function (e) {
        console.warn("[CreatorChat] New chat error:", e);
      });
  }

  function closeTab(convId) {
    if (_tabs.length <= 1) return;

    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&close=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, conversation_id: convId })
    }).catch(function () {});

    _tabs = _tabs.filter(function (t) { return t.id !== convId; });

    if (convId === conversationId && _tabs.length > 0) {
      switchToConversation(_tabs[0].id);
    } else {
      renderTabs();
    }
  }


  function updateTabPreview(convId, text) {
    for (var i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === convId) {
        if (!_tabs[i].preview || _tabs[i].preview === "New chat") {
          _tabs[i].preview = (text || "").slice(0, 60);
          renderTabs();
        }
        break;
      }
    }
  }

  /* ── History Modal ── */
  function openHistoryModal() {
    var modal = document.getElementById("creator-chat-history-modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", "false");
    loadHistoryList();
  }

  function closeHistoryModal() {
    var modal = document.getElementById("creator-chat-history-modal");
    if (modal) modal.setAttribute("aria-hidden", "true");
  }

  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return dateStr || ""; }
  }

  /* ── Confirm Dialog (centered in chat panel) ── */
  function showHistoryConfirm(message, onConfirm) {
    var panel = document.getElementById("creator-chat-panel");
    if (!panel) return;

    var existing = panel.querySelector(".creator-chat__confirm-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.className = "creator-chat__confirm-overlay";
    overlay.innerHTML = '<div class="creator-chat__confirm-box">'
      + '<p>' + escapeHtml(message) + '</p>'
      + '<div class="creator-chat__confirm-actions">'
      + '<button type="button" class="creator-chat__confirm-cancel">Cancel</button>'
      + '<button type="button" class="creator-chat__confirm-delete">Delete</button>'
      + '</div></div>';

    overlay.querySelector(".creator-chat__confirm-cancel").addEventListener("click", function () {
      overlay.remove();
    });
    overlay.querySelector(".creator-chat__confirm-delete").addEventListener("click", function () {
      overlay.remove();
      onConfirm();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });

    panel.appendChild(overlay);
  }

  /* ── Delete single history conversation ── */
  function deleteHistoryConversation(convId, rowEl) {
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&delete=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, conversation_id: convId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && rowEl && rowEl.parentNode) {
          rowEl.style.transition = "opacity 0.2s, max-height 0.3s ease 0.1s";
          rowEl.style.opacity = "0";
          rowEl.style.maxHeight = rowEl.offsetHeight + "px";
          setTimeout(function () { rowEl.style.maxHeight = "0"; rowEl.style.padding = "0"; rowEl.style.margin = "0"; }, 50);
          setTimeout(function () {
            if (rowEl.parentNode) rowEl.remove();
            var list = document.getElementById("creator-chat-history-list");
            if (list && !list.querySelector(".creator-chat__history-row")) {
              list.innerHTML = '<div class="creator-chat__history-empty">No past chats available.</div>';
            }
          }, 350);
        }
      })
      .catch(function () {});
  }

  /* ── Delete all history ── */
  function deleteAllHistory() {
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&delete_history=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          var list = document.getElementById("creator-chat-history-list");
          if (list) list.innerHTML = '<div class="creator-chat__history-empty">No past chats available.</div>';
        }
      })
      .catch(function () {});
  }

  /* ── Mobile swipe-to-delete ── */
  function initSwipeDelete(rowEl, convId) {
    var item = rowEl.querySelector(".creator-chat__history-item");
    if (!item || window.innerWidth >= 750) return;

    var startX = 0, currentX = 0, swiping = false;
    var THRESHOLD = 60;

    item.addEventListener("touchstart", function (e) {
      var t = e.touches[0];
      startX = t.clientX;
      currentX = 0;
      swiping = true;
      item.style.transition = "none";
    }, { passive: true });

    item.addEventListener("touchmove", function (e) {
      if (!swiping) return;
      var t = e.touches[0];
      currentX = Math.min(0, t.clientX - startX);
      item.style.transform = "translateX(" + currentX + "px)";
    }, { passive: true });

    item.addEventListener("touchend", function () {
      if (!swiping) return;
      swiping = false;
      item.style.transition = "transform 0.2s ease";

      if (currentX < -THRESHOLD) {
        item.style.transform = "translateX(-64px)";

        var action = rowEl.querySelector(".creator-chat__history-swipe-action");
        if (action && !action._bound) {
          action._bound = true;
          action.addEventListener("click", function (e) {
            e.stopPropagation();
            showHistoryConfirm(i18n("chatDeleteChatConfirm", "Delete this chat permanently?"), function () {
              deleteHistoryConversation(convId, rowEl);
            });
          });
        }
      } else {
        item.style.transform = "translateX(0)";
      }
      currentX = 0;
    });
  }

  function loadHistoryList() {
    var list = document.getElementById("creator-chat-history-list");
    if (!list) return;
    list.innerHTML = '<div class="creator-chat__history-empty">Loading...</div>';

    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&user_id=" + encodeURIComponent(userId) + "&list=1&status=closed", {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.conversations || data.conversations.length === 0) {
          list.innerHTML = '<div class="creator-chat__history-empty">No past chats available.</div>';
          return;
        }

        list.innerHTML = "";
        data.conversations.forEach(function (conv) {
          var row = document.createElement("div");
          row.className = "creator-chat__history-row";

          var swipeAction = document.createElement("button");
          swipeAction.type = "button";
          swipeAction.className = "creator-chat__history-swipe-action";
          swipeAction.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M12.5 4l-.5 9a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 014 13l-.5-9"/></svg>';
          row.appendChild(swipeAction);

          var item = document.createElement("button");
          item.type = "button";
          item.className = "creator-chat__history-item";
          item.innerHTML = '<div class="creator-chat__history-item-icon">'
            + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M2 8h12M2 13h8"/></svg>'
            + '</div>'
            + '<div class="creator-chat__history-item-body">'
            + '<div class="creator-chat__history-item-preview">' + escapeHtml(conv.preview || conv.summary || "Chat") + '</div>'
            + '<div class="creator-chat__history-item-date">' + formatDate(conv.last_message_at || conv.started_at) + ' · ' + (conv.message_count || 0) + ' messages</div>'
            + '</div>'
            + '<button type="button" class="creator-chat__history-item-delete" aria-label="' + escapeHtml(i18n("chatDelete", "Delete")) + '" title="' + escapeHtml(i18n("chatDelete", "Delete")) + '">'
            + '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M12.5 4l-.5 9a1.5 1.5 0 01-1.5 1.5h-5A1.5 1.5 0 014 13l-.5-9"/></svg>'
            + '</button>';

          var deleteBtn = item.querySelector(".creator-chat__history-item-delete");
          deleteBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            showHistoryConfirm(i18n("chatDeleteChatConfirm", "Delete this chat permanently?"), function () {
              deleteHistoryConversation(conv.id, row);
            });
          });

          item.addEventListener("click", function (e) {
            if (e.target.closest(".creator-chat__history-item-delete")) return;
            reopenConversation(conv.id);
          });

          row.appendChild(item);
          list.appendChild(row);

          initSwipeDelete(row, conv.id);
        });
      })
      .catch(function () {
        list.innerHTML = '<div class="creator-chat__history-empty">' + escapeHtml(i18n("chatLoadError", "Error loading.")) + '</div>';
      });
  }

  function reopenConversation(convId) {
    var userId = getUserId();
    fetch(API_BASE + "?op=eazy-conv&reopen=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, conversation_id: convId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          closeHistoryModal();
          switchToConversation(convId);
          loadTabList();
        }
      })
      .catch(function () {});
  }

  function initTabs() {
    var newBtn = document.getElementById("creator-chat-tabs-new");
    var historyBtn = document.getElementById("creator-chat-tabs-history");
    var historyClose = document.getElementById("creator-chat-history-close");
    var historyClear = document.getElementById("creator-chat-history-clear");

    if (newBtn) {
      newBtn.addEventListener("click", createNewChat);
    }

    if (historyBtn) {
      historyBtn.addEventListener("click", openHistoryModal);
    }

    if (historyClose) {
      historyClose.addEventListener("click", closeHistoryModal);
    }

    if (historyClear) {
      historyClear.addEventListener("click", function () {
        showHistoryConfirm(i18n("chatDeleteHistoryConfirm", "Delete complete chat history permanently? Open chats remain."), function () {
          deleteAllHistory();
        });
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  MOBILE KEYBOARD – lift modal above virtual keyboard
   * ══════════════════════════════════════════════════════════════════ */
  function initMobileKeyboard() {
    if (window.innerWidth >= 750) return;

    updateMobileViewportMetrics();
    window.addEventListener("resize", updateMobileViewportMetrics);

    var panel = document.getElementById("creator-chat-panel");
    var input = document.getElementById("creator-chat-input");
    if (!panel || !input || !window.visualViewport) return;

    function clearKeyboardPanelStyles() {
      panel.style.bottom = "";
      panel.style.height = "";
      panel.style.maxHeight = "";
    }

    function adjustForKeyboard() {
      if (window.innerWidth >= 750) return;
      updateMobileViewportMetrics();
      var vv = window.visualViewport;
      if (!vv) return;
      var keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
      if (keyboardHeight > 50) {
        panel.style.bottom = Math.max(0, Math.round(keyboardHeight)) + "px";
        panel.style.height = Math.round(vv.height) + "px";
        panel.style.maxHeight = Math.round(vv.height) + "px";
      } else {
        clearKeyboardPanelStyles();
      }
    }

    updateMobileViewportMetrics();
    window.visualViewport.addEventListener("resize", adjustForKeyboard);
    window.visualViewport.addEventListener("scroll", adjustForKeyboard);

    input.addEventListener("focus", adjustForKeyboard);

    input.addEventListener("blur", function () {
      setTimeout(function () {
        clearKeyboardPanelStyles();
        updateMobileViewportMetrics();
      }, 100);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  SIDEBAR (view switching: chat, notifications, jobs, settings, functions)
   * ══════════════════════════════════════════════════════════════════ */
  var _sidebarOpen = false;
  var _activeView = "chat";
  var _notifDataUser = [];
  var _notifDataSystemCreator = [];
  var _notifDataSystemShop = [];
  var _notifFeedScope = "user";
  var _jobsFeedScope = "user";
  var _notifFilter = "unread";
  var _jobsData = [];
  var _lastActiveJobsCount = 0;
  var _notifPollTimer = null;
  var _jobsPollTimer = null;
  var _eazyGamesRefreshGen = 0;
  var _creatorCodeBubbleSeenKey = "eazy_creator_code_bubble_seen";
  var CREATOR_CODE_NOTIF_PREFIX = "creator_code_";
  var SIDEBAR_KEY = "eazy_sidebar_open";

  function openSidebar() {
    var sidebar = document.getElementById("creator-chat-sidebar");
    var backdrop = document.getElementById("creator-chat-sidebar-backdrop");
    var panel = document.getElementById("creator-chat-panel");
    if (!sidebar) return;
    sidebar.classList.add("is-open");
    if (panel) panel.classList.add("has-sidebar-open");
    if (backdrop) backdrop.setAttribute("aria-hidden", "false");
    _sidebarOpen = true;
    try { localStorage.setItem(SIDEBAR_KEY, "1"); } catch (e) {}
  }

  function closeSidebar() {
    var sidebar = document.getElementById("creator-chat-sidebar");
    var backdrop = document.getElementById("creator-chat-sidebar-backdrop");
    var panel = document.getElementById("creator-chat-panel");
    if (!sidebar) return;
    sidebar.classList.remove("is-open");
    if (panel) panel.classList.remove("has-sidebar-open");
    if (backdrop) backdrop.setAttribute("aria-hidden", "true");
    _sidebarOpen = false;
    try { localStorage.setItem(SIDEBAR_KEY, "0"); } catch (e) {}
  }

  function toggleSidebar() {
    if (_sidebarOpen) closeSidebar(); else openSidebar();
  }

  /** Desktop: sidebar beim Öffnen des Chat-Modals immer einblenden; mobil geschlossen starten. */
  function applySidebarPreferenceForDesktop() {
    if (!document.getElementById("creator-chat-sidebar")) return;
    if (isMobile()) {
      closeSidebar();
      return;
    }
    openSidebar();
  }

  function refreshEazyGamesView() {
    _eazyGamesRefreshGen += 1;
    var myGen = _eazyGamesRefreshGen;
    var statusEl = document.getElementById("creator-chat-games-status");
    var prizeEl = document.getElementById("creator-chat-games-prize");
    var prizeRow = document.getElementById("creator-chat-games-prize-row");
    var playBtn = document.getElementById("creator-chat-games-play");
    var memoryRoot = document.getElementById("creator-chat-games-memory-root");
    var connectRoot = document.getElementById("creator-chat-games-connect-root");
    var simonRoot = document.getElementById("creator-chat-games-simon-root");
    var outcomeEl = document.getElementById("creator-chat-games-outcome");
    var introEl = document.querySelector(".creator-chat__games-intro");
    if (!statusEl || !playBtn) return;

    function gm(key, fb) {
      return i18n(key, fb);
    }

    var rulesDlgBtn = document.getElementById("creator-chat-games-header-info-btn");
    var rulesDlg = document.getElementById("creator-chat-games-rules-dialog");
    var rulesDlgClose = document.getElementById("creator-chat-games-rules-close");
    if (rulesDlgBtn && rulesDlg && !rulesDlgBtn.dataset.eazyBound) {
      rulesDlgBtn.dataset.eazyBound = "1";
      rulesDlgBtn.addEventListener("click", function () {
        var dyn = document.getElementById("creator-chat-games-rules-dynamic");
        var slugToday = window.__eazyTodayGameSlug || "";
        var memHints = window.__eazyLastMemoryHints;
        var connHints = window.__eazyLastConnectHints;
        var simonHints = window.__eazyLastSimonHints;
        if (dyn && slugToday === "simon_says" && simonHints && simonHints.target_rounds != null) {
          var baseSec = Math.round(Number(simonHints.play_ms_base || simonHints.play_ms_per_round) / 1000);
          dyn.textContent = gm(
            "games_simon_rules_live",
            "Today's puzzle: {{rounds}} rounds. Round 1: {{base}}s — +2s each round."
          )
            .replace(/\{\{rounds\}\}/g, String(simonHints.target_rounds || 7))
            .replace(/\{\{base\}\}/g, String(baseSec));
        } else if (dyn && slugToday === "connect_four_5x5" && connHints && connHints.play_ms != null) {
          dyn.textContent = gm(
            "games_connect_rules_live",
            "Today's puzzle: {{size}}×{{size}} grid, {{win}} in a row, {{seconds}}s total. A draw counts as a loss."
          )
            .replace(/\{\{size\}\}/g, String(connHints.size || 5))
            .replace(/\{\{win\}\}/g, String(connHints.win_len || 4))
            .replace(/\{\{seconds\}\}/g, String(Math.round(Number(connHints.play_ms) / 1000)));
        } else if (dyn && memHints && memHints.max_flip_attempts != null && memHints.play_ms != null) {
          var tmpl = gm(
            "games_rules_live_caps",
            "Today's puzzle: up to {{attempts}} pair attempts after your peek; {{seconds}}s on the play clock."
          );
          var line = tmpl
            .replace(/\{\{attempts\}\}/g, String(memHints.max_flip_attempts))
            .replace(/\{\{seconds\}\}/g, String(Math.round(Number(memHints.play_ms) / 1000)));
          if (memHints.max_wrong_moves != null) {
            line +=
              " " +
              gm("games_rules_wrong_cap", "Wrong guesses (non-matching pairs) allowed: {{n}}.").replace(
                /\{\{n\}\}/g,
                String(memHints.max_wrong_moves)
              );
          }
          dyn.textContent = line;
        } else if (dyn) {
          dyn.textContent = "";
        }
        if (rulesDlg.showModal) rulesDlg.showModal();
      });
      if (rulesDlgClose) {
        rulesDlgClose.addEventListener("click", function () {
          if (rulesDlg.close) rulesDlg.close();
        });
      }
      rulesDlg.addEventListener("click", function (e) {
        if (e.target === rulesDlg && rulesDlg.close) rulesDlg.close();
      });
    }

    function setPlainPrizeLine(amountStr) {
      if (!prizeEl || !prizeRow) return;
      if (!amountStr) {
        prizeRow.hidden = true;
        prizeEl.textContent = "";
        return;
      }
      prizeRow.hidden = false;
      prizeEl.textContent = gm("games_prize_label", "Prize value") + ": " + amountStr;
    }

    function setWinPrizeButton(giftCardId, amountStr) {
      if (!prizeEl || !prizeRow || !giftCardId) return;
      prizeRow.hidden = false;
      prizeEl.innerHTML = "";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "creator-chat__games-prize-link";
      b.textContent =
        gm("games_prize_label", "Prize value") +
        ": " +
        amountStr +
        " — " +
        gm("games_prize_open_card", "Open gift card");
      b.addEventListener("click", function () {
        if (window.CreatorChat && typeof window.CreatorChat.close === "function") {
          window.CreatorChat.close();
        }
        if (typeof window.openEazGiftCardDetailModal === "function") {
          window.openEazGiftCardDetailModal(String(giftCardId));
        } else if (typeof window.openEazVoucherModal === "function") {
          window.openEazVoucherModal({ tab: "gift-cards", subtab: "gc-rewards" });
        }
      });
      prizeEl.appendChild(b);
    }

    function playGamesLossSound() {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        var ctx = new Ctx();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = "sine";
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(280, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.52);
      } catch (eSound) {}
    }

    function updateGamesLivesFooter(data) {
      var host = document.getElementById("creator-chat-games-footer-lives");
      var countEl = document.getElementById("creator-chat-games-lives-count");
      if (!host || !countEl) return;
      if (!data || !uid) {
        host.hidden = true;
        return;
      }
      host.hidden = false;
      if (data.lives_unlimited === true) {
        countEl.textContent = gm("games_lives_unlimited", "∞");
        return;
      }
      var n = Number(data.lives_count);
      if (!Number.isFinite(n)) n = 0;
      countEl.textContent =
        n === 1
          ? gm("games_lives_count_one", "1 life")
          : gm("games_lives_count", "{{count}}").replace("{{count}}", String(n));
    }

    function fetchLivesAfterFinish(cb) {
      fetch(
        API_BASE +
          "?op=daily-game-state&shop=" +
          encodeURIComponent(shop) +
          "&logged_in_customer_id=" +
          encodeURIComponent(uid)
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.ok) {
            window.__eazyLastGamesState = data;
            updateGamesLivesFooter(data);
          }
          if (typeof cb === "function") cb(data);
        })
        .catch(function () {
          if (typeof cb === "function") cb(null);
        });
    }

    function showFinishOverlay(finishData, prizeAmountStr, done) {
      if (finishData && finishData.mascot_xp_awarded > 0 && window.EazyMascotTab && typeof window.EazyMascotTab.showGameXp === "function") {
        window.EazyMascotTab.showGameXp(finishData.mascot_xp_awarded);
      }
      if (!outcomeEl) {
        if (done) done();
        return;
      }
      outcomeEl.innerHTML = "";
      var oc = finishData && finishData.outcome;
      if (oc !== "win" && oc !== "loss") {
        if (done) done();
        return;
      }
      var inner = document.createElement("div");
      inner.className =
        "creator-chat__games-outcome-inner creator-chat__games-outcome-inner--" +
        (oc === "win" ? "win" : "loss") +
        " creator-chat__games-outcome-inner--anim";

      if (oc === "win") {
        var conf = document.createElement("div");
        conf.className = "creator-chat__games-outcome-confetti";
        inner.appendChild(conf);
        var msg = document.createElement("p");
        msg.className = "creator-chat__games-outcome-msg";
        msg.textContent = gm("games_anim_win_title", "You won!");
        inner.appendChild(msg);
        if (finishData.loot && finishData.loot.card && finishData.loot.card.definition) {
          var lootLine = document.createElement("p");
          lootLine.className = "creator-chat__games-outcome-sub creator-chat__games-outcome-loot";
          lootLine.textContent =
            gm("games_loot_won", "You won") + ": " + finishData.loot.card.definition.name;
          inner.appendChild(lootLine);
        }
      } else {
        playGamesLossSound();
        var msgL = document.createElement("p");
        msgL.className = "creator-chat__games-outcome-msg";
        msgL.textContent = gm("games_anim_loss_title", "So close!");
        inner.appendChild(msgL);
        var subL = document.createElement("p");
        subL.className = "creator-chat__games-outcome-sub";
        subL.textContent = gm(
          "games_anim_loss_sub",
          "Time ran out, too many attempts, or no prize this round."
        );
        inner.appendChild(subL);
      }

      outcomeEl.appendChild(inner);
      var winMs = 1300;
      var lossMs = 1100;

      function finishFlow(stateData) {
        if (outcomeEl) outcomeEl.innerHTML = "";
        if (oc === "win") {
          if (
            window.EazyGamesHub &&
            typeof window.EazyGamesHub.openCollectionWithHighlight === "function"
          ) {
            window.EazyGamesHub.openCollectionWithHighlight(finishData);
          } else if (
            window.EazyGamesHub &&
            typeof window.EazyGamesHub.setSection === "function"
          ) {
            window.EazyGamesHub.setSection("collection");
          }
        } else {
          var noLives =
            stateData &&
            stateData.lives_unlimited !== true &&
            Number(stateData.lives_count) === 0;
          if (noLives) {
            if (outcomeEl) {
              outcomeEl.innerHTML =
                '<div class="creator-chat__games-outcome-inner creator-chat__games-outcome-inner--loss">' +
                '<p class="creator-chat__games-outcome-msg">' +
                gm("games_loss_no_lives_title", "No lives left") +
                "</p>" +
                '<p class="creator-chat__games-outcome-sub">' +
                gm(
                  "games_loss_no_lives_sub",
                  "You have no lives left. Ask your friends for another life."
                ) +
                "</p></div>";
            }
            window.setTimeout(function () {
              if (outcomeEl) {
                var askBtn = document.createElement("button");
                askBtn.type = "button";
                askBtn.className = "eazy-games-btn eazy-games-btn--filled creator-chat__games-ask-friend";
                askBtn.textContent = gm("games_ask_friend", "Ask a Friend");
                askBtn.addEventListener("click", function () {
                  if (
                    window.EazyGamesHub &&
                    typeof window.EazyGamesHub.navigateToFriendsSubtab === "function"
                  ) {
                    window.EazyGamesHub.navigateToFriendsSubtab("friends");
                  }
                  if (outcomeEl) outcomeEl.innerHTML = "";
                  if (done) done();
                });
                outcomeEl.querySelector(".creator-chat__games-outcome-inner").appendChild(askBtn);
              }
            }, 400);
            window.setTimeout(function () {
              if (
                window.EazyGamesHub &&
                typeof window.EazyGamesHub.navigateToFriendsSubtab === "function"
              ) {
                window.EazyGamesHub.navigateToFriendsSubtab("friends");
              } else if (
                window.EazyGamesHub &&
                typeof window.EazyGamesHub.setSection === "function"
              ) {
                window.EazyGamesHub.setSection("friends");
              }
              if (outcomeEl) outcomeEl.innerHTML = "";
              if (done) done();
            }, 2200);
            return;
          }
        }
        if (done) done();
      }

      window.setTimeout(function () {
        fetchLivesAfterFinish(function (stateData) {
          finishFlow(stateData);
        });
      }, oc === "win" ? winMs : lossMs);
    }

    function resetGamesBoardQuiet() {
      try {
        if (typeof window.__eazyMemoryTimersAbort === "function") {
          window.__eazyMemoryTimersAbort();
          window.__eazyMemoryTimersAbort = null;
        }
      } catch (e) {}
      try {
        if (typeof window.__eazyConnectGameCleanup === "function") {
          window.__eazyConnectGameCleanup();
          window.__eazyConnectGameCleanup = null;
        }
      } catch (e2) {}
      try {
        if (typeof window.__eazySimonGameCleanup === "function") {
          window.__eazySimonGameCleanup();
          window.__eazySimonGameCleanup = null;
        }
      } catch (e3) {}
      window.__eazyMemoryGameCleanup = null;
      if (memoryRoot) {
        memoryRoot.innerHTML = "";
        memoryRoot.hidden = true;
      }
      if (connectRoot) {
        connectRoot.innerHTML = "";
        connectRoot.hidden = true;
      }
      if (simonRoot) {
        simonRoot.innerHTML = "";
        simonRoot.hidden = true;
      }
      if (outcomeEl) outcomeEl.innerHTML = "";
      var footerStrikeHost = document.getElementById("creator-chat-games-footer-strikes");
      var footerLeftHost = document.getElementById("creator-chat-games-footer-left");
      var timerHost = document.getElementById("creator-chat-games-timer-host");
      if (timerHost) {
        timerHost.hidden = true;
        timerHost.innerHTML = "";
      }
      if (footerStrikeHost) {
        footerStrikeHost.hidden = true;
        footerStrikeHost.innerHTML = "";
      }
      if (footerLeftHost) {
        var orphanPrimary = footerLeftHost.querySelector(".eazy-memory__primary");
        if (orphanPrimary) orphanPrimary.remove();
        var orphanConnect = footerLeftHost.querySelector(".eazy-connect__primary");
        if (orphanConnect) orphanConnect.remove();
        var orphanNr = footerLeftHost.querySelector(".eazy-simon__footer");
        if (orphanNr) orphanNr.remove();
      }
      var gamesBodyReset = document.getElementById("creator-chat-games-body");
      if (gamesBodyReset) gamesBodyReset.classList.remove("is-playing");
    }

    var uid = getUserId();
    var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : "";

    function setBusy(on) {
      playBtn.disabled = on;
      if (on) statusEl.textContent = gm("common_loading", "Loading…");
    }

    function getSelectedGameSlug() {
      if (window.EazyGamesPicker && typeof window.EazyGamesPicker.getSelectedSlug === "function") {
        return window.EazyGamesPicker.getSelectedSlug();
      }
      return window.__eazySelectedGameSlug || window.__eazyTodayGameSlug || "memory_match";
    }

    function syncPlayButtonForSelection(slug, gs) {
      if (!playBtn) return;
      if (!gs && window.__eazyLastGamesState && Array.isArray(window.__eazyLastGamesState.games)) {
        for (var i = 0; i < window.__eazyLastGamesState.games.length; i++) {
          if (window.__eazyLastGamesState.games[i].slug === slug) {
            gs = window.__eazyLastGamesState.games[i];
            break;
          }
        }
      }
      if (gs && gs.status === "cooldown") {
        playBtn.hidden = true;
        playBtn.disabled = true;
        if (statusEl) {
          var liveSec =
            window.EazyGamesPicker && typeof window.EazyGamesPicker.getLiveCooldownSec === "function"
              ? window.EazyGamesPicker.getLiveCooldownSec(slug)
              : gs.cooldown_remaining_sec;
          statusEl.textContent = gm(
            "games_cooldown_wait",
            "Available again in {{time}}"
          ).replace(
            "{{time}}",
            window.EazyGamesPicker && typeof window.EazyGamesPicker.formatCooldown === "function"
              ? window.EazyGamesPicker.formatCooldown(liveSec)
              : String(liveSec || 0)
          );
        }
        return;
      }
      if (gs && !gs.available && gs.status === "locked") {
        playBtn.hidden = true;
        playBtn.disabled = true;
        if (statusEl) {
          statusEl.textContent = gm("games_other_in_progress", "Finish your current game first.");
        }
        return;
      }
      if (gs && gs.available) {
        playBtn.hidden = false;
        playBtn.disabled = false;
      }
    }

    window.__eazyGamesOnSelectionChange = function (slug, gs) {
      window.__eazyTodayGameSlug = slug;
      window.__eazySelectedGameSlug = slug;
      applyIntroForSlug(slug);
      syncPlayButtonForSelection(slug, gs);
    };
    window.__eazyRefreshDailyGameState = refreshEazyGamesView;

    if (window.EazyGamesPicker && typeof window.EazyGamesPicker.init === "function") {
      window.EazyGamesPicker.init();
    }

    function applyIntroForSlug(slug) {
      if (introEl) introEl.style.display = "none";
      if (!introEl) return;
      if (slug === "memory_match") {
        introEl.textContent = gm(
          "games_memory_daily_intro",
          "Flip two tiles at a time. Non-matches flip back after a moment."
        );
      } else if (slug === "connect_four_5x5") {
        introEl.textContent = gm(
          "games_connect_daily_intro",
          "Place four in a row on the 5×5 grid before Eazy does. You have four minutes — a draw counts as a loss."
        );
      } else if (slug === "simon_says") {
        introEl.textContent = gm(
          "games_simon_daily_intro",
          "Watch Eazy's color sequence — it grows every round. Repeat it from memory before time runs out."
        );
      } else {
        introEl.textContent = gm("games_daily_intro", "");
      }
    }

    function mountMemoryBoard(deck, timing, boardOpts, prizeForRound) {
      resetGamesBoardQuiet();
      if (!memoryRoot || !window.EazyDailyMemoryGame || typeof window.EazyDailyMemoryGame.mount !== "function") {
        statusEl.textContent = gm("games_memory_board_error", "Could not load the game board.");
        playBtn.hidden = false;
        return;
      }
      playBtn.hidden = true;
      if (introEl) introEl.style.display = "none";
      if (prizeRow) prizeRow.hidden = true;
      var gamesBody = document.getElementById("creator-chat-games-body");
      if (gamesBody) gamesBody.classList.add("is-playing");
      var pre = !!(boardOpts && boardOpts.pregame);
      var footerLeft = document.getElementById("creator-chat-games-footer-left");
      var footerStrikes = document.getElementById("creator-chat-games-footer-strikes");
      var timerHostEl = document.getElementById("creator-chat-games-timer-host");
      var footerMount =
        footerLeft && footerStrikes ? { left: footerLeft, strikes: footerStrikes } : null;
      window.EazyDailyMemoryGame.mount({
        root: memoryRoot,
        apiBase: API_BASE,
        shop: shop,
        uid: uid,
        deck: deck,
        timing: timing || {},
        pregame: pre,
        i18n: gm,
        footerMount: footerMount,
        timerMount: timerHostEl || null,
        onComplete: function (fd) {
          showFinishOverlay(fd, prizeForRound || "", function () {
            refreshEazyGamesView();
          });
        },
      });
    }

    function getActivePlayKind() {
      return window.__eazyActivePlayKind === "bonus" ? "bonus" : "standard";
    }

    function playKindBody(extra) {
      var body = extra || {};
      if (getActivePlayKind() === "bonus") body.play_kind = "bonus";
      return body;
    }

    function postMemoryBegin(cb) {
      fetch(API_BASE + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          playKindBody({
            owner_id: uid,
            shop: shop,
            game_slug: getSelectedGameSlug(),
            memory_action: "begin",
          })
        ),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("http");
          return r.json();
        })
        .then(function (data) {
          cb(null, data);
        })
        .catch(function (e) {
          cb(e && e.message ? e : new Error("network"), null);
        });
    }

    function handleMemoryBeginPayload(err, data, prizeStr, boardOpts) {
      var gamesViewEl = document.getElementById("creator-chat-view-games");
      if (!gamesViewEl || !gamesViewEl.classList.contains("is-active")) {
        setBusy(false);
        return;
      }
      setBusy(false);
      if (err || !data) {
        statusEl.textContent = gm("chat_error_unknown", "Something went wrong.");
        playBtn.hidden = false;
        return;
      }
      if (!data.ok) {
        if (
          data.error === "daily_game_schema_missing" ||
          data.error === "customer_db_unavailable"
        ) {
          statusEl.textContent = gm(
            "games_schema_unavailable",
            "Daily games are temporarily unavailable. Please try again soon."
          );
        } else if (data.error === "memory_pool_empty") {
          statusEl.textContent = gm(
            "games_memory_pool_empty",
            "Not enough designs available for today's puzzle."
          );
        } else {
          statusEl.textContent = data.message || gm("games_outcome_failed", "Could not start.");
        }
        playBtn.hidden = false;
        return;
      }
      if (data.memory_deck && data.memory_timing) {
        statusEl.textContent = "";
        mountMemoryBoard(data.memory_deck, data.memory_timing, boardOpts || {}, prizeStr);
        return;
      }
      statusEl.textContent = gm("games_memory_board_error", "Could not load the game board.");
      playBtn.hidden = false;
    }

    function mountConnectBoard(connectBoard, timing, boardOpts, prizeForRound) {
      resetGamesBoardQuiet();
      if (
        !connectRoot ||
        !window.EazyDailyConnectGame ||
        typeof window.EazyDailyConnectGame.mount !== "function"
      ) {
        statusEl.textContent = gm("games_connect_board_error", "Could not load the game board.");
        playBtn.hidden = false;
        return;
      }
      playBtn.hidden = true;
      if (introEl) introEl.style.display = "none";
      if (prizeRow) prizeRow.hidden = true;
      var gamesBodyC = document.getElementById("creator-chat-games-body");
      if (gamesBodyC) gamesBodyC.classList.add("is-playing");
      var preC = !!(boardOpts && boardOpts.pregame);
      var footerLeftC = document.getElementById("creator-chat-games-footer-left");
      var footerStrikesC = document.getElementById("creator-chat-games-footer-strikes");
      var timerHostC = document.getElementById("creator-chat-games-timer-host");
      var footerMountC =
        footerLeftC && footerStrikesC ? { left: footerLeftC, strikes: footerStrikesC } : null;
      window.EazyDailyConnectGame.mount({
        root: connectRoot,
        apiBase: API_BASE,
        shop: shop,
        uid: uid,
        board: connectBoard,
        timing: timing || {},
        pregame: preC,
        i18n: gm,
        footerMount: footerMountC,
        timerMount: timerHostC || null,
        onComplete: function (fd) {
          showFinishOverlay(fd, prizeForRound || "", function () {
            refreshEazyGamesView();
          });
        },
      });
    }

    function connectTutorialSkipped() {
      if (
        window.EazyDailyConnectGame &&
        typeof window.EazyDailyConnectGame.tutorialSkipped === "function"
      ) {
        return window.EazyDailyConnectGame.tutorialSkipped();
      }
      try {
        return localStorage.getItem("eazy_connect_tutorial_dismissed") === "1";
      } catch (e) {
        return false;
      }
    }

    function launchConnectDailyGame(prizeStr, boardOpts) {
      setBusy(true);
      postConnectBegin(function (err, data) {
        handleConnectBeginPayload(err, data, prizeStr || "", boardOpts || { pregame: false });
      });
    }

    function mountConnectTutorial(prizeStr) {
      resetGamesBoardQuiet();
      if (
        !connectRoot ||
        !window.EazyDailyConnectGame ||
        typeof window.EazyDailyConnectGame.mountTutorial !== "function"
      ) {
        statusEl.textContent = gm("games_connect_board_error", "Could not load the game board.");
        playBtn.hidden = false;
        return;
      }
      playBtn.hidden = true;
      if (introEl) introEl.style.display = "none";
      if (prizeRow) prizeRow.hidden = true;
      var gamesBodyT = document.getElementById("creator-chat-games-body");
      if (gamesBodyT) gamesBodyT.classList.add("is-playing");
      var footerLeftT = document.getElementById("creator-chat-games-footer-left");
      var footerStrikesT = document.getElementById("creator-chat-games-footer-strikes");
      var footerMountT = footerLeftT && footerStrikesT ? { left: footerLeftT } : null;
      statusEl.textContent = "";
      window.EazyDailyConnectGame.mountTutorial({
        root: connectRoot,
        i18n: gm,
        footerMount: footerMountT,
        onStartGame: function (skipNext) {
          if (
            skipNext &&
            window.EazyDailyConnectGame &&
            typeof window.EazyDailyConnectGame.setTutorialSkipped === "function"
          ) {
            window.EazyDailyConnectGame.setTutorialSkipped(true);
          }
          launchConnectDailyGame(prizeStr, { pregame: false });
        },
      });
    }

    function postConnectBegin(cb) {
      fetch(API_BASE + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          playKindBody({
            owner_id: uid,
            shop: shop,
            game_slug: getSelectedGameSlug(),
            connect_action: "begin",
          })
        ),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("http");
          return r.json();
        })
        .then(function (data) {
          cb(null, data);
        })
        .catch(function (e) {
          cb(e && e.message ? e : new Error("network"), null);
        });
    }

    function handleConnectBeginPayload(err, data, prizeStr, boardOpts) {
      var gamesViewEl = document.getElementById("creator-chat-view-games");
      if (!gamesViewEl || !gamesViewEl.classList.contains("is-active")) {
        setBusy(false);
        return;
      }
      setBusy(false);
      if (err || !data) {
        statusEl.textContent = gm("chat_error_unknown", "Something went wrong.");
        playBtn.hidden = false;
        return;
      }
      if (!data.ok) {
        if (
          data.error === "daily_game_schema_missing" ||
          data.error === "customer_db_unavailable"
        ) {
          statusEl.textContent = gm(
            "games_schema_unavailable",
            "Daily games are temporarily unavailable. Please try again soon."
          );
        } else {
          statusEl.textContent = data.message || gm("games_outcome_failed", "Could not start.");
        }
        playBtn.hidden = false;
        return;
      }
      if (data.connect_board && data.connect_timing) {
        statusEl.textContent = "";
        mountConnectBoard(data.connect_board, data.connect_timing, boardOpts || {}, prizeStr);
        return;
      }
      statusEl.textContent = gm("games_connect_board_error", "Could not load the game board.");
      playBtn.hidden = false;
    }

    function mountSimonBoard(timing, boardOpts, prizeForRound) {
      resetGamesBoardQuiet();
      if (!simonRoot) {
        statusEl.textContent = gm("games_simon_board_error", "Could not load the game board.");
        playBtn.hidden = false;
        return;
      }
      if (
        !window.EazyDailySimonGame ||
        typeof window.EazyDailySimonGame.mount !== "function"
      ) {
        var loadBundle =
          typeof window.eazLoadCreatorChatBundle === "function"
            ? window.eazLoadCreatorChatBundle()
            : Promise.resolve();
        loadBundle
          .then(function () {
            if (
              window.EazyDailySimonGame &&
              typeof window.EazyDailySimonGame.mount === "function"
            ) {
              mountSimonBoard(timing, boardOpts, prizeForRound);
              return;
            }
            statusEl.textContent = gm("games_simon_board_error", "Could not load the game board.");
            playBtn.hidden = false;
          })
          .catch(function () {
            statusEl.textContent = gm("games_simon_board_error", "Could not load the game board.");
            playBtn.hidden = false;
          });
        return;
      }
      playBtn.hidden = true;
      if (introEl) introEl.style.display = "none";
      if (prizeRow) prizeRow.hidden = true;
      var gamesBodyS = document.getElementById("creator-chat-games-body");
      if (gamesBodyS) gamesBodyS.classList.add("is-playing");
      var footerLeftS = document.getElementById("creator-chat-games-footer-left");
      var footerMountS = footerLeftS ? { left: footerLeftS } : null;
      window.EazyDailySimonGame.mount({
        root: simonRoot,
        apiBase: API_BASE,
        shop: shop,
        uid: uid,
        timing: timing || {},
        gameMeta: boardOpts && boardOpts.gameMeta,
        targetRounds: boardOpts && boardOpts.targetRounds,
        round: boardOpts && boardOpts.round,
        playbackSteps: boardOpts && boardOpts.playbackSteps,
        phase: boardOpts && boardOpts.phase,
        lootBoostPct: boardOpts && boardOpts.lootBoostPct,
        canContinue: boardOpts && boardOpts.canContinue,
        i18n: gm,
        footerMount: footerMountS,
        onComplete: function (fd) {
          showFinishOverlay(fd, prizeForRound || "", function () {
            refreshEazyGamesView();
          });
        },
      });
    }

    function postSimonBegin(cb) {
      fetch(API_BASE + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          playKindBody({
            owner_id: uid,
            shop: shop,
            game_slug: getSelectedGameSlug(),
            simon_action: "begin",
          })
        ),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("http");
          return r.json();
        })
        .then(function (data) {
          cb(null, data);
        })
        .catch(function (e) {
          cb(e && e.message ? e : new Error("network"), null);
        });
    }

    function handleSimonBeginPayload(err, data, prizeStr) {
      var gamesViewEl = document.getElementById("creator-chat-view-games");
      if (!gamesViewEl || !gamesViewEl.classList.contains("is-active")) {
        setBusy(false);
        return;
      }
      setBusy(false);
      if (err || !data) {
        statusEl.textContent = gm("chat_error_unknown", "Something went wrong.");
        playBtn.hidden = false;
        return;
      }
      if (!data.ok) {
        if (
          data.error === "daily_game_schema_missing" ||
          data.error === "customer_db_unavailable"
        ) {
          statusEl.textContent = gm(
            "games_schema_unavailable",
            "Daily games are temporarily unavailable. Please try again soon."
          );
        } else {
          statusEl.textContent = data.message || gm("games_outcome_failed", "Could not start.");
        }
        playBtn.hidden = false;
        return;
      }
      if (data.already_played) {
        statusEl.textContent =
          data.message || gm("games_already_played", "You already played today.");
        playBtn.hidden = true;
        playBtn.disabled = true;
        return;
      }
      if (
        data.simon_timing &&
        Array.isArray(data.simon_playback_steps) &&
        data.simon_playback_steps.length > 0
      ) {
        statusEl.textContent = "";
        mountSimonBoard(data.simon_timing, {
          targetRounds: data.simon_target_rounds,
          round: data.simon_round,
          playbackSteps: data.simon_playback_steps,
          phase: data.simon_phase,
          gameMeta: data.simon_game,
          lootBoostPct: data.simon_loot_boost_pct,
          canContinue: data.simon_can_continue !== false,
        }, prizeStr);
        return;
      }
      statusEl.textContent = gm("games_simon_board_error", "Could not load the game board.");
      playBtn.hidden = false;
    }

    function launchSimonDailyGame(prizeStr) {
      setBusy(true);
      postSimonBegin(function (err, data) {
        handleSimonBeginPayload(err, data, prizeStr || "");
      });
    }

    if (window.__EAZY_GUEST || !uid) {
      resetGamesBoardQuiet();
      statusEl.textContent = gm("games_login", "Sign in to play the daily game.");
      if (prizeRow) prizeRow.hidden = true;
      playBtn.hidden = true;
      return;
    }

    playBtn.onclick = function () {
      if (playBtn.disabled) return;
      var clickGen = _eazyGamesRefreshGen;
      var slugClick = getSelectedGameSlug();
      setBusy(true);
      if (slugClick === "connect_four_5x5") {
        var prizeForConnect = window.__eazyLastGamesPrize || "";
        if (connectTutorialSkipped()) {
          launchConnectDailyGame(prizeForConnect, { pregame: false });
        } else {
          setBusy(false);
          mountConnectTutorial(prizeForConnect);
        }
        return;
      }
      if (slugClick === "simon_says") {
        launchSimonDailyGame(window.__eazyLastGamesPrize || "");
        return;
      }
      postMemoryBegin(function (err, data) {
        if (clickGen !== _eazyGamesRefreshGen) {
          setBusy(false);
          return;
        }
        handleMemoryBeginPayload(err, data, window.__eazyLastGamesPrize || "", { pregame: true });
      });
    };

    playBtn.hidden = true;
    setBusy(true);
    fetch(
      API_BASE +
        "?op=daily-game-state&shop=" +
        encodeURIComponent(shop) +
        "&logged_in_customer_id=" +
        encodeURIComponent(uid)
    )
      .then(function (r) {
        if (!r.ok) throw new Error("http");
        return r.json();
      })
      .then(function (data) {
        if (myGen !== _eazyGamesRefreshGen) return;
        setBusy(false);
        if (!data.ok) {
          if (data.error === "unauthorized") {
            statusEl.textContent = gm("games_login", "Sign in to play the daily game.");
          } else if (
            data.error === "daily_game_schema_missing" ||
            data.error === "customer_db_unavailable"
          ) {
            statusEl.textContent = gm(
              "games_schema_unavailable",
              "Daily games are temporarily unavailable. Please try again soon."
            );
          } else {
            statusEl.textContent = data.message || gm("chat_error_unknown", "Something went wrong.");
          }
          return;
        }

        window.__eazyLastGamesState = data;
        updateGamesLivesFooter(data);
        if (
          data.pending_life_invites > 0 &&
          window.EazyGamesHub &&
          typeof window.EazyGamesHub.navigateToFriendsSubtab === "function" &&
          !window.__eazyLifeInvitePromptShown
        ) {
          window.__eazyLifeInvitePromptShown = true;
          window.EazyGamesHub.navigateToFriendsSubtab("invites");
        }
        var bonusRoundAvailable =
          data.bonus_play_available === true && data.standard_play_completed === true;
        window.__eazyActivePlayKind = bonusRoundAvailable ? "bonus" : "standard";
        if (window.EazyGamesPicker && typeof window.EazyGamesPicker.applyState === "function") {
          window.EazyGamesPicker.applyState(data);
        }

        var slug = data.selected_game_slug || data.today_game_slug || data.game_slug || "";
        window.__eazyTodayGameSlug = slug;
        window.__eazySelectedGameSlug = slug;
        applyIntroForSlug(slug);

        var selectedGs = null;
        if (Array.isArray(data.games)) {
          for (var gi = 0; gi < data.games.length; gi++) {
            if (data.games[gi].slug === slug) {
              selectedGs = data.games[gi];
              break;
            }
          }
        }

        window.__eazyLastMemoryHints = data.memory_hints || null;
        window.__eazyLastConnectHints = data.connect_hints || null;
        window.__eazyLastSimonHints = data.simon_hints || null;

        var adminHint =
          data.daily_game_admin_unlimited === true
            ? gm(
                "games_admin_unlimited_hint",
                "Admin mode: unlimited rounds today."
              )
            : "";

        var prize = data.prize_amount || "";
        if (data.win_probability != null) {
          var pct = Math.round(Number(data.win_probability) * 100);
          prize =
            pct +
            "% " +
            (gm("games_win_chance_suffix", "win chance") || "win chance") +
            " · " +
            (gm("games_random_prizes_hint", "random daily prizes") || "random daily prizes");
        }
        window.__eazyLastGamesPrize = prize;

        var outcome = data.outcome;

        if (data.pending_memory) {
          statusEl.textContent =
            gm("games_memory_resume", "You have a game in progress — continuing.") +
            (adminHint ? " " + adminHint : "");
          playBtn.hidden = true;
          setBusy(true);
          postMemoryBegin(function (err, payload) {
            if (myGen !== _eazyGamesRefreshGen) {
              setBusy(false);
              return;
            }
            handleMemoryBeginPayload(err, payload, prize, {});
          });
          setPlainPrizeLine(prize);
          return;
        }

        if (data.pending_connect) {
          statusEl.textContent =
            gm("games_connect_resume", "You have a game in progress — continuing.") +
            (adminHint ? " " + adminHint : "");
          playBtn.hidden = true;
          setBusy(true);
          postConnectBegin(function (err, payload) {
            if (myGen !== _eazyGamesRefreshGen) {
              setBusy(false);
              return;
            }
            handleConnectBeginPayload(err, payload, prize, {});
          });
          setPlainPrizeLine(prize);
          return;
        }

        if (data.pending_simon) {
          statusEl.textContent =
            gm("games_simon_resume", "You have a game in progress — continuing.") +
            (adminHint ? " " + adminHint : "");
          playBtn.hidden = true;
          setBusy(true);
          postSimonBegin(function (err, payload) {
            if (myGen !== _eazyGamesRefreshGen) {
              setBusy(false);
              return;
            }
            handleSimonBeginPayload(err, payload, prize);
          });
          setPlainPrizeLine(prize);
          return;
        }

        if (data.pending && !data.pending_memory && !data.pending_connect && !data.pending_simon) {
          resetGamesBoardQuiet();
          playBtn.disabled = true;
          playBtn.hidden = true;
          statusEl.textContent = gm("games_pending", "Still processing — try again shortly.");
          setPlainPrizeLine(prize);
          return;
        }

        if (data.already_played && outcome === "win" && !bonusRoundAvailable) {
          resetGamesBoardQuiet();
          playBtn.disabled = true;
          playBtn.hidden = true;
          setWinPrizeButton(data.gift_card_id, prize);
          statusEl.textContent = gm("games_outcome_win", "You won a gift card!");
          syncPlayButtonForSelection(slug, selectedGs);
          return;
        }
        if (data.already_played && outcome === "loss" && !bonusRoundAvailable) {
          resetGamesBoardQuiet();
          playBtn.disabled = true;
          playBtn.hidden = true;
          setPlainPrizeLine(prize);
          syncPlayButtonForSelection(slug, selectedGs);
          if (!(selectedGs && selectedGs.status === "cooldown")) {
            statusEl.textContent = gm("games_outcome_loss", "Not this time. Come back tomorrow.");
          }
          return;
        }
        if (data.already_played && outcome === "failed_issue" && !bonusRoundAvailable) {
          resetGamesBoardQuiet();
          playBtn.disabled = true;
          playBtn.hidden = true;
          setPlainPrizeLine(prize);
          syncPlayButtonForSelection(slug, selectedGs);
          if (!(selectedGs && selectedGs.status === "cooldown")) {
            statusEl.textContent = gm("games_outcome_failed", "We could not issue the prize.");
          }
          return;
        }
        if (data.already_played && !bonusRoundAvailable) {
          resetGamesBoardQuiet();
          playBtn.disabled = true;
          playBtn.hidden = true;
          setPlainPrizeLine(prize);
          syncPlayButtonForSelection(slug, selectedGs);
          if (!(selectedGs && selectedGs.status === "cooldown")) {
            statusEl.textContent = gm("games_already_played", "You already played today.");
          }
          return;
        }

        playBtn.disabled = false;
        if (bonusRoundAvailable) {
          playBtn.textContent = gm("games_bonus_play", "Bonus round");
          statusEl.textContent = gm(
            "games_bonus_available",
            "A friend approved a bonus round — play again today!"
          );
        } else {
          playBtn.textContent = gm("games_play", "Play");
          statusEl.textContent = adminHint;
        }
        setPlainPrizeLine(prize);
        syncPlayButtonForSelection(slug, selectedGs);

        if (slug !== "memory_match" && slug !== "connect_four_5x5" && slug !== "simon_says") {
          resetGamesBoardQuiet();
          playBtn.hidden = false;
          return;
        }

        resetGamesBoardQuiet();
        if (selectedGs && selectedGs.available) {
          playBtn.hidden = false;
        }
      })
      .catch(function () {
        if (myGen !== _eazyGamesRefreshGen) return;
        setBusy(false);
        statusEl.textContent = gm("chat_error_unknown", "Something went wrong.");
      });
  }

  function switchView(name) {
    var prevView = _activeView;
    var views = document.querySelectorAll(".creator-chat__view");
    var btns = document.querySelectorAll(".creator-chat__sidebar-btn");

    if (window.EazyCardCollectionUI && typeof window.EazyCardCollectionUI.closeAllDialogs === "function") {
      window.EazyCardCollectionUI.closeAllDialogs();
    }

    views.forEach(function (v) { v.classList.remove("is-active"); });
    btns.forEach(function (b) { b.classList.remove("is-active"); });

    var targetView = document.getElementById("creator-chat-view-" + name);
    if (targetView) targetView.classList.add("is-active");

    btns.forEach(function (b) {
      if (b.getAttribute("data-view") === name) b.classList.add("is-active");
    });

    stopNotifPolling();
    stopJobsPolling();

    if (prevView === "games" && name !== "games") {
      _eazyGamesRefreshGen += 1;
      try {
        if (typeof window.__eazyMemoryGameCleanup === "function") {
          window.__eazyMemoryGameCleanup();
        }
      } catch (e) {}
      window.__eazyMemoryGameCleanup = null;
    }

    _activeView = name;

    if (name === "chat") {
      stripNotificationsFromChat();
    } else if (name === "notifications") {
      loadNotifications();
      renderNotificationsInView();
      startNotifPolling();
    } else if (name === "jobs") {
      loadActiveJobs();
      startJobsPolling();
    } else if (name === "mascot") {
      if (window.EazyMascotTab && typeof window.EazyMascotTab.init === "function") {
        window.EazyMascotTab.init();
      }
    } else if (name === "games") {
      if (window.EazyGamesHub && typeof window.EazyGamesHub.init === "function") {
        window.EazyGamesHub.init();
      }
      if (window.EazyGamesPicker && typeof window.EazyGamesPicker.init === "function") {
        window.EazyGamesPicker.init();
      }
      refreshEazyGamesView();
    } else if (name === "artifacts") {
      if (window.EazArtifactsHub && typeof window.EazArtifactsHub.init === "function") {
        window.EazArtifactsHub.init();
      }
    } else if (name === "verify") {
      if (window.EazyVerify && typeof window.EazyVerify.init === "function") {
        window.EazyVerify.init();
      }
    }

    if (_genActiveJobId) {
      if (prevView === "chat" && name === "jobs") {
        setTimeout(placeEazyJobMascot, 300);
      } else if (prevView === "jobs" && name === "chat") {
        removeEazyJobMascot();
      }
    }

    if (window.innerWidth < 750) closeSidebar();
  }

  function initSidebar() {
    var toggleBtns = document.querySelectorAll(".creator-chat__hamburger");
    var closeBtn = document.getElementById("creator-chat-sidebar-close");
    var backdrop = document.getElementById("creator-chat-sidebar-backdrop");
    var strip = document.getElementById("creator-chat-sidebar-strip");
    var sidebarBtns = document.querySelectorAll(".creator-chat__sidebar-btn");

    toggleBtns.forEach(function (btn) {
      btn.addEventListener("click", toggleSidebar);
    });

    if (strip) {
      strip.addEventListener("click", toggleSidebar);
      strip.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSidebar(); }
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
    if (backdrop) backdrop.addEventListener("click", closeSidebar);

    sidebarBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var view = btn.getAttribute("data-view");
        if (view) switchView(view);
      });
    });

    var notifTabs = document.querySelectorAll(".creator-chat__notif-tab");
    notifTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var filter = tab.getAttribute("data-notif-filter");
        if (!filter) return;
        _notifFilter = filter;
        notifTabs.forEach(function (t) {
          t.classList.toggle("is-active", t.getAttribute("data-notif-filter") === filter);
          t.setAttribute("aria-selected", t.getAttribute("data-notif-filter") === filter ? "true" : "false");
        });
        updateNotifFeedChrome();
        renderNotificationsInView();
      });
    });

    var feedScopeTabs = document.querySelectorAll("[data-notif-feed-scope]");
    feedScopeTabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        _notifFeedScope = btn.getAttribute("data-notif-feed-scope") || "user";
        feedScopeTabs.forEach(function (b) {
          var active = b.getAttribute("data-notif-feed-scope") === _notifFeedScope;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", active ? "true" : "false");
        });
        renderNotificationsInView();
        updateNotifFeedChrome();
      });
    });

    var markAllBtn = document.getElementById("creator-chat-notif-mark-all");
    if (markAllBtn) {
      markAllBtn.textContent = i18n("notif_mark_all_read", "Mark all as read");
      markAllBtn.addEventListener("click", function () {
        var ownerId = getUserId();
        if (!ownerId || markAllBtn.disabled) return;
        if (_notifFeedScope === "user") {
          fetch(API_BASE + "?op=mark-all-notifications-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: ownerId }),
            credentials: "include"
          })
            .then(function () { loadNotifications(); })
            .catch(function () { loadNotifications(); });
        } else {
          Promise.all([
            fetch(API_BASE + "?op=mark-all-system-notifications-read", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: ownerId, audience: "creator" }),
              credentials: "include"
            }),
            fetch(API_BASE + "?op=mark-all-system-notifications-read", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user_id: ownerId, audience: "shop" }),
              credentials: "include"
            })
          ])
            .then(function () { loadNotifications(); })
            .catch(function () { loadNotifications(); });
        }
      });
    }

    var jobsFeedTabs = document.querySelectorAll("[data-jobs-feed-scope]");
    jobsFeedTabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        _jobsFeedScope = btn.getAttribute("data-jobs-feed-scope") || "user";
        jobsFeedTabs.forEach(function (b) {
          var active = b.getAttribute("data-jobs-feed-scope") === _jobsFeedScope;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", active ? "true" : "false");
        });
        loadActiveJobs();
      });
    });
  }

  /* ── Notifications / Logs ── */
  function notifTs(n) {
    var v = n.created_at;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
    var p = Date.parse(v || "");
    return Number.isFinite(p) ? p : 0;
  }

  /** System feed: merge creator + shop notifications (same user), dedupe by id, newest first. */
  function mergeSystemNotificationLists(a, b) {
    var map = {};
    function ingest(arr) {
      (arr || []).forEach(function (n) {
        var id = String(n.notification_id || n.id || "");
        if (!id) return;
        var cur = map[id];
        if (!cur || notifTs(n) >= notifTs(cur)) map[id] = n;
      });
    }
    ingest(a);
    ingest(b);
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) {
      return notifTs(y) - notifTs(x);
    });
  }

  function getActiveNotifListForView() {
    if (_notifFeedScope === "user") return _notifDataUser;
    return mergeSystemNotificationLists(_notifDataSystemCreator, _notifDataSystemShop);
  }

  function unreadUserNotifs() {
    return (_notifDataUser || []).filter(function (n) { return !n.is_read; }).length;
  }

  function unreadSystemNotifs() {
    return mergeSystemNotificationLists(_notifDataSystemCreator, _notifDataSystemShop).filter(function (n) {
      return !n.is_read;
    }).length;
  }

  function totalUnreadNotifs() {
    function cnt(arr) {
      return (arr || []).filter(function (n) { return !n.is_read; }).length;
    }
    return cnt(_notifDataUser) + cnt(_notifDataSystemCreator) + cnt(_notifDataSystemShop);
  }

  /** Syncs User/System tab counts and mark-all button (bell + toggle use user-only via [updateNotifBadge]). */
  function updateNotifFeedChrome() {
    var eu = document.getElementById("creator-chat-notif-count-user");
    var es = document.getElementById("creator-chat-notif-count-system");
    var u = unreadUserNotifs();
    var s = unreadSystemNotifs();
    var uLabel = u > 0 ? " (" + (u > 99 ? "99+" : String(u)) + ")" : "";
    var sLabel = s > 0 ? " (" + (s > 99 ? "99+" : String(s)) + ")" : "";
    if (eu) eu.textContent = uLabel;
    if (es) es.textContent = sLabel;
    var scopeUnread = _notifFeedScope === "user" ? u : s;
    var markRow = document.getElementById("creator-chat-notif-markall-row");
    if (markRow) {
      markRow.hidden = _notifFilter !== "unread" || scopeUnread <= 0;
    }
  }

  function loadNotifications() {
    var ownerId = getUserId();
    if (!ownerId) {
      return;
    }

    Promise.all([
      fetch(API_BASE + "?op=get-notifications&owner_id=" + encodeURIComponent(ownerId), { credentials: "include" }).then(function (r) { return r.json(); }),
      fetch(API_BASE + "?op=get-system-notifications&owner_id=" + encodeURIComponent(ownerId) + "&audience=creator", { credentials: "include" }).then(function (r) { return r.json(); }),
      fetch(API_BASE + "?op=get-system-notifications&owner_id=" + encodeURIComponent(ownerId) + "&audience=shop", { credentials: "include" }).then(function (r) { return r.json(); })
    ])
      .then(function (results) {
        var du = results[0];
        var dsc = results[1];
        var dsh = results[2];
        _notifDataUser = du.ok && Array.isArray(du.notifications) ? du.notifications : [];
        _notifDataSystemCreator = dsc.ok && Array.isArray(dsc.notifications) ? dsc.notifications : [];
        _notifDataSystemShop = dsh.ok && Array.isArray(dsh.notifications) ? dsh.notifications : [];
        maybeShowCreatorCodeMascotBubble();
        updateNotifBadge();
        stripNotificationsFromChat();
        if (_activeView === "notifications") renderNotificationsInView();
      })
      .catch(function () {
        _notifDataUser = [];
        _notifDataSystemCreator = [];
        _notifDataSystemShop = [];
        updateNotifBadge();
      });
  }

  var _notifParsedMap = {};

  /** Notifications belong in the Notifications tab only — never as chat bubbles. */
  function stripNotificationsFromChat() {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    container.querySelectorAll(".creator-chat__msg--notification").forEach(function (el) {
      el.remove();
    });
  }

  function isCreatorCodeNotificationCategory(cat) {
    return String(cat || "").toLowerCase().indexOf(CREATOR_CODE_NOTIF_PREFIX) === 0;
  }

  function loadCreatorCodeBubbleSeenIds() {
    try {
      var raw = sessionStorage.getItem(_creatorCodeBubbleSeenKey);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function markCreatorCodeBubbleSeen(nid) {
    if (!nid) return;
    try {
      var seen = loadCreatorCodeBubbleSeenIds();
      seen[String(nid)] = Date.now();
      sessionStorage.setItem(_creatorCodeBubbleSeenKey, JSON.stringify(seen));
    } catch (e) {}
  }

  function creatorCodeBubbleText(n) {
    var parsed = {};
    try { parsed = typeof n.data === "string" ? JSON.parse(n.data) : (n.data || {}); } catch (e) {}
    if (parsed.mascot_bubble === false) return "";
    var msg = String(n.message || "").trim();
    if (msg) return truncateNotifTitle(msg, 120);
    return truncateNotifTitle(n.title || i18n("chat_creator_code_bubble_default", "You received a Creator Code!"), 120);
  }

  function openCreatorCodesFromNotification(parsed) {
    if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === "function") {
      window.CreatorSettingsV2Modal.open({ tab: (parsed && parsed.open_tab) || "creator-codes" });
      return;
    }
    window.location.href = "/pages/creator-settings";
  }

  function maybeShowCreatorCodeMascotBubble() {
    if (window.__eaz_mode_active || window.__eaz_guide_active) return;
    if (window.EazySettings && !window.EazySettings.isMessageTypeEnabled("messages_mascot_bubbles")) return;

    var seen = loadCreatorCodeBubbleSeenIds();
    var unread = [].concat(
      _notifDataUser.filter(function (n) { return !n.is_read; }),
      _notifDataSystemCreator.filter(function (n) { return !n.is_read; }),
      _notifDataSystemShop.filter(function (n) { return !n.is_read; })
    );

    var candidate = null;
    unread.forEach(function (n) {
      var cat = String(n.category || n.event_type || "").toLowerCase();
      if (!isCreatorCodeNotificationCategory(cat)) return;
      var nid = String(n.notification_id || n.id || "");
      if (!nid || seen[nid]) return;
      if (!candidate) candidate = n;
    });

    if (!candidate) return;
    var bubbleText = creatorCodeBubbleText(candidate);
    if (!bubbleText) return;

    var nid = String(candidate.notification_id || candidate.id || "");
    markCreatorCodeBubbleSeen(nid);

    if (window.CreatorChatMascot && typeof window.CreatorChatMascot.showBubble === "function") {
      window.CreatorChatMascot.showBubble(bubbleText, false);
      setTimeout(function () {
        if (window.CreatorChatMascot && typeof window.CreatorChatMascot.hideBubble === "function") {
          window.CreatorChatMascot.hideBubble();
        }
      }, 8000);
    }
  }

  function renderNotificationsInView() {
    var list = document.getElementById("creator-chat-notif-list");
    if (!list) return;
    var filter = _notifFilter;
    var items = getActiveNotifListForView().filter(function (n) {
      return filter === "unread" ? !n.is_read : n.is_read;
    });
    _notifParsedMap = {};
    var emptyUnread = i18n("chat_notifications_none_unread", "No unread notifications");
    var emptyRead = i18n("chat_notifications_none_read", "No read notifications");
    var emptyText = filter === "unread" ? emptyUnread : emptyRead;
    if (items.length === 0) {
      list.innerHTML = '<div class="creator-chat__view-empty">' + escapeHtml(emptyText) + '</div>';
      return;
    }
    list.innerHTML = "";
    items.forEach(function (n, idx) {
      var parsed = {};
      try { parsed = typeof n.data === "string" ? JSON.parse(n.data) : (n.data || {}); } catch (e) {}
      var nid = n.notification_id || n.id || ("notif-" + idx);
      _notifParsedMap[nid] = { raw: n, parsed: parsed, category: String(n.event_type || n.category || "").toLowerCase() };
      var display = getNotificationDisplayInfo(n, parsed);
      var imgSrc = parsed.image_url || parsed.preview_url || parsed.result?.preview_url || parsed.result?.image_url || "";
      var cat = (n.category || "").toLowerCase();
      var hasSystemAction = cat === "system" && !!(parsed.design_id || parsed.job_id || parsed.preview_url || parsed.session_id);
      var hasCreatorCodeAction = isCreatorCodeNotificationCategory(cat);
      var hasAction = hasCreatorCodeAction || hasSystemAction || (cat !== "system" && (cat === "generated" || cat === "saved" || cat === "uploaded" || cat === "merged" || cat === "hero_image" || cat === "published" || cat === "publish" || cat === "removed_products" || cat === "removed_designs" || cat === "card_collection"));
      var item = document.createElement("div");
      item.className = "creator-chat__notif-item" + (!n.is_read ? " is-unread" : "") + (hasAction ? " has-action creator-chat__notif-item--shimmer" : "");
      item.setAttribute("data-notif-id", String(nid));
      item.setAttribute("role", "listitem");
      var title = truncateNotifTitle(n.title || n.category || i18n("chat_notifications_default_title", "Notification"), 50);
      var html = "";
      if (imgSrc) {
        html += '<div class="creator-chat__notif-preview-img"><img src="' + escapeHtml(imgSrc) + '" alt="" loading="lazy" /></div>';
      }
      html += '<div class="creator-chat__notif-content">';
      html += '<div class="creator-chat__notif-title">' + escapeHtml(title) + '</div>';
      if (display.datetime) html += '<div class="creator-chat__notif-datetime">' + escapeHtml(display.datetime) + '</div>';
      html += '<div class="creator-chat__notif-badges">';
      if (display.badgeCategory && display.badgeSubcategory) {
        html += '<span class="creator-chat__notif-badge ' + escapeHtml(display.badgeClass) + '">' + escapeHtml(display.badgeCategory) + '</span>';
        html += '<span class="creator-chat__notif-badge creator-chat__notif-badge--subcategory">' + escapeHtml(display.badgeSubcategory) + '</span>';
      } else {
        html += '<span class="creator-chat__notif-badge ' + escapeHtml(display.badgeClass) + '">' + escapeHtml(display.badgeLabel) + '</span>';
      }
      html += '</div>';
      html += '</div>';
      item.innerHTML = html;
      if (hasAction) {
        item.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          console.log("[CreatorChat] Notification clicked:", { category: cat, nid: nid, hasModalEntry: !!_notifParsedMap[nid] });
          var isUnread = !n.is_read;
          if (isUnread) markNotificationRead(nid);
          if (hasCreatorCodeAction) {
            openCreatorCodesFromNotification(parsed);
            return;
          }
          if (_notifParsedMap[nid]) openNotificationModal(_notifParsedMap[nid]);
        });
      }
      list.appendChild(item);
    });
  }

  function isCreatorPage() {
    return !!document.querySelector(".header--creator");
  }

  function applyModalTheme(modalEl) {
    if (!modalEl) return;
    if (isCreatorPage()) {
      modalEl.classList.add("creator-modal-theme--dark");
      modalEl.classList.remove("creator-modal-theme--light");
    } else {
      modalEl.classList.add("creator-modal-theme--light");
      modalEl.classList.remove("creator-modal-theme--dark");
    }
  }

  function waitForJobPreviewModal(maxMs) {
    var interval = 100;
    var start = Date.now();
    return new Promise(function (resolve) {
      function check() {
        if (window.CreatorJobPreviewModalGlobal && typeof window.CreatorJobPreviewModalGlobal.open === "function") {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxMs) {
          resolve(false);
          return;
        }
        setTimeout(check, interval);
      }
      check();
    });
  }

  function extractJobIdFromNotificationId(notificationId) {
    var raw = String(notificationId || "").trim();
    if (!raw) return "";

    // Support legacy/normalized forms:
    // - generated-<jobId>
    // - merged-<jobId>
    // - saved-<jobId>
    // - api-generated-<jobId>
    // - api-api-generated-<jobId> (defensive)
    while (raw.indexOf("api-") === 0) {
      raw = raw.slice("api-".length);
    }

    var prefixes = ["generated-", "merged-", "saved-"];
    for (var i = 0; i < prefixes.length; i++) {
      if (raw.indexOf(prefixes[i]) === 0) {
        return raw.slice(prefixes[i].length);
      }
    }

    return raw;
  }

  function openNotificationModal(entry) {
    var cat = entry.category;
    var parsed = entry.parsed;
    var raw = entry.raw;
    console.log("[CreatorChat] openNotificationModal:", { category: cat, notification_id: raw?.notification_id });

    if (cat === "generated" || cat === "merged") {
      // Generated/Merged: always open the Job Preview Modal flow.
      var jobId = String(parsed.job_id || extractJobIdFromNotificationId(raw.notification_id || raw.id) || "").trim();
      var previewUrl = parsed.preview_url || parsed.image_url || parsed.result?.preview_url || parsed.result?.image_url || "";
      var categoryKey = cat === "merged" ? "merged" : "generated";

      function buildJobFromData(data) {
        var url = (data && data.result && (data.result.preview_url || data.result.image_url)) ||
          (data && (data.preview_url || data.image_url || data.generated_image_url)) || previewUrl || "";
        return {
          job_id: jobId,
          result: { preview_url: url, image_url: url },
          design_id: (data && data.design_id) || null,
          prompt: (data && data.prompt) || parsed.prompt || parsed.design_prompt || "",
          design_prompt: (data && data.design_prompt) || parsed.design_prompt || parsed.prompt || "",
          final_prompt: (data && data.final_prompt) || parsed.final_prompt || "",
          image_url: (data && (data.image_url || data.preview_url)) || url || "",
          preview_url: url,
          visibility: (data && data.visibility) || parsed.visibility || "private"
        };
      }

      function mergeFetchedPreviewIntoJob(jobToOpen, fetched) {
        if (!fetched) return;
        var url = (fetched.result && (fetched.result.preview_url || fetched.result.image_url)) ||
          fetched.preview_url || fetched.image_url || fetched.generated_image_url || "";
        if (url) {
          jobToOpen.result = jobToOpen.result || {};
          jobToOpen.result.preview_url = jobToOpen.result.preview_url || url;
          jobToOpen.result.image_url = jobToOpen.result.image_url || jobToOpen.result.preview_url;
        }
      }

      var job = buildJobFromData(parsed);

      if (window.CreatorNotificationCategories?.[categoryKey]?.openPreviewModal && jobId) {
        var normalizedItemId = String(raw.notification_id || raw.id || (categoryKey + "-" + jobId));
        window.CreatorNotificationCategories[categoryKey].openPreviewModal(job, { id: normalizedItemId, data: job }).then(function () {
          applyThemeToOpenModals();
        }).catch(function () {});
        return;
      }

      function openJobPreview(jobToOpen) {
        if (window.CreatorJobPreviewModalGlobal && typeof window.CreatorJobPreviewModalGlobal.open === "function") {
          window.CreatorJobPreviewModalGlobal.open(jobToOpen);
          applyThemeToOpenModals();
          return true;
        }
        return false;
      }

      function doOpenWithJob(jobToOpen) {
        var hasModal = !!(window.CreatorJobPreviewModalGlobal && typeof window.CreatorJobPreviewModalGlobal.open === "function");
        console.log("[CreatorChat] doOpenWithJob:", { hasPreview: !!(jobToOpen.result && (jobToOpen.result.preview_url || jobToOpen.result.image_url)), hasModal: hasModal });
        if (openJobPreview(jobToOpen)) return;
        waitForJobPreviewModal(1500).then(function (ready) {
          if (ready) openJobPreview(jobToOpen);
          else console.warn("[CreatorChat] CreatorJobPreviewModalGlobal nicht verfügbar nach 1.5s");
        });
      }

      if (!jobId) {
        doOpenWithJob(job);
        return;
      }

      var ownerId = getUserOwnerId();
      if (!ownerId) console.warn("[CreatorChat] getUserOwnerId empty, get-generated may fail");
      fetch(API_BASE + "?op=get-generated&job_id=" + encodeURIComponent(jobId) + "&owner_id=" + encodeURIComponent(ownerId || ""), { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var fetchedJob = (data && data.ok && data.job) ? data.job : null;
          var jobToOpen = fetchedJob ? buildJobFromData(fetchedJob) : job;
          mergeFetchedPreviewIntoJob(jobToOpen, fetchedJob);
          console.log("[CreatorChat] get-generated result:", { ok: !!fetchedJob, hasPreview: !!(jobToOpen.result && (jobToOpen.result.preview_url || jobToOpen.result.image_url)) });
          doOpenWithJob(jobToOpen);
        })
        .catch(function (err) {
          console.warn("[CreatorChat] get-generated failed:", err && err.message);
          doOpenWithJob(job);
        });
    } else if (cat === "saved" || cat === "uploaded" || cat === "published" || cat === "publish") {
      // Saved, uploaded, or published design - open design modal
      var designId = parsed.design_id || null;
      if (designId) {
        fetchDesignAndOpenModal(designId, parsed);
      } else {
        var design = {
          id: parsed.design_id,
          preview_url: parsed.preview_url || parsed.original_url || "",
          original_url: parsed.original_url || parsed.preview_url || "",
          title: parsed.title || raw.title || "",
          job_id: parsed.job_id || "",
          owner_id: parsed.owner_id || getUserOwnerId(),
          visibility: parsed.visibility || "private"
        };
        openDesignModal(design);
      }
    } else if (cat === "hero_image") {
      // Hero image - open hero preview modal
      var heroId = parsed.hero_image_id || parsed.image_id || null;
      if (heroId && window.HeroPreviewModal && window.HeroPreviewModal.open) {
        window.HeroPreviewModal.open(heroId);
        applyThemeToOpenModals();
      }
    } else if (cat === "card_collection") {
      var tradeOfferId = Number(parsed.trade_offer_id || parsed.offer_id || parsed.trade_offer || 0);
      switchView("games");
      if (window.EazyGamesHub && typeof window.EazyGamesHub.setSection === "function") {
        window.EazyGamesHub.setSection("collection");
      }
      if (tradeOfferId > 0 && window.EazyGamesHub && typeof window.EazyGamesHub.openTradeReview === "function") {
        window.EazyGamesHub.openTradeReview(tradeOfferId);
      } else if (window.EazyGamesHub && typeof window.EazyGamesHub.navigateCollectionDeepLink === "function") {
        window.EazyGamesHub.navigateCollectionDeepLink(true);
      }
    } else if (cat === "system") {
      var sysJid = parsed.job_id != null ? String(parsed.job_id).trim() : "";
      if (sysJid && window.CreatorNotificationCategories && window.CreatorNotificationCategories.generated && typeof window.CreatorNotificationCategories.generated.openPreviewModal === "function") {
        var sysPreview =
          parsed.preview_url ||
          parsed.image_url ||
          (parsed.result && (parsed.result.preview_url || parsed.result.image_url)) ||
          "";
        var sysJob = {
          job_id: sysJid,
          prompt: parsed.prompt || (raw && raw.title) || "",
          design_prompt: parsed.design_prompt || parsed.final_prompt || null,
          final_prompt: parsed.final_prompt || parsed.design_prompt || null,
          preview_url: sysPreview || null,
          image_url: parsed.image_url || sysPreview || null,
          result:
            parsed.result && (parsed.result.preview_url || parsed.result.image_url)
              ? parsed.result
              : sysPreview
                ? { preview_url: sysPreview, image_url: parsed.image_url || sysPreview }
                : undefined,
          done: true,
          saved: false
        };
        window.CreatorNotificationCategories.generated.openPreviewModal(sysJob, { id: "system-" + sysJid, data: sysJob }).then(function () {
          applyThemeToOpenModals();
        }).catch(function () {});
        return;
      }
      var sysDesignId = parsed.design_id != null ? Number(parsed.design_id) : 0;
      if (Number.isFinite(sysDesignId) && sysDesignId > 0) {
        fetchDesignAndOpenModal(sysDesignId, parsed);
      }
    } else if (isCreatorCodeNotificationCategory(cat)) {
      openCreatorCodesFromNotification(parsed);
    }
    // Other categories (e.g., "publish", "transfer", etc.) can be added here if needed
  }

  function applyThemeToOpenModals() {
    setTimeout(function () {
      var themeClass = isCreatorPage() ? "creator-modal-theme--dark" : "creator-modal-theme--light";
      var removeClass = isCreatorPage() ? "creator-modal-theme--light" : "creator-modal-theme--dark";
      document.querySelectorAll("dialog[open], [role='dialog']:not([aria-hidden='true'])").forEach(function (d) {
        d.classList.add(themeClass);
        d.classList.remove(removeClass);
      });
    }, 100);
  }

  function fetchDesignAndOpenModal(designId, fallbackData) {
    fetch(API_BASE + "?op=get-design&design_id=" + encodeURIComponent(designId) + "&owner_id=" + encodeURIComponent(getUserOwnerId()), {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.design) {
          openDesignModal(data.design);
        } else {
          openDesignModal({
            id: designId,
            preview_url: fallbackData.preview_url || fallbackData.original_url || "",
            original_url: fallbackData.original_url || fallbackData.preview_url || "",
            title: fallbackData.title || "",
            visibility: fallbackData.visibility || "private"
          });
        }
      })
      .catch(function () {
        openDesignModal({
          id: designId,
          preview_url: fallbackData.preview_url || "",
          title: fallbackData.title || ""
        });
      });
  }

  function openDesignModal(design) {
    if (window.CreatorDesignModal && window.CreatorDesignModal.open) {
      window.CreatorDesignModal.open(design);
      applyThemeToOpenModals();
    } else if (window.CreatorDesignPreviewModal && window.CreatorDesignPreviewModal.open) {
      window.CreatorDesignPreviewModal.open(design);
      applyThemeToOpenModals();
    }
  }

  function markNotificationRead(notifId) {
    var ownerId = getUserId();
    if (!ownerId) return;

    if (_genCompletedJobId) {
      clearGenCompleted();
    }

    var idStr = String(notifId);
    var inSys =
      _notifDataSystemCreator.some(function (n) { return String(n.notification_id || n.id) === idStr; }) ||
      _notifDataSystemShop.some(function (n) { return String(n.notification_id || n.id) === idStr; });

    var url = inSys ? "mark-system-notification-read" : "mark-notification-read";
    var body = inSys
      ? JSON.stringify({ user_id: ownerId, notification_id: idStr })
      : JSON.stringify({
          owner_id: ownerId,
          user_id: ownerId,
          notification_id: idStr
        });

    fetch(API_BASE + "?op=" + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      credentials: "include"
    }).then(function () {
      loadNotifications();
      if (_activeView === "notifications") renderNotificationsInView();
    }).catch(function () {});
  }

  function updateNotifBadge() {
    var unread = unreadUserNotifs();
    var sidebarBadge = document.getElementById("creator-chat-notif-badge");
    if (sidebarBadge) {
      if (unread > 0) {
        sidebarBadge.textContent = unread > 99 ? "99+" : String(unread);
        sidebarBadge.style.display = "";
      } else {
        sidebarBadge.style.display = "none";
      }
    }
    var toggle = document.getElementById("creator-chat-toggle");
    if (!toggle) {
      updateNotifFeedChrome();
      return;
    }
    var existingBadge = toggle.querySelector(".creator-chat__toggle-badge");
    if (existingBadge) existingBadge.remove();
    if (unread > 0) {
      var badge = document.createElement("span");
      badge.className = "creator-chat__toggle-badge";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.setAttribute("aria-label", unread + " unread user notifications");
      toggle.appendChild(badge);
    }
    updateNotifFeedChrome();
  }

  function formatNotifDate(dateStr) {
    if (!dateStr) return "";
    try {
      var d = new Date(dateStr);
      var now = new Date();
      var diff = now - d;
      if (diff < 60000) return "Gerade eben";
      if (diff < 3600000) return Math.floor(diff / 60000) + " Min.";
      if (diff < 86400000) return Math.floor(diff / 3600000) + " Std.";
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
    } catch (e) { return ""; }
  }

  function formatNotifDateTime(dateStr) {
    if (!dateStr) return "";
    try {
      var d = new Date(dateStr);
      var now = new Date();
      var diff = now - d;
      var isToday = d.toDateString() === now.toDateString();
      var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
      var isYesterday = d.toDateString() === yesterday.toDateString();
      var datePart = isToday ? i18n("notif_today", "Today") : isYesterday ? i18n("notif_yesterday", "Yesterday") : d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "2-digit" });
      var timePart = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      return datePart + ", " + timePart;
    } catch (e) { return ""; }
  }

  function getNotificationDisplayInfo(n, parsed) {
    var cat = (n.category || "").toLowerCase().replace(/\s/g, "_");
    if (cat === "system") {
      return {
        badgeLabel: i18n("notif_badge_system", "System"),
        badgeClass: "creator-chat__notif-badge--unknown",
        badgeCategory: null,
        badgeSubcategory: null,
        datetime: formatNotifDateTime(n.updated_at || n.created_at),
        dateShort: formatNotifDate(n.updated_at || n.created_at),
        creatorName: null
      };
    }
    var designType = (parsed.design_type || "").toLowerCase().replace(/\s/g, "_").replace(/-/g, "_");
    var creatorName = parsed.creator_name || parsed.creatorName || null;
    var badgeLabel = i18n("notif_badge_unknown", "Notification");
    var badgeClass = "creator-chat__notif-badge--unknown";
    var badgeCategory = null;
    var badgeSubcategory = null;
    if (cat === "generated") {
      badgeCategory = i18n("notif_badge_generated", "Generate");
      badgeSubcategory = designType && ["classic", "pattern", "all_over", "full_coverage", "panorama"].indexOf(designType) >= 0
        ? (designType === "all_over" ? "All-Over" : designType === "full_coverage" ? "Full Coverage" : designType.charAt(0).toUpperCase() + designType.slice(1).replace(/_/g, " "))
        : (window.CreatorI18n?.designTypeClassic || "Classic");
      badgeLabel = badgeCategory + " – " + badgeSubcategory;
      badgeClass = "creator-chat__notif-badge--generated" + (designType ? "_" + designType : "");
    } else if (cat === "saved") { badgeLabel = i18n("notif_badge_saved", "Saved"); badgeClass = "creator-chat__notif-badge--saved"; }
    else if (cat === "uploaded") { badgeLabel = i18n("notif_badge_uploaded", "Upload"); badgeClass = "creator-chat__notif-badge--uploaded"; }
    else if (cat === "published" || cat === "publish") { badgeLabel = i18n("notif_badge_published", "Publish"); badgeClass = "creator-chat__notif-badge--published"; }
    else if (cat === "hero_image") { badgeLabel = i18n("notif_badge_hero_image", "Hero Image"); badgeClass = "creator-chat__notif-badge--hero_image"; }
    else if (cat === "merged") { badgeLabel = i18n("notif_badge_merged", "Merge"); badgeClass = "creator-chat__notif-badge--merged"; }
    else if (cat === "amazon_publish") { badgeLabel = i18n("notif_badge_amazon_publish", "Amazon Publish"); badgeClass = "creator-chat__notif-badge--amazon_publish"; }
    else if (cat === "amazon_unpublish") { badgeLabel = i18n("notif_badge_amazon_unpublish", "Amazon Remove"); badgeClass = "creator-chat__notif-badge--amazon_unpublish"; }
    else if (cat === "removed_products") { badgeLabel = i18n("notif_badge_removed_product", "Product removed"); badgeClass = "creator-chat__notif-badge--removed_product"; }
    else if (cat === "removed_designs") { badgeLabel = i18n("notif_badge_removed_design", "Design removed"); badgeClass = "creator-chat__notif-badge--removed_design"; }
    return {
      badgeLabel: badgeLabel,
      badgeClass: badgeClass,
      badgeCategory: badgeCategory,
      badgeSubcategory: badgeSubcategory,
      datetime: formatNotifDateTime(n.updated_at || n.created_at),
      dateShort: formatNotifDate(n.updated_at || n.created_at),
      creatorName: creatorName && String(creatorName).trim() ? String(creatorName).trim() : null
    };
  }

  function truncateNotifTitle(text, maxLen) {
    if (!text || typeof text !== "string") return String(text || "").trim() || "";
    var s = String(text).trim();
    if (s.length <= (maxLen || 50)) return s;
    return s.substring(0, maxLen || 50).trim() + "\u2026";
  }

  function startNotifPolling() {
    stopNotifPolling();
    _notifPollTimer = setInterval(function () { loadNotifications(); }, 30000);
  }

  function stopNotifPolling() {
    if (_notifPollTimer) { clearInterval(_notifPollTimer); _notifPollTimer = null; }
  }

  /* ── Active Jobs ── */
  function mergeActiveHeroJobs(regularJobs) {
    try {
      if (!window.activeHeroJobs || !window.activeHeroJobs.length) return regularJobs;
      var ids = {};
      regularJobs.forEach(function (j) {
        ids[String(j.job_id || j.id || "")] = true;
      });
      var extra = [];
      window.activeHeroJobs.forEach(function (h) {
        var id = String(h.jobId || "");
        if (!id || h.done) return;
        if (ids[id]) return;
        extra.push({
          job_id: id,
          id: id,
          action: "hero-generate",
          prompt: h.prompt || i18n("chatHeroJobTitle", "Hero image"),
          progress: typeof h.progress === "number" ? h.progress : 0,
          done: false,
          status: h.status || "queued",
          message: h.status || "",
          started_at: h.startedAt || Date.now()
        });
      });
      return regularJobs.concat(extra);
    } catch (e) {
      return regularJobs;
    }
  }

  function mergeActiveVideoJobs(regularJobs) {
    try {
      if (!window.activeVideoJobs || !window.activeVideoJobs.length) return regularJobs;
      var ids = {};
      regularJobs.forEach(function (j) {
        ids[String(j.job_id || j.id || "")] = true;
      });
      var extra = [];
      window.activeVideoJobs.forEach(function (h) {
        var id = String(h.jobId || "");
        if (!id || h.done) return;
        if (ids[id]) return;
        extra.push({
          job_id: id,
          id: id,
          action: "video-generate",
          type: "video-generate",
          prompt: h.prompt || i18n("chatVideoJobTitle", "Marketing video"),
          progress: typeof h.progress === "number" ? h.progress : 0,
          done: false,
          status: h.status || "queued",
          message: h.status || "",
          started_at: h.startedAt || Date.now()
        });
      });
      return regularJobs.concat(extra);
    } catch (e) {
      return regularJobs;
    }
  }

  function loadActiveJobs() {
    var list = document.getElementById("creator-chat-jobs-list");
    if (!list) return;

    var ownerId = getUserId();
    if (!ownerId) {
      list.innerHTML = '<div class="creator-chat__view-empty">' + escapeHtml(i18n("chatJobsUnavailable", "Jobs not available")) + '</div>';
      return;
    }

    if (_jobsFeedScope === "system") {
      var sysQ =
        "?op=list-system-jobs&active_only=1&owner_id=" + encodeURIComponent(ownerId) +
        "&limit=50&audience=";
      Promise.all([
        fetch(API_BASE + sysQ + "creator", { credentials: "include" }).then(function (r) { return r.json(); }),
        fetch(API_BASE + sysQ + "shop", { credentials: "include" }).then(function (r) { return r.json(); })
      ])
        .then(function (results) {
          var rows = [];
          results.forEach(function (data) {
            if (data.ok && Array.isArray(data.items)) rows = rows.concat(data.items);
          });
          var seen = {};
          rows = rows.filter(function (row) {
            var sid = String(row.session_id || "");
            if (!sid || seen[sid]) return false;
            seen[sid] = true;
            return true;
          });
          rows.sort(function (a, b) {
            return (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0);
          });
          _jobsData = rows.map(function (row) {
            var k = String(row.job_kind || "system_publish");
            var prog =
              typeof row.effective_progress === "number" ? row.effective_progress : 55;
            var effMsg =
              typeof row.effective_message === "string" && row.effective_message.trim()
                ? row.effective_message.trim()
                : "";
            return {
              job_id: "sysjob_" + row.session_id,
              session_id: row.session_id,
              title: row.title || i18n("chat_system_publish_job", "System publish"),
              prompt: row.title,
              progress: prog,
              done: false,
              status: row.status,
              message:
                effMsg || row.error_message || row.summary || row.status || "",
              started_at: row.created_at,
              is_system_job: true,
              design_id: row.design_id,
              system_job_kind: k,
              subtitle_detail:
                typeof row.subtitle_detail === "string" ? row.subtitle_detail : "",
              preview_url_kv:
                typeof row.effective_preview_url === "string"
                  ? row.effective_preview_url
                  : "",
              automation_meta:
                typeof row.meta === "object" && row.meta !== null ? row.meta : {}
            };
          });
          renderJobs();
          updateJobsBadge();
        })
        .catch(function () {
          _jobsData = [];
          renderJobs();
        });
      return;
    }

    // No interim "Loading…" while polling — show stable empty state until fetch returns (avoids flicker each poll).
    if (!_jobsData.length) {
      renderJobs();
    }

    // Load regular jobs
    fetch(API_BASE + "?op=list-jobs&owner_id=" + encodeURIComponent(ownerId) + "&limit=50", {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var allItems = data.items || data.jobs || [];
        checkProactiveJobUpdates(allItems);
        var regularJobs = allItems.filter(function (j) {
          if (typeof j.active === "boolean") return j.active;
          return !j.done || (j.saving && j.saved !== true);
        });
        regularJobs = mergeActiveVideoJobs(mergeActiveHeroJobs(regularJobs));

        // Load active publish sessions and convert to job format
        loadPublishJobs(ownerId).then(function (publishJobs) {
          _jobsData = regularJobs.concat(publishJobs);
          if (_saveActiveJobId) {
            var saveJob = _jobsData.find(function (j) { return String(j.job_id || j.id || "") === String(_saveActiveJobId); });
            if (saveJob && (saveJob.saved === true || (saveJob.done && !saveJob.saving))) {
              _saveActiveJobId = null;
              try { localStorage.removeItem(SAVE_PERSIST_KEY); } catch (e) {}
            }
          }
          refreshEazyUploadStateFromJobs();
          renderJobs();
          updateJobsBadge();
          var currentActiveJobs = _jobsData.length;
          if (_lastActiveJobsCount > 0 && currentActiveJobs === 0) {
            if (_panelOpen) {
              loadNotifications();
              setTimeout(function () {
                switchView("notifications");
                renderNotificationsInView();
              }, 400);
            }
          }
          _lastActiveJobsCount = currentActiveJobs;
        }).catch(function () {
          _jobsData = mergeActiveVideoJobs(mergeActiveHeroJobs(regularJobs));
          if (_saveActiveJobId) {
            var saveJob = _jobsData.find(function (j) { return String(j.job_id || j.id || "") === String(_saveActiveJobId); });
            if (saveJob && (saveJob.saved === true || (saveJob.done && !saveJob.saving))) {
              _saveActiveJobId = null;
              try { localStorage.removeItem(SAVE_PERSIST_KEY); } catch (e) {}
            }
          }
          refreshEazyUploadStateFromJobs();
          renderJobs();
          updateJobsBadge();
          var currentActiveJobs = _jobsData.length;
          if (_lastActiveJobsCount > 0 && currentActiveJobs === 0) {
            if (_panelOpen) {
              loadNotifications();
              setTimeout(function () {
                switchView("notifications");
                renderNotificationsInView();
              }, 400);
            }
          }
          _lastActiveJobsCount = currentActiveJobs;
        });
      })
      .catch(function () {
        refreshEazyUploadStateFromJobs();
        if (!_jobsData.length) {
          list.innerHTML = '<div class="creator-chat__view-empty">' + escapeHtml(i18n("chatLoadError", "Error loading")) + '</div>';
        }
      });
  }

  // Load active publish sessions and convert to job format (one per product)
  function loadPublishJobs(ownerId) {
    return new Promise(function (resolve, reject) {
      // Check for active publish sessions from window.__publishProgress or sessionStorage
      var publishJobs = [];
      var activeSessions = window.__activePublishSessions || [];
      
      if (activeSessions.length === 0) {
        // Try to find sessions in sessionStorage
        try {
          for (var i = 0; i < sessionStorage.length; i++) {
            var key = sessionStorage.key(i);
            if (key && key.startsWith('publish_session_')) {
              var sessionId = sessionStorage.getItem(key);
              var designId = key.replace('publish_session_', '');
              activeSessions.push({
                sessionId: sessionId,
                designId: designId,
                designTitle: null
              });
            }
          }
        } catch (e) {}
      }
      
      if (activeSessions.length === 0) {
        resolve([]);
        return;
      }
      
      // Fetch progress for each active session
      var progressPromises = activeSessions.map(function (session) {
        var url = API_BASE + "?op=get-publish-progress&session_id=" + encodeURIComponent(session.sessionId);
        return fetch(url, { credentials: "include" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.ok || data.done || data.status === 'completed') {
              return null; // Session is done, skip
            }
            
            // Create one job entry per product
            var products = data.products || [];
            return products.map(function (product) {
              var status = product.status || 'pending';
              if (status === 'completed' || status === 'error' || status === 'skipped') {
                return null; // Skip completed products
              }
              
              var productName = product.product_key || 'Unknown product';
              var progress = product.progress || 0;
              var message = product.message || status;
              
              return {
                job_id: 'publish_' + session.sessionId + '_' + product.product_key,
                action: 'publish-product',
                title: (session.designTitle || 'Design') + ' → ' + productName,
                product_name: productName,
                design_id: session.designId,
                session_id: session.sessionId,
                status: status,
                progress: progress,
                message: message,
                started_at: data.started_at || Date.now(),
                is_publish_job: true
              };
            }).filter(function (j) { return j !== null; });
          })
          .catch(function () { return []; });
      });
      
      Promise.all(progressPromises).then(function (results) {
        var allPublishJobs = [];
        results.forEach(function (jobs) {
          if (jobs && jobs.length) {
            allPublishJobs = allPublishJobs.concat(jobs);
          }
        });
        resolve(allPublishJobs);
      }).catch(function () {
        resolve([]);
      });
    });
  }

  function updateJobsBadge() {
    var badge = document.getElementById("creator-chat-jobs-badge");
    var toggle = document.getElementById("creator-chat-toggle");
    if (badge) {
      if (_jobsData.length > 0) {
        badge.textContent = String(_jobsData.length);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    }
    if (toggle) {
      if (_jobsData.length > 0) {
        toggle.classList.add("creator-chat__toggle--has-active-jobs");
      } else {
        toggle.classList.remove("creator-chat__toggle--has-active-jobs");
      }
    }
  }

  function systemJobKindLabel(kindRaw) {
    var k = String(kindRaw || "system_publish");
    if (k === "automation_design")
      return i18n(
        "chat_job_kind_automation_design",
        "Scheduled design automation"
      );
    return i18n("chat_job_kind_system_publish", "Automatic publishing");
  }

  function isWearClientJob(j) {
    var dev = String(j.client_device || j.source || "").toLowerCase();
    var typ = String(j.type || j.action || "").toLowerCase();
    return dev === "wear" || typ.indexOf("wear-generate") >= 0 || typ.indexOf("wear_generate") >= 0;
  }

  function jobUiProgress(j) {
    var p = typeof j.progress === "number" ? j.progress : 0;
    if (j.saving) return Math.max(p, 90);
    if (j.done && !j.saved && p < 100) return Math.max(p, 90);
    return p;
  }

  function getJobStatusLabel(j) {
    if (j.is_system_job) {
      var progSys = typeof j.progress === "number" ? j.progress : 0;
      var ss = String(j.status || "").toLowerCase();
      var msgLc = String(j.message || "").toLowerCase();

      var doneLike =
        ss === "completed" ||
        progSys >= 100 ||
        msgLc.indexOf("gespeichert") >= 0 ||
        msgLc.indexOf("saved") >= 0;

      var failLike =
        ss === "failed" ||
        ss === "cancelled" ||
        progSys <= 0 && (msgLc.indexOf("fehl") >= 0 || msgLc.indexOf("fail") >= 0);

      if (doneLike && !failLike)
        return i18n("chat_job_status_done", "Done");
      if (failLike && msgLc.indexOf("complete") < 0)
        return i18n("chat_job_status_failed", "Failed");

      if (
        ss === "running" ||
        ss === "queued" ||
        ss === "pending" ||
        ss === "starting" ||
        (progSys > 0 && progSys < 100)
      ) {
        var r = i18n("chat_job_status_running", "Running…");
        var detail = typeof j.message === "string" && j.message.trim() ? j.message.trim() : "";
        return detail && detail.length < 140 ? detail : r;
      }

      var fallback =
        typeof j.message === "string" && j.message.trim()
          ? j.message.trim()
          : j.status ||
            i18n("chat_job_status_running", "Running…");
      return fallback;
    }
    if (j.is_publish_job) {
      // Publishing job status
      var s = (j.status || '').toLowerCase();
      var map = {
        'pending': 'Wartet…',
        'queued': 'Warteschlange…',
        'starting': 'Startet…',
        'uploading': 'Wird hochgeladen…',
        'processing': 'Wird verarbeitet…',
        'publishing': 'Wird veröffentlicht…',
        'completed': 'Fertig',
        'error': 'Fehlgeschlagen',
        'skipped': 'Übersprungen'
      };
      return map[s] || (j.message || 'Wird veröffentlicht…');
    }
    if (j.saving && !j.saved) return "Speichert…";
    if (j.saved) return i18n("chatSaved", "Saved");
    var s = j.status || j.message || "Verarbeitet";
    var map = {
      processing: "Generiert\u2026",
      generating: "Generiert\u2026",
      accepted: "Generiert\u2026",
      saving: "Speichert\u2026",
      publishing: "Ver\u00f6ffentlicht\u2026",
      completed: "Fertig",
      failed: "Fehlgeschlagen",
      queued: "Warteschlange\u2026",
      pending: "Warteschlange\u2026",
      starting: "Startet\u2026"
    };
    return map[s] || s;
  }

  function renderJobs() {
    var list = document.getElementById("creator-chat-jobs-list");
    if (!list) return;

    if (_jobsData.length === 0) {
      list.innerHTML = '<div class="creator-chat__view-empty">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--chat-muted)" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
        "<p>" + escapeHtml(i18n("chat_no_active_jobs", "No active jobs")) + "</p></div>";
      return;
    }

    list.innerHTML = _jobsData.map(function (j) {
      var title = j.prompt || j.product_name || j.title || j.action || "Design-Job";
      var statusLabel = getJobStatusLabel(j);
      var progress = jobUiProgress(j);
      var wearBadge = isWearClientJob(j)
        ? '<span class="creator-chat__job-device">' + escapeHtml(i18n("chat_job_device_wear", "Wear")) + "</span>"
        : "";
      var elapsed = (j.started || j.started_at) ? getElapsed(j.started || j.started_at) : "";
      var imgHtml = "";
      if (j.image_url || (j.result && j.result.preview_url)) {
        var srcImg = j.image_url || j.result.preview_url;
        imgHtml = '<img src="' + escapeHtml(srcImg) + '" alt="" />';
      } else if (j.preview_url_kv) {
        imgHtml =
          '<img src="' + escapeHtml(j.preview_url_kv) + '" alt="" />';
      }
      var jobId = j.job_id || j.id || "";
      var isRunning = !j.is_system_job && progress < 100 && !j.done;
      var runningClass = isRunning ? " creator-chat__job-item--running" : "";
      var ringPct = Math.min(100, Math.max(0, Math.round(progress)));
      var iconInner = isRunning
        ? '<div class="creator-chat__job-ring" style="--pct:' + ringPct + '%" aria-hidden="true"><span class="creator-chat__job-ring__pct">' + ringPct + "%</span></div>"
        : (imgHtml || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>');
      var subDetail =
        j.is_system_job &&
        typeof j.subtitle_detail === "string" &&
        j.subtitle_detail.trim()
          ? j.subtitle_detail.trim()
          : "";
      var kindLine = j.is_system_job ? systemJobKindLabel(j.system_job_kind) : "";

      return '<div class="creator-chat__job-item creator-chat__job-item--clickable' + runningClass + '" data-job-id="' + escapeHtml(jobId) + '">' +
        '<div class="creator-chat__job-icon">' +
          iconInner +
        '</div>' +
        '<div class="creator-chat__job-body">' +
          '<div class="creator-chat__job-title">' + escapeHtml(title.length > 50 ? title.slice(0, 50) + "…" : title) + wearBadge + '</div>' +
          (j.is_system_job
            ? '<div class="creator-chat__job-sysmeta" style="margin-top:4px;line-height:1.35;font-size:11px;opacity:0.75">' +
              escapeHtml(kindLine) +
              (subDetail
                ? "<br/><span>" + escapeHtml(subDetail.length > 120 ? subDetail.slice(0, 118) + "…" : subDetail) + "</span>"
                : "") +
              "</div>"
            : "") +
          '<div class="creator-chat__job-progress"><div class="creator-chat__job-progress-bar" style="width:' + Math.min(100, progress) + '%"></div></div>' +
          '<div class="creator-chat__job-meta">' +
            '<span class="creator-chat__job-status">' + escapeHtml(statusLabel) + '</span>' +
            (elapsed ? ' · ' + elapsed : '') +
            (progress > 0 ? ' · ' + Math.round(progress) + '%' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join("");

    list.querySelectorAll(".creator-chat__job-item--clickable").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () {
        var jobId = el.getAttribute("data-job-id");
        if (!jobId) return;
        var job = _jobsData.find(function (j) { return String(j.job_id || j.id || "") === String(jobId); });
        if (!job) return;
        if (job.is_system_job) return;
        var previewUrl = job.image_url || (job.result && job.result.preview_url) || job.preview_url;
        if (!previewUrl && (job.done || job.saved)) return;
        var jobForModal = {
          job_id: jobId,
          result: { preview_url: previewUrl || "", image_url: previewUrl || "" },
          preview_url: previewUrl,
          image_url: previewUrl,
          prompt: job.prompt,
          design_prompt: job.design_prompt || job.prompt,
          design_type: job.design_type
        };
        if (window.CreatorNotificationCategories?.generated?.openPreviewModal) {
          window.CreatorNotificationCategories.generated.openPreviewModal(jobForModal, { data: job }).then(function () {
            applyThemeToOpenModals();
          }).catch(function () {});
        } else if (window.CreatorJobPreviewModalGlobal?.open) {
          window.CreatorJobPreviewModalGlobal.open(jobForModal);
          applyThemeToOpenModals();
        }
      });
    });

    try {
      var focusId = sessionStorage.getItem("creator_chat_focus_job_id");
      if (focusId) {
        var items = list.querySelectorAll(".creator-chat__job-item");
        for (var i = 0; i < items.length; i++) {
          if (String(items[i].getAttribute("data-job-id") || "") === String(focusId)) {
            items[i].classList.add("creator-chat__job-item--focused");
            items[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
            break;
          }
        }
        sessionStorage.removeItem("creator_chat_focus_job_id");
      }
    } catch (e) {}

    if (_genActiveJobId && _activeView === "jobs") {
      setTimeout(placeEazyJobMascot, 50);
    }
  }

  function getElapsed(startedAt) {
    try {
      var diff = Date.now() - new Date(startedAt).getTime();
      if (diff < 0) return "";
      var secs = Math.floor(diff / 1000);
      if (secs < 60) return secs + "s";
      var mins = Math.floor(secs / 60);
      if (mins < 60) return mins + "m " + (secs % 60) + "s";
      return Math.floor(mins / 60) + "h " + (mins % 60) + "m";
    } catch (e) { return ""; }
  }

  function startJobsPolling() {
    stopJobsPolling();
    var intervalMs = _saveActiveJobId ? 2000 : 5000;
    _jobsPollTimer = setInterval(function () { loadActiveJobs(); }, intervalMs);
  }

  function stopJobsPolling() {
    if (_jobsPollTimer) { clearInterval(_jobsPollTimer); _jobsPollTimer = null; }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  DRAWER (pull-down menu below header)
   * ══════════════════════════════════════════════════════════════════ */
  var _drawerOpen = false;
  var _drawerEl = null;
  var _drawerPeek = null;
  var _drawerHintShown = false;
  var DRAWER_HINT_KEY = "eazy_drawer_hint_shown";

  function initDrawer() {
    _drawerEl = document.getElementById("creator-chat-drawer");
    _drawerPeek = document.getElementById("creator-chat-drawer-peek");
    if (!_drawerEl || !_drawerPeek) return;

    _drawerHintShown = localStorage.getItem(DRAWER_HINT_KEY) === "1";

    /* Single click/tap on peek strip toggles drawer */
    _drawerPeek.addEventListener("click", function () {
      if (_drawerOpen) closeDrawer(); else openDrawer();
    });

    /* Swipe down on peek strip (mobile) */
    var startY = 0, dragging = false;

    _drawerPeek.addEventListener("touchstart", function (e) {
      if (!e.touches.length) return;
      startY = e.touches[0].clientY;
      dragging = false;
    }, { passive: true });

    _drawerPeek.addEventListener("touchmove", function (e) {
      if (!e.touches.length) return;
      if (Math.abs(e.touches[0].clientY - startY) > 10) dragging = true;
    }, { passive: true });

    _drawerPeek.addEventListener("touchend", function (e) {
      if (!dragging) return;
      var y = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientY : startY;
      var dy = y - startY;
      if (dy > 30 && !_drawerOpen) openDrawer();
      else if (dy < -30 && _drawerOpen) closeDrawer();
    }, { passive: true });

    /* Swipe up on drawer handle to close */
    var handleEl = _drawerEl.querySelector(".creator-chat__drawer-handle");
    if (handleEl) {
      var hStartY = 0, hDragging = false;
      handleEl.addEventListener("touchstart", function (e) {
        if (!e.touches.length) return;
        hStartY = e.touches[0].clientY;
        hDragging = false;
      }, { passive: true });
      handleEl.addEventListener("touchmove", function (e) {
        if (!e.touches.length) return;
        if (Math.abs(e.touches[0].clientY - hStartY) > 10) hDragging = true;
      }, { passive: true });
      handleEl.addEventListener("touchend", function (e) {
        if (!hDragging) return;
        var y = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientY : hStartY;
        if (y - hStartY < -30) closeDrawer();
      }, { passive: true });
    }

    /* Shortcut buttons inside drawer (legacy + carousel) */
    _drawerEl.querySelectorAll(".creator-chat__drawer-shortcut").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = this.getAttribute("data-action");
        closeDrawer();
        if (action === "generate-design") startDesignFlow();
      });
    });

    _drawerEl.addEventListener("click", function (e) {
      var item = e.target.closest(".eazy-fn-carousel__item");
      if (!item) return;
      var fn = item.getAttribute("data-fn");
      if (!fn) return;
      closeDrawer();
      startChatFunction(fn);
    });
  }

  function showDrawerHint() {
    if (_drawerHintShown) return;
    _drawerHintShown = true;
    localStorage.setItem(DRAWER_HINT_KEY, "1");

    var hintEl = document.getElementById("creator-chat-drawer-hint");
    if (!hintEl || !_drawerEl) return;

    hintEl.setAttribute("aria-hidden", "false");
    _drawerEl.classList.add("creator-chat__drawer--hint-anim");

    setTimeout(function () {
      hintEl.setAttribute("aria-hidden", "true");
      _drawerEl.classList.remove("creator-chat__drawer--hint-anim");
    }, 2600);
  }

  function openDrawer() {
    if (!_drawerEl) return;
    _drawerOpen = true;
    _drawerEl.classList.add("creator-chat__drawer--open");
    _drawerEl.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    if (!_drawerEl) return;
    _drawerOpen = false;
    _drawerEl.classList.remove("creator-chat__drawer--open");
    _drawerEl.setAttribute("aria-hidden", "true");
  }

  /* ══════════════════════════════════════════════════════════════════
   *  DESIGN FLOW (step-by-step wizard in chat)
   * ══════════════════════════════════════════════════════════════════ */
  var _designData = {};
  var _activeStepEl = null;
  var _stepHistory = [];
  var DESIGN_PERSIST_KEY = "eazy_design_flow";

  var _stepFunctions = [stepSelectProduct, stepSelectDesignType, stepPromptUpload, stepOptions];

  function saveDesignState(stepFn) {
    var stepIdx = _stepFunctions.indexOf(stepFn);
    try {
      localStorage.setItem(DESIGN_PERSIST_KEY, JSON.stringify({
        data: _designData,
        step: stepIdx >= 0 ? stepIdx : 0,
        ts: Date.now()
      }));
    } catch (e) {}
  }

  function clearDesignState() {
    try { localStorage.removeItem(DESIGN_PERSIST_KEY); } catch (e) {}
  }

  function loadDesignState() {
    try {
      var raw = localStorage.getItem(DESIGN_PERSIST_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.data) return null;
      // expire after 24h
      if (Date.now() - s.ts > 24 * 60 * 60 * 1000) { clearDesignState(); return null; }
      return s;
    } catch (e) { return null; }
  }

  function getUserOwnerId() {
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID);
    if (window.CreatorWidget && window.CreatorWidget.ownerId) return window.CreatorWidget.ownerId;
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta) return meta.getAttribute("content");
    var el = document.querySelector("[data-owner-id]");
    if (el) return el.getAttribute("data-owner-id");
    return getUserId();
  }

  function renderStepCard(label, contentHtml) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return null;
    var wrapper = document.createElement("div");
    wrapper.className = "creator-chat__msg creator-chat__msg--assistant";
    wrapper.innerHTML = '<div class="creator-chat__step-card">'
      + '<div class="creator-chat__step-label">' + label + '</div>'
      + contentHtml
      + '</div>';
    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    _activeStepEl = wrapper;
    return wrapper;
  }

  function disableStepCard(el) {
    if (!el) return;
    el.querySelectorAll("button").forEach(function (b) {
      b.disabled = true;
      if (!b.classList.contains("creator-chat__step-option--selected")) {
        b.style.opacity = "0.35";
      }
    });
    el.querySelectorAll("textarea, input").forEach(function (inp) {
      inp.disabled = true;
    });
  }

  function goBackToStep(stepIndex) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var entry = _stepHistory[stepIndex];
    if (!entry) return;
    var found = false;
    var toRemove = [];
    for (var i = container.children.length - 1; i >= 0; i--) {
      var child = container.children[i];
      if (child === entry.el) { found = true; break; }
      toRemove.push(child);
    }
    if (found) {
      toRemove.forEach(function (n) { n.remove(); });
      entry.el.remove();
    }
    // Steps after this one may have set image_url; reset if going back to or before step 3
    var step3Idx = -1;
    for (var j = 0; j < _stepHistory.length; j++) {
      if (_stepHistory[j].render === stepPromptUpload) { step3Idx = j; break; }
    }
    if (stepIndex <= step3Idx || step3Idx < 0) {
      _designData.image_url = null;
    }
    _stepHistory.length = stepIndex;
    saveDesignState(entry.render);
    entry.render();
  }

  function addBackButton(card, stepIndex) {
    if (stepIndex <= 0) return;
    var backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "creator-chat__step-back";
    backBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2L4 8l6 6"/></svg>';
    backBtn.title = i18n("actionsBack", "Back");
    backBtn.addEventListener("click", function () {
      goBackToStep(stepIndex - 1);
    });
    var label = card.querySelector(".creator-chat__step-label");
    if (label) label.appendChild(backBtn);
  }

  function startDesignFlow(resumeStep) {
    if (typeof resumeStep === "undefined") {
      _designData = {
        target_product: "all",
        design_type: "classic",
        prompt: "",
        image_url: null,
        ratio: "portrait",
        content_type: "design-text",
        background: { mode: "transparent" },
        language: { mode: "as-design" },
        styles: [],
        design_colors: []
      };
    }
    _stepHistory = [];
    if (typeof resumeStep === "number" && resumeStep > 0) {
      appendMessage("assistant", "Welcome back! We will continue where you left off.", { msgType: "design_flow" });
    } else {
      appendMessage("assistant", i18n("chat_design_flow_start_intro", "Let's create a design! I will guide you step by step through the process."), { msgType: "design_flow" });
    }
    var startAt = (typeof resumeStep === "number" && resumeStep >= 0 && resumeStep < _stepFunctions.length) ? resumeStep : 0;
    _stepFunctions[startAt]();
  }

  function resumeDesignFlowIfSaved() {
    var saved = loadDesignState();
    if (!saved) return;
    _designData = saved.data;
    startDesignFlow(saved.step);
  }

  /* ── Step 1: Product Selection ── */
  function stepSelectProduct() {
    appendMessage("assistant",
      i18n("chat_design_flow_step_1_intro", "Choose the product for which your design should be created.\n\n")
      + i18n("chat_design_flow_step_1_tip", "Tip: Classic designs work well across all products. If you are unsure, choose \"All products\" for the most universal result."),
      { msgType: "design_flow" });
    var stepIdx = _stepHistory.length;
    var loadingEl = renderStepCard(i18n("chat_design_flow_step_1_title", "Step 1 - Product"), '<p style="color:var(--chat-muted);font-size:13px;">' + escapeHtml(i18n("chat_design_flow_step_1_loading_products", "Loading products...")) + '</p>');
    _stepHistory.push({ el: loadingEl, render: stepSelectProduct });

    fetch(API_BASE + "?op=get-catalog-products&region=EU", { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.products) throw new Error("no products");
        var html = '<div class="creator-chat__step-grid">';
        html += '<button class="creator-chat__step-option' + (_designData.target_product === "all" ? ' creator-chat__step-option--selected' : '') + '" data-value="all">' + escapeHtml(i18n("chat.designFlow.step1.allProducts", "All products")) + '</button>';
        data.products.forEach(function (p) {
          var sel = _designData.target_product === p.product_key ? ' creator-chat__step-option--selected' : '';
          html += '<button class="creator-chat__step-option' + sel + '" data-value="' + escapeHtml(p.product_key) + '">' + escapeHtml(p.title) + '</button>';
        });
        html += '</div>';
        var card = loadingEl.querySelector(".creator-chat__step-card");
        if (card) card.innerHTML = '<div class="creator-chat__step-label">' + escapeHtml(i18n("chat_design_flow_step_1_select_product", "Step 1 - Choose product")) + '</div>' + html;
        addBackButton(card, stepIdx);

        card.querySelectorAll(".creator-chat__step-option").forEach(function (btn) {
          btn.addEventListener("click", function () {
            card.querySelectorAll(".creator-chat__step-option").forEach(function (b) { b.classList.remove("creator-chat__step-option--selected"); });
            this.classList.add("creator-chat__step-option--selected");
            _designData.target_product = this.getAttribute("data-value");
            saveDesignState(stepSelectDesignType);
            disableStepCard(loadingEl);
            stepSelectDesignType();
          });
        });
      })
      .catch(function () {
        var card = loadingEl.querySelector(".creator-chat__step-card");
        if (card) card.innerHTML = '<div class="creator-chat__step-label">' + escapeHtml(i18n("chat_design_flow_step_1_title", "Step 1 - Product")) + '</div>'
          + '<p style="color:var(--chat-muted);font-size:13px;">' + escapeHtml(i18n("chat_design_flow_step_1_products_fallback", 'Products could not be loaded. We are using "All products".')) + '</p>';
        _designData.target_product = "all";
        setTimeout(stepSelectDesignType, 800);
      });
  }

  /* ── Step 2: Design Type Selection ── */
  function stepSelectDesignType() {
    appendMessage("assistant",
      i18n("chat_design_flow_step_2_intro", "What type of design should it be?\n\n")
      + i18n("chat_design_flow_step_2_classic", "• Classic - Centered motif, suitable for all products\n")
      + i18n("chat_design_flow_step_2_pattern", "• Pattern - Repeating pattern, ideal for t-shirts and accessories\n")
      + i18n("chat_design_flow_step_2_all_over", "• All-Over - Design covers the entire print area\n")
      + i18n("chat_design_flow_step_2_full_coverage", "• Full-Coverage - Like all-over, reaches to the edge\n")
      + i18n("chat_design_flow_step_2_panorama", "• Panorama - Wide format, perfect for mugs and broad surfaces"),
      { msgType: "design_flow" });
    var stepIdx = _stepHistory.length;
    var types = [
      { value: "classic", label: "Classic" },
      { value: "pattern", label: "Pattern" },
      { value: "all-over", label: "All-Over" },
      { value: "full-coverage", label: "Full-Coverage" },
      { value: "panorama", label: "Panorama" }
    ];
    var html = '<div class="creator-chat__step-grid">';
    types.forEach(function (t) {
      var sel = _designData.design_type === t.value ? ' creator-chat__step-option--selected' : '';
      html += '<button class="creator-chat__step-option' + sel + '" data-value="' + t.value + '">' + t.label + '</button>';
    });
    html += '</div>';

    var el = renderStepCard(i18n("chat_design_flow_step_2_title", "Step 2 - Design type"), html);
    _stepHistory.push({ el: el, render: stepSelectDesignType });
    var card = el.querySelector(".creator-chat__step-card");
    addBackButton(card, stepIdx);

    function getDesignTypeDefaults(type) {
      var t = (type || "").toLowerCase();
      var out = {};
      if (t === "panorama") { out.ratio = "landscape"; out.background = { mode: "transparent" }; }
      else if (t === "all-over") { out.ratio = "portrait"; out.background = { mode: "solid" }; }
      else if (t === "full-coverage") { out.background = { mode: "solid" }; }
      return out;
    }

    card.querySelectorAll(".creator-chat__step-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        card.querySelectorAll(".creator-chat__step-option").forEach(function (b) { b.classList.remove("creator-chat__step-option--selected"); });
        this.classList.add("creator-chat__step-option--selected");
        _designData.design_type = this.getAttribute("data-value");
        var def = getDesignTypeDefaults(_designData.design_type);
        if (def.ratio) _designData.ratio = def.ratio;
        if (def.background) _designData.background = def.background;
        saveDesignState(stepPromptUpload);
        disableStepCard(el);
        stepPromptUpload();
      });
    });
  }

  /* ── Step 3: Prompt + Upload ── */
  var EXAMPLE_PROMPTS = [
    "A minimalist lion in geometric art style with golden lines on a dark background",
    "Retro-Sonnenuntergang \u00fcber Palmen im 80er Synthwave-Stil mit Neonfarben",
    "Japanische Kirschbl\u00fcten mit einer Katze auf einem Ast, Aquarell-Stil",
    "Abstraktes Streetart-Graffiti mit dem Wort 'CREATE' in bunten Farben",
    "Vintage-Illustration eines Astronauten der auf dem Mond Kaffee trinkt",
    "Botanische Zeichnung tropischer Pflanzen in feinen Linien, schwarz auf wei\u00df",
    "A fox in low-poly style with autumn colors and a geometric background",
    "Comic-Stil Superheld der ein Skateboard f\u00e4hrt, Pop-Art Farben"
  ];

  function stepPromptUpload() {
    var stepIdx = _stepHistory.length;

    var examplePrompt = EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)];
    var infoHtml = i18n("chat_design_flow_step_3_intro", "Describe your design or upload a reference image - or both!\n\n")
      + i18n("chat_design_flow_step_3_prompt_only", "📝 Prompt only - Describe what you imagine\n")
      + i18n("chat_design_flow_step_3_image_only", "🖼️ Image only - Upload a reference image as a template\n")
      + i18n("chat_design_flow_step_3_both", "✨ Both - Image + description for the best result\n\n")
      + i18n("chat.designFlow.step3.examplePrefix", "Example: \"") + examplePrompt + '"';

    var infoEl = appendMessage("assistant", infoHtml, { msgType: "design_flow" });
    if (infoEl) {
      var actionsDiv = document.createElement("div");
      actionsDiv.className = "creator-chat__design-choices";
      actionsDiv.style.marginTop = "8px";

      var adoptBtn = document.createElement("button");
      adoptBtn.className = "creator-chat__choice-btn creator-chat__choice-btn--go";
      adoptBtn.textContent = i18n("chat_design_flow_step_3_use_example", "Use example");
      adoptBtn.style.fontSize = "12px";
      adoptBtn.style.padding = "6px 12px";

      var suggestBtn = document.createElement("button");
      suggestBtn.className = "creator-chat__choice-btn creator-chat__choice-btn--adjust";
      suggestBtn.textContent = i18n("chat_design_flow_step_3_another_suggestion", "Another suggestion");
      suggestBtn.style.fontSize = "12px";
      suggestBtn.style.padding = "6px 12px";

      actionsDiv.appendChild(adoptBtn);
      actionsDiv.appendChild(suggestBtn);

      var bubble = infoEl.querySelector(".creator-chat__bubble");
      if (bubble) bubble.appendChild(actionsDiv);

      var _lastSuggestion = examplePrompt;
      adoptBtn.addEventListener("click", function () {
        var promptEl = document.getElementById("chat-design-prompt");
        if (promptEl) {
          promptEl.value = _lastSuggestion;
          promptEl.dispatchEvent(new Event("input"));
        }
        adoptBtn.disabled = true;
        suggestBtn.disabled = true;
      });

      suggestBtn.addEventListener("click", function () {
        var filtered = EXAMPLE_PROMPTS.filter(function (p) { return p !== _lastSuggestion; });
        var newPrompt = filtered[Math.floor(Math.random() * filtered.length)];
        _lastSuggestion = newPrompt;
        var promptEl = document.getElementById("chat-design-prompt");
        if (promptEl) {
          promptEl.value = newPrompt;
          promptEl.dispatchEvent(new Event("input"));
        }
      });
    }

    var hasImg = !!_designData.image_url;
    var html = '<div class="creator-chat__step-form">'
      + '<textarea class="creator-chat__step-textarea" placeholder="' + escapeHtml(i18n("chat_design_flow_step_3_prompt_placeholder", "Describe your design...")) + '" rows="3" id="chat-design-prompt">' + escapeHtml(_designData.prompt || '') + '</textarea>'
      + '<button type="button" class="creator-chat__step-upload-btn' + (hasImg ? ' creator-chat__step-upload-btn--has-file' : '') + '" id="chat-design-upload-trigger">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
      + '<span id="chat-design-upload-label">' + (hasImg ? i18n("chat_design_flow_step_3_image_uploaded", "Image uploaded ✓") : i18n("chat_design_flow_step_3_upload_optional", "Upload image (optional)")) + '</span>'
      + '</button>'
      + '<div class="creator-chat__step-actions">'
      + '<button type="button" class="creator-chat__step-next" id="chat-design-prompt-next">' + escapeHtml(i18n("chat_next", "Next")) + '</button>'
      + '</div></div>';

    var el = renderStepCard(i18n("chat_design_flow_step_3_title", "Step 3 - Description and image"), html);
    _stepHistory.push({ el: el, render: stepPromptUpload });
    var card = el.querySelector(".creator-chat__step-card");
    addBackButton(card, stepIdx);

    var promptInput = card.querySelector("#chat-design-prompt");
    var nextBtn = card.querySelector("#chat-design-prompt-next");
    var uploadBtn = card.querySelector("#chat-design-upload-trigger");

    function validateStep3() {
      var hasPrompt = promptInput && promptInput.value.trim().length > 0;
      var hasImage = !!_designData.image_url;
      nextBtn.disabled = !(hasPrompt || hasImage);
    }

    promptInput.addEventListener("input", validateStep3);

    uploadBtn.addEventListener("click", function () {
      openUploadModal(function (imageUrl) {
        _designData.image_url = imageUrl;
        var label = card.querySelector("#chat-design-upload-label");
        if (label) label.textContent = i18n("chat_design_flow_step_3_image_uploaded", "Image uploaded ✓");
        uploadBtn.classList.add("creator-chat__step-upload-btn--has-file");
        validateStep3();

        var container = document.getElementById("creator-chat-messages");
        if (container && imageUrl) {
          var imgMsg = document.createElement("div");
          imgMsg.className = "creator-chat__msg creator-chat__msg--user";
          imgMsg.innerHTML = '<div class="creator-chat__bubble creator-chat__bubble--user">'
            + '<img src="' + imageUrl + '" style="max-width:180px;max-height:180px;border-radius:8px;display:block;" alt="' + escapeHtml(i18n("chat.designFlow.step3.uploadedImageAlt", "Uploaded image")) + '">'
            + '</div>';
          container.appendChild(imgMsg);
          container.scrollTop = container.scrollHeight;
          persistMessage("user", "[Image uploaded]", "design_flow");
        }

        _designData.prompt = (promptInput && promptInput.value || "").trim();
        saveDesignState(stepOptions);
        disableStepCard(el);
        stepOptions();
      });
    });

    nextBtn.addEventListener("click", function () {
      _designData.prompt = (promptInput.value || "").trim();
      saveDesignState(stepOptions);
      disableStepCard(el);
      stepOptions();
    });

    validateStep3();
  }

  /* ── Step 4: Options or Default ── */
  function stepOptions() {
    appendMessage("assistant",
      i18n("chat_design_flow_step_4_intro", "Almost done! Choose your settings.\n\n")
      + i18n("chat_design_flow_step_4_defaults", "⚙️ Default settings:\n• Format: Portrait\n• Content: Design + Text\n• Background: Transparent\n\n")
      + i18n("chat_design_flow_step_4_custom_hint", "In \"More options\" you can customize format (Portrait, Landscape, Square), content type, background color and styles."),
      { msgType: "design_flow" });
    var stepIdx = _stepHistory.length;
    var html = '<div class="creator-chat__step-grid">'
      + '<button class="creator-chat__step-next" data-choice="default">' + escapeHtml(i18n("chat_design_flow_step_4_default_settings", "Default settings")) + '</button>'
      + '<button class="creator-chat__step-skip" data-choice="custom">' + escapeHtml(i18n("chat_design_flow_step_4_more_options", "More options")) + '</button>'
      + '</div>';

    var el = renderStepCard(i18n("chat.designFlow.step4.title", "Step 4 - Options"), html);
    _stepHistory.push({ el: el, render: stepOptions });
    var card = el.querySelector(".creator-chat__step-card");
    addBackButton(card, stepIdx);

    card.querySelector('[data-choice="default"]').addEventListener("click", function () {
      if (!_designData.ratio) _designData.ratio = "portrait";
      if (!_designData.content_type) _designData.content_type = "design-text";
      if (!_designData.background) _designData.background = { mode: "transparent" };
      disableStepCard(el);
      showDesignReadyChoices(el);
    });

    card.querySelector('[data-choice="custom"]').addEventListener("click", function () {
      card.querySelector(".creator-chat__step-grid").remove();

      if (!_designData.ratio) _designData.ratio = "portrait";
      if (!_designData.content_type) _designData.content_type = "design-text";
      if (!_designData.background) _designData.background = { mode: "transparent" };
      var curRatio = _designData.ratio;
      var curCt = _designData.content_type;
      var curBg = _designData.background.mode;
      var stylesCount = (_designData.styles && _designData.styles.length) || 0;

      var optHtml = '<div class="creator-chat__step-form">'
        // Ratio as icons
        + '<div><span class="creator-chat__step-opt-label">Format</span>'
        + '<div class="creator-chat__step-ratio-row">'
        + '<button class="creator-chat__step-ratio' + (curRatio === "portrait" ? ' is-active' : '') + '" data-opt="ratio" data-value="portrait" title="Portrait">'
        + '<svg width="20" height="28" viewBox="0 0 20 28"><rect x="1" y="1" width="18" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
        + '<span>Portrait</span></button>'
        + '<button class="creator-chat__step-ratio' + (curRatio === "landscape" ? ' is-active' : '') + '" data-opt="ratio" data-value="landscape" title="Landscape">'
        + '<svg width="28" height="20" viewBox="0 0 28 20"><rect x="1" y="1" width="26" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
        + '<span>Landscape</span></button>'
        + '<button class="creator-chat__step-ratio' + (curRatio === "square" ? ' is-active' : '') + '" data-opt="ratio" data-value="square" title="Square">'
        + '<svg width="22" height="22" viewBox="0 0 22 22"><rect x="1" y="1" width="20" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
        + '<span>Square</span></button>'
        + '</div></div>'
        // Content type
        + '<div><span class="creator-chat__step-opt-label">Content</span>'
        + '<div class="creator-chat__step-grid">'
        + '<button class="creator-chat__step-option' + (curCt === "design-text" ? ' creator-chat__step-option--selected' : '') + '" data-opt="content_type" data-value="design-text">Design + Text</button>'
        + '<button class="creator-chat__step-option' + (curCt === "design-only" ? ' creator-chat__step-option--selected' : '') + '" data-opt="content_type" data-value="design-only">Design only</button>'
        + '<button class="creator-chat__step-option' + (curCt === "text-only" ? ' creator-chat__step-option--selected' : '') + '" data-opt="content_type" data-value="text-only">Text only</button>'
        + '</div></div>'
        // Background
        + '<div><span class="creator-chat__step-opt-label">Background</span>'
        + '<div class="creator-chat__step-grid">'
        + '<button class="creator-chat__step-option' + (curBg === "transparent" ? ' creator-chat__step-option--selected' : '') + '" data-opt="bg" data-value="transparent">Transparent</button>'
        + '<button class="creator-chat__step-option' + (curBg === "solid" ? ' creator-chat__step-option--selected' : '') + '" data-opt="bg" data-value="solid">Colored</button>'
        + '</div></div>'
        // Styles
        + '<div><span class="creator-chat__step-opt-label">Styles</span>'
        + '<button type="button" class="creator-chat__step-option creator-chat__step-styles-btn" id="chat-design-styles-btn">'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="14" cy="15" r="1.5" fill="currentColor"/></svg>'
        + ' <span id="chat-design-styles-label">' + (stylesCount > 0 ? stylesCount + ' Styles' : 'Choose styles') + '</span>'
        + '</button></div>'
        + '</div>';

      card.insertAdjacentHTML("beforeend", optHtml);

      var _readyTriggered = false;
      var _optInteractions = 0;
      function checkDesignReady() {
        if (_readyTriggered) return;
        _optInteractions++;
        if (_designData.ratio && _designData.content_type && _optInteractions >= 1) {
          _readyTriggered = true;
          showDesignReadyChoices(el);
        }
      }

      // Ratio icon buttons
      card.querySelectorAll(".creator-chat__step-ratio").forEach(function (btn) {
        btn.addEventListener("click", function () {
          card.querySelectorAll(".creator-chat__step-ratio").forEach(function (b) { b.classList.remove("is-active"); });
          this.classList.add("is-active");
          _designData.ratio = this.getAttribute("data-value");
          checkDesignReady();
        });
      });

      // Content type & background option buttons
      card.querySelectorAll("[data-opt='content_type'], [data-opt='bg']").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var group = this.getAttribute("data-opt");
          this.closest(".creator-chat__step-grid").querySelectorAll(".creator-chat__step-option").forEach(function (b) {
            b.classList.remove("creator-chat__step-option--selected");
          });
          this.classList.add("creator-chat__step-option--selected");
          var val = this.getAttribute("data-value");
          if (group === "content_type") _designData.content_type = val;
          else if (group === "bg") _designData.background = { mode: val };
          checkDesignReady();
        });
      });

      // Styles button -> open existing style-modal
      var stylesBtn = card.querySelector("#chat-design-styles-btn");
      if (stylesBtn) {
        stylesBtn.addEventListener("click", function () {
          if (window.StyleModal && window.StyleModal.open) {
            window.StyleModal.open({
              selected: _designData.styles || [],
              onApply: function (sel) {
                _designData.styles = sel;
                var lbl = card.querySelector("#chat-design-styles-label");
                if (lbl) lbl.textContent = sel.length > 0
                  ? sel.length + " " + i18n("chat_design_flow_styles_count_label", "styles")
                  : i18n("chat_design_flow_styles_choose", "Choose styles");
                if (sel.length > 0) stylesBtn.classList.add("creator-chat__step-option--selected");
                else stylesBtn.classList.remove("creator-chat__step-option--selected");
              }
            });
          }
        });
      }
    });
  }

  /* ── Design Ready: choice buttons ── */
  function showDesignReadyChoices(stepEl) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;

    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML
      + '<div class="creator-chat__bubble creator-chat__bubble--assistant">'
      + '<p style="margin:0 0 10px;font-weight:600;">' + escapeHtml(i18n("chat_design_flow_ready_to_generate", "Your design can now be generated!")) + '</p>'
      + '<div class="creator-chat__design-choices">'
      + '<button class="creator-chat__choice-btn creator-chat__choice-btn--go" data-choice="go">' + escapeHtml(pickRandom(CHOICE_GENERATE)) + '</button>'
      + '<button class="creator-chat__choice-btn creator-chat__choice-btn--adjust" data-choice="adjust">' + escapeHtml(pickRandom(CHOICE_ADJUST)) + '</button>'
      + '<button class="creator-chat__choice-btn creator-chat__choice-btn--cancel" data-choice="cancel">' + escapeHtml(pickRandom(CHOICE_CANCEL)) + '</button>'
      + '</div></div>';
    msg.innerHTML = html;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;

    msg.querySelector('[data-choice="go"]').addEventListener("click", function () {
      disableChoiceButtons(msg);
      animateEazyBounceToInput();
    });
    msg.querySelector('[data-choice="adjust"]').addEventListener("click", function () {
      disableChoiceButtons(msg);
      _designData.ratio = null;
      _designData.content_type = null;
      stepOptions();
    });
    msg.querySelector('[data-choice="cancel"]').addEventListener("click", function () {
      disableChoiceButtons(msg);
      clearDesignState();
      _designData = {};
      appendMessage("assistant", "No problem! When you are ready, just start a new design.", { msgType: "design_flow" });
    });
  }

  function disableChoiceButtons(msgEl) {
    msgEl.querySelectorAll(".creator-chat__choice-btn").forEach(function (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
    });
  }

  /* ── Eazy Generation Animations ── */

  function animateEazyBounceToInput() {
    var sendBtn = document.getElementById("creator-chat-send");
    if (!sendBtn) { stepGenerate(); return; }

    var sRect = sendBtn.getBoundingClientRect();
    var sCx = sRect.left + sRect.width / 2;
    var sCy = sRect.top + sRect.height / 2;
    var ghostSize = sRect.width * 0.9;

    var ghost = document.createElement("div");
    ghost.className = "eazy-gen-ghost";
    var svgEl = sendBtn.querySelector("svg");
    if (svgEl) ghost.innerHTML = svgEl.outerHTML;
    ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;"
      + "left:" + (sCx - ghostSize / 2) + "px;top:" + (sCy - ghostSize / 2) + "px;"
      + "width:" + ghostSize + "px;height:" + ghostSize + "px;"
      + "display:flex;align-items:center;justify-content:center;border-radius:50%;";
    if (ghost.querySelector("svg")) ghost.querySelector("svg").style.cssText = "width:100%;height:100%;";
    document.body.appendChild(ghost);

    sendBtn.style.opacity = "0";

    var inputWrap = document.querySelector(".creator-chat__input-wrap");
    var iRect = inputWrap ? inputWrap.getBoundingClientRect() : sRect;
    var targetX = iRect.left + iRect.width / 2 - ghostSize / 2;
    var targetY = iRect.top + iRect.height / 2 - ghostSize / 2;

    ghost.style.setProperty("--bounce-target-x", targetX + "px");
    ghost.style.setProperty("--bounce-target-y", targetY + "px");
    ghost.style.setProperty("--bounce-start-x", (sCx - ghostSize / 2) + "px");
    ghost.style.setProperty("--bounce-start-y", (sCy - ghostSize / 2) + "px");

    requestAnimationFrame(function () {
      ghost.classList.add("eazy-gen-ghost--bouncing");
    });

    setTimeout(function () {
      ghost.classList.remove("eazy-gen-ghost--bouncing");
      ghost.style.left = targetX + "px";
      ghost.style.top = targetY + "px";

      requestAnimationFrame(function () {
        ghost.classList.add("eazy-gen-ghost--grow");
      });

      setTimeout(function () {
        var bubble = document.createElement("div");
        bubble.className = "eazy-gen-bubble";
        bubble.textContent = "Click to generate the design";
        ghost.appendChild(bubble);
        ghost.style.pointerEvents = "auto";
        ghost.style.cursor = "pointer";

        requestAnimationFrame(function () {
          bubble.classList.add("is-visible");
        });

        ghost.addEventListener("click", function handler() {
          ghost.removeEventListener("click", handler);
          ghost.style.pointerEvents = "none";
          ghost.style.cursor = "";
          bubble.remove();
          onGenerateClickAnim(ghost, sendBtn);
        });
      }, 400);
    }, 1400);
  }

  function onGenerateClickAnim(ghost, sendBtn) {
    var quote = pickGenQuote();

    var jumpBubble = document.createElement("div");
    jumpBubble.className = "eazy-gen-bubble eazy-gen-bubble--quote";
    jumpBubble.textContent = quote;
    ghost.appendChild(jumpBubble);

    requestAnimationFrame(function () {
      ghost.classList.add("eazy-gen-ghost--jump-up");
      jumpBubble.classList.add("is-visible");
    });

    setTimeout(function () {
      ghost.remove();
      if (sendBtn) sendBtn.style.opacity = "1";
      stepGenerate();
    }, 1600);
  }

  /* ── Live Generation Progress Bar ── */
  function showGenProgress(jobId) {
    _genActiveJobId = jobId;
    _genStartTime = Date.now();
    try {
      localStorage.setItem(GEN_PERSIST_KEY, JSON.stringify({ jobId: jobId, startTime: _genStartTime }));
    } catch (e) {}

    var el = document.getElementById("creator-chat-rate-limit");
    if (!el) return;

    el.innerHTML = '<div class="creator-chat__gen-progress">'
      + '<span class="creator-chat__gen-text">Generating design...</span>'
      + '<span class="creator-chat__gen-timer" id="eazy-gen-timer">0:00</span>'
      + '<div class="creator-chat__gen-bar"><div class="creator-chat__gen-bar-fill" id="eazy-gen-bar-fill"></div></div>'
      + '</div>';
    el.classList.add("is-visible", "is-generating");

    startGenTimer();
    startGenBubbles();
  }

  function startGenTimer() {
    if (_genTimerInterval) clearInterval(_genTimerInterval);
    _genTimerInterval = setInterval(function () {
      if (!_genStartTime) return;
      var diff = Math.floor((Date.now() - _genStartTime) / 1000);
      var m = Math.floor(diff / 60);
      var s = diff % 60;
      var timerEl = document.getElementById("eazy-gen-timer");
      if (timerEl) timerEl.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    }, 1000);
  }

  function stopGenProgress(success) {
    _genActiveJobId = null;
    _genStartTime = null;
    try { localStorage.removeItem(GEN_PERSIST_KEY); } catch (e) {}
    if (_genTimerInterval) { clearInterval(_genTimerInterval); _genTimerInterval = null; }
    stopGenBubbles();

    var el = document.getElementById("creator-chat-rate-limit");
    if (el) {
      el.classList.remove("is-generating");
      setTimeout(function () {
        el.classList.remove("is-visible");
        el.innerHTML = '<span class="creator-chat__rate-text">'
          + '<span id="creator-chat-remaining">--</span> ' + i18n("ui_messages_of", "of") + ' <span id="creator-chat-limit">30</span> ' + i18n("ui_messages", "messages")
          + '</span>'
          + '<span class="creator-chat__rate-timer">' + i18n("ui_reset_in", "Reset in") + ' <span id="creator-chat-reset-timer">--:--</span></span>'
          + '<div class="creator-chat__rate-bar" role="progressbar"><div class="creator-chat__rate-fill" id="creator-chat-bar-fill"></div></div>';
      }, 300);
    }

    removeEazyJobMascot();
  }

  function resumeGenProgress() {
    if (_genActiveJobId) return;
    try {
      var raw = localStorage.getItem(GEN_PERSIST_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || !s.jobId) return;
      if (Date.now() - s.startTime > 10 * 60 * 1000) {
        localStorage.removeItem(GEN_PERSIST_KEY);
        return;
      }
      _genActiveJobId = s.jobId;
      _genStartTime = s.startTime;

      var el = document.getElementById("creator-chat-rate-limit");
      if (el) {
        el.innerHTML = '<div class="creator-chat__gen-progress">'
          + '<span class="creator-chat__gen-text">Generating design...</span>'
          + '<span class="creator-chat__gen-timer" id="eazy-gen-timer">0:00</span>'
          + '<div class="creator-chat__gen-bar"><div class="creator-chat__gen-bar-fill" id="eazy-gen-bar-fill"></div></div>'
          + '</div>';
        el.classList.add("is-visible", "is-generating");
      }
      startGenTimer();
      startGenBubbles();
      pollDesignStatus(s.jobId, 0);
      if (_panelOpen) setTimeout(animateEazyToActiveJobs, 600);
    } catch (e) {}
  }

  /* ── Generation Bubbles (5s interval) ── */
  function startGenBubbles() {
    stopGenBubbles();
    _genBubbleInterval = setInterval(function () {
      showGenBubbleWhereVisible();
    }, 5000);
  }

  function stopGenBubbles() {
    if (_genBubbleInterval) { clearInterval(_genBubbleInterval); _genBubbleInterval = null; }
    hideAllGenBubbles();
  }

  function showGenBubbleWhereVisible() {
    var quote = pickGenQuote();

    if (_panelOpen && _activeView === "jobs") {
      showJobMascotBubble(quote);
    } else if (_panelOpen && _activeView === "chat") {
      showSendBtnBubble(quote);
    } else if (!_panelOpen) {
      if (window.CreatorChatMascot) {
        var el = document.getElementById("eazy-thought");
        if (el) {
          var textEl = el.querySelector(".eazy-thought-text");
          if (textEl) textEl.textContent = quote;
          el.classList.add("show");
          setTimeout(function () { el.classList.remove("show"); }, 4000);
        }
      }
    }
  }

  function showSendBtnBubble(text) {
    var existing = document.querySelector(".eazy-gen-send-bubble");
    if (existing) existing.remove();

    var sendBtn = document.getElementById("creator-chat-send");
    if (!sendBtn) return;
    var wrap = sendBtn.parentElement;
    if (!wrap) return;

    wrap.style.position = "relative";
    var bubble = document.createElement("div");
    bubble.className = "eazy-gen-send-bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);

    requestAnimationFrame(function () { bubble.classList.add("is-visible"); });
    setTimeout(function () {
      bubble.classList.remove("is-visible");
      setTimeout(function () { bubble.remove(); }, 400);
    }, 4000);
  }

  function hideAllGenBubbles() {
    document.querySelectorAll(".eazy-gen-send-bubble, .eazy-job-mascot__bubble").forEach(function (b) { b.remove(); });
    var thought = document.getElementById("eazy-thought");
    if (thought) thought.classList.remove("show");
  }

  /* ── Eazy Job Mascot (sits in job container) ── */
  function placeEazyJobMascot() {
    removeEazyJobMascot();
    var list = document.getElementById("creator-chat-jobs-list");
    if (!list) return;
    var firstJob = list.querySelector(".creator-chat__job-item");
    if (!firstJob) return;

    firstJob.style.position = "relative";
    var mascot = document.createElement("div");
    mascot.className = "eazy-job-mascot";
    mascot.id = "eazy-job-mascot";
    var sendBtn = document.getElementById("creator-chat-send");
    if (sendBtn) {
      var svg = sendBtn.querySelector("svg");
      if (svg) mascot.innerHTML = svg.outerHTML;
    }
    firstJob.appendChild(mascot);
  }

  function removeEazyJobMascot() {
    var m = document.getElementById("eazy-job-mascot");
    if (m) m.remove();
  }

  function showJobMascotBubble(text) {
    var mascot = document.getElementById("eazy-job-mascot");
    if (!mascot) return;
    var existing = mascot.querySelector(".eazy-job-mascot__bubble");
    if (existing) existing.remove();

    var bubble = document.createElement("div");
    bubble.className = "eazy-job-mascot__bubble";
    bubble.textContent = text;
    mascot.appendChild(bubble);
    requestAnimationFrame(function () { bubble.classList.add("is-visible"); });
    setTimeout(function () {
      bubble.classList.remove("is-visible");
      setTimeout(function () { bubble.remove(); }, 400);
    }, 4000);
  }

  /* ── During generation: navigate to Active Jobs tab ── */
  function animateEazyToActiveJobs() {
    if (!_panelOpen) return;

    var sendBtn = document.getElementById("creator-chat-send");
    if (!sendBtn) { fallbackGoToJobs(); return; }

    var svgEl = sendBtn.querySelector("svg");
    if (!svgEl) { fallbackGoToJobs(); return; }

    var sRect = sendBtn.getBoundingClientRect();
    var ghostSize = Math.max(sRect.width, sRect.height) * 0.9;

    var ghost = document.createElement("div");
    ghost.className = "eazy-gen-ghost";
    ghost.innerHTML = svgEl.outerHTML;
    ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;"
      + "left:" + (sRect.left + sRect.width / 2 - ghostSize / 2) + "px;"
      + "top:" + (sRect.top + sRect.height / 2 - ghostSize / 2) + "px;"
      + "width:" + ghostSize + "px;height:" + ghostSize + "px;"
      + "display:flex;align-items:center;justify-content:center;border-radius:50%;";
    if (ghost.querySelector("svg")) ghost.querySelector("svg").style.cssText = "width:100%;height:100%;";
    document.body.appendChild(ghost);

    sendBtn.style.opacity = "0";

    if (_sidebarOpen) {
      jumpToJobsTab(ghost, function () {
        sendBtn.style.opacity = "";
        ghost.remove();
      });
    } else {
      jumpToDrawerStrip(ghost, function () {
        openSidebar();
        setTimeout(function () {
          jumpToJobsTab(ghost, function () {
            sendBtn.style.opacity = "";
            ghost.remove();
          });
        }, 400);
      });
    }
  }

  function jumpToDrawerStrip(ghost, cb) {
    var strip = document.getElementById("creator-chat-sidebar-strip");
    if (!strip) { if (cb) cb(); return; }
    var tRect = strip.getBoundingClientRect();
    var startX = parseFloat(ghost.style.left);
    var startY = parseFloat(ghost.style.top);
    var targetX = tRect.left + tRect.width / 2 - parseFloat(ghost.style.width) / 2;
    var targetY = tRect.top + tRect.height / 2 - parseFloat(ghost.style.height) / 2;

    ghost.style.setProperty("--bounce-start-x", startX + "px");
    ghost.style.setProperty("--bounce-start-y", startY + "px");
    ghost.style.setProperty("--bounce-target-x", targetX + "px");
    ghost.style.setProperty("--bounce-target-y", targetY + "px");
    ghost.classList.add("eazy-gen-ghost--bouncing");

    addLiftoffBurst(startX + parseFloat(ghost.style.width) / 2, startY + parseFloat(ghost.style.height) / 2);

    setTimeout(function () {
      ghost.classList.remove("eazy-gen-ghost--bouncing");
      ghost.style.left = targetX + "px";
      ghost.style.top = targetY + "px";
      ghost.style.transform = "";
      addImpactBurst(targetX + parseFloat(ghost.style.width) / 2, targetY + parseFloat(ghost.style.height) / 2);
      shakeElement(strip, function () { if (cb) cb(); });
    }, 1300);
  }

  function jumpToJobsTab(ghost, cb) {
    var jobsBtn = document.querySelector('.creator-chat__sidebar-btn[data-view="jobs"]');
    if (!jobsBtn) { switchView("jobs"); if (cb) cb(); return; }
    var tRect = jobsBtn.getBoundingClientRect();
    var startX = parseFloat(ghost.style.left);
    var startY = parseFloat(ghost.style.top);
    var targetX = tRect.left + tRect.width / 2 - parseFloat(ghost.style.width) / 2;
    var targetY = tRect.top + tRect.height / 2 - parseFloat(ghost.style.height) / 2;

    ghost.style.setProperty("--bounce-start-x", startX + "px");
    ghost.style.setProperty("--bounce-start-y", startY + "px");
    ghost.style.setProperty("--bounce-target-x", targetX + "px");
    ghost.style.setProperty("--bounce-target-y", targetY + "px");
    ghost.classList.add("eazy-gen-ghost--bouncing");

    addLiftoffBurst(startX + parseFloat(ghost.style.width) / 2, startY + parseFloat(ghost.style.height) / 2);

    setTimeout(function () {
      ghost.classList.remove("eazy-gen-ghost--bouncing");
      ghost.style.left = targetX + "px";
      ghost.style.top = targetY + "px";
      ghost.style.transform = "";
      addImpactBurst(targetX + parseFloat(ghost.style.width) / 2, targetY + parseFloat(ghost.style.height) / 2);
      shakeElement(jobsBtn, function () {
        switchView("jobs");
        waitForJobItem(function () { placeEazyJobMascot(); }, 8);
        if (cb) cb();
      });
    }, 1300);
  }

  function addLiftoffBurst(cx, cy) {
    var burst = document.createElement("div");
    burst.className = "eazy-anim-burst eazy-anim-burst--liftoff";
    burst.style.cssText = "position:fixed;z-index:99998;left:" + cx + "px;top:" + cy + "px;pointer-events:none;";
    document.body.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 600);
  }

  function addImpactBurst(cx, cy) {
    var burst = document.createElement("div");
    burst.className = "eazy-anim-burst eazy-anim-burst--impact";
    burst.style.cssText = "position:fixed;z-index:99998;left:" + cx + "px;top:" + cy + "px;pointer-events:none;";
    document.body.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 600);
  }

  function shakeElement(el, cb) {
    el.classList.add("eazy-anim-shake");
    setTimeout(function () {
      el.classList.remove("eazy-anim-shake");
      if (cb) cb();
    }, 400);
  }

  function fallbackGoToJobs() {
    if (!_sidebarOpen) openSidebar();
    setTimeout(function () {
      switchView("jobs");
      waitForJobItem(function () { placeEazyJobMascot(); }, 8);
    }, _sidebarOpen ? 100 : 500);
  }

  function waitForJobItem(cb, retries) {
    var list = document.getElementById("creator-chat-jobs-list");
    if (list && list.querySelector(".creator-chat__job-item")) { cb(); return; }
    if (retries <= 0) return;
    setTimeout(function () { waitForJobItem(cb, retries - 1); }, 500);
  }

  /* ── Completed-state management ── */
  function setGenCompleted(jobId) {
    _genCompletedJobId = jobId;
    try {
      localStorage.setItem(GEN_COMPLETE_KEY, JSON.stringify({ jobId: jobId, ts: Date.now() }));
    } catch (e) {}
  }

  function clearGenCompleted() {
    _genCompletedJobId = null;
    try { localStorage.removeItem(GEN_COMPLETE_KEY); } catch (e) {}
    removeEazyJobMascot();
  }

  function loadGenCompleted() {
    try {
      var raw = localStorage.getItem(GEN_COMPLETE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.jobId) return null;
      if (Date.now() - s.ts > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(GEN_COMPLETE_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  /* ── Post-generation: animate Eazy to Chat (notifications view removed) ── */
  function animateEazyToNotifications() {
    var isMobile = window.innerWidth < 750;

    function goToChat() {
      switchView("chat");
      // Notifications badge will show on toggle button
    }

    if (isMobile) {
      openSidebar();
      setTimeout(goToChat, 400);
      return;
    }

    if (!_sidebarOpen) {
      openSidebar();
      setTimeout(goToChat, 500);
    } else {
      goToChat();
    }
  }

  // placeEazyOnNotification removed - notifications view removed

  function autoOpenForCompleted() {
    var toggle = document.getElementById("creator-chat-toggle");
    if (toggle && !_panelOpen) {
      openPanel();
      try { localStorage.removeItem(GEN_COMPLETE_KEY); } catch (e) {}
      setTimeout(function () {
        animateEazyToNotifications();
      }, 800);
    }
  }

  function resumeGenCompleted() {
    var c = loadGenCompleted();
    if (!c) return;
    _genCompletedJobId = c.jobId;
    if (_panelOpen) {
      animateEazyToNotifications();
    } else {
      autoOpenForCompleted();
    }
  }

  /* ── Step 5: Generate ── */
  function stepGenerate() {
    clearDesignState();
    var summary = "Produkt: " + (_designData.target_product === "all" ? "Alle" : _designData.target_product)
      + "\nTyp: " + _designData.design_type
      + (_designData.prompt ? "\nPrompt: " + _designData.prompt.slice(0, 80) + (_designData.prompt.length > 80 ? "…" : "") : "")
      + (_designData.image_url ? "\nBild: ✓" : "");

    appendMessage("assistant", "Your design is being generated...\n" + summary, { msgType: "design_flow" });
    showTypingIndicator();

    var jobId = "chatjob_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

    var payload = {
      job_id: jobId,
      prompt: _designData.prompt || "",
      image_url: _designData.image_url || null,
      owner_id: getUserOwnerId(),
      design_type: _designData.design_type,
      target_product: _designData.target_product,
      ratio: _designData.ratio,
      content_type: _designData.content_type,
      styles: _designData.styles || [],
      design_colors: _designData.design_colors || [],
      background_colors: _designData.background_colors || [],
      background: _designData.background || { mode: "transparent" },
      language: _designData.language || { mode: "as-design" }
    };

    fetch(API_BASE + "?op=accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.status || data.status === "error") {
          removeTypingIndicator();
          appendMessage("assistant", i18n("chat_design_flow_generate_start_error", "Error starting generation: ") + (data.message || data.error || i18n("chat_error_unknown", "Unknown error")));
          return;
        }
        var realJobId = data.jobId || jobId;
        showGenProgress(realJobId);
        pollDesignStatus(realJobId, 0);
        setTimeout(animateEazyToActiveJobs, 800);
      })
      .catch(function (e) {
        removeTypingIndicator();
        appendMessage("assistant", i18n("chat.networkError", "Network error: ") + (e.message || i18n("chat_retry_prompt", "Please try again.")));
      });
  }

  function pollDesignStatus(jobId, attempt) {
    if (attempt > 60) {
      removeTypingIndicator();
      stopGenProgress(false);
      appendMessage("assistant", i18n("chat_design_flow_generate_took_too_long", "Generation is taking too long. You will find the result in your notifications."));
      return;
    }

    setTimeout(function () {
      fetch(API_BASE + "?op=status&job_id=" + encodeURIComponent(jobId), { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.done) {
            removeTypingIndicator();
            var finishedJobId = jobId;
            stopGenProgress(true);
            var previewUrl = (data.result && (data.result.preview_url || data.result.image_url)) || null;
            var doneIdx = Math.floor(Math.random() * GEN_DONE_QUOTES.length);
            var doneQuote = GEN_DONE_QUOTES[doneIdx];
            playEazyVoice("gen_done_" + (doneIdx + 1));
            showDesignResult(previewUrl, doneQuote, false, {
              job_id: finishedJobId,
              done: true,
              saved: data.saved,
              saving: data.saving,
            });
            setGenCompleted(finishedJobId);
            if (_panelOpen) {
              animateEazyToNotifications();
            } else {
              autoOpenForCompleted();
            }
          } else if (data.error) {
            removeTypingIndicator();
            stopGenProgress(false);
            appendMessage("assistant", i18n("chat_design_flow_generate_error", "Generation error: ") + (data.error_message || data.error || i18n("chat_error_unknown", "Unknown")));
          } else {
            var fill = document.getElementById("eazy-gen-bar-fill");
            if (fill && data.progress) fill.style.width = Math.min(95, data.progress) + "%";
            pollDesignStatus(jobId, attempt + 1);
          }
        })
        .catch(function () {
          pollDesignStatus(jobId, attempt + 1);
        });
    }, 3000);
  }

  /* ── Design Result Card ── */
  function chatCanShowLegacySave(statusHint) {
    if (window.CreatorLegacySave && typeof window.CreatorLegacySave.canShowLegacySaveButton === 'function') {
      return window.CreatorLegacySave.canShowLegacySaveButton(statusHint);
    }
    if (!statusHint) return true;
    if (statusHint.saving === true && statusHint.saved !== true) return false;
    return statusHint.done === true && statusHint.saved !== true;
  }

  function showDesignResult(previewUrl, quoteText, skipPersist, statusHint) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;

    var wrapper = document.createElement("div");
    wrapper.className = "creator-chat__msg creator-chat__msg--assistant";
    var inner = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    if (quoteText) inner += '<p style="margin:0 0 10px;font-weight:600;">' + escapeHtml(quoteText) + '</p>';
    if (previewUrl) {
      inner += '<div class="creator-chat__design-result">'
        + '<img src="' + previewUrl + '" alt="Generated design" />'
        + '</div>';
    }
    inner += '<p style="margin:10px 0 6px;font-size:13px;line-height:1.5;color:var(--chat-muted);">'
      + 'If you are happy with it, you can save the design - or review it later in peace. '
      + 'If you do not like it, you can discard it or generate a new one right away.</p>'
      + '<p style="margin:0 0 10px;font-size:12px;line-height:1.4;color:var(--chat-muted);">'
      + escapeHtml(i18n("chat_design_flow_design_location_hint", 'You can always find your designs in notifications or in the creator/shop area under "My Creations".')) + '</p>';
    var showLegacySave = chatCanShowLegacySave(statusHint);
    inner += '<div class="creator-chat__design-actions">';
    if (showLegacySave) {
      inner += '<button data-action="save-design">\uD83D\uDCBE Save</button>';
    }
    inner += '<button data-action="new-design">\uD83C\uDFA8 New design</button>'
      + '<button data-action="discard-design">\uD83D\uDDD1\uFE0F Discard</button>'
      + '<button data-action="later-design">\u23F3 Decide later</button>'
      + '</div>';
    inner += '</div>';
    wrapper.innerHTML = inner;

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;

    var persistContent = "DESIGN_RESULT:" + (previewUrl || "none") + ":" + (quoteText || "");
    if (!skipPersist) {
      persistMessage("assistant", persistContent, "design_flow");
      messages.push({ role: "assistant", content: persistContent });
    }

    bindDesignResultActions(wrapper);
  }

  function bindDesignResultActions(wrapper) {
    var saveBtn = wrapper.querySelector('[data-action="save-design"]');
    var newBtn = wrapper.querySelector('[data-action="new-design"]');
    var discardBtn = wrapper.querySelector('[data-action="discard-design"]');
    var laterBtn = wrapper.querySelector('[data-action="later-design"]');

    function disableAll() {
      wrapper.querySelectorAll(".creator-chat__design-actions button").forEach(function (b) { b.disabled = true; });
    }

    if (saveBtn) saveBtn.addEventListener("click", function () {
      disableAll();
      startSaveDesignFlow();
    });
    if (newBtn) newBtn.addEventListener("click", function () {
      disableAll();
      appendMessage("assistant", "Alright, let's start a new design!", { msgType: "design_flow" });
      startDesignFlow();
    });
    if (discardBtn) discardBtn.addEventListener("click", function () {
      disableAll();
      appendMessage("assistant", "Design discarded. Start a new one anytime if you like!", { msgType: "design_flow" });
    });
    if (laterBtn) laterBtn.addEventListener("click", function () {
      disableAll();
      appendMessage("assistant", i18n("chat_design_flow_find_later", "No worries! You can find your design anytime in notifications or in \"My Creations\"."), { msgType: "design_flow" });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  SAVE DESIGN FLOW (creator selection + visibility + queue)
   * ══════════════════════════════════════════════════════════════════ */
  var _saveCreatorName = null;
  var _saveVisibility = "private";
  var _saveActiveJobId = null;
  var SAVE_PERSIST_KEY = "eazy_save_active";

  function startSaveDesignFlow() {
    _saveCreatorName = null;
    _saveVisibility = "private";
    appendMessage("assistant",
      i18n("chat_design_flow_save_intro", "Before saving your design, I need a few details."),
      { msgType: "design_flow" });
    fetchCreatorNamesForSave();
  }

  function fetchCreatorNamesForSave() {
    var ownerId = getUserOwnerId();
    fetch(API_BASE + "?op=get-settings&owner_id=" + encodeURIComponent(ownerId), {
      credentials: "include"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var names = (data && data.settings && data.settings.creator_names) || [];
        var activeName = (data && data.settings && data.settings.active_creator_name) || null;
        if (names.length > 1) {
          showCreatorNameSelection(names, activeName);
        } else {
          _saveCreatorName = names.length === 1 ? names[0] : (activeName || null);
          showVisibilitySelection();
        }
      })
      .catch(function () {
        _saveCreatorName = null;
        showVisibilitySelection();
      });
  }

  function showCreatorNameSelection(names, activeName) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) { showVisibilitySelection(); return; }

    appendMessage("assistant",
      i18n("chat_design_flow_creator_profile_choice", "You have multiple creator profiles. Under which name would you like to save the design?\n\n")
      + i18n("chat_design_flow_creator_name_public_hint", "The selected creator name will be shown publicly when you publish the design."),
      { msgType: "design_flow" });

    var el = document.createElement("div");
    el.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">'
      + '<div class="creator-chat__step-card"><div class="creator-chat__step-label">' + escapeHtml(i18n("chat_design_flow_select_creator", "Select creator")) + '</div>'
      + '<div class="creator-chat__step-grid">';
    names.forEach(function (name) {
      var sel = name === activeName ? " creator-chat__step-option--selected" : "";
      html += '<button class="creator-chat__step-option' + sel + '" data-creator-name="' + escapeHtml(name) + '">'
        + escapeHtml(name) + '</button>';
    });
    html += '</div></div></div>';
    el.innerHTML = html;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    el.querySelectorAll("[data-creator-name]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll(".creator-chat__step-option").forEach(function (b) {
          b.classList.remove("creator-chat__step-option--selected");
        });
        this.classList.add("creator-chat__step-option--selected");
        _saveCreatorName = this.getAttribute("data-creator-name");
        disableStepCard(el);
        appendMessage("user", _saveCreatorName, { msgType: "design_flow" });
        showVisibilitySelection();
      });
    });
  }

  function showVisibilitySelection() {
    var container = document.getElementById("creator-chat-messages");
    if (!container) { executeSaveDesign(); return; }

    appendMessage("assistant",
      "Choose visibility for your design:\n\n"
      + "\uD83C\uDF0D **Public** \u2014 Your design is visible to everyone and can be applied to products. "
      + "Other users can discover and use it.\n\n"
      + "\uD83D\uDD12 **Private** \u2014 Only you can see the design. Ideal if you still want to edit it or publish later.",
      { msgType: "design_flow" });

    var el = document.createElement("div");
    el.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">'
      + '<div class="creator-chat__step-card"><div class="creator-chat__step-label">' + escapeHtml(i18n("chat_design_flow_visibility_label", "Visibility")) + '</div>'
      + '<div class="creator-chat__step-grid">'
      + '<button class="creator-chat__step-option" data-visibility="public">\uD83C\uDF0D Public</button>'
      + '<button class="creator-chat__step-option" data-visibility="private">\uD83D\uDD12 Private</button>'
      + '</div></div></div>';
    el.innerHTML = html;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;

    el.querySelectorAll("[data-visibility]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        el.querySelectorAll(".creator-chat__step-option").forEach(function (b) {
          b.classList.remove("creator-chat__step-option--selected");
        });
        this.classList.add("creator-chat__step-option--selected");
        _saveVisibility = this.getAttribute("data-visibility");
        disableStepCard(el);
        appendMessage("user", _saveVisibility === "public" ? "\uD83C\uDF0D Public" : "\uD83D\uDD12 Private", { msgType: "design_flow" });
        executeSaveDesign();
      });
    });
  }

  function executeSaveDesign() {
    var jobId = _genCompletedJobId || _genActiveJobId;
    if (!jobId) {
      appendMessage("assistant", i18n("chat_design_flow_no_active_design_to_save", "Error: No active design found to save."), { msgType: "design_flow" });
      return;
    }
    var ownerId = getUserOwnerId();
    var summary = "Saving design..."
      + (_saveCreatorName ? "\nCreator: " + _saveCreatorName : "")
      + "\n" + i18n("chat_design_flow_visibility_label", "Visibility") + ": " + (_saveVisibility === "public" ? "Public" : "Private");

    appendMessage("assistant", summary, { msgType: "design_flow" });
    showTypingIndicator();

    var payload = {
      job_id: jobId,
      owner_id: ownerId,
      prompt: _designData.prompt || "",
      image_url: _designData.image_url || null,
      design_prompt: _designData.prompt || "",
      creator_name: _saveCreatorName || null,
      visibility: _saveVisibility,
      parent_design_id: null
    };

    fetch(API_BASE + "?op=save-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        removeTypingIndicator();
        if (!data.ok && data.error) {
          appendMessage("assistant", i18n("chat_design_flow_save_error", "Error saving: ") + (data.error || i18n("chat_error_unknown", "Unknown")), { msgType: "design_flow" });
          return;
        }
        _saveActiveJobId = jobId;
        try {
          localStorage.setItem(SAVE_PERSIST_KEY, JSON.stringify({ jobId: jobId, ts: Date.now() }));
        } catch (e) {}

        window.dispatchEvent(new CustomEvent("creatorSaveJobStarted", { detail: { jobId: jobId } }));

        showSaveProgress(jobId);
        pollSaveStatus(jobId, 0);
        setTimeout(animateEazyToActiveJobs, 800);
      })
      .catch(function (e) {
        removeTypingIndicator();
        appendMessage("assistant", i18n("chat_design_flow_save_network_error", "Network error while saving: ") + (e.message || i18n("chat_retry_prompt", "Please try again.")), { msgType: "design_flow" });
      });
  }

  function showSaveProgress(jobId) {
    _saveActiveJobId = jobId;
    var el = document.getElementById("creator-chat-rate-limit");
    if (!el) return;
    el.innerHTML = '<div class="creator-chat__gen-progress">'
      + '<span class="creator-chat__gen-text">Saving design...</span>'
      + '<div class="creator-chat__gen-bar"><div class="creator-chat__gen-bar-fill" id="eazy-save-bar-fill" style="width:30%"></div></div>'
      + '</div>';
    el.classList.add("is-visible", "is-generating");
  }

  function stopSaveProgress() {
    _saveActiveJobId = null;
    try { localStorage.removeItem(SAVE_PERSIST_KEY); } catch (e) {}
    var el = document.getElementById("creator-chat-rate-limit");
    if (el) {
      el.classList.remove("is-generating");
      setTimeout(function () {
        el.classList.remove("is-visible");
        el.innerHTML = '<span class="creator-chat__rate-text">'
          + '<span id="creator-chat-remaining">--</span> ' + i18n("ui_messages_of", "of") + ' <span id="creator-chat-limit">30</span> ' + i18n("ui_messages", "messages")
          + '</span>'
          + '<span class="creator-chat__rate-timer">' + i18n("ui_reset_in", "Reset in") + ' <span id="creator-chat-reset-timer">--:--</span></span>';
      }, 1000);
    }
  }

  function pollSaveStatus(jobId, attempt) {
    if (attempt > 40) {
      stopSaveProgress();
      appendMessage("assistant", i18n("chat_design_flow_save_took_too_long", "Saving takes longer than expected. Check the status in notifications."), { msgType: "design_flow" });
      return;
    }
    setTimeout(function () {
      fetch(API_BASE + "?op=status&job_id=" + encodeURIComponent(jobId), { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.saved === true || (data.done && data.action === "save")) {
            stopSaveProgress();
            clearGenCompleted();
            appendMessage("assistant",
              "\u2705 Design erfolgreich gespeichert!"
              + (_saveCreatorName ? " (Creator: " + escapeHtml(_saveCreatorName) + ")" : "")
              + "\n" + i18n("chat_design_flow_visibility_label", "Visibility") + ": " + (_saveVisibility === "public" ? "\uD83C\uDF0D Public" : "\uD83D\uDD12 Private")
              + "\n\nDu findest es jederzeit unter \u201EMeine Kreationen\u201C.",
              { msgType: "design_flow" });

            loadNotifications();
            loadActiveJobs();

            if (_panelOpen) {
              setTimeout(animateEazyToNotifications, 600);
            }
          } else if (data.error) {
            stopSaveProgress();
            appendMessage("assistant", i18n("chat_design_flow_save_error", "Error saving: ") + (data.error_message || data.error || i18n("chat_error_unknown", "Unknown")), { msgType: "design_flow" });
          } else {
            var fill = document.getElementById("eazy-save-bar-fill");
            if (fill) fill.style.width = Math.min(90, 30 + attempt * 3) + "%";
            pollSaveStatus(jobId, attempt + 1);
          }
        })
        .catch(function () {
          pollSaveStatus(jobId, attempt + 1);
        });
    }, 3000);
  }

  /* ══════════════════════════════════════════════════════════════════
   *  UPLOAD MODAL
   * ══════════════════════════════════════════════════════════════════ */
  var _uploadCallback = null;
  var _uploadFile = null;

  function initUploadModal() {
    var modal = document.getElementById("creator-chat-upload-modal");
    if (!modal) return;

    var zone = document.getElementById("creator-chat-upload-zone");
    var fileInput = document.getElementById("creator-chat-upload-input");
    var preview = document.getElementById("creator-chat-upload-preview");
    var previewImg = document.getElementById("creator-chat-upload-img");
    var removeBtn = document.getElementById("creator-chat-upload-remove");
    var confirmBtn = document.getElementById("creator-chat-upload-confirm");
    var closeBtn = document.getElementById("creator-chat-upload-close");

    zone.addEventListener("click", function () { fileInput.click(); });

    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      zone.classList.add("creator-chat__upload-zone--dragover");
    });
    zone.addEventListener("dragleave", function () {
      zone.classList.remove("creator-chat__upload-zone--dragover");
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("creator-chat__upload-zone--dragover");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleUploadFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", function () {
      if (this.files && this.files.length) handleUploadFile(this.files[0]);
    });

    function handleUploadFile(file) {
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) {
        alert(i18n("chat.upload.maxFileSize", "Maximum file size: 10 MB"));
        return;
      }
      _uploadFile = file;
      var reader = new FileReader();
      reader.onload = function (ev) {
        previewImg.src = ev.target.result;
        preview.style.display = "";
        zone.style.display = "none";
        confirmBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }

    removeBtn.addEventListener("click", function () {
      _uploadFile = null;
      previewImg.src = "";
      preview.style.display = "none";
      zone.style.display = "";
      confirmBtn.disabled = true;
      fileInput.value = "";
    });

    confirmBtn.addEventListener("click", function () {
      if (!_uploadFile) return;
      var cb = _uploadCallback;
      var dataUrl = previewImg ? previewImg.src : null;
      if (!dataUrl) return;
      closeUploadModal();
      if (cb) cb(dataUrl);
    });

    closeBtn.addEventListener("click", closeUploadModal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeUploadModal();
    });
  }

  function openUploadModal(callback) {
    _uploadCallback = callback;
    _uploadFile = null;

    var modal = document.getElementById("creator-chat-upload-modal");
    var preview = document.getElementById("creator-chat-upload-preview");
    var zone = document.getElementById("creator-chat-upload-zone");
    var confirmBtn = document.getElementById("creator-chat-upload-confirm");
    var fileInput = document.getElementById("creator-chat-upload-input");

    if (preview) preview.style.display = "none";
    if (zone) zone.style.display = "";
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = i18n("chat.apply", "Apply"); }
    if (fileInput) fileInput.value = "";
    if (modal) modal.setAttribute("aria-hidden", "false");
  }

  function closeUploadModal() {
    var modal = document.getElementById("creator-chat-upload-modal");
    if (modal) modal.setAttribute("aria-hidden", "true");
    _uploadCallback = null;
    _uploadFile = null;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  CHAT UPLOAD BUTTON (inside textarea)
   * ══════════════════════════════════════════════════════════════════ */
  var _pendingUploadImage = null;

  function initChatUpload() {
    var btn = document.getElementById("creator-chat-upload-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      openUploadModal(function (dataUrl) {
        _pendingUploadImage = dataUrl;
        var container = document.getElementById("creator-chat-messages");
        if (container) {
          var imgMsg = document.createElement("div");
          imgMsg.className = "creator-chat__msg creator-chat__msg--user";
          imgMsg.innerHTML = '<div class="creator-chat__bubble creator-chat__bubble--user">' +
            '<img src="' + dataUrl + '" class="creator-chat__upload-preview-img" alt="Uploaded image">' +
            '</div>';
          container.appendChild(imgMsg);
          container.scrollTop = container.scrollHeight;
        }
        messages.push({ role: "user", content: "[Image uploaded]" });
        showUploadFunctionSelection();
      });
    });
  }

  function showUploadFunctionSelection() {
    var text = "What would you like to do with the image?";
    renderShowOptions(text, {
      options: [
        { key: "a", label: "Generate design", value: "generate-design" },
        { key: "b", label: "Upload design", value: "upload-design" },
        { key: "c", label: "Create hero image", value: "generate-hero" },
        { key: "d", label: "Creator image/banner", value: "creator-image" }
      ],
      allow_custom: false,
      _imageUploadSelection: true
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  GRID SELECTION HANDLERS
   * ══════════════════════════════════════════════════════════════════ */
  var _publishSelectedDesignId = null;

  function handleGridSelection(gridType, items) {
    if (!items || !items.length) return;
    var item = items[0];
    if (gridType === "designs" || gridType === "publish-designs") {
      appendMessage("user", "Selected design: " + (item.label || item.id));
      if (gridType === "publish-designs") {
        _publishSelectedDesignId = item.id;
        appendMessage("assistant", "Which products do you want to publish to?");
        renderShowOptions("", {
          options: [
            { key: "a", label: "All products", value: "__all_products__" },
            { key: "b", label: "Select products", value: "__select_products__" },
          ],
          allow_custom: false,
          _publishProductSelection: true
        });
      } else if (window.CreatorDesignModal) {
        window.CreatorDesignModal.open(item);
      }
    } else if (gridType === "my-products") {
      showProductDetail(item);
    } else if (gridType === "favorites") {
      showFavoriteDetail(item);
    } else if (gridType === "gift-cards") {
      showGiftCardDetail(item);
    } else if (gridType === "my-orders") {
      showOrderDetail(item);
    } else if (gridType === "shop-products") {
      showShopProductDetail(item);
    } else if (gridType === "wardrobe") {
      showOutfitDetail(item);
    } else if (gridType === "my-mockups") {
      showMockupDetail(item);
    } else if (gridType === "hero-images") {
      showHeroDetail(item);
    }
  }

  function handleGridConfirm(gridType, items) {
    if (!items || !items.length) return;
    if (gridType === "publish-products") {
      var productKeys = items.map(function (it) { return it.id; });
      doPublish(_publishSelectedDesignId, productKeys);
    } else if (gridType === "my-products") {
      showProductDetail(items[0]);
    } else if (gridType === "favorites") {
      showFavoriteDetail(items[0]);
    } else if (gridType === "gift-cards") {
      showGiftCardDetail(items[0]);
    } else if (gridType === "my-orders") {
      showOrderDetail(items[0]);
    } else if (gridType === "shop-products") {
      showShopProductDetail(items[0]);
    } else if (gridType === "wardrobe") {
      showOutfitDetail(items[0]);
    } else if (gridType === "my-mockups") {
      showMockupDetail(items[0]);
    } else if (gridType === "hero-images") {
      showHeroDetail(items[0]);
    }
  }

  function loadProductGridForPublish() {
    showTypingIndicator();
    var url = API_BASE + "?op=get-catalog-products&region=EU";
    if (_publishSelectedDesignId) {
      url += "&design_id=" + encodeURIComponent(_publishSelectedDesignId);
    }
    fetch(url, {
      credentials: "include",
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      removeTypingIndicator();
      var products = (data.products || data.results || []).map(function (p) {
        return {
          id: p.product_key || p.id,
          image_url: p.image_url || "",
          label: p.title || p.product_key || i18n("chat.product.defaultLabel", "Product"),
        };
      });
      if (!products.length) {
        appendMessage("assistant", i18n("chat.product.noneFound", "No products found. Please try again later."));
        return;
      }
      appendMessage("assistant", i18n("chat.product.selectAndConfirm", "Select products and confirm:"));
      renderChatGrid({
        items: products,
        mode: "multi",
        grid_type: "publish-products",
        emptyText: i18n("chat.product.noneAvailable", "No products available."),
        onConfirm: function (items) { handleGridConfirm("publish-products", items); },
      });
    })
    .catch(function () {
      removeTypingIndicator();
      appendMessage("assistant", i18n("chat.product.loadError", "Products could not be loaded."));
    });
  }

  function doPublish(designId, productKeys) {
    if (!designId || !productKeys.length) return;
    appendMessage("assistant", i18n("chat.publish.starting", "Publishing is starting... ") + productKeys.length + " " + i18n("chat.publish.productCount", "product(s)"));
    fetch(API_BASE + "?op=publish-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        design_id: designId,
        product_keys: productKeys,
        visibility: "public",
        owner_id: getUserId(),
      }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok && data.session_id) {
        appendMessage("assistant", "Eazy is handling it! Check the Jobs tab for progress.");
        setTimeout(function () { animateEazyBounceToInput(); }, 400);
      } else {
        appendMessage("assistant", i18n("chat.publish.error", "An error occurred while publishing: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      }
    })
    .catch(function () {
      appendMessage("assistant", i18n("chat.publish.failedRetry", "Publishing failed. Please try again."));
    });
    _publishSelectedDesignId = null;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  PRODUCT DETAIL & ACTIONS (My products)
   * ══════════════════════════════════════════════════════════════════ */
  function showProductDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    if (item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(item.label) + '</strong>';
    if (item.badge) html += '<br><span style="opacity:.7;font-size:.85em">' + escapeHtml(item.badge) + '</span>';
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="toggle_visibility" data-pid="' + escapeHtml(item.id) + '">' + escapeHtml(i18n("chat.product.button.changeVisibility", "Change visibility")) + '</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="amazon_publish" data-pid="' + escapeHtml(item.id) + '">To Amazon</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="amazon_unpublish" data-pid="' + escapeHtml(item.id) + '">Remove from Amazon</button>';
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="delete" data-pid="' + escapeHtml(item.id) + '">Delete</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        var pid = btn.getAttribute("data-pid");
        if (act === "delete") {
          showConfirmDialog("Delete product permanently?", function () { executeProductAction(pid, act, btn); });
        } else {
          executeProductAction(pid, act, btn);
        }
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeProductAction(productId, action, btn) {
    var opMap = {
      toggle_visibility: "update-visibility",
      amazon_publish: "amazon-publish",
      amazon_unpublish: "amazon-unpublish",
      "delete": "delete-published"
    };
    var op = opMap[action];
    if (!op) return;
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }
    var method = action === "delete" ? "DELETE" : "POST";
    var url = API_BASE + "?op=" + op + "&owner_id=" + encodeURIComponent(getUserId());
    if (action === "delete" || action === "amazon_publish" || action === "amazon_unpublish") {
      url += "&id=" + encodeURIComponent(productId);
    }
    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: method === "POST" ? JSON.stringify({ product_id: productId, owner_id: getUserId() }) : undefined,
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok) {
        var labels = {
          toggle_visibility: i18n("chat.product.action.visibilityUpdated", "Visibility updated"),
          amazon_publish: i18n("chat.product.action.amazonPublished", "Published on Amazon"),
          amazon_unpublish: i18n("chat.product.action.amazonRemoved", "Removed from Amazon"),
          "delete": i18n("chat.product.action.deleted", "Product deleted")
        };
        appendMessage("assistant", labels[action] || i18n("chat.action.executed", "Action executed!"));
      } else {
        appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      }
    })
    .catch(function () { appendMessage("assistant", i18n("chat_network_error_retry", "Network error. Please try again.")); })
    .finally(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = {
          toggle_visibility: i18n("chat.product.button.changeVisibility", "Change visibility"),
          amazon_publish: i18n("chat.product.button.toAmazon", "To Amazon"),
          amazon_unpublish: i18n("chat.product.button.removeFromAmazon", "Remove from Amazon"),
          "delete": i18n("chat_delete", "Delete")
        }[action] || i18n("chat_action", "Action");
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  FAVORITE DETAIL & ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function showFavoriteDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    if (item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(item.label) + '</strong>';
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="add_to_cart" data-pid="' + escapeHtml(item.id) + '">Add to cart</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="share" data-pid="' + escapeHtml(item.id) + '">Share</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="set_price_alert" data-pid="' + escapeHtml(item.id) + '">Price alert</button>';
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="remove" data-pid="' + escapeHtml(item.id) + '">Remove</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        var pid = btn.getAttribute("data-pid");
        executeFavoriteAction(pid, act, btn);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeFavoriteAction(productId, action, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    if (action === "add_to_cart") {
      fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(productId), quantity: 1 }),
      })
      .then(function (r) { return r.json(); })
      .then(function () { appendMessage("assistant", "Added to cart!"); })
      .catch(function () { appendMessage("assistant", i18n("chat.cart.addError", "Error adding to cart.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Add to cart"; } });
      return;
    }

    if (action === "set_price_alert") {
      try {
        var alerts = JSON.parse(localStorage.getItem("eazy_price_alerts") || "[]");
        var exists = alerts.some(function (a) { return String(a.product_id) === String(productId); });
        if (exists) {
          appendMessage("assistant", i18n("chat.priceAlert.alreadyExists", "You already have a price alert for this product."));
        } else {
          alerts.push({ product_id: productId, set_at: Date.now() });
          localStorage.setItem("eazy_price_alerts", JSON.stringify(alerts));
          appendMessage("assistant", "Price alert set! Eazy will notify you about price changes.");
        }
      } catch (e) {
        appendMessage("assistant", "Price alert could not be set.");
      }
      if (btn) { btn.disabled = false; btn.textContent = "Price alert"; }
      return;
    }

    if (action === "share") {
      appendMessage("assistant", "Teile-Link wird erstellt\u2026");
      if (btn) { btn.disabled = false; btn.textContent = "Share"; }
      var baseUrl = window.location.origin + "/products/" + productId;
      var sharePromise = (window.ShareButtonResolveShareUrl && typeof window.ShareButtonResolveShareUrl === "function")
        ? window.ShareButtonResolveShareUrl(baseUrl)
        : Promise.resolve(baseUrl);
      sharePromise.then(function (shareUrl) {
        var finalUrl = shareUrl || baseUrl;
        if (window.ShareButtonOpenModal) {
          window.ShareButtonOpenModal(finalUrl, "", baseUrl);
        } else {
          try { navigator.clipboard.writeText(finalUrl); appendMessage("assistant", "Link kopiert: " + finalUrl); } catch (e) { appendMessage("assistant", "Link: " + finalUrl); }
        }
      }).catch(function () {
        if (window.ShareButtonOpenModal) {
          window.ShareButtonOpenModal(baseUrl, "", baseUrl);
        } else {
          try { navigator.clipboard.writeText(baseUrl); appendMessage("assistant", "Link kopiert: " + baseUrl); } catch (e) { appendMessage("assistant", "Link: " + baseUrl); }
        }
      });
      return;
    }

    if (action === "remove") {
      fetch(API_BASE + "?op=remove-favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_id: getUserId(), product_id: productId }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) appendMessage("assistant", "Aus Favoriten entfernt.");
        else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      })
      .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Remove"; } });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  GIFT CARD DETAIL & ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function showGiftCardDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    html += '<div class="creator-chat__gift-card-icon">\ud83c\udf81</div>';
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(item.label) + '</strong>';
    if (item.badge) html += '<br><span class="creator-chat__gc-status creator-chat__gc-status--' + escapeHtml(item.badge.toLowerCase()) + '">' + escapeHtml(item.badge) + '</span>';
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="gc-apply" data-gcid="' + escapeHtml(item.id) + '">Apply in cart</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="gc-email" data-gcid="' + escapeHtml(item.id) + '">E-Mail senden</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="gc-products" data-gcid="' + escapeHtml(item.id) + '">Produkte ausw\u00e4hlen</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="gc-ai" data-gcid="' + escapeHtml(item.id) + '">Create AI design</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        var gcid = btn.getAttribute("data-gcid");
        executeGiftCardAction(gcid, act, btn);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeGiftCardAction(giftCardId, action, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    if (action === "gc-apply") {
      appendMessage("assistant", i18n("chat.giftcard.enterCode", "Enter your gift card code:"));
      if (btn) { btn.disabled = false; btn.textContent = i18n("chat.giftcard.applyInCart", "Apply in cart"); }
      var input = document.getElementById("creator-chat-input");
      if (input) { input.focus(); input.placeholder = i18n("chat.giftcard.enterCodePlaceholder", "Enter gift card code..."); }
      _pendingGiftCardApply = true;
      return;
    }

    if (action === "gc-email") {
      appendMessage("assistant", i18n("chat.giftcard.emailInfo", "Email sending for gift cards is available on the gift card detail page."));
      if (btn) { btn.disabled = false; btn.textContent = i18n("chat.giftcard.sendEmail", "Send email"); }
      return;
    }

    if (action === "gc-products") {
      appendMessage("assistant", i18n("chat.giftcard.openingProductSelection", "Opening product selection..."));
      if (btn) { btn.disabled = false; btn.textContent = i18n("chat.giftcard.selectProducts", "Select products"); }
      return;
    }

    if (action === "gc-ai") {
      appendMessage("assistant", i18n("chat.giftcard.aiDescribePrompt", "Describe what should appear on the gift card image:"));
      if (btn) { btn.disabled = false; btn.textContent = i18n("chat.giftcard.aiCreateDesign", "Create AI design"); }
      var input2 = document.getElementById("creator-chat-input");
      if (input2) { input2.focus(); input2.placeholder = i18n("chat.giftcard.aiPlaceholder", "e.g. flower meadow with butterflies..."); }
      _pendingGiftCardAI = giftCardId;
      return;
    }
  }

  var _pendingGiftCardApply = false;
  var _pendingGiftCardAI = null;

  function applyGiftCardCode(code) {
    _pendingGiftCardApply = false;
    showTypingIndicator();
    fetch(API_BASE + "?op=apply-gift-card-storefront", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code: code }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      removeTypingIndicator();
      if (data.ok) {
        appendMessage("assistant", i18n("chat.giftcard.appliedSuccess", "Gift card applied successfully!"));
      } else {
        appendMessage("assistant", i18n("chat.giftcard.applyError", "Code could not be applied: ") + (data.error || i18n("chat.giftcard.invalidCode", "Invalid code")));
      }
    })
    .catch(function () {
      removeTypingIndicator();
      appendMessage("assistant", i18n("chat_network_error_retry", "Network error. Please try again."));
    });
  }

  function triggerGiftCardAI(giftCardId, description) {
    showTypingIndicator();
    fetch(API_BASE + "?op=generate-gift-card-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ gift_card_id: giftCardId, description: description, owner_id: getUserId() }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      removeTypingIndicator();
      if (data.ok && data.image_url) {
        var msg = appendMessage("assistant", i18n("chat.giftcard.aiResult", "Here is your AI-generated gift card design:"));
        var container = document.getElementById("creator-chat-messages");
        if (container) {
          var imgWrap = document.createElement("div");
          imgWrap.className = "creator-chat__inline-grid";
          imgWrap.innerHTML = '<img src="' + escapeHtml(data.image_url) + '" alt="' + escapeHtml(i18n("chat.giftcard.aiDesignAlt", "Gift card design")) + '" style="max-width:100%;border-radius:8px;margin-top:8px">';
          container.appendChild(imgWrap);
          container.scrollTop = container.scrollHeight;
        }
      } else {
        appendMessage("assistant", i18n("chat.image.generateError", "Image could not be generated: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      }
    })
    .catch(function () {
      removeTypingIndicator();
      appendMessage("assistant", i18n("chat.image.generateNetworkError", "Network error during image generation."));
    });
  }

  /* ══════════════════════════════════════════════════════════════════
   *  ORDER DETAIL & ACTIONS (Meine Bestellungen)
   * ══════════════════════════════════════════════════════════════════ */
  function showOrderDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var meta = item._meta || {};
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__order-detail">';
    if (item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(meta.order_name || item.label) + '</strong>';
    if (meta.created_at) {
      html += '<br><span style="opacity:.7;font-size:.85em">' + escapeHtml(new Date(meta.created_at).toLocaleDateString("de-DE")) + '</span>';
    }
    html += '<br><span style="font-size:.9em">' + escapeHtml(parseFloat(meta.total_price || 0).toFixed(2)) + '\u20ac</span>';
    var badgeMap = { fulfilled: "Zugestellt", partial: "Teilweise versendet", unfulfilled: "Offen" };
    html += '<br><span class="creator-chat__order-badge creator-chat__order-badge--' + escapeHtml(meta.fulfillment_status || "unfulfilled") + '">' + escapeHtml(badgeMap[meta.fulfillment_status] || "Offen") + '</span>';
    if (meta.line_items && meta.line_items.length) {
      html += '<div class="creator-chat__order-items">';
      for (var i = 0; i < meta.line_items.length; i++) {
        html += '<span class="creator-chat__order-item">\u2022 ' + escapeHtml(meta.line_items[i]) + '</span>';
      }
      html += '</div>';
    }
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    if (meta.tracking_url) {
      html += '<a href="' + escapeHtml(meta.tracking_url) + '" target="_blank" rel="noopener" class="creator-chat__action-btn">Tracking \u00f6ffnen</a>';
    } else if (meta.tracking_number) {
      html += '<button type="button" class="creator-chat__action-btn" disabled>Tracking: ' + escapeHtml(meta.tracking_number) + '</button>';
    }
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="report_problem" data-oid="' + escapeHtml(item.id) + '">Problem melden</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll("[data-action=report_problem]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.disabled = true;
        btn.textContent = "\u2026";
        var supportText = "Problem mit Bestellung " + (meta.order_name || item.id) + " vom " + (meta.created_at ? new Date(meta.created_at).toLocaleDateString("de-DE") : "unbekannt");
        sendSupportMessage(supportText);
      appendMessage("assistant", i18n("chat.support.forwarded", "Your request has been forwarded to support. You will receive a reply soon."));
        btn.textContent = "Gemeldet";
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  SHOP PRODUCT DETAIL & ACTIONS (Search / Browse)
   * ══════════════════════════════════════════════════════════════════ */
  function showShopProductDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var meta = item._meta || {};
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    if (item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(item.label) + '</strong>';
    if (item.badge) html += '<br><span style="font-weight:600;color:var(--eazy-accent,#e67e22)">' + escapeHtml(item.badge) + '</span>';
    if (meta.description) html += '<br><span style="opacity:.7;font-size:.85em">' + escapeHtml(meta.description) + '</span>';
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    if (meta.variant_id) {
      html += '<button type="button" class="creator-chat__action-btn" data-action="add_to_cart" data-vid="' + escapeHtml(meta.variant_id) + '">Add to cart</button>';
    }
    html += '<button type="button" class="creator-chat__action-btn" data-action="add_to_favorites" data-pid="' + escapeHtml(item.id) + '">Zu Favoriten</button>';
    if (meta.handle) {
      html += '<a href="/products/' + escapeHtml(meta.handle) + '" target="_blank" rel="noopener" class="creator-chat__action-btn">Produktseite</a>';
    }
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        if (btn.tagName === "A") return;
        e.preventDefault();
        var act = btn.getAttribute("data-action");
        if (!act) return;
        executeShopProductAction(item, act, btn);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeShopProductAction(item, action, btn) {
    var meta = item._meta || {};
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    if (action === "add_to_cart" && meta.variant_id) {
      fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: Number(meta.variant_id), quantity: 1 }] }),
      })
      .then(function (r) { return r.json(); })
      .then(function () { appendMessage("assistant", escapeHtml(item.label) + " wurde zum Warenkorb hinzugef\u00fcgt!"); })
      .catch(function () { appendMessage("assistant", i18n("chat.cart.addError", "Error adding to cart.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Add to cart"; } });
      return;
    }

    if (action === "add_to_favorites") {
      fetch(API_BASE + "?op=add-favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_id: getUserId(), product_id: item.id, product_title: item.label, product_image: item.image_url }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) appendMessage("assistant", escapeHtml(item.label) + " zu Favoriten hinzugef\u00fcgt!");
        else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      })
      .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Zu Favoriten"; } });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  WARDROBE DETAIL & ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function showOutfitDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var meta = item._meta || {};
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    if (item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(item.label) + '</strong>';
    if (item.badge) html += '<br><span style="opacity:.7;font-size:.85em">' + escapeHtml(item.badge) + '</span>';
    if (meta.gender) html += '<br><span style="font-size:.85em">' + escapeHtml(meta.gender === "male" ? "M\u00e4nnlich" : "Weiblich") + (meta.age_group ? " \u2013 " + escapeHtml(meta.age_group) : "") + '</span>';

    var slots = {};
    try { slots = JSON.parse(meta.slots || "{}"); } catch (e) {}
    var slotLabels = { head: "Kopf", upper_body: "Oberteil", layer: "Schicht", pants: "Hose", feet: "Schuhe", socks: "Socken", accessory_1: "Accessoire 1", accessory_2: "Accessoire 2", one_piece: "Einteiler" };
    var filledSlots = Object.keys(slots).filter(function (k) { return slots[k]; });
    if (filledSlots.length) {
      html += '<div class="creator-chat__wardrobe-slots">';
      for (var si = 0; si < filledSlots.length; si++) {
        var sk = filledSlots[si];
        var sv = slots[sk];
        var slotName = slotLabels[sk] || sk;
        var prodName = typeof sv === "object" ? (sv.title || sv.product_key || sk) : String(sv);
        html += '<span class="creator-chat__wardrobe-slot">\u2022 ' + escapeHtml(slotName) + ': ' + escapeHtml(prodName) + '</span>';
      }
      html += '</div>';
    }
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="generate_image" data-oid="' + escapeHtml(item.id) + '">AI Bild generieren</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="edit_slots" data-oid="' + escapeHtml(item.id) + '">Slots bearbeiten</button>';
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="delete_outfit" data-oid="' + escapeHtml(item.id) + '">L\u00f6schen</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        var oid = btn.getAttribute("data-oid");
        executeWardrobeAction(oid, act, btn, item);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeWardrobeAction(outfitId, action, btn, item) {
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    if (action === "generate_image") {
      fetch(API_BASE + "?op=wardrobe-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outfit_id: outfitId, customer_id: getUserId() }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          appendMessage("assistant", "AI-Bild wird generiert! Eazy k\u00fcmmert sich darum.");
          setTimeout(function () { animateEazyBounceToInput(); }, 400);
        } else {
          appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
        }
      })
      .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "AI Bild generieren"; } });
      return;
    }

    if (action === "edit_slots") {
      appendMessage("assistant", i18n("chat.wardrobe.askSlotToEdit", "Which slot would you like to edit?"));
      var slotLabels = { head: "Kopf", upper_body: "Oberteil", layer: "Schicht", pants: "Hose", feet: "Schuhe", socks: "Socken", accessory_1: "Accessoire 1", accessory_2: "Accessoire 2", one_piece: "Einteiler" };
      var slotOptions = Object.keys(slotLabels).map(function (k, i) {
        return { key: String.fromCharCode(97 + i), label: slotLabels[k], value: k };
      });
      renderShowOptions("", { param_key: "__wardrobe_slot_" + outfitId + "__", options: slotOptions.slice(0, 9), allow_custom: false });
      if (btn) { btn.disabled = false; btn.textContent = "Slots bearbeiten"; }
      return;
    }

    if (action === "delete_outfit") {
      showConfirmDialog("Outfit wirklich l\u00f6schen?", function () {
        fetch(API_BASE + "?op=wardrobe-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ outfit_id: outfitId, customer_id: getUserId() }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) appendMessage("assistant", "Outfit gel\u00f6scht.");
          else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
        })
        .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); });
      });
      if (btn) { btn.disabled = false; btn.textContent = "L\u00f6schen"; }
      return;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  SIZE AI PROFILE DISPLAY
   * ══════════════════════════════════════════════════════════════════ */
  function renderSizeProfile(data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__size-profile">';
    html += '<div class="creator-chat__size-profile__title">Dein Size AI Profil</div>';
    var fields = [
      { label: "K\u00f6rpergr\u00f6\u00dfe", value: data.height_cm ? data.height_cm + " cm" : "-" },
      { label: "Gewicht", value: data.weight_kg ? data.weight_kg + " kg" : "-" },
      { label: "K\u00f6rpertyp", value: data.body_type || "-" },
      { label: "Passform", value: data.fit_preference || "-" },
    ];
    for (var i = 0; i < fields.length; i++) {
      html += '<div class="creator-chat__size-profile__row"><span class="creator-chat__size-profile__label">' + escapeHtml(fields[i].label) + '</span><span class="creator-chat__size-profile__value">' + escapeHtml(fields[i].value) + '</span></div>';
    }
    html += '</div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="update_profile">Profil \u00e4ndern</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="add_reference">Referenz hinzuf\u00fcgen</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        if (act === "update_profile") {
          appendMessage("assistant", i18n("chat.sizeProfile.askValueToChange", "Which value would you like to change? For example: 'height 180' or 'fit relaxed'."));
        } else if (act === "add_reference") {
          appendMessage("assistant", "Nenne mir eine Marke und Gr\u00f6\u00dfe, die dir gut passt. z.B. 'Nike L' oder 'Zara M'.");
        }
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  MY MOCKUPS DETAIL + ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function showMockupDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var meta = item._meta || {};
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    if (item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(meta.product_name || item.label) + '</strong>';
    if (meta.product_key) html += '<div class="creator-chat__product-detail__badge">' + escapeHtml(meta.product_key) + '</div>';
    if (meta.created_at) html += '<div style="font-size:0.82em;opacity:0.7;margin-top:2px">Erstellt: ' + new Date(meta.created_at).toLocaleDateString("de-DE") + '</div>';
    if (meta.use_as_preview) html += '<div style="font-size:0.82em;color:var(--eazy-orange,#f60);margin-top:2px">Aktive Vorschau</div>';
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="use_preview" data-id="' + escapeHtml(item.id) + '">Als Vorschau</button>';
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="delete" data-id="' + escapeHtml(item.id) + '">L\u00f6schen</button>';
    html += '</div></div>';
    msg.innerHTML = html;
    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        var mid = btn.getAttribute("data-id");
        executeMockupAction(mid, act, btn, item);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeMockupAction(mockupId, action, btn, item) {
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    if (action === "delete") {
      showConfirmDialog("Mockup wirklich l\u00f6schen?", function () {
        fetch(API_BASE + "?op=delete-customer-mockup&mockup_id=" + encodeURIComponent(mockupId), {
          method: "POST",
          credentials: "include",
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) appendMessage("assistant", "Mockup wurde gel\u00f6scht.");
          else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
        })
        .catch(function () { appendMessage("assistant", i18n("chat.delete.networkError", "Network error while deleting.")); });
      });
      if (btn) { btn.disabled = false; btn.textContent = "L\u00f6schen"; }
      return;
    }

    if (action === "use_preview") {
      fetch(API_BASE + "?op=set-mockup-preview&mockup_id=" + encodeURIComponent(mockupId), {
        method: "POST",
        credentials: "include",
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) appendMessage("assistant", "Mockup als Produktvorschau gesetzt!");
        else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      })
      .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Als Vorschau"; } });
      return;
    }

    if (action === "generate") {
      appendMessage("assistant", i18n("chat.mockup.uploadAndChooseType", "Upload a photo to generate mockups. Then choose the person type:"));
      renderShowOptions("", {
        param_key: "__mockup_person_type__",
        options: [
          { key: "a", label: "Mann", value: "man" },
          { key: "b", label: "Frau", value: "woman" },
          { key: "c", label: "Junge (Teen)", value: "teen_boy" },
          { key: "d", label: "M\u00e4dchen (Teen)", value: "teen_girl" },
          { key: "e", label: "Junge", value: "boy" },
          { key: "f", label: "M\u00e4dchen", value: "girl" },
        ],
        allow_custom: false,
      });
      if (btn) { btn.disabled = false; btn.textContent = "Generieren"; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  HERO IMAGES DETAIL + ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function showHeroDetail(item) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var meta = item._meta || {};
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__product-detail">';
    if (meta.image_url || item.image_url) {
      html += '<img class="creator-chat__product-detail__img" src="' + escapeHtml(meta.image_url || item.image_url) + '" alt="" loading="lazy">';
    }
    html += '<div class="creator-chat__product-detail__info">';
    html += '<strong>' + escapeHtml(meta.title || item.label) + '</strong>';
    var statusLabel = meta.published_at ? "Ver\u00f6ffentlicht" : "Entwurf";
    var statusColor = meta.published_at ? "var(--eazy-green,#2e7)" : "rgba(0,0,0,0.4)";
    html += '<div style="font-size:0.82em;color:' + statusColor + ';margin-top:2px">' + statusLabel + '</div>';
    if (meta.user_prompt) html += '<div style="font-size:0.82em;opacity:0.7;margin-top:4px;font-style:italic">"' + escapeHtml(meta.user_prompt.slice(0, 80)) + '"</div>';
    if (meta.created_at) html += '<div style="font-size:0.82em;opacity:0.7;margin-top:2px">Erstellt: ' + new Date(meta.created_at).toLocaleDateString("de-DE") + '</div>';
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    if (meta.published_at) {
      html += '<button type="button" class="creator-chat__action-btn" data-action="unpublish" data-id="' + escapeHtml(item.id) + '">Zur\u00fcckziehen</button>';
    } else {
      html += '<button type="button" class="creator-chat__action-btn" data-action="publish" data-id="' + escapeHtml(item.id) + '">Ver\u00f6ffentlichen</button>';
    }
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="delete" data-id="' + escapeHtml(item.id) + '">L\u00f6schen</button>';
    html += '</div></div>';
    msg.innerHTML = html;
    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        var hid = btn.getAttribute("data-id");
        executeHeroAction(hid, act, btn);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeHeroAction(heroId, action, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    if (action === "publish") {
      fetch(API_BASE + "?op=hero-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hero_id: heroId, owner_id: getUserId() }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) appendMessage("assistant", "Hero Image ver\u00f6ffentlicht!");
        else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      })
      .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Ver\u00f6ffentlichen"; } });
      return;
    }

    if (action === "unpublish") {
      fetch(API_BASE + "?op=hero-unpublish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hero_id: heroId, owner_id: getUserId() }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) appendMessage("assistant", "Hero Image zur\u00fcckgezogen.");
        else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
      })
      .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); })
      .finally(function () { if (btn) { btn.disabled = false; btn.textContent = "Zur\u00fcckziehen"; } });
      return;
    }

    if (action === "delete") {
      showConfirmDialog("Hero Image wirklich l\u00f6schen?", function () {
        fetch(API_BASE + "?op=hero-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hero_id: heroId, owner_id: getUserId() }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            appendMessage("assistant", "Hero Image gel\u00f6scht.");
            try {
              var _hid = String(heroId || "");
              if (_hid) {
                document.querySelectorAll(".creator-hero-image-card, .content-publish-hero-card, .cdm-hero-list-item").forEach(function (el) {
                  if (String(el.dataset.heroId || "") === _hid) el.remove();
                });
              }
              window.dispatchEvent(new CustomEvent("hero-image-deleted", { detail: { heroId: heroId } }));
            } catch (e) {}
          } else {
            appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
          }
        })
        .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); });
      });
      if (btn) { btn.disabled = false; btn.textContent = "L\u00f6schen"; }
      return;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  CREATOR IMAGE DISPLAY + ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function renderCreatorImages(data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__creator-images">';
    html += '<div class="creator-chat__creator-images__item">';
    html += '<div class="creator-chat__creator-images__label">Avatar</div>';
    if (data.avatar_url) {
      html += '<img class="creator-chat__creator-images__img creator-chat__creator-images__img--avatar" src="' + escapeHtml(data.avatar_url) + '" alt="Avatar" loading="lazy">';
    } else {
      html += '<div class="creator-chat__creator-images__placeholder">Kein Avatar</div>';
    }
    html += '</div>';
    html += '<div class="creator-chat__creator-images__item">';
    html += '<div class="creator-chat__creator-images__label">Cover</div>';
    if (data.cover_url) {
      html += '<img class="creator-chat__creator-images__img creator-chat__creator-images__img--cover" src="' + escapeHtml(data.cover_url) + '" alt="Cover" loading="lazy">';
    } else {
      html += '<div class="creator-chat__creator-images__placeholder">Kein Cover</div>';
    }
    html += '</div></div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="upload_avatar">Avatar hochladen</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="generate_avatar">Avatar AI</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="upload_cover">Cover hochladen</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="generate_cover">Cover AI</button>';
    if (data.avatar_url) html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="delete_avatar">Avatar l\u00f6schen</button>';
    if (data.cover_url) html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-action="delete_cover">Cover l\u00f6schen</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        executeCreatorImageAction(data.creator_name, act, btn);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function executeCreatorImageAction(creatorName, action, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "\u2026"; }

    var category = action.indexOf("avatar") >= 0 ? "avatar" : "cover";
    var baseAction = action.replace("_avatar", "").replace("_cover", "");

    if (baseAction === "upload") {
      appendMessage("assistant", i18n("chat.creatorImage.uploadPrompt", "Upload an image for your ") + (category === "avatar" ? i18n("chat.creatorImage.avatarSize", "avatar (512x512)") : i18n("chat.creatorImage.coverSize", "cover (800x300)")) + i18n("chat.creatorImage.uploadHintSuffix", ". Use the upload button next to the input field."));
      if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute("data-action") === "upload_avatar" ? "Avatar hochladen" : "Cover hochladen"; }
      return;
    }

    if (baseAction === "generate") {
      appendMessage("assistant", i18n("chat.creatorImage.describePromptPrefix", "Describe your desired ") + (category === "avatar" ? i18n("chat.creatorImage.avatar", "avatar") : i18n("chat.creatorImage.cover", "cover")) + i18n("chat.creatorImage.describePromptSuffix", " and I will generate it with AI. What should it show?"));
      if (btn) { btn.disabled = false; btn.textContent = btn.getAttribute("data-action") === "generate_avatar" ? "Avatar AI" : "Cover AI"; }
      return;
    }

    if (baseAction === "delete") {
      showConfirmDialog((category === "avatar" ? "Avatar" : "Cover") + " wirklich l\u00f6schen?", function () {
        fetch(API_BASE + "?op=delete-creator-image&owner_id=" + encodeURIComponent(getUserId()) + "&creator_name=" + encodeURIComponent(creatorName || "") + "&image_category=" + category, {
          method: "DELETE",
          credentials: "include",
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) appendMessage("assistant", (category === "avatar" ? "Avatar" : "Cover") + " gel\u00f6scht.");
          else appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || i18n("chat_error_unknown", "Unknown")));
        })
        .catch(function () { appendMessage("assistant", i18n("chat.networkError", "Network error.")); });
      });
      if (btn) { btn.disabled = false; btn.textContent = (category === "avatar" ? "Avatar" : "Cover") + " l\u00f6schen"; }
      return;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  CREATOR SETTINGS DISPLAY + ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function renderSettingsPanel(data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__settings-list">';
    html += '<div class="creator-chat__settings-list__title">Creator Einstellungen</div>';

    var fields = [
      { label: "Aktiver Creator", value: data.active_creator_name || "-" },
      { label: "Creator Namen", value: (data.creator_names || []).join(", ") || "-" },
      { label: "Status", value: data.is_creator ? "Aktiv" : "Inaktiv" },
    ];
    for (var i = 0; i < fields.length; i++) {
      html += '<div class="creator-chat__settings-list__row"><span class="creator-chat__settings-list__label">' + escapeHtml(fields[i].label) + '</span><span class="creator-chat__settings-list__value">' + escapeHtml(fields[i].value) + '</span></div>';
    }
    html += '</div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="update_name">Name \u00e4ndern</button>';
    if ((data.creator_names || []).length > 1) {
      html += '<button type="button" class="creator-chat__action-btn" data-action="switch_creator">Creator wechseln</button>';
    }
    html += '<button type="button" class="creator-chat__action-btn" data-action="update_filters">Filter \u00e4ndern</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        handleSettingsAction(act, data);
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  function handleSettingsAction(action, data) {
    if (action === "update_name") {
      appendMessage("assistant", i18n("chat.creatorName.askNew", "What should your new creator name be? Just type it in:"));
    } else if (action === "switch_creator") {
      var names = data.creator_names || [];
      var options = names.map(function (n, i) {
        var keys = ["a", "b", "c", "d", "e"];
        return { key: keys[i] || String(i + 1), label: n, value: n };
      });
      renderShowOptions(i18n("chat.creatorName.chooseActive", "Choose your active creator:"), {
        param_key: "__switch_creator__",
        options: options.slice(0, 5),
        allow_custom: false,
      });
    } else if (action === "update_filters") {
      appendMessage("assistant", i18n("chat.filters.askChange", "Which filters would you like to change? Describe your preferred filter settings or say 'reset filters'."));
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  BALANCE DISPLAY
   * ══════════════════════════════════════════════════════════════════ */
  function renderBalancePanel(data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var eazg =
      data.balance_eazg != null
        ? Number(data.balance_eazg)
        : Number(data.balance_eaz || 0);
    var eazcAvail =
      data.balance_eazc_available != null
        ? Number(data.balance_eazc_available)
        : Number(data.balance_earned_available || 0);
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__balance-panel">';
    html += '<div class="creator-chat__balance-panel__amount">' + escapeHtml(eazg.toFixed(2)) + ' <span class="creator-chat__balance-panel__unit">EAZG</span></div>';
    html += '<div class="creator-chat__balance-panel__cap">' + escapeHtml('EAZC available: ' + eazcAvail.toFixed(2)) + '</div>';

    if (data.transactions && data.transactions.length) {
      html += '<div class="creator-chat__balance-panel__tx-title">Recent transactions</div>';
      for (var i = 0; i < data.transactions.length && i < 5; i++) {
        var tx = data.transactions[i];
        var sign = tx.type === "debit" ? "-" : "+";
        var txClass = tx.type === "debit" ? "creator-chat__transaction-item--debit" : (tx.type === "refund" ? "creator-chat__transaction-item--refund" : "creator-chat__transaction-item--credit");
        var date = tx.created_at ? new Date(tx.created_at).toLocaleDateString("de-DE") : "";
        html += '<div class="creator-chat__transaction-item ' + txClass + '">';
        html += '<span class="creator-chat__transaction-item__amount">' + sign + parseFloat(tx.amount_eaz || 0).toFixed(2) + ' EAZ</span>';
        html += '<span class="creator-chat__transaction-item__reason">' + escapeHtml(tx.reason || tx.type) + '</span>';
        html += '<span class="creator-chat__transaction-item__date">' + escapeHtml(date) + '</span>';
        html += '</div>';
      }
    }
    html += '</div>';
    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="open_eaz_wallet">Open EAZ wallet</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="earn_tips">How do I earn EAZC?</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="view_level">View level</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        if (act === "earn_tips") {
          appendMessage("assistant", "How to earn EAZC:\n\u2022 Sales on your products\n\u2022 Move to Earn with your Character\n\nConvert EAZC to EAZG in Creator Settings to use features, or cash out from the EAZ tab.");
        } else if (act === "open_eaz_wallet") {
          if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === "function") {
            window.CreatorSettingsV2Modal.open({ tab: "eaz", eazSub: "balance" });
          }
        } else if (act === "view_level") {
          startChatFunction("level");
        }
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  LEVEL DISPLAY
   * ══════════════════════════════════════════════════════════════════ */
  function renderLevelPanel(data) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += '<div class="creator-chat__level-panel">';
    html += '<div class="creator-chat__level-panel__header">';
    html += '<span class="creator-chat__level-panel__level">Level ' + escapeHtml(String(data.current_level || 1)) + '</span>';
    html += '<span class="creator-chat__level-panel__xp">' + escapeHtml(String(data.total_xp || 0)) + ' XP</span>';
    html += '</div>';

    var pct = Math.min(100, Math.max(0, data.progress_percent || 0));
    html += '<div class="creator-chat__progress-bar">';
    html += '<div class="creator-chat__progress-bar__fill" style="width:' + pct + '%"></div>';
    html += '</div>';

    if (data.xp_to_next > 0) {
      html += '<div class="creator-chat__level-panel__next">' + escapeHtml(String(data.xp_to_next)) + ' XP to level ' + escapeHtml(String((data.current_level || 1) + 1)) + '</div>';
    } else {
      html += '<div class="creator-chat__level-panel__next">Maximum reached!</div>';
    }

    html += '<div class="creator-chat__level-panel__benefits">';
    html += '<div class="creator-chat__level-panel__benefits-title">Level benefits</div>';
    html += '<div>Max EAZ balance: ' + escapeHtml(String(data.max_eaz || 10)) + ' EAZ</div>';
    html += '</div></div>';

    html += '<div class="creator-chat__action-bar">';
    html += '<button type="button" class="creator-chat__action-btn" data-action="xp_tips">How do I get XP?</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-action="view_balance">Balance ansehen</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll(".creator-chat__action-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-action");
        if (act === "xp_tips") {
          appendMessage("assistant", "So bekommst du XP:\n\u2022 Design erstellen: +5 XP\n\u2022 Design speichern: +2 XP\n\u2022 Produkt ver\u00f6ffentlichen: +10 XP\n\u2022 Erster Verkauf: +50 XP\n\u2022 Hero Image erstellen: +8 XP\n\u2022 Community-Empfehlung: +15 XP\n\u2022 Bewertung abgeben: +3 XP");
        } else if (act === "view_balance") {
          startChatFunction("balance");
        }
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  CONFIRM DIALOG (reusable for delete etc.)
   * ══════════════════════════════════════════════════════════════════ */
  function showConfirmDialog(message, onConfirm) {
    var container = document.getElementById("creator-chat-messages");
    if (!container) return;
    var msg = document.createElement("div");
    msg.className = "creator-chat__msg creator-chat__msg--assistant";
    var html = EAZY_AVATAR_HTML + '<div class="creator-chat__bubble creator-chat__bubble--assistant">';
    html += escapeHtml(message);
    html += '<div class="creator-chat__confirm-dialog">';
    html += '<button type="button" class="creator-chat__action-btn creator-chat__action-btn--danger" data-choice="yes">Ja, l\u00f6schen</button>';
    html += '<button type="button" class="creator-chat__action-btn" data-choice="no">Cancel</button>';
    html += '</div></div>';
    msg.innerHTML = html;

    msg.querySelectorAll("[data-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var choice = btn.getAttribute("data-choice");
        var dlg = msg.querySelector(".creator-chat__confirm-dialog");
        if (dlg) dlg.innerHTML = '<span class="creator-chat__action-chosen">' + (choice === "yes" ? "Confirmed" : "Cancelled") + '</span>';
        if (choice === "yes" && onConfirm) onConfirm();
      });
    });
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  PROACTIVE JOB UPDATES
   * ══════════════════════════════════════════════════════════════════ */
  var _proactiveJobIds = {};
  var _proactiveInitialLoadDone = false;
  var _PROACTIVE_STORAGE_KEY = "eazy_notified_jobs";

  (function _loadNotifiedJobs() {
    try {
      var stored = localStorage.getItem(_PROACTIVE_STORAGE_KEY);
      if (stored) _proactiveJobIds = JSON.parse(stored);
    } catch (e) {}
  })();

  function _persistNotifiedJobs() {
    try {
      var keys = Object.keys(_proactiveJobIds);
      if (keys.length > 200) {
        var trimmed = {};
        keys.slice(-100).forEach(function (k) { trimmed[k] = true; });
        _proactiveJobIds = trimmed;
      }
      localStorage.setItem(_PROACTIVE_STORAGE_KEY, JSON.stringify(_proactiveJobIds));
    } catch (e) {}
  }

  function checkProactiveJobUpdates(jobs) {
    if (!jobs || !jobs.length) return;
    if (!_proactiveInitialLoadDone) _proactiveInitialLoadDone = true;
    var hasNew = false;

    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      if (!j.job_id) continue;
      if (j.done && !_proactiveJobIds[j.job_id]) {
        _proactiveJobIds[j.job_id] = true;
        hasNew = true;
        // Job completions outside Eazy Chat → Notifications / Jobs tab only (not chat bubbles).
      }
    }
    if (hasNew) _persistNotifiedJobs();
  }

  /* ══════════════════════════════════════════════════════════════════
   *  PROMO CODE SUB-ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function handlePromoSubAction(action) {
    if (action === "pc-create") {
      appendMessage("assistant", i18n("chat.promo.creating", "Creating a new promo code..."));
      showTypingIndicator();
      fetch(API_BASE + "?op=create-promo-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_id: getUserId() }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        removeTypingIndicator();
        if (data.ok) {
          appendMessage("assistant", i18n("chat.promo.createdPrefix", "Promo code created: ") + (data.discount_code || data.code || i18n("chat.done", "Done!")) + "\n" + i18n("chat.promo.shareWithFriends", "Share it with your friends!"));
        } else {
          appendMessage("assistant", i18n("chat.error.prefix", "Error: ") + (data.error || data.message || i18n("chat_error_unknown", "Unknown")));
        }
      })
      .catch(function () { removeTypingIndicator(); appendMessage("assistant", i18n("chat.networkError", "Network error.")); });
    } else if (action === "pc-share") {
      appendMessage("assistant", i18n("chat.promo.askShareCode", "Which code would you like to share? Enter the code:"));
      var input = document.getElementById("creator-chat-input");
      if (input) { input.focus(); input.placeholder = i18n("chat.promo.codePlaceholder", "Enter promo code..."); }
    } else if (action === "pc-revoke") {
      appendMessage("assistant", i18n("chat.promo.askRevokeCode", "Which code would you like to revoke? Enter the code:"));
      var input2 = document.getElementById("creator-chat-input");
      if (input2) { input2.focus(); input2.placeholder = i18n("chat.promo.codePlaceholder", "Enter promo code..."); }
    } else if (action === "pc-edit") {
      appendMessage("assistant", i18n("chat.promo.askEditCode", "Which code would you like to edit? Enter the code, then you can update title and description:"));
      var input3 = document.getElementById("creator-chat-input");
      if (input3) { input3.focus(); input3.placeholder = i18n("chat.promo.codePlaceholder", "Enter promo code..."); }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  GIFT CARD SUB-ACTIONS
   * ══════════════════════════════════════════════════════════════════ */
  function handleGiftCardSubAction(action) {
    if (action === "gc-buy") {
      appendMessage("assistant", i18n("chat.giftcard.buyAmountPrompt", "Buy gift card - which amount would you like?"));
      renderShowOptions("", {
        options: [
          { key: "a", label: "25\u20ac", value: "25" },
          { key: "b", label: "50\u20ac", value: "50" },
          { key: "c", label: "100\u20ac", value: "100" },
        ],
        allow_custom: true,
      });
    } else if (action === "gc-apply") {
      appendMessage("assistant", i18n("chat.giftcard.enterCode", "Enter your gift card code:"));
      _pendingGiftCardApply = true;
      var input = document.getElementById("creator-chat-input");
      if (input) { input.focus(); input.placeholder = i18n("chat.giftcard.codePlaceholder", "Gift card code..."); }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
   *  START CHAT FUNCTION (generic trigger for any function)
   * ══════════════════════════════════════════════════════════════════ */
  function startChatFunction(functionId) {
    if (isGuestUser()) {
      switchView("chat");
      showGuestFunctionPrompt();
      return;
    }
    if (functionId === "generate-design") {
      startDesignFlow();
      return;
    }
    if (functionId === "artifacts") {
      switchView("artifacts");
      return;
    }
    switchView("chat");
    if (window.EazyTips) window.EazyTips.setActiveFunction(functionId);
    appendMessage("user", "[Funktion: " + functionId + "]", { skipPersist: true, hidden: true });
    showTypingIndicator();

    var payload = {
      messages: messages,
      user_id: getUserId(),
      conversation_id: conversationId || null,
      function_trigger: functionId,
      context: {
        page: getPagePath(),
        locale: getLocale(),
        session_id: getSessionId(),
        customer: window.__EAZ_CUSTOMER_CONTEXT || null,
        bot_context: (window.EazyBot && window.EazyBot.getContext) ? window.EazyBot.getContext() : null,
        product: getProductContext(),
        cart: _cartData
      },
    };

    fetch(API_BASE + "?op=chat-completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      removeTypingIndicator();
      if (data.ok && data.text) {
        if (data.action && data.action.action === "show_options") {
          renderShowOptions(data.text, data.action.params || {});
        } else if (data.action && data.action.action === "confirm_flow") {
          renderConfirmFlow(data.text, data.action.params || {});
        } else if (data.action && data.action.action === "show_grid") {
          appendMessage("assistant", data.text);
          var gridParams = data.action.params || {};
          gridParams.onSelect = function (items) { handleGridSelection(gridParams.grid_type, items); };
          gridParams.onConfirm = function (items) { handleGridConfirm(gridParams.grid_type, items); };
          renderChatGrid(gridParams);
        } else if (data.action && data.action.action === "show_interests") {
          appendMessage("assistant", data.text);
          renderInterestsPanel(data.action.params || {});
        } else if (data.action && data.action.action === "show_stats") {
          renderStatsMessage(data.text, data.action.params || {});
        } else if (data.action && data.action.action === "show_creator_images") {
          appendMessage("assistant", data.text);
          renderCreatorImages(data.action.params || {});
        } else if (data.action && data.action.action === "show_settings_panel") {
          appendMessage("assistant", data.text);
          renderSettingsPanel(data.action.params || {});
        } else if (data.action && data.action.action === "show_balance_panel") {
          appendMessage("assistant", data.text);
          renderBalancePanel(data.action.params || {});
        } else if (data.action && data.action.action === "show_level_panel") {
          appendMessage("assistant", data.text);
          renderLevelPanel(data.action.params || {});
        } else if (data.action && data.action.action === "switch_view") {
          appendMessage("assistant", data.text);
          var tv = data.action.params && data.action.params.view;
          if (tv) switchView(tv);
        } else {
          appendMessage("assistant", data.text);
        }
        messages.push({ role: "assistant", content: data.text });
      }
    })
    .catch(function () {
      removeTypingIndicator();
      appendMessage("assistant", i18n("chat.genericErrorRetryLater", "An error occurred. Please try again later."));
    });
  }

  function openJobs(opts) {
    if (!_panelOpen) openPanel();
    switchView("jobs");
    if (opts && opts.focusJobId) {
      try {
        sessionStorage.setItem("creator_chat_focus_job_id", opts.focusJobId);
      } catch (e) {}
    }
  }

  window.CreatorChat = {
    open: function (options) {
      if (!_panelOpen) openPanel();
      var v = options && options.view;
      if (v) switchView(v);
      else switchView("chat");
    },
    close: function () {
      if (_panelOpen) closePanel();
    },
    openJobs: openJobs,
    switchView: switchView,
    refreshNotifications: loadNotifications,
    refreshActiveJobs: loadActiveJobs,
    startChatFunction: startChatFunction,
    renderChatGrid: renderChatGrid,
    renderInterestsPanel: renderInterestsPanel,
    renderStatsMessage: renderStatsMessage,
    isSnappedInHeader: isEazySnappedInHeader,
  };

  var _toggle = document.getElementById("creator-chat-toggle");
  window.EazyIconDock = {
    dock: function () { if (_toggle) dockEazy(_toggle, true); },
    undock: function () { if (_toggle) undockEazy(_toggle); },
    resetPosition: function () {
      if (!_toggle) return;
      undockEazy(_toggle);
      _toggle.style.cssText = "";
      _toggle.style.right = "20px";
      _toggle.style.bottom = "20px";
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();