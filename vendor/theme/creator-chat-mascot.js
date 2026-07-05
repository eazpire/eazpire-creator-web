/**
 * Eazy Chat Mascot – Thought/Speech Bubbles (powered by EazyBot Engine)
 * Shows contextual bubble messages based on user state, time, auth, location
 * Sleep mode: dream thought bubbles (purple, italic, slower pace)
 * Awake mode: normal speech bubbles (white, 45-60 min cooldown)
 * Depends on: eazy-bot.js (window.EazyBot) loaded first
 */
(function () {
  "use strict";

  var MIN_COOLDOWN = 45 * 60 * 1000;
  var MAX_COOLDOWN = 60 * 60 * 1000;
  var BUBBLE_SHOW_MS = 6000;
  var WAKE_DURATION = 4500;

  var DREAM_MIN_COOLDOWN = 2 * 60 * 1000;
  var DREAM_MAX_COOLDOWN = 4 * 60 * 1000;
  var DREAM_SHOW_MS = 8000;

  function _freqMul(key) {
    return window.EazySettings ? window.EazySettings.getFrequencyMultiplier(key) : 1;
  }
  function _msgOk(key) {
    return window.EazySettings ? window.EazySettings.isMessageTypeEnabled(key) : true;
  }
  function _moodOk(tags) {
    return window.EazySettings ? window.EazySettings.isMoodTagAllowed(tags) : true;
  }

  function randomCooldown() {
    var base = MIN_COOLDOWN + Math.random() * (MAX_COOLDOWN - MIN_COOLDOWN);
    return base * _freqMul("frequency_mascot_bubbles");
  }

  function randomDreamCooldown() {
    var base = DREAM_MIN_COOLDOWN + Math.random() * (DREAM_MAX_COOLDOWN - DREAM_MIN_COOLDOWN);
    return base * _freqMul("frequency_dream_bubbles");
  }

  function setDreamMode(el, isDream) {
    if (!el) return;
    if (isDream) {
      el.classList.add("eazy-thought--dream");
    } else {
      el.classList.remove("eazy-thought--dream");
    }
  }

  function showBubble(text, isDream) {
    if (window.__eaz_mode_active || window.__eaz_guide_active) return;
    var el = document.getElementById("eazy-thought");
    if (!el) return;
    var textEl = el.querySelector(".eazy-thought-text");
    if (textEl) textEl.textContent = text;
    setDreamMode(el, !!isDream);
    el.classList.add("show");
  }

  function hideBubble() {
    var el = document.getElementById("eazy-thought");
    if (!el) return;
    el.classList.remove("show");
    setTimeout(function () {
      el.classList.remove("eazy-thought--dream");
    }, 300);
  }

  function init() {
    var btn = document.getElementById("creator-chat-toggle");
    if (!btn || !btn.classList.contains("creator-chat__toggle--custom-icon")) return;

    var bot = window.EazyBot;
    var sleepTimeout = null;
    var phraseTimeout = null;
    var isAwake = false;

    var _lastGiftHintTs = 0;
    var GIFT_HINT_COOLDOWN = 90 * 60 * 1000; // max once per 90 min

    function tryGiftHintBubble() {
      if (Date.now() - _lastGiftHintTs < GIFT_HINT_COOLDOWN) return false;
      var pool = window.EazyGiftPool;
      if (!pool || typeof pool.getPoolGifts !== "function") return false;
      var gifts = pool.getPoolGifts();
      if (!gifts || gifts.length === 0) return false;

      var hints = window.EAZY_GIFT_HINTS || [
        "Schau mal in deine Benachrichtigungen – da wartet ein Geschenk!",
        "Psst… ein Geschenk wartet auf dich!",
        "Du hast ungeöffnete Geschenke!",
        "Eazy hat etwas für dich bereit!"
      ];
      var text = hints[Math.floor(Math.random() * hints.length)];
      showBubble(text, false);
      _lastGiftHintTs = Date.now();
      setTimeout(hideBubble, BUBBLE_SHOW_MS);
      return true;
    }

    function scheduleNextBubble() {
      if (isAwake) return;
      if (phraseTimeout) clearTimeout(phraseTimeout);

      var sleeping = bot && bot.isSleepTime();
      var cooldown = sleeping ? randomDreamCooldown() : randomCooldown();
      var showDuration = sleeping ? DREAM_SHOW_MS : BUBBLE_SHOW_MS;

      phraseTimeout = setTimeout(function () {
        if (isAwake) return;

        // ~20 % chance to show a gift hint instead of a normal message
        if (!sleeping && Math.random() < 0.2 && tryGiftHintBubble()) {
          scheduleNextBubble();
          return;
        }

        var isSleep = bot && bot.isSleepTime();
        var typeKey = isSleep ? "messages_dream_bubbles" : "messages_mascot_bubbles";
        if (!_msgOk(typeKey)) { scheduleNextBubble(); return; }

        var msg = bot ? bot.pickMessage("bubble") : null;
        if (msg && !_moodOk(msg.tags)) msg = null;
        if (msg) {
          showBubble(msg.text, isSleep);
          if (!isSleep && window.playEazyVoice) window.playEazyVoice(msg.id);
          if (bot) {
            bot.logMessageShown("bubble", msg.id, bot.getContext());
          }
          setTimeout(hideBubble, showDuration);
        }

        scheduleNextBubble();
      }, cooldown);
    }

    function showWakeBubble() {
      isAwake = true;
      if (phraseTimeout) {
        clearTimeout(phraseTimeout);
        phraseTimeout = null;
      }
      hideBubble();

      if (!_msgOk("messages_chat_greeting")) return;

      if (bot) {
        var msg = bot.pickMessage("chat_open");
        if (msg && !_moodOk(msg.tags)) msg = null;
        if (msg) {
          var short = msg.text.replace(/\*\*/g, "");
          if (short.length > 60) short = short.substring(0, 57) + "...";
          showBubble(short, false);
        }
      } else {
        var i18n = window.EAZY_I18N;
        var wakeText = (i18n && i18n.wake) || "Oh! I'm awake!";
        showBubble(wakeText, false);
      }
    }

    function returnToSleep() {
      isAwake = false;
      if (sleepTimeout) {
        clearTimeout(sleepTimeout);
        sleepTimeout = null;
      }
      hideBubble();
      scheduleNextBubble();
    }

    btn.addEventListener("click", function () {
      showWakeBubble();
      if (sleepTimeout) clearTimeout(sleepTimeout);
      sleepTimeout = setTimeout(returnToSleep, WAKE_DURATION);
    });

    if (document.body) {
      document.body.addEventListener("creator-chat-close", function () {
        returnToSleep();
      });
    }

    if (btn.classList.contains("creator-chat-icon--sleeping")) {
      scheduleNextBubble();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CreatorChatMascot = { init: init, showBubble: showBubble, hideBubble: hideBubble };
})();
