/**
 * Daily memory mini-game for Eazy Chat (deterministic deck from worker).
 * Exposes window.EazyDailyMemoryGame.mount(opts).
 *
 * Audio: lightweight Web Audio synth (no asset files). Match/mismatch/timer SFX only.
 * Autoplay policy: context resumes on Start / first flip after peek where needed.
 */
(function (global) {
  "use strict";

  function preventCaptureEv(e) {
    e.preventDefault();
  }

  /** UI sounds only (no external files, no background pad). */
  function createEazyMemorySynthAudio() {
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

    function stopAmbient() {}

    function resume() {
      var c = getCtx();
      if (!c) return Promise.resolve();
      if (c.state === "suspended") return c.resume().catch(function () {});
      return Promise.resolve();
    }

    function startAmbient() {}

    function scheduleTone(startT, freq, dur, peakVol, type, freqEnd) {
      var c = getCtx();
      if (!c || c.state !== "running") return;
      var o = c.createOscillator();
      o.type = type || "sine";
      var g = c.createGain();
      var t = Math.max(startT, c.currentTime);
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd != null && freqEnd > 0) {
        o.frequency.exponentialRampToValueAtTime(Math.max(45, freqEnd), t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peakVol, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.04);
    }

    function playMatch() {
      var c = getCtx();
      if (!c || c.state !== "running") return;
      var t = c.currentTime;
      scheduleTone(t, 523.25, 0.055, 0.11, "sine");
      scheduleTone(t + 0.048, 783.99, 0.085, 0.095, "sine");
      scheduleTone(t + 0.095, 1046.5, 0.062, 0.065, "sine");
    }

    function playMismatch() {
      var c = getCtx();
      if (!c || c.state !== "running") return;
      scheduleTone(c.currentTime, 210, 0.145, 0.13, "triangle", 95);
    }

    function playSoftTick() {
      var c = getCtx();
      if (!c || c.state !== "running") return;
      scheduleTone(c.currentTime, 2650, 0.022, 0.038, "square");
    }

    /** Last-full-second pings: secLeft 3, 2, 1 as deadline approaches. */
    function playCountPing(secLeft) {
      var c = getCtx();
      if (!c || c.state !== "running") return;
      var base = secLeft === 3 ? 392 : secLeft === 2 ? 523.25 : 659.25;
      scheduleTone(c.currentTime, base, 0.11, 0.14, "sine");
      scheduleTone(c.currentTime + 0.05, base * 1.25, 0.07, 0.055, "sine");
    }

    function dispose() {
      stopAmbient();
    }

    return {
      resume: resume,
      startAmbient: startAmbient,
      stopAmbient: stopAmbient,
      playMatch: playMatch,
      playMismatch: playMismatch,
      playSoftTick: playSoftTick,
      playCountPing: playCountPing,
      dispose: dispose,
      getState: function () {
        var c = getCtx();
        return c ? c.state : "unsupported";
      },
    };
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.root
   * @param {string} opts.apiBase
   * @param {string} opts.shop
   * @param {string} opts.uid
   * @param {object} opts.deck — { slot_pair_keys: number[], images: string[], pairs: number }
   * @param {object} [opts.timing]
   * @param {boolean} [opts.pregame] — board visible covered; user starts via primary button
   * @param {function(string,string):string} [opts.i18n]
   * @param {function(object):void} [opts.onComplete] — receives parsed JSON from finish POST
   * @param {object} [opts.footerMount] — optional { left: HTMLElement, strikes: HTMLElement } for chat widget footer layout
   * @param {HTMLElement} [opts.timerMount] — optional host for progress bar + readout (e.g. games subheader below prize)
   */
  function mount(opts) {
    var root = opts.root;
    var apiBase = opts.apiBase;
    var shop = opts.shop;
    var uid = opts.uid;
    var gm =
      opts.i18n ||
      function (_k, fb) {
        return fb;
      };
    var onComplete =
      opts.onComplete ||
      function () {};

    var audio = createEazyMemorySynthAudio();

    var deck = opts.deck || {};
    var timing = opts.timing || {};
    var footerMount =
      opts.footerMount &&
      opts.footerMount.left &&
      opts.footerMount.strikes
        ? opts.footerMount
        : null;

    var timerMount =
      opts.timerMount && opts.timerMount.nodeType === 1 ? opts.timerMount : null;

    var slotPairKeys = deck.slot_pair_keys || [];
    var images = deck.images || [];
    var n = slotPairKeys.length;
    var matchFlipMs = Number(timing.match_flip_ms) || 850;
    var maxWrongMoves = Number(timing.max_wrong_moves);
    if (!Number.isFinite(maxWrongMoves) || maxWrongMoves < 1) maxWrongMoves = 5;
    maxWrongMoves = Math.min(20, Math.floor(maxWrongMoves));

    var playSegmentMs = Number(timing.play_ms);
    if (!Number.isFinite(playSegmentMs) || playSegmentMs < 5000) playSegmentMs = 52000;
    playSegmentMs = Math.min(600000, playSegmentMs);

    var wmInit = Number(timing.memory_wrong_moves);
    var wrongMoves =
      Number.isFinite(wmInit) && wmInit > 0 ? Math.min(maxWrongMoves, Math.floor(wmInit)) : 0;

    var syncChain = Promise.resolve();

    function syncFlipStateAfterMismatch() {
      if (submitted) return;
      var payloadLog = flipLog.slice();
      syncChain = syncChain.then(function () {
        if (submitted) return null;
        return fetch(apiBase + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            owner_id: uid,
            shop: shop,
            memory_action: "sync_flip",
            memory_flip_log: payloadLog,
          }),
        })
          .then(function (r) {
            return r.json().catch(function () {
              return {};
            });
          })
          .then(function (data) {
            if (submitted || !data) return;
            if (data.outcome === "loss") {
              submitted = true;
              global.__eazyMemoryGameCleanup = null;
              clearTimersOnly();
              audio.stopAmbient();
              try {
                onComplete(data || {});
              } catch (e1) {}
              teardownUi();
              return;
            }
            if (data.already_played) {
              submitted = true;
              global.__eazyMemoryGameCleanup = null;
              clearTimersOnly();
              audio.stopAmbient();
              try {
                onComplete(data || {});
              } catch (e2) {}
              teardownUi();
              return;
            }
            if (data.ok && data.memory_wrong_moves != null) {
              var srv = Number(data.memory_wrong_moves);
              if (Number.isFinite(srv)) {
                wrongMoves = Math.min(maxWrongMoves, Math.max(0, Math.floor(srv)));
                refreshStrikeDots();
              }
            }
          })
          .catch(function () {});
      });
    }

    var previewGrace = Number(timing.preview_grace_ms) || 5000;
    var deadlineMs = Number(timing.deadline_ms) || Date.now() + 120000;
    var serverNow = Number(timing.server_now_ms) || Date.now();
    var skew = serverNow - Date.now();
    var pregame = opts.pregame === true;
    var playStarted = timing.play_started === true;

    var flipLog = [];
    var matched = {};
    var lockBoard = false;
    var firstPick = null;
    var previewPhase = false;
    var timerId = null;
    var previewTimerId = null;
    var submitted = false;
    var gameStarted = !pregame;
    var wrap = null;

    /** HUD clock SFX state */
    var lastHudCeilSec = null;
    var lastClockPulseAt = 0;

    function resetHudSoundState() {
      lastHudCeilSec = null;
      lastClockPulseAt = 0;
    }

    function adjustedDeadline() {
      return deadlineMs + skew;
    }

    function applyTimingFromServer(timingPayload) {
      if (!timingPayload) return;
      if (timingPayload.deadline_ms != null && Number(timingPayload.deadline_ms) > 0) {
        deadlineMs = Number(timingPayload.deadline_ms);
        serverNow = Number(timingPayload.server_now_ms) || Date.now();
        skew = serverNow - Date.now();
        playStarted = true;
      }
      if (timingPayload.play_ms != null && Number(timingPayload.play_ms) > 0) {
        playSegmentMs = Math.min(600000, Number(timingPayload.play_ms));
      }
    }

    function postStartPlay(cb) {
      fetch(apiBase + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          owner_id: uid,
          shop: shop,
          memory_action: "start_play",
        }),
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function (data) {
          if (data && data.ok && data.memory_timing) {
            applyTimingFromServer(data.memory_timing);
          }
          cb(Boolean(data && data.ok));
        })
        .catch(function () {
          cb(false);
        });
    }

    function ensurePlayStarted(cb) {
      if (playStarted) {
        cb(true);
        return;
      }
      postStartPlay(cb);
    }

    function matchedCount() {
      var mc = 0;
      for (var k in matched) {
        if (Object.prototype.hasOwnProperty.call(matched, k)) mc++;
      }
      return mc;
    }

    function isBoardComplete() {
      return matchedCount() >= n;
    }

    function maybePlayDeadlineSounds(remMs) {
      if (submitted || previewPhase) return;
      if (remMs <= 0) return;
      var now = Date.now();

      if (remMs <= 5000) {
        if (now - lastClockPulseAt >= 248) {
          lastClockPulseAt = now;
          audio.playSoftTick();
        }
      }

      var ceilSec = Math.ceil(remMs / 1000);
      if (lastHudCeilSec !== null && ceilSec !== lastHudCeilSec && ceilSec >= 1 && ceilSec <= 3) {
        audio.playCountPing(ceilSec);
      }
      lastHudCeilSec = ceilSec;
    }

    function clearTimersOnly() {
      if (timerId) clearInterval(timerId);
      timerId = null;
      if (previewTimerId) clearTimeout(previewTimerId);
      previewTimerId = null;
      resetHudSoundState();
    }

    function removeProtection() {
      if (!wrap) return;
      wrap.classList.remove("eazy-memory--protected");
      wrap.removeEventListener("contextmenu", preventCaptureEv);
      wrap.removeEventListener("dragstart", preventCaptureEv);
    }

    function applyProtection() {
      if (!wrap) return;
      wrap.classList.add("eazy-memory--protected");
      wrap.addEventListener("contextmenu", preventCaptureEv, { passive: false });
      wrap.addEventListener("dragstart", preventCaptureEv, { passive: false });
    }

    function teardownUi() {
      clearTimersOnly();
      audio.dispose();
      global.__eazyMemoryTimersAbort = null;
      removeProtection();
      if (footerMount) {
        try {
          if (primaryBtn && primaryBtn.parentNode) primaryBtn.parentNode.removeChild(primaryBtn);
        } catch (e) {}
        try {
          if (strikesEl && strikesEl.parentNode) strikesEl.parentNode.removeChild(strikesEl);
        } catch (e2) {}
        try {
          if (footerMount.strikes) footerMount.strikes.hidden = true;
        } catch (e3) {}
      }
      if (timerMount) {
        try {
          if (timerWrap && timerWrap.parentNode === timerMount) {
            timerMount.removeChild(timerWrap);
          }
          timerMount.hidden = true;
        } catch (e4) {}
      }
      root.innerHTML = "";
      root.hidden = true;
      wrap = null;
    }

    function imgUrlForSlot(i) {
      var pk = slotPairKeys[i];
      return images[pk] || "";
    }

    function submitFinish(forfeit) {
      if (submitted) return;
      submitted = true;
      global.__eazyMemoryGameCleanup = null;
      clearTimersOnly();
      audio.stopAmbient();

      fetch(apiBase + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          owner_id: uid,
          shop: shop,
          memory_action: "finish",
          memory_forfeit: !!forfeit,
          memory_flip_log: forfeit ? [] : flipLog,
        }),
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        })
        .then(function (data) {
          try {
            onComplete(data || {});
          } catch (e) {}
        })
        .catch(function () {
          try {
            onComplete({});
          } catch (e) {}
        })
        .finally(function () {
          teardownUi();
        });
    }

    global.__eazyMemoryGameCleanup = function () {
      submitFinish(true);
    };

    root.hidden = false;
    root.innerHTML = "";

    wrap = document.createElement("div");
    wrap.className = "eazy-memory";

    var hud = document.createElement("div");
    hud.className = "eazy-memory__hud";

    var timerRow = document.createElement("div");
    timerRow.className = "eazy-memory__timer-row";

    var timerWrap = document.createElement("div");
    timerWrap.className = "eazy-memory__timer";
    timerWrap.setAttribute(
      "aria-label",
      gm("games_memory_timer_hint", "Beat the clock — memorize quickly.")
    );

    var progressTrack = document.createElement("div");
    progressTrack.className = "eazy-memory__progress-track";
    progressTrack.setAttribute("aria-hidden", "true");

    var progressFill = document.createElement("div");
    progressFill.className = "eazy-memory__progress-fill";

    progressTrack.appendChild(progressFill);

    var readoutEl = document.createElement("div");
    readoutEl.className = "eazy-memory__timer-readout";

    timerWrap.appendChild(progressTrack);
    timerWrap.appendChild(readoutEl);

    var strikesEl = document.createElement("div");
    strikesEl.className = "eazy-memory__strikes";
    strikesEl.setAttribute("role", "img");
    strikesEl.setAttribute(
      "aria-label",
      gm("games_memory_strikes_aria", "Wrong guesses remaining — each flame goes out after a non-matching pair.")
    );

    var strikeDots = [];
    for (var si = 0; si < maxWrongMoves; si++) {
      var st = document.createElement("span");
      st.className = "eazy-memory__strike";
      st.setAttribute("aria-hidden", "true");
      var flame = document.createElement("span");
      flame.className = "eazy-memory__strike-flame";
      st.appendChild(flame);
      var core = document.createElement("span");
      core.className = "eazy-memory__strike-core";
      st.appendChild(core);
      strikesEl.appendChild(st);
      strikeDots.push(st);
    }

    function refreshStrikeDots() {
      for (var di = 0; di < strikeDots.length; di++) {
        strikeDots[di].classList.toggle("is-spent", di < wrongMoves);
      }
    }

    function syncFooterStrikesVisibility() {
      if (footerMount && footerMount.strikes) {
        footerMount.strikes.hidden = strikesEl.hidden;
      }
    }

    if (footerMount) {
      footerMount.strikes.appendChild(strikesEl);
    }

    if (pregame && !gameStarted) {
      strikesEl.hidden = true;
      strikesEl.setAttribute("aria-hidden", "true");
    }

    syncFooterStrikesVisibility();

    var phaseEl = document.createElement("div");
    phaseEl.className = "eazy-memory__phase";
    phaseEl.setAttribute("data-t", "eazy_chat.games_memory_preview_hint");

    var actions = document.createElement("div");
    actions.className = "eazy-memory__actions";

    var primaryBtn = document.createElement("button");
    primaryBtn.type = "button";
    primaryBtn.className = "eazy-memory__primary";

    var grid = document.createElement("div");
    grid.className = "eazy-memory__grid";

    var cols = n <= 8 ? 4 : 4;
    grid.style.setProperty("--eazy-memory-cols", String(Math.min(cols, n)));

    function cellEl(slot) {
      return grid.querySelector('.eazy-memory__card[data-slot="' + String(slot) + '"]');
    }

    function updatePrimaryLabel() {
      if (!gameStarted) {
        primaryBtn.textContent = gm("games_play", "Start game");
        primaryBtn.setAttribute("data-t", "eazy_chat.games_play");
      } else {
        primaryBtn.textContent = gm("games_memory_forfeit", "Give up");
        primaryBtn.setAttribute("data-t", "eazy_chat.games_memory_forfeit");
      }
    }

    function setTimerFrozenUi(on) {
      timerWrap.classList.toggle("eazy-memory__timer--frozen", !!on);
    }

    function updateProgressUi(remMs, opts2) {
      opts2 = opts2 || {};
      var frozen = !!opts2.frozen;
      var activePlay = !!opts2.activePlay;

      setTimerFrozenUi(frozen);

      if (!gameStarted && pregame) {
        progressFill.style.transform = "scaleX(0)";
        readoutEl.textContent = gm("games_memory_pregame_timer", "Ready when you are");
        timerWrap.classList.remove("eazy-memory__timer--danger");
        timerWrap.classList.remove("eazy-memory__timer--frozen");
        timerWrap.removeAttribute("role");
        return;
      }

      timerWrap.setAttribute("role", "timer");

      if (frozen) {
        progressFill.style.transform = "scaleX(1)";
        readoutEl.textContent = gm("games_memory_preview_timer_frozen", "Timer starts after peek");
        timerWrap.classList.remove("eazy-memory__timer--danger");
        return;
      }

      if (!activePlay) return;

      var rm = Math.max(0, remMs);
      var secShown = Math.max(0, Math.ceil(rm / 1000));
      var p = playSegmentMs > 0 ? rm / playSegmentMs : 0;
      if (p > 1) p = 1;
      progressFill.style.transform = "scaleX(" + String(Math.min(1, Math.max(0, p))) + ")";
      readoutEl.textContent =
        gm("games_memory_timer", "Time left") + ": " + String(secShown) + "s";
      timerWrap.setAttribute("aria-valuenow", String(secShown));
      timerWrap.setAttribute("aria-valuemin", "0");
      timerWrap.setAttribute(
        "aria-valuemax",
        String(Math.max(1, Math.ceil(playSegmentMs / 1000)))
      );

      timerWrap.classList.toggle("eazy-memory__timer--danger", rm <= 5000 && rm > 0);
    }

    function unlockAudio() {
      audio.resume();
    }

    function startHudTimer() {
      resetHudSoundState();
      unlockAudio();

      function tick() {
        var rem = adjustedDeadline() - Date.now();
        if (rem <= 0) {
          if (timerId) clearInterval(timerId);
          timerId = null;
          progressFill.style.transform = "scaleX(0)";
          readoutEl.textContent = gm("games_memory_time_up", "Time's up!");
          timerWrap.classList.add("eazy-memory__timer--danger");
          submitFinish(false);
          return;
        }
        updateProgressUi(rem, { frozen: false, activePlay: true });
        maybePlayDeadlineSounds(rem);
      }
      tick();
      timerId = setInterval(tick, 160);
    }

    function endPreview() {
      previewPhase = false;
      phaseEl.textContent = "";
      var cells = grid.querySelectorAll(".eazy-memory__card");
      for (var i = 0; i < cells.length; i++) {
        if (!matched[i]) cells[i].classList.remove("is-open");
      }
      resetHudSoundState();
      updateProgressUi(playSegmentMs, { frozen: false, activePlay: true });
      unlockAudio();
      startHudTimer();
    }

    function runAfterPlayStarted(fn) {
      ensurePlayStarted(function (ok) {
        if (!ok || submitted) return;
        fn();
      });
    }

    function beginPlay() {
      if (gameStarted) return;
      runAfterPlayStarted(function () {
        gameStarted = true;
        applyProtection();
        updatePrimaryLabel();
        strikesEl.hidden = false;
        strikesEl.removeAttribute("aria-hidden");
        refreshStrikeDots();
        syncFooterStrikesVisibility();

        audio.resume();

        if (previewGrace > 0) {
          previewPhase = true;
          resetHudSoundState();
          updateProgressUi(playSegmentMs, { frozen: true, activePlay: false });
          phaseEl.textContent = gm("games_memory_preview", "Peek — cards hide when the countdown ends.");
          var cells = grid.querySelectorAll(".eazy-memory__card");
          for (var j = 0; j < cells.length; j++) {
            cells[j].classList.add("is-open");
          }
          previewTimerId = setTimeout(endPreview, previewGrace);
        } else {
          previewPhase = false;
          phaseEl.textContent = "";
          updateProgressUi(playSegmentMs, { frozen: false, activePlay: true });
          startHudTimer();
        }
      });
    }

    for (var i = 0; i < n; i++) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "eazy-memory__card";
      cell.dataset.slot = String(i);

      var inner = document.createElement("div");
      inner.className = "eazy-memory__card-inner";

      var back = document.createElement("div");
      back.className = "eazy-memory__card-face eazy-memory__card-face--back";
      var q = document.createElement("span");
      q.className = "eazy-memory__q";
      q.textContent = "?";
      back.appendChild(q);

      var front = document.createElement("div");
      front.className = "eazy-memory__card-face eazy-memory__card-face--front";
      var img = document.createElement("img");
      img.src = imgUrlForSlot(i);
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      front.appendChild(img);

      inner.appendChild(back);
      inner.appendChild(front);
      cell.appendChild(inner);

      (function (slot) {
        cell.addEventListener("click", function () {
          audio.resume();

          if (!gameStarted || previewPhase || lockBoard || submitted) return;
          if (matched[slot]) return;

          var el = cellEl(slot);
          if (!el) return;

          if (firstPick === slot) {
            firstPick = null;
            el.classList.remove("is-open");
            return;
          }

          if (firstPick === null) {
            firstPick = slot;
            el.classList.add("is-open");
            return;
          }

          var a = firstPick;
          var b = slot;
          firstPick = null;

          var elA = cellEl(a);
          var elB = cellEl(b);
          if (!elA || !elB) return;
          elA.classList.add("is-open");
          elB.classList.add("is-open");

          flipLog.push(a, b);

          if (slotPairKeys[a] === slotPairKeys[b]) {
            audio.resume().then(function () {
              audio.playMatch();
            });
            matched[a] = true;
            matched[b] = true;
            elA.classList.add("is-matched");
            elB.classList.add("is-matched");
            var mc = 0;
            for (var k in matched) if (Object.prototype.hasOwnProperty.call(matched, k)) mc++;
            if (mc >= n) {
              clearTimersOnly();
              submitFinish(false);
            }
          } else {
            audio.resume().then(function () {
              audio.playMismatch();
            });
            wrongMoves += 1;
            refreshStrikeDots();
            syncFlipStateAfterMismatch();
            lockBoard = true;
            if (wrongMoves >= maxWrongMoves) {
              setTimeout(function () {
                submitFinish(false);
              }, matchFlipMs);
            } else {
              setTimeout(function () {
                elA.classList.remove("is-open");
                elB.classList.remove("is-open");
                lockBoard = false;
              }, matchFlipMs);
            }
          }
        });
      })(i);

      grid.appendChild(cell);
    }

    primaryBtn.addEventListener("click", function () {
      if (!gameStarted) {
        beginPlay();
        return;
      }
      submitFinish(true);
    });

    if (timerMount) {
      timerMount.appendChild(timerWrap);
      timerMount.hidden = false;
    } else {
      if (!footerMount) {
        timerRow.appendChild(strikesEl);
      }
      timerRow.appendChild(timerWrap);
      hud.appendChild(timerRow);
    }
    hud.appendChild(phaseEl);
    if (footerMount) {
      footerMount.left.appendChild(primaryBtn);
    } else {
      actions.appendChild(primaryBtn);
      wrap.appendChild(actions);
    }
    wrap.appendChild(hud);
    wrap.appendChild(grid);
    root.appendChild(wrap);

    global.__eazyMemoryTimersAbort = clearTimersOnly;

    if (gameStarted) {
      applyProtection();
      updatePrimaryLabel();
      strikesEl.hidden = false;
      strikesEl.removeAttribute("aria-hidden");
      refreshStrikeDots();
      syncFooterStrikesVisibility();
    } else {
      updatePrimaryLabel();
    }

    if (previewGrace > 0 && !pregame) {
      runAfterPlayStarted(function () {
        if (submitted) return;
        previewPhase = true;
        resetHudSoundState();
        updateProgressUi(playSegmentMs, { frozen: true, activePlay: false });
        phaseEl.textContent = gm("games_memory_preview", "Peek — cards hide when the countdown ends.");
        var cells0 = grid.querySelectorAll(".eazy-memory__card");
        for (var j0 = 0; j0 < cells0.length; j0++) {
          cells0[j0].classList.add("is-open");
        }
        previewTimerId = setTimeout(endPreview, previewGrace);
        unlockAudio();
      });
    } else if (!pregame) {
      runAfterPlayStarted(function () {
        if (submitted) return;
        phaseEl.textContent = "";
        updateProgressUi(playSegmentMs, { frozen: false, activePlay: true });
        startHudTimer();
      });
    } else {
      previewPhase = false;
      updateProgressUi(0, {});
      phaseEl.textContent = gm(
        "games_memory_pregame_hint",
        "Tiles are hidden. Tap Start when you are ready — then you get a peek before the timer runs."
      );
      phaseEl.setAttribute("data-t", "eazy_chat.games_memory_pregame_hint");
    }
  }

  global.EazyDailyMemoryGame = { mount: mount };
})(typeof window !== "undefined" ? window : globalThis);
