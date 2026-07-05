/**
 * Daily Simon Says for Eazy Chat.
 * Exposes window.EazyDailySimonGame.mount(opts).
 */
(function (global) {
  "use strict";

  var PAD_COUNT = 9;

  function createSimonSynth(gameMeta) {
    var meta = gameMeta || {};
    var freqs = Array.isArray(meta.pad_freqs) && meta.pad_freqs.length >= PAD_COUNT
      ? meta.pad_freqs
      : [262, 294, 330, 349, 392, 440, 494, 523, 587];
    var instrument = meta.instrument || "piano";
    var ctx = null;

    function getCtx() {
      if (!ctx) {
        try {
          ctx = new (global.AudioContext || global.webkitAudioContext)();
        } catch (e) {
          ctx = null;
        }
      }
      return ctx;
    }

    function playTone(c, freq, dur, vol) {
      var t0 = c.currentTime;
      var g = c.createGain();
      g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      if (instrument === "organ" || instrument === "synth") {
        var o1 = c.createOscillator();
        var o2 = c.createOscillator();
        o1.type = instrument === "organ" ? "sine" : "sawtooth";
        o2.type = "sine";
        o1.frequency.value = freq;
        o2.frequency.value = freq * 2;
        o1.connect(g);
        o2.connect(g);
        o1.start(t0);
        o2.start(t0);
        o1.stop(t0 + dur + 0.03);
        o2.stop(t0 + dur + 0.03);
        return;
      }

      var o = c.createOscillator();
      if (instrument === "marimba" || instrument === "xylophone" || instrument === "harp") {
        o.type = "triangle";
      } else if (instrument === "bells") {
        o.type = "sine";
      } else if (instrument === "flute") {
        o.type = "sine";
      } else {
        o.type = "sine";
      }
      o.frequency.value = freq;
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }

    function tone(freq, dur, vol) {
      var c = getCtx();
      if (!c) return;
      try {
        if (c.state === "suspended") {
          c.resume().catch(function () {});
        }
        playTone(c, freq, dur, vol);
      } catch (e) {}
    }

    return {
      resume: function () {
        var c = getCtx();
        if (!c) return Promise.resolve();
        if (c.state === "suspended") return c.resume().catch(function () {});
        return Promise.resolve();
      },
      playColor: function (idx) {
        tone(freqs[idx] || 440, instrument === "bells" ? 0.18 : 0.14, 0.11);
      },
      playWrong: function () {
        tone(140, 0.22, 0.12);
      },
      playWin: function () {
        tone(523, 0.1, 0.09);
        setTimeout(function () {
          tone(784, 0.12, 0.08);
        }, 90);
      },
      dispose: function () {},
    };
  }

  function mount(opts) {
    var root = opts.root;
    var apiBase = opts.apiBase;
    var shop = opts.shop;
    var uid = opts.uid;
    var timing = opts.timing || {};
    var gameMeta = opts.gameMeta || {};
    var gm = opts.i18n || function (_k, fb) {
      return fb;
    };
    var onComplete = typeof opts.onComplete === "function" ? opts.onComplete : function () {};
    var footerMount = opts.footerMount && opts.footerMount.left ? opts.footerMount : null;

    var playMsPerRound = Number(timing.play_ms_per_round) || 10000;
    var flashMs = Number(timing.flash_ms) || 310;
    var gapMs = Number(timing.gap_ms) || 240;
    var introMs = Number(timing.intro_ms) || 1400;
    var roundBreakMs = Number(timing.round_break_ms) || 1200;
    var preloadMinMs = Number(timing.preload_min_ms) || 900;
    var deadlineMs = Number(timing.deadline_ms) || 0;
    var serverNow = Number(timing.server_now_ms) || Date.now();
    var skew = serverNow - Date.now();
    var targetRounds = Number(opts.targetRounds) || 7;
    var round = Number(opts.round) || 0;
    var playbackSteps = Array.isArray(opts.playbackSteps) ? opts.playbackSteps.slice() : [];
    var phase = opts.phase || "playback";
    var lootBoostPct = Number(opts.lootBoostPct) || 0;
    var canContinue = opts.canContinue !== false;
    var atOffer = phase === "offer";

    var audio = createSimonSynth(gameMeta);
    var lockPads = true;
    var submitted = false;
    var tapProcessing = false;
    var tapQueue = [];
    var timerId = null;
    var playbackTimerId = null;
    var pads = [];
    var padArts = [];
    var statusEl = null;
    var roundEl = null;
    var footerEl = null;
    var timerReadoutEl = null;
    var forfeitBtn = null;
    var offerActionsEl = null;
    var playActionsEl = null;
    var gridEl = null;
    var boardReady = false;
    var sessionStarted = false;
    var inputTapIndex = 0;

    function adjustedDeadline() {
      return deadlineMs + skew;
    }

    function clearTimersOnly() {
      if (timerId) clearInterval(timerId);
      timerId = null;
      if (playbackTimerId) clearTimeout(playbackTimerId);
      playbackTimerId = null;
    }

    function teardownUi() {
      clearTimersOnly();
      audio.dispose();
      global.__eazySimonGameCleanup = null;
      if (footerEl && footerEl.parentNode) {
        footerEl.parentNode.removeChild(footerEl);
      }
      root.innerHTML = "";
      root.hidden = true;
    }

    function postJson(body) {
      return fetch(apiBase + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          Object.assign({ owner_id: uid, shop: shop, game_slug: "simon_says" }, body || {})
        ),
      }).then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      });
    }

    function syncFlashCssVar() {
      if (gridEl) gridEl.style.setProperty("--simon-flash-ms", flashMs + "ms");
    }

    function syncOfferState(data) {
      if (!data) return;
      if (
        data.simon_status === "offer_continue" ||
        Number(data.simon_at_offer) === 1 ||
        data.simon_phase === "offer"
      ) {
        atOffer = true;
        phase = "offer";
        return;
      }
      if (
        data.simon_status === "playing" ||
        data.simon_status === "round_complete" ||
        data.simon_status === "your_turn" ||
        data.simon_status === "extension_start" ||
        data.simon_phase === "input" ||
        data.simon_phase === "playback"
      ) {
        atOffer = false;
      }
    }

    function resetInputTapIndex(count) {
      inputTapIndex = Math.max(0, Number(count) || 0);
    }

    function applyServerState(data) {
      if (data.simon_timing) {
        timing = data.simon_timing;
        playMsPerRound = Number(timing.play_ms_per_round) || playMsPerRound;
        flashMs = Number(timing.flash_ms) || flashMs;
        gapMs = Number(timing.gap_ms) || gapMs;
        introMs = Number(timing.intro_ms) || introMs;
        roundBreakMs = Number(timing.round_break_ms) || roundBreakMs;
        preloadMinMs = Number(timing.preload_min_ms) || preloadMinMs;
        deadlineMs = Number(timing.deadline_ms) || 0;
        serverNow = Number(timing.server_now_ms) || Date.now();
        skew = serverNow - Date.now();
        syncFlashCssVar();
      }
      if (data.simon_game) {
        gameMeta = data.simon_game;
        audio = createSimonSynth(gameMeta);
        refreshPadArt();
      }
      if (data.simon_target_rounds != null) targetRounds = Number(data.simon_target_rounds);
      if (data.simon_round != null) round = Number(data.simon_round);
      if (data.simon_playback_steps) playbackSteps = data.simon_playback_steps.slice();
      if (data.simon_phase) phase = data.simon_phase;
      if (data.simon_loot_boost_pct != null) lootBoostPct = Number(data.simon_loot_boost_pct) || 0;
      if (data.simon_can_continue != null) canContinue = Boolean(data.simon_can_continue);
      if (data.simon_tap_count != null) resetInputTapIndex(data.simon_tap_count);
      syncOfferState(data);
      updateRoundLabel();
      updateOfferUi();
    }

    function submitForfeit() {
      if (submitted || atOffer) return;
      submitted = true;
      global.__eazySimonGameCleanup = null;
      clearTimersOnly();
      tapQueue = [];
      postJson({ simon_action: "forfeit" })
        .then(function (data) {
          audio.playWrong();
          try {
            onComplete(data || { outcome: "loss", simon_reason: "forfeit" });
          } catch (e) {}
        })
        .catch(function () {
          try {
            onComplete({ outcome: "loss", simon_reason: "forfeit" });
          } catch (e2) {}
        })
        .finally(teardownUi);
    }

    global.__eazySimonGameCleanup = function () {
      if (!atOffer) submitForfeit();
    };

    function handleTerminal(data) {
      if (submitted) return;
      submitted = true;
      tapQueue = [];
      global.__eazySimonGameCleanup = null;
      clearTimersOnly();
      lockPads = true;
      if (data.outcome === "win") audio.playWin();
      else audio.playWrong();
      try {
        onComplete(data || {});
      } catch (e) {}
      setTimeout(teardownUi, data.outcome === "win" ? 450 : 250);
    }

    function triggerPadFlash(el, className) {
      if (!el) return;
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
      function onEnd(ev) {
        if (ev.animationName !== "eazy-simon-pad-flash" && ev.animationName !== "eazy-simon-pad-press") return;
        el.classList.remove(className);
        el.removeEventListener("animationend", onEnd);
      }
      el.addEventListener("animationend", onEnd);
    }

    function flashPadVisual(idx) {
      triggerPadFlash(pads[idx], "is-lit");
    }

    function pressPadVisual(idx) {
      triggerPadFlash(pads[idx], "is-pressed");
    }

    function flashPad(idx) {
      flashPadVisual(idx);
      audio.playColor(idx);
    }

    function preloadPadAssets(minMs) {
      var urls = [];
      var imgs = gameMeta.pad_images;
      if (Array.isArray(imgs)) {
        for (var u = 0; u < imgs.length; u += 1) {
          if (imgs[u]) urls.push(String(imgs[u]));
        }
      }
      return new Promise(function (resolve) {
        var started = Date.now();
        function finish() {
          var wait = Math.max(0, minMs - (Date.now() - started));
          window.setTimeout(resolve, wait);
        }
        if (!urls.length) {
          finish();
          return;
        }
        var pending = 0;
        urls.forEach(function (url) {
          pending += 1;
          var img = new Image();
          img.onload = img.onerror = function () {
            pending -= 1;
            if (pending <= 0) finish();
          };
          img.src = url;
        });
      });
    }

    function setBoardReady(ready) {
      boardReady = ready;
      if (gridEl) gridEl.classList.toggle("is-ready", ready);
    }

    function runPlayback(steps, done) {
      lockPads = true;
      clearTimersOnly();
      if (statusEl) {
        statusEl.textContent = gm("games_simon_watch", "Watch Eazy's sequence…");
      }
      var i = 0;
      function next() {
        if (submitted) return;
        if (i >= steps.length) {
          if (done) done();
          return;
        }
        flashPad(steps[i]);
        i += 1;
        playbackTimerId = window.setTimeout(next, flashMs + gapMs);
      }
      playbackTimerId = window.setTimeout(next, gapMs);
    }

    function startInputPhase() {
      postJson({ simon_action: "start_input" }).then(function (data) {
        if (!data || !data.ok) {
          if (data && data.outcome === "loss") handleTerminal(data);
          return;
        }
        applyServerState(data);
        phase = "input";
        atOffer = false;
        resetInputTapIndex(0);
        lockPads = false;
        if (statusEl) {
          statusEl.textContent = gm("games_simon_your_turn", "Your turn — repeat the sequence!");
        }
        startRoundTimer();
        updateOfferUi();
      });
    }

    function afterPlayback() {
      if (phase === "input" && deadlineMs > 0) {
        lockPads = false;
        if (statusEl) {
          statusEl.textContent = gm("games_simon_your_turn", "Your turn — repeat the sequence!");
        }
        startRoundTimer();
      } else {
        startInputPhase();
      }
    }

    function onRoundComplete(data) {
      applyServerState(data);
      lockPads = true;
      clearTimersOnly();
      if (statusEl) {
        statusEl.textContent = gm("games_simon_round_done", "Nice! Next round…");
      }
      window.setTimeout(function () {
        runPlayback(playbackSteps, afterPlayback);
      }, roundBreakMs);
    }

    function showContinueOffer(data) {
      applyServerState(data);
      phase = "offer";
      atOffer = true;
      lockPads = true;
      clearTimersOnly();
      global.__eazySimonGameCleanup = null;
      if (statusEl) {
        var nextBoost = lootBoostPct + 5;
        statusEl.textContent = gm(
          "games_simon_win_offer",
          "You won! Keep playing for +{{pct}}% better loot — or take your prize now."
        ).replace("{{pct}}", String(canContinue ? nextBoost : lootBoostPct));
      }
      updateOfferUi();
    }

    function claimWin() {
      if (submitted) return;
      submitted = true;
      lockPads = true;
      postJson({ simon_action: "claim_win" }).then(function (data) {
        if (data && data.outcome === "win") {
          handleTerminal(data);
          return;
        }
        submitted = false;
        lockPads = true;
      }).catch(function () {
        submitted = false;
      });
    }

    function continueGamble() {
      if (submitted || !canContinue) return;
      lockPads = true;
      atOffer = false;
      updateOfferUi();
      postJson({ simon_action: "continue_gamble" }).then(function (data) {
        if (!data || !data.ok) {
          if (data && data.outcome === "loss") handleTerminal(data);
          return;
        }
        applyServerState(data);
        phase = "playback";
        atOffer = false;
        if (statusEl) {
          statusEl.textContent = gm("games_simon_extension_start", "Keep going — watch the next sequence!");
        }
        updateOfferUi();
        window.setTimeout(function () {
          resetInputTapIndex(0);
          runPlayback(playbackSteps, afterPlayback);
        }, Math.min(roundBreakMs, 700));
      });
    }

    function handleTapResponse(data) {
      if (data && (data.outcome === "loss" || data.outcome === "win")) {
        handleTerminal(data);
        return;
      }
      if (!data || !data.ok) {
        return;
      }
      if (data.simon_status === "offer_continue") {
        showContinueOffer(data);
        return;
      }
      if (data.simon_status === "round_complete") {
        resetInputTapIndex(0);
        onRoundComplete(data);
        return;
      }
      applyServerState(data);
      if (phase === "input" && deadlineMs > 0) startRoundTimer();
    }

    function reportWrongTap(idx) {
      if (submitted) return;
      submitted = true;
      tapQueue = [];
      tapProcessing = false;
      clearTimersOnly();
      lockPads = true;
      audio.playWrong();
      postJson({ simon_action: "tap", color: idx })
        .then(function (data) {
          handleTerminal(
            data && (data.outcome === "loss" || data.outcome === "win")
              ? data
              : { outcome: "loss", simon_reason: "wrong_color" }
          );
        })
        .catch(function () {
          handleTerminal({ outcome: "loss", simon_reason: "wrong_color" });
        });
    }

    function processTapQueue() {
      if (tapProcessing || !tapQueue.length || submitted || atOffer) return;
      tapProcessing = true;
      var idx = tapQueue.shift();
      postJson({ simon_action: "tap", color: idx })
        .then(function (data) {
          handleTapResponse(data);
        })
        .catch(function () {})
        .finally(function () {
          tapProcessing = false;
          if (phase === "input" && !submitted && !atOffer && deadlineMs > 0) {
            startRoundTimer();
          }
          processTapQueue();
        });
    }

    function onPadClick(idx) {
      if (!boardReady || submitted || phase !== "input" || atOffer) return;
      var expected = playbackSteps[inputTapIndex];
      if (expected !== idx) {
        pressPadVisual(idx);
        reportWrongTap(idx);
        return;
      }
      inputTapIndex += 1;
      pressPadVisual(idx);
      audio.playColor(idx);
      tapQueue.push(idx);
      clearTimersOnly();
      processTapQueue();
    }

    function renderTimer() {
      if (!timerReadoutEl || phase !== "input" || !deadlineMs || atOffer) return;
      var secLeft = Math.max(0, Math.ceil((adjustedDeadline() - Date.now()) / 1000));
      timerReadoutEl.textContent = secLeft + "s";
      timerReadoutEl.classList.toggle("eazy-simon__timer-readout--danger", secLeft <= 5);
      if (secLeft <= 0 && !submitted && !tapProcessing && !tapQueue.length) {
        submitForfeit();
      }
    }

    function startRoundTimer() {
      renderTimer();
      if (!timerId) timerId = setInterval(renderTimer, 200);
    }

    function updateRoundLabel() {
      if (roundEl) {
        roundEl.textContent = gm("games_simon_round_label", "Round {{r}} of {{t}}")
          .replace("{{r}}", String(round + 1))
          .replace("{{t}}", String(targetRounds));
      }
    }

    function updateOfferUi() {
      if (!footerEl) return;
      var inOffer = atOffer && !submitted;
      if (offerActionsEl) offerActionsEl.hidden = !inOffer;
      if (playActionsEl) playActionsEl.hidden = inOffer;
      if (roundEl) roundEl.hidden = inOffer;
      if (offerActionsEl) {
        var continueBtn = offerActionsEl.querySelector(".eazy-simon__offer-btn--continue");
        if (continueBtn) continueBtn.disabled = !canContinue;
      }
    }

    function padColor(idx) {
      var colors = gameMeta.colors;
      return colors && colors[idx] ? colors[idx] : "";
    }

    function padImageUrl(idx) {
      var imgs = gameMeta.pad_images;
      return imgs && imgs[idx] ? imgs[idx] : "";
    }

    function refreshPadArt() {
      for (var i = 0; i < pads.length; i += 1) {
        if (pads[i] && pads[i].style) {
          var bg = padColor(i);
          if (bg) pads[i].style.background = bg;
        }
        if (padArts[i]) {
          var url = padImageUrl(i);
          padArts[i].src = url || "";
          padArts[i].hidden = !url;
        }
      }
    }

    root.hidden = false;
    root.innerHTML = "";
    pads = [];
    padArts = [];
    var wrap = document.createElement("div");
    wrap.className = "eazy-simon";

    var grid = document.createElement("div");
    grid.className = "eazy-simon__grid";
    gridEl = grid;
    syncFlashCssVar();
    for (var c = 0; c < PAD_COUNT; c += 1) {
      (function (idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "eazy-simon__pad";
        btn.setAttribute("aria-label", "Pad " + (idx + 1));
        var bg = padColor(idx);
        if (bg) btn.style.background = bg;
        var art = document.createElement("img");
        art.className = "eazy-simon__pad-art";
        art.alt = "";
        art.draggable = false;
        art.decoding = "async";
        var url = padImageUrl(idx);
        if (url) art.src = url;
        else art.hidden = true;
        btn.appendChild(art);
        btn.addEventListener("pointerdown", function (e) {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.preventDefault();
          onPadClick(idx);
        });
        pads.push(btn);
        padArts.push(art);
        grid.appendChild(btn);
      })(c);
    }
    wrap.appendChild(grid);
    root.appendChild(wrap);

    if (footerMount && footerMount.left) {
      footerEl = document.createElement("div");
      footerEl.className = "eazy-simon__footer";

      var metaEl = document.createElement("div");
      metaEl.className = "eazy-simon__footer-meta";
      roundEl = document.createElement("p");
      roundEl.className = "eazy-simon__round";
      metaEl.appendChild(roundEl);
      updateRoundLabel();
      statusEl = document.createElement("p");
      statusEl.className = "eazy-simon__status";
      metaEl.appendChild(statusEl);
      footerEl.appendChild(metaEl);

      offerActionsEl = document.createElement("div");
      offerActionsEl.className = "eazy-simon__offer-actions";
      offerActionsEl.hidden = true;

      var takeWinBtn = document.createElement("button");
      takeWinBtn.type = "button";
      takeWinBtn.className = "eazy-simon__offer-btn eazy-simon__offer-btn--take";
      takeWinBtn.textContent = gm("games_simon_take_win", "Take prize");
      takeWinBtn.addEventListener("click", claimWin);
      offerActionsEl.appendChild(takeWinBtn);

      var continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "eazy-simon__offer-btn eazy-simon__offer-btn--continue";
      continueBtn.textContent = gm("games_simon_continue", "Keep playing");
      continueBtn.addEventListener("click", continueGamble);
      offerActionsEl.appendChild(continueBtn);

      footerEl.appendChild(offerActionsEl);

      var actionsEl = document.createElement("div");
      actionsEl.className = "eazy-simon__footer-actions";
      playActionsEl = actionsEl;
      var timerWrap = document.createElement("div");
      timerWrap.className = "eazy-simon__timer";
      var timerLabel = document.createElement("span");
      timerLabel.className = "eazy-simon__timer-label";
      timerLabel.textContent = gm("games_simon_timer", "Time left");
      timerReadoutEl = document.createElement("span");
      timerReadoutEl.className = "eazy-simon__timer-readout";
      timerWrap.appendChild(timerLabel);
      timerWrap.appendChild(timerReadoutEl);
      actionsEl.appendChild(timerWrap);
      forfeitBtn = document.createElement("button");
      forfeitBtn.type = "button";
      forfeitBtn.className = "eazy-simon__forfeit";
      forfeitBtn.textContent = gm("games_simon_forfeit", "Give up");
      forfeitBtn.addEventListener("click", submitForfeit);
      actionsEl.appendChild(forfeitBtn);
      footerEl.appendChild(actionsEl);

      footerMount.left.appendChild(footerEl);
      updateOfferUi();
    }

    function startSimonSession() {
      if (sessionStarted) return;
      sessionStarted = true;
      if (atOffer) {
        setBoardReady(true);
        showContinueOffer({
          simon_phase: "offer",
          simon_status: "offer_continue",
          simon_loot_boost_pct: lootBoostPct,
          simon_can_continue: canContinue,
          simon_round: round,
          simon_target_rounds: targetRounds,
        });
        return;
      }
      setBoardReady(false);
      if (statusEl) {
        statusEl.textContent = gm("games_simon_get_ready", "Get ready…");
      }
      Promise.resolve()
        .then(function () {
          return audio.resume();
        })
        .then(function () {
          return preloadPadAssets(preloadMinMs);
        })
        .then(function () {
          if (submitted) return;
          setBoardReady(true);
          return new Promise(function (resolve) {
            window.setTimeout(resolve, introMs);
          });
        })
        .then(function () {
          if (submitted || atOffer) return;
          if (phase === "input" && deadlineMs > 0) {
            lockPads = false;
            if (statusEl) {
              statusEl.textContent = gm("games_simon_your_turn", "Your turn — repeat the sequence!");
            }
            startRoundTimer();
          } else {
            runPlayback(playbackSteps, afterPlayback);
          }
        });
    }

    if (atOffer) {
      setBoardReady(true);
      sessionStarted = true;
      showContinueOffer({
        simon_phase: "offer",
        simon_status: "offer_continue",
        simon_loot_boost_pct: lootBoostPct,
        simon_can_continue: canContinue,
        simon_round: round,
        simon_target_rounds: targetRounds,
      });
    } else if (phase === "input" && deadlineMs > 0) {
      setBoardReady(true);
      sessionStarted = true;
      atOffer = false;
      resetInputTapIndex(0);
      lockPads = false;
      if (statusEl) {
        statusEl.textContent = gm("games_simon_your_turn", "Your turn — repeat the sequence!");
      }
      startRoundTimer();
    } else {
      startSimonSession();
    }
  }

  global.EazyDailySimonGame = { mount: mount };
})(window);
