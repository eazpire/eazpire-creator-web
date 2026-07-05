/**
 * Daily Connect-Four (5×5, 4 in a row) vs Eazy bot.
 * Exposes window.EazyDailyConnectGame.mount(opts).
 */
(function (global) {
  "use strict";

  var PLAYER = 1;
  var BOT = 2;
  var EMPTY = 0;
  var TUTORIAL_SKIP_KEY = "eazy_connect_tutorial_dismissed";
  var TUTORIAL_SIZE = 5;
  var TUTORIAL_WIN_CELLS = { "2:0": true, "2:1": true, "2:2": true, "2:3": true };
  var TUTORIAL_STEPS = [
    {
      key: "games_connect_tutorial_step1",
      fb: "You play X and move first.",
      move: { row: 2, col: 0, player: PLAYER },
    },
    {
      key: "games_connect_tutorial_step2",
      fb: "Eazy responds with O after each of your moves.",
      move: { row: 4, col: 0, player: BOT },
    },
    {
      key: "games_connect_tutorial_step3",
      fb: "Build four in a row — horizontal, vertical, or diagonal.",
      move: { row: 2, col: 1, player: PLAYER },
    },
    {
      key: "games_connect_tutorial_step4",
      fb: "Eazy tries to block you.",
      move: { row: 4, col: 1, player: BOT },
    },
    {
      key: "games_connect_tutorial_step5",
      fb: "Three in a row — one more wins!",
      move: { row: 2, col: 2, player: PLAYER },
    },
    {
      key: "games_connect_tutorial_step6",
      fb: "Keep an eye on Eazy's line too.",
      move: { row: 4, col: 2, player: BOT },
    },
    {
      key: "games_connect_tutorial_step7",
      fb: "Four X in a row wins the round!",
      move: { row: 2, col: 3, player: PLAYER },
      win: true,
    },
  ];

  function readTutorialSkip() {
    try {
      return global.localStorage.getItem(TUTORIAL_SKIP_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function writeTutorialSkip(on) {
    try {
      global.localStorage.setItem(TUTORIAL_SKIP_KEY, on ? "1" : "0");
    } catch (e2) {}
  }

  function cloneBoard(src) {
    return (src || []).map(function (row) {
      return row.slice();
    });
  }

  function emptyBoard(size) {
    var b = [];
    for (var r = 0; r < size; r += 1) {
      var row = [];
      for (var c = 0; c < size; c += 1) row.push(EMPTY);
      b.push(row);
    }
    return b;
  }

  function createConnectSynthAudio() {
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
    function resume() {
      var c = getCtx();
      if (!c) return Promise.resolve();
      if (c.state === "suspended") return c.resume().catch(function () {});
      return Promise.resolve();
    }
    function tone(freq, dur, vol) {
      var c = getCtx();
      if (!c || c.state !== "running") return;
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.08, c.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    }
    return {
      resume: resume,
      playMove: function () {
        tone(440, 0.06, 0.07);
      },
      playBot: function () {
        tone(330, 0.05, 0.06);
      },
      playWin: function () {
        tone(523, 0.08, 0.09);
        setTimeout(function () {
          tone(784, 0.1, 0.08);
        }, 70);
      },
      playLoss: function () {
        tone(180, 0.14, 0.1);
      },
      dispose: function () {},
    };
  }

  function mount(opts) {
    var root = opts.root;
    var apiBase = opts.apiBase;
    var shop = opts.shop;
    var uid = opts.uid;
    var board = opts.board || [];
    var timing = opts.timing || {};
    var gm = opts.i18n || function (_k, fb) {
      return fb;
    };
    var onComplete = typeof opts.onComplete === "function" ? opts.onComplete : function () {};
    var timerMount = opts.timerMount && opts.timerMount.nodeType === 1 ? opts.timerMount : null;
    var footerMount = opts.footerMount || null;
    var pregame = opts.pregame === true;

    var size = Number(timing.size) || 5;
    var playMs = Number(timing.play_ms) || 240000;
    var deadlineMs = Number(timing.deadline_ms) || Date.now() + playMs;
    var serverNow = Number(timing.server_now_ms) || Date.now();
    var skew = serverNow - Date.now();

    var audio = createConnectSynthAudio();
    var lockBoard = false;
    var submitted = false;
    var gameStarted = !pregame;
    var winningCells = {};
    var lastMove = null;
    var timerId = null;
    var wrap = null;
    var gridEl = null;
    var statusEl = null;
    var primaryBtn = null;

    function adjustedDeadline() {
      return deadlineMs + skew;
    }

    function clearTimersOnly() {
      if (timerId) clearInterval(timerId);
      timerId = null;
    }

    function teardownUi() {
      clearTimersOnly();
      audio.dispose();
      global.__eazyConnectGameCleanup = null;
      if (primaryBtn && primaryBtn.parentNode) {
        try {
          primaryBtn.parentNode.removeChild(primaryBtn);
        } catch (e) {}
      }
      if (timerMount) {
        timerMount.hidden = true;
        timerMount.innerHTML = "";
      }
      root.innerHTML = "";
      root.hidden = true;
      wrap = null;
    }

    function postJson(body) {
      return fetch(apiBase + "?op=daily-game-play&shop=" + encodeURIComponent(shop), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          Object.assign({ owner_id: uid, shop: shop }, body || {})
        ),
      }).then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      });
    }

    function submitFinish(forfeit) {
      if (submitted) return;
      submitted = true;
      global.__eazyConnectGameCleanup = null;
      clearTimersOnly();
      postJson({
        connect_action: "finish",
        connect_forfeit: !!forfeit,
      })
        .then(function (data) {
          try {
            onComplete(data || {});
          } catch (e) {}
        })
        .catch(function () {
          try {
            onComplete({});
          } catch (e2) {}
        })
        .finally(teardownUi);
    }

    function submitForfeit() {
      if (submitted) return;
      submitted = true;
      global.__eazyConnectGameCleanup = null;
      clearTimersOnly();
      postJson({ connect_action: "forfeit" })
        .then(function (data) {
          audio.playLoss();
          try {
            onComplete(data || { outcome: "loss" });
          } catch (e) {}
        })
        .catch(function () {
          try {
            onComplete({ outcome: "loss" });
          } catch (e2) {}
        })
        .finally(teardownUi);
    }

    global.__eazyConnectGameCleanup = function () {
      submitForfeit();
    };

    function markWinningCells(cells) {
      winningCells = {};
      if (!cells || !cells.length) return;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        winningCells[c.row + ":" + c.col] = true;
      }
    }

    function renderBoard() {
      if (!gridEl) return;
      var cells = gridEl.querySelectorAll(".eazy-connect__cell");
      for (var i = 0; i < cells.length; i++) {
        var el = cells[i];
        var r = Number(el.getAttribute("data-row"));
        var c = Number(el.getAttribute("data-col"));
        var v = board[r] && board[r][c] != null ? board[r][c] : EMPTY;
        el.classList.remove(
          "eazy-connect__cell--x",
          "eazy-connect__cell--o",
          "eazy-connect__cell--win",
          "eazy-connect__cell--last"
        );
        el.textContent = "";
        if (v === PLAYER) {
          el.classList.add("eazy-connect__cell--x");
          el.textContent = "X";
        } else if (v === BOT) {
          el.classList.add("eazy-connect__cell--o");
          el.textContent = "O";
        }
        if (winningCells[r + ":" + c]) el.classList.add("eazy-connect__cell--win");
        if (lastMove && lastMove.row === r && lastMove.col === c) {
          el.classList.add("eazy-connect__cell--last");
        }
        el.disabled = lockBoard || !gameStarted || v !== EMPTY || submitted;
      }
    }

    function handleTerminal(data) {
      if (submitted) return;
      submitted = true;
      global.__eazyConnectGameCleanup = null;
      clearTimersOnly();
      if (data.outcome === "win") audio.playWin();
      else audio.playLoss();
      try {
        onComplete(data || {});
      } catch (e) {}
      setTimeout(teardownUi, data.outcome === "win" ? 400 : 200);
    }

    function handleMoveResponse(data) {
      if (!data || submitted) return;
      if (data.connect_board) board = data.connect_board;
      if (data.winning_cells) markWinningCells(data.winning_cells);
      if (data.last_bot_move) lastMove = data.last_bot_move;
      else if (data.connect_status === "player_won") {
        lastMove = null;
      }

      if (data.outcome === "loss") {
        lockBoard = true;
        renderBoard();
        handleTerminal(data);
        return;
      }

      if (data.connect_status === "player_won") {
        lockBoard = true;
        renderBoard();
        audio.playWin();
        postJson({ connect_action: "finish" }).then(function (fd) {
          handleTerminal(fd);
        });
        return;
      }

      lockBoard = false;
      if (statusEl) statusEl.textContent = gm("games_connect_your_turn", "Your turn");
      renderBoard();
    }

    function onCellClick(row, col) {
      if (!gameStarted || lockBoard || submitted) return;
      if (!board[row] || board[row][col] !== EMPTY) return;
      var prevBoard = cloneBoard(board);
      board[row][col] = PLAYER;
      lockBoard = true;
      lastMove = { row: row, col: col };
      if (statusEl) {
        statusEl.textContent = gm("games_connect_eazy_turn", "Eazy is thinking…");
      }
      audio.resume();
      audio.playMove();
      renderBoard();

      postJson({ connect_action: "move", row: row, col: col }).then(function (data) {
        if (!data || !data.ok) {
          board = prevBoard;
          lastMove = null;
          lockBoard = false;
          if (statusEl) statusEl.textContent = gm("games_connect_your_turn", "Your turn");
          renderBoard();
          return;
        }
        if (data.last_bot_move) {
          audio.playBot();
        }
        handleMoveResponse(data);
      });
    }

    function startHudTimer() {
      if (!timerMount) return;
      var timerWrap = timerMount.querySelector(".eazy-connect__timer");
      var progressFill = timerMount.querySelector(".eazy-connect__progress-fill");
      var readoutEl = timerMount.querySelector(".eazy-connect__timer-readout");
      if (!timerWrap || !progressFill || !readoutEl) return;

      function tick() {
        var rem = adjustedDeadline() - Date.now();
        if (rem <= 0) {
          readoutEl.textContent = gm("games_connect_time_up", "Time's up!");
          timerWrap.classList.add("eazy-connect__timer--danger");
          submitForfeit();
          return;
        }
        var secShown = Math.max(0, Math.ceil(rem / 1000));
        var p = playMs > 0 ? rem / playMs : 0;
        progressFill.style.transform = "scaleX(" + String(Math.min(1, Math.max(0, p))) + ")";
        readoutEl.textContent =
          gm("games_connect_timer", "Time left") + ": " + String(secShown) + "s";
        timerWrap.classList.toggle("eazy-connect__timer--danger", rem <= 5000);
      }
      tick();
      timerId = setInterval(tick, 200);
    }

    function beginPlay() {
      if (gameStarted) return;
      gameStarted = true;
      audio.resume();
      if (primaryBtn) {
        primaryBtn.textContent = gm("games_connect_forfeit", "Give up");
      }
      if (statusEl) statusEl.textContent = gm("games_connect_your_turn", "Your turn");
      if (timerMount) timerMount.hidden = false;
      startHudTimer();
      renderBoard();
    }

    root.hidden = false;
    root.innerHTML = "";

    wrap = document.createElement("div");
    wrap.className = "eazy-connect";

    statusEl = document.createElement("p");
    statusEl.className = "eazy-connect__status";
    statusEl.textContent = pregame
      ? gm("games_connect_pregame_hint", "Tap Start when you are ready.")
      : gm("games_connect_your_turn", "Your turn");
    wrap.appendChild(statusEl);

    gridEl = document.createElement("div");
    gridEl.className = "eazy-connect__grid";
    gridEl.style.setProperty("--eazy-connect-size", String(size));

    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        (function (row, col) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "eazy-connect__cell";
          btn.setAttribute("data-row", String(row));
          btn.setAttribute("data-col", String(col));
          btn.addEventListener("click", function () {
            onCellClick(row, col);
          });
          gridEl.appendChild(btn);
        })(r, c);
      }
    }
    wrap.appendChild(gridEl);
    root.appendChild(wrap);

    if (timerMount) {
      timerMount.hidden = pregame;
      timerMount.innerHTML =
        '<div class="eazy-connect__timer" role="timer">' +
        '<div class="eazy-connect__progress-track"><div class="eazy-connect__progress-fill"></div></div>' +
        '<div class="eazy-connect__timer-readout"></div></div>';
    }

    if (footerMount && footerMount.left) {
      primaryBtn = document.createElement("button");
      primaryBtn.type = "button";
      primaryBtn.className = "eazy-connect__primary";
      primaryBtn.textContent = pregame
        ? gm("games_play", "Start game")
        : gm("games_connect_forfeit", "Give up");
      primaryBtn.addEventListener("click", function () {
        if (!gameStarted) beginPlay();
        else submitForfeit();
      });
      footerMount.left.appendChild(primaryBtn);
    }

    renderBoard();
    if (gameStarted) {
      if (timerMount) timerMount.hidden = false;
      startHudTimer();
    }
  }

  /**
   * Interactive tutorial: auto-plays a short example, then Start game + skip checkbox.
   * @param {object} opts
   * @param {HTMLElement} opts.root
   * @param {function(string,string):string} [opts.i18n]
   * @param {object} [opts.footerMount] — { left: HTMLElement }
   * @param {function(boolean):void} opts.onStartGame — pass true when skip-next-time checked
   */
  function mountTutorial(opts) {
    var root = opts.root;
    var gm =
      opts.i18n ||
      function (_k, fb) {
        return fb;
      };
    var onStartGame =
      typeof opts.onStartGame === "function"
        ? opts.onStartGame
        : function () {};
    var footerMount = opts.footerMount || null;

    var tutorialBoard = emptyBoard(TUTORIAL_SIZE);
    var winningCells = {};
    var lastMove = null;
    var stepIndex = 0;
    var finished = false;
    var skipNext = false;
    var timers = [];

    function clearTutorialTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    function teardownTutorial() {
      clearTutorialTimers();
      root.innerHTML = "";
      root.hidden = true;
    }

    function renderTutorialGrid(gridEl) {
      if (!gridEl) return;
      var cells = gridEl.querySelectorAll(".eazy-connect__cell");
      for (var i = 0; i < cells.length; i++) {
        var el = cells[i];
        var r = Number(el.getAttribute("data-row"));
        var c = Number(el.getAttribute("data-col"));
        var v =
          tutorialBoard[r] && tutorialBoard[r][c] != null ? tutorialBoard[r][c] : EMPTY;
        el.classList.remove(
          "eazy-connect__cell--x",
          "eazy-connect__cell--o",
          "eazy-connect__cell--win",
          "eazy-connect__cell--last"
        );
        el.textContent = "";
        if (v === PLAYER) {
          el.classList.add("eazy-connect__cell--x");
          el.textContent = "X";
        } else if (v === BOT) {
          el.classList.add("eazy-connect__cell--o");
          el.textContent = "O";
        }
        if (winningCells[r + ":" + c]) el.classList.add("eazy-connect__cell--win");
        if (lastMove && lastMove.row === r && lastMove.col === c) {
          el.classList.add("eazy-connect__cell--last");
        }
        el.disabled = true;
      }
    }

    function showFinishUi(statusEl, actionsEl) {
      finished = true;
      if (statusEl) {
        statusEl.textContent = gm(
          "games_connect_tutorial_done",
          "Ready for today's puzzle? Start when you are."
        );
      }

      var skipWrap = document.createElement("label");
      skipWrap.className = "eazy-connect__tutorial-skip";
      var skipInput = document.createElement("input");
      skipInput.type = "checkbox";
      skipInput.addEventListener("change", function () {
        skipNext = !!skipInput.checked;
      });
      var skipText = document.createElement("span");
      skipText.textContent = gm(
        "games_connect_tutorial_skip",
        "Don't show this tutorial again"
      );
      skipWrap.appendChild(skipInput);
      skipWrap.appendChild(skipText);
      actionsEl.appendChild(skipWrap);

      var startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "eazy-connect__primary";
      startBtn.textContent = gm("games_play", "Start game");
      startBtn.addEventListener("click", function () {
        clearTutorialTimers();
        teardownTutorial();
        onStartGame(skipNext);
      });
      if (footerMount && footerMount.left) {
        footerMount.left.appendChild(startBtn);
      } else {
        actionsEl.appendChild(startBtn);
      }
    }

    function runStep(statusEl, gridEl, actionsEl) {
      if (finished) return;
      if (stepIndex >= TUTORIAL_STEPS.length) {
        showFinishUi(statusEl, actionsEl);
        return;
      }
      var step = TUTORIAL_STEPS[stepIndex];
      if (statusEl) statusEl.textContent = gm(step.key, step.fb);
      if (step.move) {
        tutorialBoard[step.move.row][step.move.col] = step.move.player;
        lastMove = { row: step.move.row, col: step.move.col };
        if (step.win) {
          winningCells = TUTORIAL_WIN_CELLS;
        }
        renderTutorialGrid(gridEl);
      }
      stepIndex += 1;
      var delay = step.win ? 1400 : 850;
      timers.push(
        setTimeout(function () {
          runStep(statusEl, gridEl, actionsEl);
        }, delay)
      );
    }

    root.hidden = false;
    root.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "eazy-connect eazy-connect--tutorial";

    var badge = document.createElement("p");
    badge.className = "eazy-connect__tutorial-badge";
    badge.textContent = gm("games_connect_tutorial_badge", "Quick tutorial");
    wrap.appendChild(badge);

    var statusEl = document.createElement("p");
    statusEl.className = "eazy-connect__status";
    statusEl.textContent = gm(
      "games_connect_tutorial_intro",
      "Watch a short example — four in a row wins."
    );
    wrap.appendChild(statusEl);

    var gridEl = document.createElement("div");
    gridEl.className = "eazy-connect__grid";
    gridEl.style.setProperty("--eazy-connect-size", String(TUTORIAL_SIZE));
    for (var r = 0; r < TUTORIAL_SIZE; r += 1) {
      for (var c = 0; c < TUTORIAL_SIZE; c += 1) {
        (function (row, col) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "eazy-connect__cell";
          btn.setAttribute("data-row", String(row));
          btn.setAttribute("data-col", String(col));
          btn.disabled = true;
          gridEl.appendChild(btn);
        })(r, c);
      }
    }
    wrap.appendChild(gridEl);

    var actionsEl = document.createElement("div");
    actionsEl.className = "eazy-connect__tutorial-actions";
    wrap.appendChild(actionsEl);

    root.appendChild(wrap);
    renderTutorialGrid(gridEl);

    timers.push(
      setTimeout(function () {
        runStep(statusEl, gridEl, actionsEl);
      }, 700)
    );
  }

  global.EazyDailyConnectGame = {
    mount: mount,
    mountTutorial: mountTutorial,
    tutorialSkipped: readTutorialSkip,
    setTutorialSkipped: writeTutorialSkip,
  };
})(typeof window !== "undefined" ? window : globalThis);
