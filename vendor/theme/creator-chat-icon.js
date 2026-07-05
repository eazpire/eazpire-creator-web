/**
 * Creator Chat Icon – Sleep/Wake + Activity Animations
 * - Time-aware: sleeps 22:00–05:59, awake 06:00–21:59
 * - Activity animations cycle randomly when Eazy is free on the page
 * - No activities when docked, in chat, or sleeping
 */
(function () {
  "use strict";

  var ACTIVITY_CYCLE_MIN = 20000;
  var ACTIVITY_CYCLE_MAX = 40000;
  var SEASON_CHANCE = 0.25;

  function getTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch (e) { return "UTC"; }
  }

  function getLocalHour() {
    try {
      var str = new Date().toLocaleString("en-US", { timeZone: getTimezone(), hour: "numeric", hour12: false });
      return parseInt(str, 10);
    } catch (e) { return new Date().getHours(); }
  }

  function isSleepTime() {
    var h = getLocalHour();
    return h >= 22 || h <= 5;
  }

  function getTimeBucket() {
    var h = getLocalHour();
    if (h >= 6 && h <= 11) return "morning";
    if (h >= 12 && h <= 16) return "midday";
    if (h >= 17 && h <= 21) return "evening";
    return "night";
  }

  function getSeason() {
    var m = new Date().getMonth();
    if (m >= 2 && m <= 4) return "spring";
    if (m >= 5 && m <= 7) return "summer";
    if (m >= 8 && m <= 10) return "autumn";
    return "winter";
  }

  function isDecember() {
    return new Date().getMonth() === 11;
  }

  /* ── Activity SVG definitions ── */
  var ACTIVITIES = {
    morning: [
      { id: "kaffee", svg: '<rect x="38" y="92" width="22" height="18" rx="3" fill="#8B5E3C"/><rect x="40" y="92" width="18" height="5" rx="2" fill="#6B4226"/><path d="M60 97c4 0 6 2 6 5s-2 5-6 5" stroke="#8B5E3C" stroke-width="2.5" fill="none" stroke-linecap="round"/><line class="eazy-steam eazy-steam--1" x1="45" y1="88" x2="45" y2="80" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><line class="eazy-steam eazy-steam--2" x1="49" y1="88" x2="50" y2="79" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><line class="eazy-steam eazy-steam--3" x1="53" y1="88" x2="52" y2="80" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' },
      { id: "yoga", svg: '<line class="eazy-yoga-arm eazy-yoga-arm--l" x1="32" y1="62" x2="18" y2="42" stroke="#f97316" stroke-width="3.5" stroke-linecap="round"/><line class="eazy-yoga-arm eazy-yoga-arm--r" x1="100" y1="55" x2="116" y2="35" stroke="#f97316" stroke-width="3.5" stroke-linecap="round"/>' },
      { id: "zeitung", svg: '<rect x="56" y="78" width="36" height="26" rx="2" fill="#f5f5dc"/><line x1="60" y1="84" x2="88" y2="84" stroke="#94a3b8" stroke-width="1.2"/><line x1="60" y1="88" x2="84" y2="88" stroke="#cbd5e1" stroke-width=".8"/><line x1="60" y1="91" x2="86" y2="91" stroke="#cbd5e1" stroke-width=".8"/><line x1="60" y1="94" x2="80" y2="94" stroke="#cbd5e1" stroke-width=".8"/>' },
      { id: "joggen", svg: '<path d="M58 44c8-6 22-8 38-2" stroke="#ef4444" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="52" cy="108" rx="9" ry="5" fill="#3b82f6"/><ellipse cx="78" cy="110" rx="9" ry="5" fill="#3b82f6"/><circle class="eazy-sweat eazy-sweat--1" cx="100" cy="42" r="2.5" fill="#60a5fa"/><circle class="eazy-sweat eazy-sweat--2" cx="106" cy="48" r="2" fill="#60a5fa"/>' },
      { id: "pancakes", svg: '<ellipse cx="30" cy="105" rx="16" ry="4" fill="#d4a24e"/><ellipse cx="30" cy="101" rx="15" ry="3.5" fill="#e8b84e"/><ellipse cx="30" cy="97" rx="14" ry="3" fill="#f0c860"/><ellipse cx="30" cy="95" rx="8" ry="2" fill="#92400e" opacity=".6"/><rect x="27" y="92" width="6" height="3" rx="1" fill="#fde68a"/>' }
    ],
    midday: [
      { id: "malen", svg: '<g class="eazy-brush"><rect x="100" y="52" width="4" height="30" rx="1.5" fill="#92400e"/><path d="M99 52l3-10 3 10z" fill="#ef4444"/></g><circle class="eazy-splat eazy-splat--1" cx="20" cy="90" r="5" fill="#3b82f6"/><circle class="eazy-splat eazy-splat--2" cx="110" cy="95" r="4" fill="#10b981"/><circle class="eazy-splat eazy-splat--3" cx="65" cy="108" r="4.5" fill="#f43f5e"/>' },
      { id: "skateboard", svg: '<rect x="36" y="100" width="56" height="6" rx="3" fill="#7c3aed"/><circle cx="46" cy="110" r="3.5" fill="#444"/><circle cx="82" cy="110" r="3.5" fill="#444"/>' },
      { id: "kochen", svg: '<ellipse cx="72" cy="22" rx="18" ry="10" fill="#fff" stroke="#e5e7eb" stroke-width="1"/><rect x="56" y="22" width="32" height="8" rx="1" fill="#fff" stroke="#e5e7eb" stroke-width="1"/><rect x="24" y="94" width="34" height="22" rx="3" fill="#64748b"/><rect x="22" y="92" width="38" height="5" rx="2" fill="#475569"/><g class="eazy-spoon"><line x1="50" y1="88" x2="58" y2="72" stroke="#a3a3a3" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="59" cy="70" rx="4" ry="3" fill="#a3a3a3"/></g><line class="eazy-steam eazy-steam--1" x1="32" y1="90" x2="32" y2="82" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><line class="eazy-steam eazy-steam--2" x1="38" y1="90" x2="39" y2="81" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><line class="eazy-steam eazy-steam--3" x1="44" y1="90" x2="43" y2="82" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' },
      { id: "musik", svg: '<path d="M52 38c0-12 18-16 30-10" stroke="#333" stroke-width="3.5" fill="none" stroke-linecap="round"/><rect x="48" y="36" width="8" height="10" rx="3" fill="#333"/><rect x="80" y="30" width="8" height="10" rx="3" fill="#333"/><text class="eazy-note eazy-note--1" x="100" y="38" font-size="14" fill="#a78bfa">&#9834;</text><text class="eazy-note eazy-note--2" x="108" y="28" font-size="11" fill="#f472b6">&#9835;</text><text class="eazy-note eazy-note--3" x="96" y="22" font-size="12" fill="#60a5fa">&#9833;</text>' },
      { id: "programmieren", svg: '<circle cx="72" cy="58" r="8" stroke="#333" stroke-width="2" fill="none"/><circle cx="88" cy="50" r="7" stroke="#333" stroke-width="2" fill="none"/><line x1="80" y1="55" x2="82" y2="53" stroke="#333" stroke-width="2"/><rect x="20" y="90" width="40" height="24" rx="3" fill="#334155"/><rect x="22" y="92" width="36" height="17" rx="2" fill="#1e293b"/><rect x="25" y="95" width="12" height="2" rx="1" fill="#10b981"/><rect x="25" y="99" width="18" height="2" rx="1" fill="#60a5fa"/><rect x="25" y="103" width="8" height="2" rx="1" fill="#f97316"/><rect class="eazy-cursor" x="34" y="103" width="1.5" height="3" fill="#f1f5f9"/><rect x="16" y="114" width="48" height="3" rx="1" fill="#475569"/>' }
    ],
    evening: [
      { id: "lesen", svg: '<rect x="44" y="86" width="40" height="28" rx="2" fill="#7c3aed"/><line x1="64" y1="86" x2="64" y2="114" stroke="#5b21b6" stroke-width="1.5"/><g class="eazy-page"><rect x="45" y="87" width="19" height="26" rx="1" fill="#f5f5dc" opacity=".9"/></g><line x1="50" y1="92" x2="60" y2="92" stroke="#cbd5e1" stroke-width=".8"/><line x1="50" y1="95" x2="58" y2="95" stroke="#cbd5e1" stroke-width=".8"/><line x1="68" y1="92" x2="78" y2="92" stroke="#94a3b8" stroke-width=".8"/><line x1="68" y1="95" x2="80" y2="95" stroke="#94a3b8" stroke-width=".8"/>' },
      { id: "gaming", svg: '<rect x="34" y="96" width="56" height="20" rx="8" fill="#334155"/><circle cx="48" cy="104" r="4" fill="#475569" stroke="#64748b" stroke-width="1"/><line x1="48" y1="101" x2="48" y2="107" stroke="#64748b" stroke-width="1.2"/><line x1="45" y1="104" x2="51" y2="104" stroke="#64748b" stroke-width="1.2"/><circle cx="74" cy="102" r="2.5" fill="#ef4444"/><circle cx="80" cy="106" r="2.5" fill="#3b82f6"/>' },
      { id: "film", svg: '<rect x="96" y="82" width="20" height="28" rx="2" fill="#dc2626"/><rect x="98" y="84" width="16" height="3" rx="1" fill="#b91c1c"/><circle cx="101" cy="80" r="3.5" fill="#fde68a"/><circle cx="107" cy="78" r="3" fill="#fde68a"/><circle cx="113" cy="80" r="3.5" fill="#fde68a"/><circle cx="104" cy="76" r="2.5" fill="#fef3c7"/><circle class="eazy-popcorn" cx="108" cy="74" r="2" fill="#fde68a"/>' },
      { id: "gitarre", svg: '<g class="eazy-gitarre"><ellipse cx="26" cy="92" rx="12" ry="15" fill="#92400e"/><ellipse cx="26" cy="92" rx="4" ry="5" fill="#422006"/><rect x="24" y="58" width="4" height="35" rx="1.5" fill="#a16207"/><rect x="22" y="56" width="8" height="4" rx="1" fill="#78350f"/></g><text class="eazy-note eazy-note--1" x="8" y="70" font-size="13" fill="#fbbf24">&#9834;</text><text class="eazy-note eazy-note--2" x="2" y="58" font-size="10" fill="#f472b6">&#9835;</text><text class="eazy-note eazy-note--3" x="14" y="50" font-size="11" fill="#a78bfa">&#9833;</text>' },
      { id: "tee", svg: '<path d="M70 72c4 3 14 3 18 0" stroke="#f97316" stroke-width="2" stroke-linecap="round" fill="none"/><rect x="86" y="88" width="24" height="20" rx="4" fill="#4ade80"/><rect x="88" y="88" width="20" height="5" rx="2" fill="#22c55e"/><path d="M110 93c5 0 7 3 7 6s-2 6-7 6" stroke="#4ade80" stroke-width="2.5" fill="none" stroke-linecap="round"/><line x1="98" y1="88" x2="102" y2="82" stroke="#92400e" stroke-width="1"/><rect x="100" y="80" width="6" height="4" rx="1" fill="#fde68a"/><line class="eazy-steam eazy-steam--1" x1="92" y1="84" x2="92" y2="76" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><line class="eazy-steam eazy-steam--2" x1="97" y1="84" x2="98" y2="75" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><line class="eazy-steam eazy-steam--3" x1="102" y1="84" x2="101" y2="76" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>' }
    ],
    seasonal: {
      winter: { id: "schneemann", svg: '<path d="M52 78c10 6 30 4 40-2" stroke="#ef4444" stroke-width="4" fill="none" stroke-linecap="round"/><line x1="88" y1="76" x2="94" y2="90" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round"/><circle cx="22" cy="108" r="8" fill="#e2e8f0"/><circle cx="22" cy="96" r="6" fill="#e2e8f0"/><circle cx="22" cy="87" r="4.5" fill="#e2e8f0"/><circle cx="20" cy="86" r="1" fill="#333"/><circle cx="24" cy="86" r="1" fill="#333"/><path d="M20 88l4 1" stroke="#f97316" stroke-width="1.5" stroke-linecap="round"/><text class="eazy-flake eazy-flake--1" x="40" y="20" font-size="10" fill="#93c5fd">&#10052;</text><text class="eazy-flake eazy-flake--2" x="80" y="15" font-size="8" fill="#bfdbfe">&#10052;</text><text class="eazy-flake eazy-flake--3" x="100" y="25" font-size="9" fill="#93c5fd">&#10052;</text><text class="eazy-flake eazy-flake--4" x="60" y="10" font-size="7" fill="#dbeafe">&#10052;</text><text class="eazy-flake eazy-flake--5" x="20" y="18" font-size="9" fill="#bfdbfe">&#10052;</text>' },
      summer: { id: "strand", svg: '<circle cx="108" cy="18" r="10" fill="#fbbf24"/><line x1="108" y1="4" x2="108" y2="0" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/><line x1="120" y1="10" x2="124" y2="6" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/><line x1="122" y1="18" x2="127" y2="18" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/><rect x="65" y="56" width="14" height="8" rx="3" fill="#1e293b"/><rect x="83" y="48" width="13" height="8" rx="3" fill="#1e293b"/><line x1="79" y1="59" x2="83" y2="54" stroke="#1e293b" stroke-width="2"/><path class="eazy-wave" d="M0 115c10-4 20 0 30-4s20 0 30-4 20 0 30-4 20 0 30-4" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' },
      autumn: { id: "herbst", svg: '<ellipse cx="72" cy="34" rx="22" ry="6" fill="#b45309"/><path d="M54 34c0-12 16-18 28-14 8 3 12 10 4 14" fill="#d97706"/><circle cx="72" cy="20" r="4" fill="#d97706"/><path class="eazy-leaf eazy-leaf--1" d="M95 12l-5 8 8-2z" fill="#ef4444"/><path class="eazy-leaf eazy-leaf--2" d="M40 8l-4 7 7-1z" fill="#f59e0b"/><path class="eazy-leaf eazy-leaf--3" d="M110 30l-6 6 7 0z" fill="#dc2626"/><path class="eazy-leaf eazy-leaf--4" d="M20 20l-3 7 6-2z" fill="#ea580c"/>' },
      spring: { id: "blumen", svg: '<rect x="90" y="68" width="18" height="14" rx="3" fill="#64748b"/><line x1="100" y1="68" x2="114" y2="58" stroke="#64748b" stroke-width="3" stroke-linecap="round"/><circle cx="114" cy="57" r="2" fill="#64748b"/><circle class="eazy-waterdrop" cx="112" cy="62" r="1.5" fill="#60a5fa"/><g class="eazy-flower eazy-flower--1"><line x1="14" y1="120" x2="14" y2="100" stroke="#22c55e" stroke-width="2"/><circle cx="14" cy="98" r="4" fill="#f472b6"/><circle cx="14" cy="98" r="1.5" fill="#fbbf24"/></g><g class="eazy-flower eazy-flower--2"><line x1="28" y1="120" x2="28" y2="104" stroke="#22c55e" stroke-width="2"/><circle cx="28" cy="102" r="3.5" fill="#a78bfa"/><circle cx="28" cy="102" r="1.5" fill="#fbbf24"/></g><g class="eazy-flower eazy-flower--3"><line x1="42" y1="120" x2="42" y2="106" stroke="#22c55e" stroke-width="2"/><circle cx="42" cy="104" r="3" fill="#fb923c"/><circle cx="42" cy="104" r="1.5" fill="#fbbf24"/></g><rect x="2" y="118" width="56" height="6" rx="2" fill="#92400e" opacity=".4"/>' },
      xmas: { id: "weihnachten", svg: '<path d="M50 38c4-16 30-20 40-10l-6 8c-8-6-24-4-28 4z" fill="#dc2626"/><ellipse cx="66" cy="40" rx="24" ry="5" fill="#fef3c7"/><circle cx="90" cy="26" r="5" fill="#fef3c7"/><rect x="12" y="96" width="24" height="20" rx="2" fill="#dc2626"/><rect x="22" y="96" width="4" height="20" fill="#fbbf24"/><rect x="12" y="103" width="24" height="4" fill="#fbbf24"/><path d="M18 96c-4-6 0-10 6-6" stroke="#fbbf24" stroke-width="1.5" fill="none"/><path d="M30 96c4-6 0-10-6-6" stroke="#fbbf24" stroke-width="1.5" fill="none"/><text class="eazy-star eazy-star--1" x="4" y="40" font-size="10" fill="#fbbf24">&#9733;</text><text class="eazy-star eazy-star--2" x="100" y="15" font-size="8" fill="#fbbf24">&#9733;</text><text class="eazy-star eazy-star--3" x="112" y="42" font-size="7" fill="#fde68a">&#9733;</text><text class="eazy-star eazy-star--4" x="50" y="12" font-size="9" fill="#fbbf24">&#9733;</text>' }
    }
  };

  function pickActivity() {
    var bucket = getTimeBucket();
    if (bucket === "night") return null;

    var season = getSeason();
    var useSeasonal = Math.random() < SEASON_CHANCE;
    if (isDecember()) useSeasonal = Math.random() < 0.4;

    if (useSeasonal) {
      if (isDecember() && Math.random() < 0.6) return ACTIVITIES.seasonal.xmas;
      var s = ACTIVITIES.seasonal[season];
      if (s) return s;
    }

    var list = ACTIVITIES[bucket];
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function init() {
    var btn = document.getElementById("creator-chat-toggle");
    if (!btn) return;

    var activityEl = document.getElementById("eazy-activity");
    var cycleTimer = null;
    var currentActivity = null;
    var chatOpen = false;

    function isDocked() {
      return btn.classList.contains("creator-chat__toggle--docked") ||
             btn.classList.contains("creator-chat__toggle--snap-mode");
    }

    function applyMode() {
      if (isSleepTime()) {
        sleep();
      } else {
        wakeIdle();
      }
    }

    function sleep() {
      stopActivity();
      btn.classList.remove("creator-chat-icon--waking");
      btn.classList.add("creator-chat-icon--sleeping");
    }

    function wake() {
      btn.classList.remove("creator-chat-icon--sleeping");
      btn.classList.add("creator-chat-icon--waking");
      setTimeout(function () {
        btn.classList.remove("creator-chat-icon--waking");
      }, 550);
    }

    function wakeIdle() {
      btn.classList.remove("creator-chat-icon--sleeping");
      btn.classList.remove("creator-chat-icon--waking");
      if (!chatOpen && !isDocked()) startActivityCycle();
    }

    function setActivity(act) {
      if (!activityEl) return;
      if (currentActivity) {
        btn.classList.remove("eazy-act-" + currentActivity);
      }
      if (!act) {
        activityEl.innerHTML = "";
        currentActivity = null;
        return;
      }
      activityEl.innerHTML = act.svg;
      currentActivity = act.id;
      btn.classList.add("eazy-act-" + act.id);
    }

    function stopActivity() {
      if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
      setActivity(null);
    }

    function startActivityCycle() {
      stopActivity();
      if (isSleepTime() || isDocked() || chatOpen) return;

      var act = pickActivity();
      if (act) setActivity(act);

      var delay = ACTIVITY_CYCLE_MIN + Math.random() * (ACTIVITY_CYCLE_MAX - ACTIVITY_CYCLE_MIN);
      cycleTimer = setTimeout(function () {
        startActivityCycle();
      }, delay);
    }

    applyMode();

    btn.addEventListener("click", function () {
      chatOpen = true;
      stopActivity();
      wake();
    });

    if (document.body) {
      document.body.addEventListener("creator-chat-close", function () {
        chatOpen = false;
        setTimeout(function () { applyMode(); }, 800);
      });
    }

    setInterval(function () {
      if (!chatOpen) applyMode();
    }, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CreatorChatIcon = { init: init };
})();
