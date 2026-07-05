/**
 * Daily game picker carousel (Play tab) — choose game, view rules, cooldown + notify toggles.
 */
(function () {
  "use strict";

  var GAMES = [
    {
      slug: "memory_match",
      labelKey: "games_memory_title",
      labelFb: "Memory Match",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="8" height="10" rx="1.5"/><rect x="13" y="5" width="8" height="10" rx="1.5"/><rect x="3" y="17" width="8" height="2" rx="1"/><rect x="13" y="17" width="8" height="2" rx="1"/></svg>',
      ruleKeys: ["games_rules_p1", "games_rules_p2", "games_rules_p3", "games_rules_p4"],
    },
    {
      slug: "connect_four_5x5",
      labelKey: "games_connect_title",
      labelFb: "Connect Four",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="6" cy="8" r="2.2"/><circle cx="12" cy="8" r="2.2"/><circle cx="18" cy="8" r="2.2"/><circle cx="9" cy="14" r="2.2"/><circle cx="15" cy="14" r="2.2"/><circle cx="12" cy="20" r="2.2"/></svg>',
      ruleKeys: [
        "games_connect_rules_p1",
        "games_connect_rules_p2",
        "games_connect_rules_p3",
        "games_connect_rules_p4",
      ],
    },
    {
      slug: "simon_says",
      labelKey: "games_simon_title",
      labelFb: "Simon Says",
      icon:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" fill="rgba(249,115,22,0.25)" stroke="#f97316"/><rect x="13" y="4" width="7" height="7" rx="2" fill="rgba(56,189,248,0.2)" stroke="#38bdf8"/><rect x="4" y="13" width="7" height="7" rx="2" fill="rgba(34,197,94,0.2)" stroke="#22c55e"/><rect x="13" y="13" width="7" height="7" rx="2" fill="rgba(167,139,250,0.2)" stroke="#a78bfa"/></svg>',
      ruleKeys: [
        "games_simon_rules_p1",
        "games_simon_rules_p2",
        "games_simon_rules_p3",
        "games_simon_rules_p4",
      ],
    },
  ];

  var selectedSlug = "memory_match";
  var stateGames = [];
  var nextAvailableMsRoot = null;
  var notifySchedule = null;
  var cooldownTimer = null;
  var notifySaving = false;

  function cooldownSecFromMs(ms) {
    if (!ms) return 0;
    var sec = Math.ceil((Number(ms) - Date.now()) / 1000);
    return Number.isFinite(sec) && sec > 0 ? sec : 0;
  }

  function syncCooldownFromClock() {
    var anyCooldown = false;
    stateGames.forEach(function (g) {
      if (g.status !== "cooldown") return;
      var ms = g.next_available_ms || nextAvailableMsRoot;
      var sec = cooldownSecFromMs(ms);
      g.cooldown_remaining_sec = sec;
      if (sec <= 0) {
        g.status = "available";
        g.available = true;
        g.cooldown_remaining_sec = 0;
      } else {
        anyCooldown = true;
      }
    });
    return anyCooldown;
  }

  function t(key, fb) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fb;
  }

  function gm(key, fb) {
    return t("eazy_chat." + key, fb);
  }

  function apiBase() {
    return window.CREATOR_API_BASE || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  }

  function shopDomain() {
    return window.CREATOR_SHOP_DOMAIN || (window.Shopify && window.Shopify.shop) || "eazpire.myshopify.com";
  }

  function gameDef(slug) {
    for (var i = 0; i < GAMES.length; i++) {
      if (GAMES[i].slug === slug) return GAMES[i];
    }
    return GAMES[0];
  }

  function gameState(slug) {
    for (var i = 0; i < stateGames.length; i++) {
      if (stateGames[i].slug === slug) return stateGames[i];
    }
    return null;
  }

  function formatCooldown(sec) {
    var s = Math.max(0, Math.floor(Number(sec) || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    if (h > 0) {
      return (
        String(h) +
        ":" +
        String(m).padStart(2, "0") +
        ":" +
        String(r).padStart(2, "0")
      );
    }
    return String(m) + ":" + String(r).padStart(2, "0");
  }

  function buildItemHtml(feat, gs) {
    var locked = gs && !gs.available && gs.status !== "in_progress";
    var cls = "eazy-games-picker-carousel__item";
    if (feat.slug === selectedSlug) cls += " is-active";
    if (gs && gs.status === "cooldown") cls += " is-cooldown";
    if (gs && gs.status === "in_progress") cls += " is-progress";
    if (locked) cls += " is-locked";
    return (
      '<button type="button" class="' +
      cls +
      '" data-game-slug="' +
      feat.slug +
      '" title="' +
      gm(feat.labelKey, feat.labelFb) +
      '">' +
      '<span class="eazy-games-picker-carousel__item-icon">' +
      feat.icon +
      "</span>" +
      '<span class="eazy-games-picker-carousel__item-label">' +
      gm(feat.labelKey, feat.labelFb) +
      "</span>" +
      (gs && gs.status === "cooldown"
        ? '<span class="eazy-games-picker-carousel__item-badge">' +
          formatCooldown(gs.cooldown_remaining_sec) +
          "</span>"
        : "") +
      "</button>"
    );
  }

  var _track = null;
  var _wrapper = null;

  function refreshCarouselDom() {
    if (!_track) return;
    var html = "";
    for (var i = 0; i < GAMES.length; i++) {
      html += buildItemHtml(GAMES[i], gameState(GAMES[i].slug));
    }
    _track.innerHTML = html;
    _track.querySelectorAll("[data-game-slug]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectGame(btn.getAttribute("data-game-slug"), true);
      });
    });
  }

  function initCarousel() {
    _track = document.getElementById("eazy-games-picker-track");
    _wrapper = document.getElementById("eazy-games-picker-track-wrapper");
    if (!_track || !_wrapper || _wrapper.dataset.bound) return;
    _wrapper.dataset.bound = "1";
    refreshCarouselDom();

    var leftBtn = document.getElementById("eazy-games-picker-left");
    var rightBtn = document.getElementById("eazy-games-picker-right");
    var scrollAmount = 160;

    if (leftBtn) {
      leftBtn.addEventListener("click", function () {
        _wrapper.scrollBy({ left: -scrollAmount, behavior: "smooth" });
      });
    }
    if (rightBtn) {
      rightBtn.addEventListener("click", function () {
        _wrapper.scrollBy({ left: scrollAmount, behavior: "smooth" });
      });
    }
  }

  function renderRules(slug) {
    var panel = document.getElementById("creator-chat-games-rules-panel");
    if (!panel) return;
    var def = gameDef(slug);
    var gs = gameState(slug);
    var html = '<div class="creator-chat__games-rules-panel__title">' + gm(def.labelKey, def.labelFb) + "</div>";
    html += '<div class="creator-chat__games-rules-panel__body">';
    def.ruleKeys.forEach(function (key) {
      html += "<p>" + gm(key, "") + "</p>";
    });
    if (slug === "memory_match" && window.__eazyLastMemoryHints) {
      var mh = window.__eazyLastMemoryHints;
      if (mh.max_flip_attempts != null && mh.play_ms != null) {
        html +=
          "<p class=\"creator-chat__games-rules-dynamic\">" +
          gm(
            "games_rules_live_caps",
            "Today's puzzle: up to {{attempts}} pair attempts after your peek; {{seconds}}s on the play clock."
          )
            .replace(/\{\{attempts\}\}/g, String(mh.max_flip_attempts))
            .replace(/\{\{seconds\}\}/g, String(Math.round(Number(mh.play_ms) / 1000))) +
          "</p>";
      }
    }
    if (slug === "connect_four_5x5" && window.__eazyLastConnectHints) {
      var ch = window.__eazyLastConnectHints;
      html +=
        "<p class=\"creator-chat__games-rules-dynamic\">" +
        gm(
          "games_connect_rules_live",
          "Today's puzzle: {{size}}×{{size}} grid, {{win}} in a row, {{seconds}}s total. A draw counts as a loss."
        )
          .replace(/\{\{size\}\}/g, String(ch.size || 5))
          .replace(/\{\{win\}\}/g, String(ch.win_len || 4))
          .replace(/\{\{seconds\}\}/g, String(Math.round(Number(ch.play_ms) / 1000))) +
        "</p>";
    }
    if (slug === "simon_says" && window.__eazyLastSimonHints) {
      var sh = window.__eazyLastSimonHints;
      html +=
        "<p class=\"creator-chat__games-rules-dynamic\">" +
        gm(
          "games_simon_rules_live",
          "Today's puzzle: {{rounds}} rounds, {{seconds}}s per input phase."
        )
          .replace(/\{\{rounds\}\}/g, String(sh.target_rounds || 7))
          .replace(/\{\{seconds\}\}/g, String(Math.round(Number(sh.play_ms_per_round) / 1000))) +
        "</p>";
    }
    html += "</div>";
    if (gs && gs.status === "cooldown") {
      html +=
        '<p class="creator-chat__games-rules-panel__cooldown">' +
        gm("games_cooldown_wait", "Available again in {{time}}").replace(
          "{{time}}",
          formatCooldown(gs.cooldown_remaining_sec)
        ) +
        "</p>";
    }
    panel.innerHTML = html;
    panel.hidden = false;
  }

  function renderNotifyToggles(notify, show) {
    var host = document.getElementById("creator-chat-games-notify-toggles");
    if (!host) return;
    if (!show) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;
    var pushOn = notify && notify.push_enabled !== false;
    var emailOn = notify && notify.email_enabled === true;
    host.innerHTML =
      '<label class="creator-chat__games-notify-row">' +
      '<span class="creator-chat__games-notify-label">' +
      gm("games_notify_push", "Notify me (push) when available") +
      "</span>" +
      '<input type="checkbox" class="creator-chat__games-notify-switch" data-notify-channel="push"' +
      (pushOn ? " checked" : "") +
      " />" +
      "</label>" +
      '<label class="creator-chat__games-notify-row">' +
      '<span class="creator-chat__games-notify-label">' +
      gm("games_notify_email", "Notify me (email) when available") +
      "</span>" +
      '<input type="checkbox" class="creator-chat__games-notify-switch" data-notify-channel="email"' +
      (emailOn ? " checked" : "") +
      " />" +
      "</label>";
    host.querySelectorAll("[data-notify-channel]").forEach(function (input) {
      input.addEventListener("change", function () {
        saveNotifyPref(input.getAttribute("data-notify-channel"), input.checked);
      });
    });
  }

  function saveNotifyPref(channel, enabled) {
    if (notifySaving) return;
    notifySaving = true;
    var body = { shop: { daily_game: {} } };
    if (channel === "push") {
      body.shop.daily_game.push = enabled;
      body.shop.daily_game.in_app = enabled;
    } else if (channel === "email") {
      body.shop.daily_game.email = enabled;
    }
    fetch(apiBase() + "?op=save-notification-preferences&shop=" + encodeURIComponent(shopDomain()), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function () {
        if (typeof window.__eazyRefreshDailyGameState === "function") {
          window.__eazyRefreshDailyGameState();
        }
      })
      .catch(function () {})
      .finally(function () {
        notifySaving = false;
      });
  }

  function stopCooldownTimer() {
    if (cooldownTimer) {
      window.clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }

  function startCooldownTimer() {
    stopCooldownTimer();
    syncCooldownFromClock();
    cooldownTimer = window.setInterval(function () {
      var stillCooling = syncCooldownFromClock();
      refreshCarouselDom();
      renderRules(selectedSlug);
      var gs = gameState(selectedSlug);
      renderNotifyToggles(window.__eazyGamesNotify || {}, gs && gs.status === "cooldown");
      if (typeof window.__eazyGamesOnSelectionChange === "function") {
        window.__eazyGamesOnSelectionChange(selectedSlug, gs);
      }
      if (!stillCooling) {
        stopCooldownTimer();
      }
    }, 1000);
  }

  function selectGame(slug, fromUser) {
    if (!slug || !gameDef(slug)) return;
    selectedSlug = slug;
    window.__eazySelectedGameSlug = slug;
    window.__eazyTodayGameSlug = slug;
    refreshCarouselDom();
    renderRules(slug);
    var gs = gameState(slug);
    renderNotifyToggles(window.__eazyGamesNotify || {}, gs && gs.status === "cooldown");
    if (typeof window.__eazyGamesOnSelectionChange === "function") {
      window.__eazyGamesOnSelectionChange(slug, gs, fromUser);
    }
  }

  function applyState(data) {
    if (!data || !data.ok) return;
    stateGames = Array.isArray(data.games) ? data.games : [];
    nextAvailableMsRoot = data.next_available_ms || null;
    notifySchedule = data.notify_schedule || null;
    window.__eazyGamesNotify = data.notify || {};
    window.__eazyGamesNotifySchedule = notifySchedule;
    window.__eazyLastMemoryHints = data.memory_hints || null;
    window.__eazyLastConnectHints = data.connect_hints || null;
    window.__eazyLastSimonHints = data.simon_hints || null;
    syncCooldownFromClock();
    var slug = data.selected_game_slug || data.today_game_slug || selectedSlug;
    if (!fromUserSelection(slug)) {
      selectedSlug = slug;
    }
    window.__eazySelectedGameSlug = selectedSlug;
    window.__eazyTodayGameSlug = selectedSlug;
    refreshCarouselDom();
    renderRules(selectedSlug);
    var gs = gameState(selectedSlug);
    renderNotifyToggles(window.__eazyGamesNotify, gs && gs.status === "cooldown");
    if (stateGames.some(function (g) {
      return g.status === "cooldown" && cooldownSecFromMs(g.next_available_ms || nextAvailableMsRoot) > 0;
    })) {
      startCooldownTimer();
    } else {
      stopCooldownTimer();
    }
    if (typeof window.__eazyGamesOnSelectionChange === "function") {
      window.__eazyGamesOnSelectionChange(selectedSlug, gs);
    }
  }

  var userPicked = false;
  function fromUserSelection(slug) {
    return userPicked && slug;
  }

  function init() {
    initCarousel();
    var picker = document.getElementById("creator-chat-games-play-picker");
    if (picker && !picker.dataset.bound) {
      picker.dataset.bound = "1";
    }
    selectGame(selectedSlug, false);
  }

  window.EazyGamesPicker = {
    init: init,
    applyState: applyState,
    selectGame: function (slug) {
      userPicked = true;
      selectGame(slug, true);
    },
    getSelectedSlug: function () {
      return selectedSlug;
    },
    getLiveCooldownSec: function (slug) {
      var gs = gameState(slug || selectedSlug);
      if (!gs || gs.status !== "cooldown") return 0;
      return cooldownSecFromMs(gs.next_available_ms || nextAvailableMsRoot);
    },
    formatCooldown: formatCooldown,
  };

  document.addEventListener("DOMContentLoaded", init);
})();
