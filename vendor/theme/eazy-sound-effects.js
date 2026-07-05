/**
 * Eazy Sound Effects – Random ambient sounds + voice reactions + animations
 * Flow: animation + sound → short pause → speaking animation + voice reaction
 * Only plays when icon is free on the page (not docked, not sleeping, chat closed)
 * Only the currently visible tab plays (leader election via localStorage)
 * Depends on: eazy-bot.js, eazy-settings.js, creator-chat-icon.css
 */
(function () {
  "use strict";

  var MIN_INTERVAL = 60 * 60 * 1000;
  var MAX_INTERVAL = 180 * 60 * 1000;
  var VOICE_DELAY_MIN = 600;
  var VOICE_DELAY_MAX = 1800;
  var PLAY_CHANCE = 0.7;

  var LEADER_KEY = "eazy_sfx_leader";
  var LEADER_HEARTBEAT_MS = 10000;
  var LEADER_EXPIRE_MS = 20000;

  var ANIMS_FART = ["eazy-sfx-shock", "eazy-sfx-embarrassed", "eazy-sfx-giggle"];
  var ANIMS_BURP = ["eazy-sfx-proud", "eazy-sfx-embarrassed", "eazy-sfx-shock"];

  var _sfxAudio = null;
  var _voiceAudio = null;
  var _sfxTimer = null;
  var _animTimer = null;
  var _heartbeatTimer = null;
  var _data = null;
  var _lastSoundUrl = null;
  var _lastVoiceUrls = {};
  var _tabId = Math.random().toString(36).slice(2, 10);
  var _isLeader = false;

  /* ── Tab Leader Election ── */
  function claimLeader() {
    try {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: _tabId, ts: Date.now() }));
    } catch (e) {}
    _isLeader = true;
  }

  function releaseLeader() {
    _isLeader = false;
    try {
      var raw = localStorage.getItem(LEADER_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data.id === _tabId) localStorage.removeItem(LEADER_KEY);
      }
    } catch (e) {}
  }

  function isLeaderAlive() {
    try {
      var raw = localStorage.getItem(LEADER_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      return (Date.now() - data.ts) < LEADER_EXPIRE_MS;
    } catch (e) { return false; }
  }

  function isCurrentLeader() {
    try {
      var raw = localStorage.getItem(LEADER_KEY);
      if (!raw) return false;
      return JSON.parse(raw).id === _tabId;
    } catch (e) { return false; }
  }

  function isWindowVisiblyActive() {
    if (document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return true;
  }

  function tryBecomeLeader() {
    if (!isWindowVisiblyActive()) return false;
    if (!isLeaderAlive()) {
      claimLeader();
      return true;
    }
    return isCurrentLeader();
  }

  function heartbeat() {
    if (_isLeader && isWindowVisiblyActive()) {
      claimLeader();
    } else if (_isLeader) {
      releaseLeader();
    }
  }

  function startHeartbeat() {
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(heartbeat, LEADER_HEARTBEAT_MS);
  }

  /* ── Data + Checks ── */
  function getData() {
    if (_data) return _data;
    var el = document.getElementById("eazy-sfx-data");
    if (!el) return null;
    try {
      _data = JSON.parse(el.textContent);
    } catch (e) {
      _data = null;
    }
    return _data;
  }

  function getToggleBtn() {
    return document.getElementById("creator-chat-toggle");
  }

  function isSnappedInHeader() {
    var btn = getToggleBtn();
    if (btn && (btn.classList.contains("creator-chat__toggle--docked") || btn.classList.contains("creator-chat__toggle--snap-mode"))) {
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

  function isIconFreeOnPage() {
    var btn = getToggleBtn();
    if (!btn) return false;
    if (isSnappedInHeader()) return false;
    if (btn.classList.contains("creator-chat-icon--sleeping")) return false;
    var panel = document.querySelector(".creator-chat__panel");
    if (panel && (panel.classList.contains("is-visible") || panel.classList.contains("is-open"))) return false;
    return true;
  }

  function isEnabled() {
    if (window.__eaz_mode_active || window.__eaz_guide_active) return false;
    if (!isWindowVisiblyActive()) return false;
    if (window.CreatorAudioPlaying) return false;
    if (window.EazySettings && !window.EazySettings.get("audio_enabled")) return false;
    if (window.EazyBot && window.EazyBot.isSleepTime()) return false;
    if (!isIconFreeOnPage()) return false;
    return true;
  }

  function getSfxVolume() {
    var vol = window.EazySettings ? window.EazySettings.get("audio_volume") : 75;
    return Math.max(0, Math.min(1, (vol / 100) * 0.55));
  }

  function getVoiceVolume() {
    var vol = window.EazySettings ? window.EazySettings.get("audio_volume") : 75;
    return Math.max(0, Math.min(1, vol / 100));
  }

  function pickRandom(arr, lastPicked) {
    if (!arr || !arr.length) return null;
    if (arr.length === 1) return arr[0];
    var pick;
    var attempts = 0;
    do {
      pick = arr[Math.floor(Math.random() * arr.length)];
      attempts++;
    } while (pick === lastPicked && attempts < 5);
    return pick;
  }

  function randomInterval() {
    var mul = 1;
    if (window.EazySettings && window.EazySettings.getFrequencyMultiplier) {
      mul = window.EazySettings.getFrequencyMultiplier("frequency_sound_effects");
    }
    var base = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
    return base * mul;
  }

  function voiceDelay() {
    return VOICE_DELAY_MIN + Math.random() * (VOICE_DELAY_MAX - VOICE_DELAY_MIN);
  }

  /* ── Animations ── */
  function clearAnimClasses() {
    var btn = getToggleBtn();
    if (!btn) return;
    if (_animTimer) { clearTimeout(_animTimer); _animTimer = null; }
    btn.classList.remove(
      "eazy-sfx-shock", "eazy-sfx-embarrassed", "eazy-sfx-proud", "eazy-sfx-giggle",
      "eazy-sfx-speaking", "eazy-sfx-stink-active", "eazy-sfx-burp-active"
    );
  }

  function animateSfx(type) {
    var btn = getToggleBtn();
    if (!btn) return null;
    clearAnimClasses();

    var isBurp = type === "burp" || type === "burp_double";
    var anims = isBurp ? ANIMS_BURP : ANIMS_FART;
    var anim = pickRandom(anims);

    btn.classList.add(anim);
    btn.classList.add(isBurp ? "eazy-sfx-burp-active" : "eazy-sfx-stink-active");
    return anim;
  }

  function animateSpeak() {
    var btn = getToggleBtn();
    if (!btn) return;
    clearAnimClasses();
    btn.classList.add("eazy-sfx-speaking");
  }

  /* ── Playback ── */
  function stopAll() {
    if (_sfxAudio) { _sfxAudio.pause(); _sfxAudio = null; }
    if (_voiceAudio) { _voiceAudio.pause(); _voiceAudio = null; }
    clearAnimClasses();
  }

  function showThoughtBubble(text) {
    var el = document.getElementById("eazy-thought");
    if (!el || !text) return;
    var textEl = el.querySelector(".eazy-thought-text");
    if (textEl) textEl.textContent = text;
    el.classList.remove("eazy-thought--dream");
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, 4500);
  }

  function playVoiceReaction(type) {
    var data = getData();
    if (!data || !data.voices || !data.voices[type]) return;

    var pool = data.voices[type];
    var lastUrl = _lastVoiceUrls[type] || null;
    var voice = pickRandomVoice(pool, lastUrl);
    if (!voice) return;
    var url = typeof voice === "object" && voice.url ? voice.url : voice;
    var text = typeof voice === "object" && voice.text ? voice.text : null;
    _lastVoiceUrls[type] = url;

    animateSpeak();
    if (text) showThoughtBubble(text);
    if (isSnappedInHeader()) {
      setTimeout(function () { clearAnimClasses(); }, 1200);
      return;
    }

    try {
      _voiceAudio = new Audio(url);
      _voiceAudio.volume = getVoiceVolume();
      _voiceAudio.addEventListener("ended", function () { clearAnimClasses(); });
      _voiceAudio.addEventListener("error", function () { clearAnimClasses(); });
      _voiceAudio.play().catch(function () { clearAnimClasses(); });
    } catch (e) { clearAnimClasses(); }
  }

  function pickRandomVoice(pool, lastUrl) {
    if (!pool || !pool.length) return null;
    if (pool.length === 1) return pool[0];
    var pick;
    var attempts = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
      attempts++;
      var pickUrl = typeof pick === "object" && pick.url ? pick.url : pick;
    } while (pickUrl === lastUrl && attempts < 5);
    return pick;
  }

  function playSound(sound) {
    if (!isWindowVisiblyActive()) return;
    stopAll();

    if (isSnappedInHeader()) {
      playVoiceReaction(sound.type);
      return;
    }

    animateSfx(sound.type);

    try {
      _sfxAudio = new Audio(sound.url);
      _sfxAudio.volume = getSfxVolume();

      _sfxAudio.addEventListener("ended", function () {
        clearAnimClasses();
        setTimeout(function () {
          playVoiceReaction(sound.type);
        }, voiceDelay());
      });

      _sfxAudio.addEventListener("error", function () { clearAnimClasses(); });
      _sfxAudio.play().catch(function (e) {
        console.warn("[EazySFX] play blocked:", e.message);
        clearAnimClasses();
      });
    } catch (e) { clearAnimClasses(); }
  }

  function playSfx(force) {
    var data = getData();
    if (!data || !data.sounds || !data.sounds.length) return;
    if (!force) {
      if (!isEnabled()) return;
      if (!tryBecomeLeader()) return;
      if (Math.random() > PLAY_CHANCE) return;
    }

    var sound = pickRandom(data.sounds, _lastSoundUrl);
    if (!sound) return;
    _lastSoundUrl = sound.url;
    playSound(sound);
  }

  /* ── Scheduling ── */
  function scheduleNext() {
    if (_sfxTimer) clearTimeout(_sfxTimer);
    _sfxTimer = setTimeout(function () {
      playSfx();
      scheduleNext();
    }, randomInterval());
  }

  /* ── Visibility Handling ── */
  function onVisibilityChange() {
    if (!isWindowVisiblyActive()) {
      stopAll();
      if (_isLeader) releaseLeader();
    } else {
      tryBecomeLeader();
    }
  }

  function onWindowBlur() {
    stopAll();
    if (_isLeader) releaseLeader();
  }

  function onWindowFocus() {
    tryBecomeLeader();
  }

  /* ── Init ── */
  function init() {
    var data = getData();
    if (!data || !data.sounds || !data.sounds.length) return;

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("beforeunload", releaseLeader);

    tryBecomeLeader();
    startHeartbeat();
    scheduleNext();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EazySoundEffects = {
    play: function () { playSfx(true); },
    stop: stopAll,
    scheduleNext: scheduleNext,
    debug: function () {
      var d = getData();
      if (!d) { console.log("[EazySFX] No data found (missing #eazy-sfx-data)"); return; }
      console.log("[EazySFX] Tab ID:", _tabId);
      console.log("[EazySFX] Is leader:", _isLeader, "(" + (isCurrentLeader() ? "confirmed" : "not leader") + ")");
      console.log("[EazySFX] Visible:", document.visibilityState);
      console.log("[EazySFX] Icon free:", isIconFreeOnPage());
      console.log("[EazySFX] Sounds:", d.sounds ? d.sounds.length : 0);
      console.log("[EazySFX] Voice pools:", Object.keys(d.voices || {}).map(function (k) { return k + ":" + d.voices[k].length; }).join(", "));
      console.log("[EazySFX] Enabled:", isEnabled());
      console.log("[EazySFX] Sleep:", window.EazyBot ? window.EazyBot.isSleepTime() : "no bot");
    }
  };
})();
