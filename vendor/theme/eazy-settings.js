/**
 * Eazy Settings – Persistent user preferences
 * localStorage for instant UI + eazy-memory API for cross-device sync
 * Exposes window.EazySettings for use by mascot, tips, widget scripts
 */
(function () {
  "use strict";

  var STORAGE_KEY = "eazy_settings_v1";
  var SYNC_DEBOUNCE_MS = 3000;
  var API_BASE = (window.CreatorChatActions && window.CreatorChatActions.API_BASE)
    || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";

  var FREQ_LABELS = { 0: "Selten", 1: "Normal", 2: "Oft" };

  var DEFAULTS = {
    audio_enabled: true,
    audio_volume: 75,
    audio_autoplay: false,
    messages_enabled: true,
    messages_mascot_bubbles: true,
    messages_dream_bubbles: true,
    messages_chat_greeting: true,
    messages_idle_tips_chat: true,
    messages_idle_tips_page: true,
    messages_function_tips: true,
    messages_job_updates: true,
    frequency_mascot_bubbles: 1,
    frequency_dream_bubbles: 1,
    frequency_idle_tips_chat: 1,
    frequency_idle_tips_page: 1,
    mood_tags: ["lustig", "inspirierend", "weisheit", "informativ", "frech", "flirty"],
    placement: "page"
  };

  var _settings = null;
  var _syncTimer = null;
  var _loaded = false;

  function load() {
    if (_settings) return _settings;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _settings = JSON.parse(raw);
        for (var k in DEFAULTS) {
          if (_settings[k] === undefined) _settings[k] = DEFAULTS[k];
        }
      }
    } catch (e) {}
    if (!_settings) _settings = JSON.parse(JSON.stringify(DEFAULTS));
    return _settings;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    } catch (e) {}
    scheduleSyncToServer();
  }

  function get(key) {
    load();
    return _settings[key] !== undefined ? _settings[key] : DEFAULTS[key];
  }

  function set(key, value) {
    load();
    _settings[key] = value;
    save();
  }

  function getAll() {
    return load();
  }

  function getFrequencyMultiplier(key) {
    var val = get(key);
    if (val === 0) return 2.0;
    if (val === 2) return 0.5;
    return 1.0;
  }

  function isMessageTypeEnabled(key) {
    if (!get("messages_enabled")) return false;
    return get(key);
  }

  function isMoodTagAllowed(tags) {
    if (!tags || !tags.length) return true;
    var allowed = get("mood_tags");
    if (!allowed || !allowed.length) return true;
    for (var i = 0; i < tags.length; i++) {
      if (allowed.indexOf(tags[i]) !== -1) return true;
    }
    return false;
  }

  /* ── Server sync ── */
  function getUserId() {
    if (window.EazyBot && window.EazyBot.getUserId) return window.EazyBot.getUserId();
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID);
    try { return localStorage.getItem("eazy_user_id"); } catch (e) { return null; }
  }

  function scheduleSyncToServer() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(function () {
      _syncTimer = null;
      syncToServer();
    }, SYNC_DEBOUNCE_MS);
  }

  function syncToServer() {
    var userId = getUserId();
    if (!userId) return;
    fetch(API_BASE + "?op=eazy-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId, preferences: { eazy_settings: _settings } })
    }).catch(function () {});
  }

  function loadFromServer() {
    if (_loaded) return;
    _loaded = true;
    var userId = getUserId();
    if (!userId) return;

    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (e) {}

    fetch(API_BASE + "?op=eazy-memory&user_id=" + encodeURIComponent(userId), { credentials: "include" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.memory || !data.memory.preferences) return;
        try {
          var prefs = typeof data.memory.preferences === "string"
            ? JSON.parse(data.memory.preferences) : data.memory.preferences;
          if (prefs.eazy_settings) {
            _settings = prefs.eazy_settings;
            for (var k in DEFAULTS) {
              if (_settings[k] === undefined) _settings[k] = DEFAULTS[k];
            }
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch (e) {}
            applyToUI();
          }
        } catch (e) {}
      }).catch(function () {});
  }

  /* ── UI Binding ── */
  function applyToUI() {
    var s = load();
    var container = document.getElementById("eazy-settings-container");
    if (!container) return;

    container.querySelectorAll("[data-key]").forEach(function (el) {
      var key = el.getAttribute("data-key");
      var val = s[key];
      if (val === undefined) return;
      if (el.type === "checkbox") {
        el.checked = !!val;
      } else if (el.type === "range") {
        el.value = val;
        if (key === "audio_volume") {
          var vLabel = document.getElementById("eazy-set-audio-volume-val");
          if (vLabel) vLabel.textContent = val + "%";
        }
      }
    });

    container.querySelectorAll("[data-freq-for]").forEach(function (el) {
      var key = el.getAttribute("data-freq-for");
      var val = s[key] !== undefined ? s[key] : 1;
      el.textContent = FREQ_LABELS[val] || "Normal";
    });

    container.querySelectorAll("[data-tag]").forEach(function (el) {
      var tag = el.getAttribute("data-tag");
      var tags = s.mood_tags || [];
      el.classList.toggle("is-active", tags.indexOf(tag) !== -1);
    });

    var placementBtns = container.querySelectorAll("[data-placement]");
    placementBtns.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-placement") === s.placement);
    });

    updateMessageGroupDisabled();
    updateAudioSubRows();
  }

  function updateMessageGroupDisabled() {
    var master = get("messages_enabled");
    var group = document.getElementById("eazy-set-messages-group");
    if (!group) return;
    group.querySelectorAll(".eazy-settings__msg-card").forEach(function (card) {
      card.classList.toggle("is-disabled", !master);
    });
  }

  function updateAudioSubRows() {
    var enabled = get("audio_enabled");
    var volRow = document.getElementById("eazy-set-audio-volume-row");
    var autoRow = document.getElementById("eazy-set-audio-autoplay-row");
    if (volRow) volRow.style.opacity = enabled ? "1" : "0.4";
    if (autoRow) autoRow.style.opacity = enabled ? "1" : "0.4";
  }

  /* ── Confirm Modal ── */
  var _confirmCallback = null;

  function showConfirm(opts, onConfirm) {
    var modal = document.getElementById("eazy-confirm-modal");
    if (!modal) { if (confirm(opts.title + "\n" + opts.text) && onConfirm) onConfirm(); return; }

    var iconEl = document.getElementById("eazy-confirm-icon");
    var titleEl = document.getElementById("eazy-confirm-title");
    var textEl = document.getElementById("eazy-confirm-text");
    var okBtn = document.getElementById("eazy-confirm-ok");

    if (iconEl) {
      iconEl.className = "eazy-confirm__icon " + (opts.iconClass || "eazy-confirm__icon--danger");
      iconEl.innerHTML = opts.icon || "&#9888;";
    }
    if (titleEl) titleEl.textContent = opts.title || "";
    if (textEl) textEl.textContent = opts.text || "";
    if (okBtn) okBtn.textContent = opts.confirmLabel || okBtn.textContent;

    _confirmCallback = onConfirm;
    modal.setAttribute("aria-hidden", "false");
    modal.style.display = "";
  }

  function closeConfirm(confirmed) {
    var modal = document.getElementById("eazy-confirm-modal");
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
      modal.style.display = "none";
    }
    if (confirmed && _confirmCallback) _confirmCallback();
    _confirmCallback = null;
  }

  function bindConfirmModal() {
    var cancelBtn = document.getElementById("eazy-confirm-cancel");
    var okBtn = document.getElementById("eazy-confirm-ok");
    var modal = document.getElementById("eazy-confirm-modal");
    if (cancelBtn) cancelBtn.addEventListener("click", function () { closeConfirm(false); });
    if (okBtn) okBtn.addEventListener("click", function () { closeConfirm(true); });
    if (modal) modal.addEventListener("click", function (e) {
      if (e.target === modal) closeConfirm(false);
    });
  }

  function showToast(text) {
    var view = document.getElementById("creator-chat-view-settings");
    if (!view) return;
    var existing = view.querySelector(".eazy-settings__toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.className = "eazy-settings__toast";
    toast.textContent = text;
    view.style.position = "relative";
    view.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () { toast.remove(); }, 200);
    }, 2000);
  }

  function bindEvents() {
    var container = document.getElementById("eazy-settings-container");
    if (!container) return;

    container.addEventListener("change", function (e) {
      var el = e.target;
      var key = el.getAttribute("data-key");
      if (!key) return;

      if (el.type === "checkbox") {
        set(key, el.checked);
        if (key === "messages_enabled") updateMessageGroupDisabled();
        if (key === "audio_enabled") updateAudioSubRows();
      } else if (el.type === "range") {
        var val = parseInt(el.value, 10);
        set(key, val);
        if (key === "audio_volume") {
          var vLabel = document.getElementById("eazy-set-audio-volume-val");
          if (vLabel) vLabel.textContent = val + "%";
        }
      }
    });

    container.addEventListener("input", function (e) {
      var el = e.target;
      var key = el.getAttribute("data-key");
      if (!key || el.type !== "range") return;

      if (key === "audio_volume") {
        var vLabel = document.getElementById("eazy-set-audio-volume-val");
        if (vLabel) vLabel.textContent = el.value + "%";
      }

      var freqLabel = container.querySelector('[data-freq-for="' + key + '"]');
      if (freqLabel) {
        freqLabel.textContent = FREQ_LABELS[parseInt(el.value, 10)] || "Normal";
      }
    });

    var chips = document.getElementById("eazy-set-mood-chips");
    if (chips) {
      chips.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-tag]");
        if (!btn) return;
        btn.classList.toggle("is-active");
        var tags = [];
        chips.querySelectorAll("[data-tag].is-active").forEach(function (el) {
          tags.push(el.getAttribute("data-tag"));
        });
        set("mood_tags", tags);
      });
    }

    var placementEl = document.getElementById("eazy-set-placement");
    if (placementEl) {
      placementEl.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-placement]");
        if (!btn) return;
        var val = btn.getAttribute("data-placement");
        placementEl.querySelectorAll("[data-placement]").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        set("placement", val);
        if (val === "header") {
          if (window.EazyIconDock && window.EazyIconDock.dock) window.EazyIconDock.dock();
        } else {
          if (window.EazyIconDock && window.EazyIconDock.undock) window.EazyIconDock.undock();
        }
      });
    }

    var resetBtn = document.getElementById("eazy-set-reset-pos");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        try {
          localStorage.removeItem("eazy_icon_desktop");
          localStorage.removeItem("eazy_icon_mobile");
          localStorage.removeItem("eazy_docked");
        } catch (e) {}
        set("placement", "page");
        var segBtns = document.querySelectorAll("#eazy-set-placement [data-placement]");
        segBtns.forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-placement") === "page");
        });
        if (window.EazyIconDock && window.EazyIconDock.undock) window.EazyIconDock.undock();
        if (window.EazyIconDock && window.EazyIconDock.resetPosition) window.EazyIconDock.resetPosition();
        showToast("Position zurückgesetzt");
      });
    }

    var clearHistoryBtn = document.getElementById("eazy-set-clear-history");
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener("click", function () {
        showConfirm({
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
          iconClass: "eazy-confirm__icon--danger",
          title: "Chat-Verlauf löschen",
          text: "Alle Chats und Konversationen werden unwiderruflich gelöscht. Das kann nicht rückgängig gemacht werden.",
          confirmLabel: "Löschen"
        }, function () {
          var userId = getUserId();
          if (userId) {
            fetch(API_BASE + "?op=eazy-conv&delete_all=1", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ user_id: userId })
            }).catch(function () {});
          }
          try {
            localStorage.removeItem("eazy_gen_active");
            localStorage.removeItem("eazy_notified_jobs");
          } catch (e) {}
          showToast("Chat-Verlauf gelöscht");
        });
      });
    }

    var clearMemoryBtn = document.getElementById("eazy-set-clear-memory");
    if (clearMemoryBtn) {
      clearMemoryBtn.addEventListener("click", function () {
        showConfirm({
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
          iconClass: "eazy-confirm__icon--warning",
          title: "Eazy Memory zurücksetzen",
          text: "Alle Einstellungen, Präferenzen und Eazy's Erinnerungen an dich werden zurückgesetzt.",
          confirmLabel: "Zurücksetzen"
        }, function () {
          _settings = JSON.parse(JSON.stringify(DEFAULTS));
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch (e) {}
          try { localStorage.removeItem("eaz_bot_state_v1"); } catch (e) {}
          applyToUI();
          syncToServer();
          showToast("Memory zurückgesetzt");
        });
      });
    }
  }

  function init() {
    load();
    applyToUI();
    bindEvents();
    bindConfirmModal();
    loadFromServer();

    var placement = get("placement");
    if (placement === "header") {
      var seg = document.querySelector('#eazy-set-placement [data-placement="header"]');
      if (seg) seg.classList.add("is-active");
      var pageSeg = document.querySelector('#eazy-set-placement [data-placement="page"]');
      if (pageSeg) pageSeg.classList.remove("is-active");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EazySettings = {
    get: get,
    set: set,
    getAll: getAll,
    getFrequencyMultiplier: getFrequencyMultiplier,
    isMessageTypeEnabled: isMessageTypeEnabled,
    isMoodTagAllowed: isMoodTagAllowed,
    showConfirm: showConfirm,
    DEFAULTS: DEFAULTS
  };
})();
