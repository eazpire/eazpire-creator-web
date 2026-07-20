/**
 * Dashboard chrome loader — Level, Journey/Quests, EAZV/EAZC, Daily Limits, overview stats.
 * Gates the boot splash until these are applied (or guest / timeout).
 */
(function (global) {
  "use strict";

  var readyPromise = null;
  var chromeReady = false;
  var lastChrome = null;

  function resolveOwnerId() {
    if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.resolveOwnerId === "function") {
      var bridged = global.CreatorPortalThemeBridge.resolveOwnerId();
      if (bridged) return String(bridged).trim();
    }
    if (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.ownerId) {
      return String(global.CreatorPortalAuth.state.ownerId).trim();
    }
    if (global.__EAZ_OWNER_ID) return String(global.__EAZ_OWNER_ID).trim();
    return null;
  }

  function apiGet(op, ownerId) {
    if (global.CreatorPortalApi && typeof global.CreatorPortalApi.dispatch === "function") {
      return global.CreatorPortalApi.dispatch(op, { query: { owner_id: ownerId } });
    }
    if (typeof global.creatorApiFetch === "function") {
      return global.creatorApiFetch(op, { owner_id: ownerId });
    }
    return Promise.reject(new Error("no_api"));
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setWidth(id, pct) {
    var el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + "%";
  }

  function setHeight(id, pct) {
    var el = document.getElementById(id);
    if (el) el.style.height = Math.max(0, Math.min(100, Number(pct) || 0)) + "%";
  }

  function levelName(level) {
    var map = (global.CreatorI18n && global.CreatorI18n.levelNames) || {};
    return map[level] || map[String(level)] || "Level " + level;
  }

  function applyBalance(data) {
    if (!data || !data.ok) return false;
    if (typeof global.loadCreatorBalance === "function") {
      // Seed cache then paint via existing helpers when possible.
      try {
        var balanceValueRaw = data.balance_total != null ? data.balance_total : data.balance_eaz;
        var balanceValue = balanceValueRaw != null ? balanceValueRaw : 0;
        global.__eazBalanceCache = global.__eazBalanceCache || {};
        global.__eazBalanceCache.value = balanceValue;
        global.__eazBalanceCache.timestamp = Date.now();
        global.__eazBalanceCache.loading = null;
      } catch (e) {}
    }
    if (typeof global.applyCreatorFooterStarterUi === "function") {
      try {
        global.applyCreatorFooterStarterUi(data);
      } catch (e) {}
    }
    var balanceValueRaw2 = data.balance_total != null ? data.balance_total : data.balance_eaz;
    var balanceValue2 = balanceValueRaw2 != null ? balanceValueRaw2 : 0;
    var formatted =
      balanceValue2 % 1 === 0 ? String(balanceValue2) : Number(balanceValue2).toFixed(2);
    ["global-eaz-balance-value", "creator-desktop-eaz-value", "creator-footer-eaz-value"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (data.eaz_wallet_active === false && data.is_creator !== true) {
        el.textContent = "—";
        el.style.color = "#9ca3af";
      } else {
        el.textContent = formatted;
        el.style.color = "#f97316";
      }
      el.dataset.eazLoaded = "1";
    });
    if (typeof global.applyCreatorHeaderEazcBalance === "function") {
      try {
        global.applyCreatorHeaderEazcBalance(data);
      } catch (e) {}
    }
    try {
      global.dispatchEvent(new CustomEvent("eazBalanceUpdated", { detail: { balance: balanceValue2 } }));
    } catch (e) {}
    return true;
  }

  function applyLevel(data) {
    if (!data || !data.ok) return false;
    global.__EAZ_JOURNEY_LEVEL_DATA__ = data;
    global.__EAZ_JOURNEY_LEVEL_LOAD_PROMISE__ = Promise.resolve(data);
    if (global.CreatorDesktopApplyChrome && typeof global.CreatorDesktopApplyChrome.applyLevel === "function") {
      global.CreatorDesktopApplyChrome.applyLevel(data);
    }
    // Mobile badge (portal partials)
    var totalXp = Number(data.total_xp || 0);
    var thresholds = Array.isArray(data.level_thresholds) && data.level_thresholds.length
      ? data.level_thresholds
      : Array.isArray(data.thresholds)
        ? data.thresholds
        : [];
    function xpAt(L) {
      var row = thresholds.find(function (t) {
        return Number(t.level) === Number(L);
      });
      return row ? Number(row.xp_required) || 0 : 0;
    }
    var srv = Number(data.current_level);
    var level = Number.isFinite(srv) && srv >= 1 ? Math.min(10, Math.floor(srv)) : 1;
    var pct = 0;
    var xpMainText = "";
    var hintText = "";
    var i18n = global.CreatorI18n || {};
    if (data.trial_mode === true) {
      var capXp = xpAt(2);
      pct = Math.min(100, (totalXp / Math.max(1, capXp)) * 100);
      xpMainText = totalXp + " / " + capXp + " XP";
      hintText =
        data.trial_needs_creator_code || totalXp >= capXp
          ? i18n.xpNeedCreatorCode || ""
          : String(i18n.xpUntilNext || "Still {xp} XP until Level {level}")
              .replace("{xp}", String(Math.max(0, capXp - totalXp)))
              .replace("{level}", "2");
    } else {
      var curXpReq = xpAt(level);
      var nextXpAbs = xpAt(level + 1);
      var hasNext = level < 10 && nextXpAbs > curXpReq;
      var xpInLevel = Math.max(0, totalXp - curXpReq);
      var xpNeeded = hasNext ? Math.max(1, nextXpAbs - curXpReq) : 1;
      pct = hasNext ? Math.min(100, (xpInLevel / xpNeeded) * 100) : 100;
      xpMainText = hasNext ? xpInLevel + " / " + xpNeeded + " XP" : totalXp + " XP";
      hintText =
        level >= 10 || !hasNext
          ? i18n.maxLevelReached || ""
          : String(i18n.xpUntilNext || "Still {xp} XP until Level {level}")
              .replace("{xp}", String(Math.max(0, nextXpAbs - totalXp)))
              .replace("{level}", String(level + 1));
    }
    var name = levelName(level);
    setText("creator-mobile-level-num", String(level));
    setText("creator-mobile-level-name", name);
    setText("creator-mobile-xp-value", xpMainText);
    setHeight("creator-mobile-xp-fill", pct);
    setText("creator-mobile-xp-hint", hintText);
    if (global.CreatorLevelCelebration && typeof global.CreatorLevelCelebration.syncFromApi === "function") {
      try {
        global.CreatorLevelCelebration.syncFromApi(data, { levelName: name });
      } catch (e) {}
    }
    return true;
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyMobileOnboarding(onboarding) {
    var openEl = document.getElementById("creator-mobile-journey-open");
    var completedEl = document.getElementById("creator-mobile-journey-completed");
    if (!openEl || !completedEl) return false;
    if (!onboarding || !onboarding.ok) {
      openEl.innerHTML = '<p class="creator-journey-loading">Could not load tasks.</p>';
      return false;
    }
    var progress = onboarding.progress || {};
    var completedIds = new Set(onboarding.completed_todos || []);
    var todos = onboarding.todos || [];
    var stats = onboarding.stats || {};
    setWidth("creator-mobile-journey-bar-fill", stats.progress_percent || 0);
    setText(
      "creator-mobile-journey-progress",
      (stats.completed_count || 0) + "/" + (stats.total_todos || 0)
    );
    var i18n = global.CreatorI18n || {};
    var open = [];
    var completed = [];
    todos.forEach(function (t) {
      var pres = t.presentation && typeof t.presentation === "object" ? t.presentation : {};
      var progKey = t.progress_key || t.progressKey;
      var isDone = progKey ? !!progress[progKey] : false;
      var isClaimed = completedIds.has(t.id) || t.completed;
      var label = t.title || String(t.id || "");
      var xpText = String(i18n.xpReward || "+%{xp} XP").replace("%{xp}", String(t.xp != null ? t.xp : 0));
      var icon = typeof pres.icon === "string" && pres.icon ? pres.icon : "✓";
      var href = typeof pres.href === "string" && pres.href ? pres.href : "#";
      if (isClaimed) {
        completed.push(
          '<div class="creator-todo-item creator-todo-item--claimed"><div class="creator-todo-item__icon">' +
            esc(icon) +
            '</div><div class="creator-todo-item__content"><p>' +
            esc(label) +
            '</p><span class="creator-todo-item__xp">' +
            esc(xpText) +
            " ✓</span></div></div>"
        );
      } else if (isDone) {
        open.push(
          '<a href="' +
            esc(href) +
            '" class="creator-todo-item creator-todo-item--ready"><div class="creator-todo-item__icon">' +
            esc(icon) +
            '</div><div class="creator-todo-item__content"><p>' +
            esc(label) +
            '</p><span class="creator-todo-item__xp">' +
            esc(xpText) +
            "</span></div></a>"
        );
      } else {
        open.push(
          '<a href="' +
            esc(href) +
            '" class="creator-todo-item"><div class="creator-todo-item__icon">' +
            esc(icon) +
            '</div><div class="creator-todo-item__content"><p>' +
            esc(label) +
            '</p><span class="creator-todo-item__xp">' +
            esc(xpText) +
            "</span></div></a>"
        );
      }
    });
    openEl.innerHTML = open.length ? open.join("") : '<p class="creator-journey-empty">No open tasks</p>';
    completedEl.innerHTML = completed.length
      ? completed.join("")
      : '<p class="creator-journey-empty">No completed tasks</p>';
    setText("creator-mobile-journey-open-count", String(open.length));
    setText("creator-mobile-journey-completed-count", String(completed.length));
    return true;
  }

  function applyOnboarding(data) {
    if (!data || !data.ok) return false;
    if (global.CreatorDesktopApplyChrome && typeof global.CreatorDesktopApplyChrome.applyOnboarding === "function") {
      global.CreatorDesktopApplyChrome.applyOnboarding(data);
    }
    applyMobileOnboarding(data);
    return true;
  }

  function applyDailyLimits(data) {
    if (!data || !data.ok) return false;
    if (
      global.CreatorDailyLimitsSubheader &&
      typeof global.CreatorDailyLimitsSubheader.mount === "function"
    ) {
      try {
        global.CreatorDailyLimitsSubheader.mount({ soft: true });
      } catch (e) {}
    }
    if (
      global.CreatorDailyLimitsSubheader &&
      typeof global.CreatorDailyLimitsSubheader.applyFromData === "function"
    ) {
      return !!global.CreatorDailyLimitsSubheader.applyFromData(data);
    }
    global.__EAZ_DAILY_LIMITS__ = {
      ok: true,
      creation_limits_effective: data.creation_limits_effective || null,
      listing_limits_effective: data.listing_limits_effective || null,
    };
    global.__EAZ_DAILY_LIMITS_FETCHED_AT__ = Date.now();
    if (global.CreatorDailyLimitsSubheader && typeof global.CreatorDailyLimitsSubheader.refresh === "function") {
      global.CreatorDailyLimitsSubheader.refresh(false);
    }
    return true;
  }

  function applyDashboardStats(data) {
    if (!data || !data.ok) return false;
    if (
      global.CreatorDashboardData &&
      typeof global.CreatorDashboardData.applyDashboardStats === "function"
    ) {
      global.CreatorDashboardData.applyDashboardStats(data);
      return true;
    }
    return false;
  }

  function applyChrome(chrome) {
    if (!chrome || typeof chrome !== "object") return false;
    lastChrome = chrome;
    var ok = false;
    if (applyBalance(chrome.balance)) ok = true;
    if (applyLevel(chrome.level)) ok = true;
    if (applyOnboarding(chrome.onboarding)) ok = true;
    if (applyDailyLimits(chrome.daily_limits)) ok = true;
    if (applyDashboardStats(chrome.dashboard_stats)) ok = true;
    return ok;
  }

  function fetchChromeParallel(ownerId) {
    return Promise.all([
      apiGet("get-balance", ownerId).catch(function () {
        return null;
      }),
      apiGet("get-level", ownerId).catch(function () {
        return null;
      }),
      apiGet("get-onboarding-progress", ownerId).catch(function () {
        return null;
      }),
      apiGet("get-daily-limits", ownerId).catch(function () {
        return null;
      }),
      apiGet("get-dashboard-stats", ownerId).catch(function () {
        return null;
      }),
    ]).then(function (parts) {
      return {
        balance: parts[0],
        level: parts[1],
        onboarding: parts[2],
        daily_limits: parts[3],
        dashboard_stats: parts[4],
      };
    });
  }

  function chromeLooksComplete(chrome) {
    if (!chrome) return false;
    var bal = chrome.balance && chrome.balance.ok;
    var lvl = chrome.level && chrome.level.ok;
    var onb = chrome.onboarding && chrome.onboarding.ok;
    var lim = chrome.daily_limits && chrome.daily_limits.ok;
    // Require the critical four; stats are nice-to-have.
    return !!(bal && lvl && onb && lim);
  }

  function load(options) {
    options = options || {};
    if (chromeReady && !options.force && lastChrome) {
      return Promise.resolve(lastChrome);
    }
    if (readyPromise && !options.force) return readyPromise;

    readyPromise = (async function () {
      var ownerId = resolveOwnerId();
      if (!ownerId) {
        chromeReady = true;
        global.__EAZ_DASHBOARD_CHROME_READY__ = true;
        return null;
      }

      var chrome = options.bootstrapChrome || null;
      if (!chromeLooksComplete(chrome)) {
        try {
          chrome = await fetchChromeParallel(ownerId);
        } catch (e) {
          console.warn("[CreatorPortalChrome] fetch failed", e);
        }
      }

      // DOM may still be mounting — short retry for apply targets.
      var attempts = 0;
      while (attempts < 8) {
        applyChrome(chrome);
        var hasLevel =
          document.getElementById("creator-desktop-level-num") ||
          document.getElementById("creator-mobile-level-num");
        var hasJourney =
          document.getElementById("creator-desktop-journey-open-list") ||
          document.getElementById("creator-mobile-journey-open");
        if ((hasLevel || hasJourney) && chromeLooksComplete(chrome)) break;
        attempts += 1;
        await new Promise(function (r) {
          setTimeout(r, 120 * attempts);
        });
      }

      chromeReady = true;
      global.__EAZ_DASHBOARD_CHROME_READY__ = true;
      global.__EAZ_DASHBOARD_CHROME__ = chrome;
      try {
        global.dispatchEvent(new CustomEvent("eazDashboardChromeReady", { detail: chrome }));
      } catch (e) {}
      return chrome;
    })().catch(function (e) {
      console.warn("[CreatorPortalChrome] load failed", e);
      chromeReady = true;
      global.__EAZ_DASHBOARD_CHROME_READY__ = true;
      return null;
    });

    return readyPromise;
  }

  function whenReady(timeoutMs) {
    var ms = typeof timeoutMs === "number" ? timeoutMs : 12000;
    return Promise.race([
      load(),
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve(lastChrome);
        }, ms);
      }),
    ]);
  }

  global.CreatorPortalChrome = {
    load: load,
    whenReady: whenReady,
    apply: applyChrome,
    isReady: function () {
      return chromeReady;
    },
    getLast: function () {
      return lastChrome;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
