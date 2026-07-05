/**
 * Eazy Bot Engine – Rule Engine, State, Context, Behavior Tracker, Debug
 * Exposes window.EazyBot for use by mascot + widget scripts
 * Depends on: eazy-messages.js (window.EAZY_MESSAGES) loaded first
 */
(function () {
  "use strict";

  var API_BASE = (window.CreatorChatActions && window.CreatorChatActions.API_BASE)
    || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";

  var STATE_KEY = "eaz_bot_state_v1";
  var USER_ID_KEY = "eaz_bot_user_id";
  var SYNC_DEBOUNCE_MS = 60000;
  var BEHAVIOR_FLUSH_MS = 30000;
  var DEBUG = false;

  // ─── Time Buckets ──────────────────────────────────────────────────
  var TIME_BUCKETS = {
    MORNING:     { start: 6,  end: 11 },
    MIDDAY:      { start: 12, end: 16 },
    EVENING:     { start: 17, end: 21 },
    NIGHT_SLEEP: { start: 22, end: 5 }
  };

  // ─── Helpers ───────────────────────────────────────────────────────
  function log() {
    if (DEBUG || window.EAZ_BOT_DEBUG) {
      var args = ["[EazyBot]"].concat(Array.prototype.slice.call(arguments));
      console.log.apply(console, args);
    }
  }

  function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  // ─── User ID (anonymous UUID or customer_id) ──────────────────────
  function getUserId() {
    var cid = window.__EAZ_OWNER_ID;
    if (cid) return String(cid);
    try {
      var stored = localStorage.getItem(USER_ID_KEY);
      if (stored) return stored;
      var uid = generateUUID();
      localStorage.setItem(USER_ID_KEY, uid);
      return uid;
    } catch (e) {
      return "anon-" + Math.random().toString(36).slice(2, 10);
    }
  }

  function isLoggedIn() {
    return !!(window.__creatorSettingsUserLoggedIn || window.__EAZ_OWNER_ID);
  }

  // ─── Local State ───────────────────────────────────────────────────
  var localState = null;

  function getLocalState() {
    if (localState) return localState;
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        localState = JSON.parse(raw);
        if (localState.last_open_date !== todayKey()) {
          localState.open_count_today = 0;
          localState.seen_chat_ids_today = [];
          localState.seen_bubble_ids_today = [];
        }
      }
    } catch (e) {}
    if (!localState) {
      localState = {
        user_id: getUserId(),
        open_count_total: 0,
        open_count_today: 0,
        last_open_date: null,
        last_open_at: null,
        seen_chat_ids_today: [],
        seen_bubble_ids_today: [],
        tz: null,
        last_synced_at: null
      };
    }
    localState.user_id = getUserId();
    localState.tz = getTimezone();
    return localState;
  }

  function saveLocalState() {
    if (!localState) return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(localState));
    } catch (e) {}
  }

  function incrementOpen() {
    var s = getLocalState();
    s.open_count_total++;
    s.open_count_today++;
    s.last_open_date = todayKey();
    s.last_open_at = new Date().toISOString();
    saveLocalState();
    scheduleSyncToServer();
  }

  // ─── Timezone Detection ────────────────────────────────────────────
  function getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      return "UTC";
    }
  }

  function getLocalHour() {
    try {
      var tz = getTimezone();
      var now = new Date();
      var str = now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false });
      return parseInt(str, 10);
    } catch (e) {
      return new Date().getHours();
    }
  }

  function getTimeBucket() {
    var h = getLocalHour();
    if (h >= 22 || h <= 5) return "night_sleep";
    if (h >= 6 && h <= 11) return "morning";
    if (h >= 12 && h <= 16) return "midday";
    return "evening";
  }

  function isSleepTime() {
    return getTimeBucket() === "night_sleep";
  }

  // ─── Context Detection ─────────────────────────────────────────────
  function getLocation() {
    return window.isCreatorMode ? "creator" : "shop";
  }

  function getAuth() {
    return isLoggedIn() ? "logged_in" : "guest";
  }

  function getFirstName() {
    try {
      var ctx = window.__EAZ_CUSTOMER_CONTEXT;
      if (ctx && ctx.user_name) {
        var parts = ctx.user_name.split(" ");
        return parts[0] || "";
      }
    } catch (e) {}
    return "";
  }

  function getStage() {
    var s = getLocalState();
    var total = s.open_count_total || 0;
    var daysSince = 0;

    if (s.last_open_at) {
      try {
        var last = new Date(s.last_open_at).getTime();
        daysSince = Math.floor((Date.now() - last) / 86400000);
      } catch (e) {}
    }

    if (total === 0) return "first_contact";
    if (daysSince >= 3) return "long_gap";
    if (total < 5) return "returning";
    return "regular";
  }

  // ─── CTA URLs ──────────────────────────────────────────────────────
  function getCtaUrls() {
    return {
      loginUrl: "/account/login",
      creatorUrl: "/pages/creator-dashboard",
      shopUrl: "/collections/all",
      nameSettingsUrl: "/pages/creator-dashboard#settings"
    };
  }

  function replacePlaceholders(text) {
    var firstName = getFirstName();
    var urls = getCtaUrls();

    var result = text;
    if (firstName) {
      result = result.replace(/\{\{firstName\}\}/g, ", " + firstName);
    } else {
      result = result.replace(/\{\{firstName\}\}/g, "");
    }
    result = result.replace(/\{\{loginUrl\}\}/g, urls.loginUrl);
    result = result.replace(/\{\{creatorUrl\}\}/g, urls.creatorUrl);
    result = result.replace(/\{\{shopUrl\}\}/g, urls.shopUrl);
    result = result.replace(/\{\{nameSettingsUrl\}\}/g, urls.nameSettingsUrl);
    return result;
  }

  // ─── Message Selection ─────────────────────────────────────────────
  function pickMessage(type) {
    var msgs = window.EAZY_MESSAGES;
    if (!msgs) {
      log("EAZY_MESSAGES not loaded");
      return null;
    }

    var pool = msgs[type];
    if (!pool) {
      log("No pool for type:", type);
      return null;
    }

    var timeBucket = getTimeBucket();
    var auth = getAuth();
    var location = getLocation();
    var stage = getStage();

    log("pickMessage", { type: type, timeBucket: timeBucket, auth: auth, location: location, stage: stage });

    var candidates = null;

    if (timeBucket === "night_sleep") {
      var nightPool = pool.night_sleep;
      if (nightPool) {
        var nightAuth = nightPool[auth];
        if (nightAuth) {
          var nightLoc = nightAuth[location];
          if (nightLoc && nightLoc.length) {
            candidates = nightLoc;
          } else {
            var nightKeys = Object.keys(nightAuth);
            for (var ni = 0; ni < nightKeys.length; ni++) {
              var nl = nightAuth[nightKeys[ni]];
              if (Array.isArray(nl) && nl.length) { candidates = nl; break; }
            }
          }
        }
        if (!candidates && nightPool._all) {
          candidates = nightPool._all;
        }
      }
    }

    if (!candidates) {
      var dayPool = pool.day;
      if (!dayPool) { log("No day pool"); return null; }

      var authPool = dayPool[auth];
      if (!authPool) { log("No auth pool for:", auth); return null; }

      var locPool = authPool[location];
      if (!locPool) { log("No location pool for:", location); return null; }

      if (type === "chat_open") {
        candidates = locPool[stage];
        if (!candidates || !candidates.length) {
          candidates = locPool.regular || locPool.returning || locPool.first_contact;
          log("Stage fallback used");
        }
      } else {
        candidates = locPool;
      }
    }

    if (!candidates || !candidates.length) {
      log("No candidates found");
      return null;
    }

    var s = getLocalState();
    var seenKey = type === "chat_open" ? "seen_chat_ids_today" : "seen_bubble_ids_today";
    var seenToday = s[seenKey] || [];

    var unseen = candidates.filter(function (m) {
      return seenToday.indexOf(m.id) === -1;
    });

    if (unseen.length === 0) {
      log("All messages seen today, resetting pool");
      unseen = candidates;
    }

    var chosen = unseen[Math.floor(Math.random() * unseen.length)];

    seenToday.push(chosen.id);
    s[seenKey] = seenToday;
    saveLocalState();

    var result = {
      id: chosen.id,
      text: replacePlaceholders(chosen.text),
      tags: chosen.tags || [],
      cta: chosen.cta || null
    };

    log("Chosen:", result.id, result.text.substring(0, 60) + "...");
    return result;
  }

  // ─── Server Sync ───────────────────────────────────────────────────
  var syncTimer = null;

  function scheduleSyncToServer() {
    if (syncTimer) return;
    syncTimer = setTimeout(function () {
      syncTimer = null;
      syncToServer();
    }, SYNC_DEBOUNCE_MS);
  }

  function syncToServer() {
    var s = getLocalState();
    var payload = {
      user_id: s.user_id,
      customer_id: isLoggedIn() ? String(window.__EAZ_OWNER_ID || "") : null,
      open_count_total: s.open_count_total,
      open_count_today: s.open_count_today,
      last_open_date: s.last_open_date,
      last_open_at: s.last_open_at,
      timezone: s.tz
    };

    log("Syncing state to server:", payload);

    fetch(API_BASE + "?op=eazy-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    }).then(function () {
      s.last_synced_at = new Date().toISOString();
      saveLocalState();
      log("State synced");
    }).catch(function (e) {
      log("Sync failed:", e);
    });
  }

  function logMessageShown(type, messageId, context) {
    var payload = {
      type: type === "chat_open" ? "chat" : "bubble",
      user_id: getUserId(),
      message_id: messageId,
      context: context || {}
    };

    fetch(API_BASE + "?op=eazy-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    }).catch(function (e) {
      log("Log failed:", e);
    });
  }

  // ─── Anonymous Merge ───────────────────────────────────────────────
  function tryMergeAnonymous() {
    if (!isLoggedIn()) return;
    var customerId = String(window.__EAZ_OWNER_ID);
    var anonId;
    try { anonId = localStorage.getItem(USER_ID_KEY); } catch (e) { return; }
    if (!anonId || anonId === customerId) return;

    log("Merging anonymous", anonId, "into customer", customerId);

    var mergeBody = JSON.stringify({ anon_id: anonId, customer_id: customerId });
    var mergeHeaders = { "Content-Type": "application/json" };

    Promise.all([
      fetch(API_BASE + "?op=eazy-state&merge=1", {
        method: "POST", headers: mergeHeaders, credentials: "include", body: mergeBody
      }),
      fetch(API_BASE + "?op=eazy-conv&merge=1", {
        method: "POST", headers: mergeHeaders, credentials: "include", body: mergeBody
      })
    ]).then(function () {
      try { localStorage.setItem(USER_ID_KEY, customerId); } catch (e) {}
      if (localState) localState.user_id = customerId;
      saveLocalState();
      log("Merge complete (state + conversations)");
    }).catch(function (e) {
      log("Merge failed:", e);
    });
  }

  // ─── Behavior Tracking ─────────────────────────────────────────────
  var behaviorQueue = [];
  var flushTimer = null;

  function trackEvent(eventType, data, pagePath) {
    behaviorQueue.push({
      type: eventType,
      data: data || null,
      page: pagePath || window.location.pathname,
      ts: new Date().toISOString()
    });
    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flushBehavior();
    }, BEHAVIOR_FLUSH_MS);
  }

  function flushBehavior() {
    if (behaviorQueue.length === 0) return;
    var events = behaviorQueue.splice(0, 50);
    var payload = { user_id: getUserId(), events: events };

    log("Flushing", events.length, "behavior events");

    fetch(API_BASE + "?op=eazy-behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    }).catch(function (e) {
      log("Behavior flush failed:", e);
      behaviorQueue = events.concat(behaviorQueue);
    });
  }

  // ─── Behavior Trackers (auto-attached) ─────────────────────────────
  var trackersInitialized = false;

  function initTrackers() {
    if (trackersInitialized) return;
    trackersInitialized = true;

    trackEvent("page_view", { referrer: document.referrer || null });

    // Scroll depth
    var maxScroll = 0;
    var scrollHandler = function () {
      var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      var docHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight
      );
      var winHeight = window.innerHeight;
      if (docHeight <= winHeight) return;
      var pct = Math.round((scrollTop / (docHeight - winHeight)) * 100);
      if (pct > maxScroll) maxScroll = pct;
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });

    // Dwell time
    var pageStart = Date.now();

    // Unload: flush scroll depth + dwell time
    var onUnload = function () {
      var dwellSec = Math.round((Date.now() - pageStart) / 1000);
      if (maxScroll > 0) trackEvent("scroll_depth", { max_percent: maxScroll });
      if (dwellSec > 2) trackEvent("dwell_time", { seconds: dwellSec });
      flushBehavior();
    };
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") onUnload();
    });
    window.addEventListener("beforeunload", onUnload);

    // Search tracking
    var searchInputs = document.querySelectorAll('input[type="search"], input[name="q"], input[name="query"]');
    searchInputs.forEach(function (input) {
      input.addEventListener("change", function () {
        var val = (this.value || "").trim();
        if (val.length > 1) trackEvent("search", { query: val });
      });
    });

    // Add to cart tracking (Shopify events)
    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!form || !form.action) return;
      if (form.action.indexOf("/cart/add") !== -1 || form.action.indexOf("/cart") !== -1) {
        var productId = form.querySelector("[name='id']");
        var quantity = form.querySelector("[name='quantity']");
        trackEvent("add_to_cart", {
          variant_id: productId ? productId.value : null,
          quantity: quantity ? quantity.value : "1"
        });
      }
    });

    // Product click tracking
    document.addEventListener("click", function (e) {
      var link = e.target.closest("a[href*='/products/']");
      if (!link) return;
      var href = link.getAttribute("href") || "";
      var match = href.match(/\/products\/([^?#/]+)/);
      if (match) {
        trackEvent("product_click", { product_handle: match[1] });
      }
    });

    // Purchase tracking (thank-you page)
    if (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.order_id) {
      trackEvent("purchase", { order_id: window.Shopify.checkout.order_id });
    }

    // Design create tracking (listen for custom event)
    window.addEventListener("creator-design-saved", function (e) {
      var detail = e.detail || {};
      trackEvent("design_create", { design_id: detail.design_id || null, type: detail.type || null });
    });

    log("Behavior trackers initialized");
  }

  // ─── Public API ────────────────────────────────────────────────────
  window.EazyBot = {
    getUserId: getUserId,
    pickMessage: pickMessage,
    incrementOpen: incrementOpen,
    getLocalState: getLocalState,
    getTimeBucket: getTimeBucket,
    getLocation: getLocation,
    getAuth: getAuth,
    getStage: getStage,
    isSleepTime: isSleepTime,
    getFirstName: getFirstName,

    logMessageShown: logMessageShown,
    trackEvent: trackEvent,
    flushBehavior: flushBehavior,

    syncToServer: syncToServer,
    tryMergeAnonymous: tryMergeAnonymous,
    initTrackers: initTrackers,

    getContext: function () {
      return {
        location: getLocation(),
        auth: getAuth(),
        stage: getStage(),
        time: getTimeBucket()
      };
    },

    enableDebug: function () {
      DEBUG = true;
      window.EAZ_BOT_DEBUG = true;
      log("Debug mode enabled");
      log("State:", getLocalState());
      log("Context:", window.EazyBot.getContext());
    }
  };

  // ─── Auto-init ─────────────────────────────────────────────────────
  function autoInit() {
    getLocalState();
    tryMergeAnonymous();
    initTrackers();
    log("EazyBot initialized. User:", getUserId(), "Context:", window.EazyBot.getContext());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
