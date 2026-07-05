/**
 * Eazy Mascot – long-press snap into header; cluster = speech + mascot.
 * Compose center: while “Start generation” is shown OR job polling (undocked).
 * Face + bubble side from cluster X vs viewport half; free drag only when not compose (snap still works).
 */
(function () {
  var STORAGE_KEY = 'eazy_mascot_position';
  var CLUSTER_KEY = 'eazy_cluster_position';
  var DOCK_KEY = 'eazy_mascot_docked';
  /** Set when undock is only for compose/relocate; DOCK_KEY stays 1 until user drags or explicit undock */
  var COMPOSE_TEMP_UNDOCK_KEY = 'eazy_compose_temp_undock';
  var LONG_PRESS_MS = 300;
  var SNAP_DISTANCE = 50;
  var SNAP_NEAR_DISTANCE = 60;
  var SNAP_VIBRATE_MAX_DISTANCE = 580;
  var DRAG_THRESHOLD = 8;
  var lastDragAt = 0;
  var suppressClickUntil = 0;

  var el = document.getElementById('eazy-mascot');
  var cluster = document.getElementById('creatorEazyCluster');
  if (!el) return;

  function getSnapSlot() {
    try {
      var desk = document.getElementById('creatorDesktopApp');
      if (desk && window.getComputedStyle(desk).display !== 'none') {
        var sd = document.getElementById('eazy-snap-slot--desktop');
        if (sd) return sd;
      }
    } catch (e) {}
    return document.getElementById('eazy-snap-slot--mobile') || document.getElementById('eazy-snap-slot--desktop');
  }

  function openCreatorChatFromMascot() {
    var isRecentDrag = Date.now() - (typeof lastDragAt === 'number' ? lastDragAt : 0) < 250;
    if (isRecentDrag) return;
    if (Date.now() < suppressClickUntil) return;
    if (window.EazyGuide && window.EazyGuide.shouldSuppressChatOpen && window.EazyGuide.shouldSuppressChatOpen()) return;
    if (window.EazyGuide && window.EazyGuide.isActive && window.EazyGuide.isActive()) {
      window.EazyGuide.exit();
      return;
    }

    var isDockedNow =
      _eazyDocked ||
      (el && el.classList && el.classList.contains('eazy-mascot--docked'));

    if (isDockedNow) {
      if (openCreatorChatFromMascot._timer) {
        clearTimeout(openCreatorChatFromMascot._timer);
      }
      openCreatorChatFromMascot._timer = setTimeout(function () {
        openCreatorChatFromMascot._timer = null;
        openCreatorChatFromMascotImmediate();
      }, 450);
      return;
    }

    openCreatorChatFromMascotImmediate();
  }

  function openCreatorChatFromMascotImmediate() {
    if (window.EazyGuide && window.EazyGuide.shouldSuppressChatOpen && window.EazyGuide.shouldSuppressChatOpen()) return;
    if (window.EazyGuide && window.EazyGuide.isActive && window.EazyGuide.isActive()) {
      window.EazyGuide.exit();
      return;
    }

    if (window.CreatorChat && typeof window.CreatorChat.open === 'function') {
      window.CreatorChat.open({ view: 'chat' });
      return;
    }

    try {
      window.dispatchEvent(new CustomEvent('eazy-mascot-click'));
    } catch (e) {}

    var panel = document.getElementById('creator-chat-panel');
    if (panel) {
      panel.style.display = '';
      panel.classList.add('creator-chat__panel--open');
      panel.setAttribute('aria-hidden', 'false');
      return;
    }

    var toggle = document.getElementById('creator-chat-toggle');
    if (toggle && typeof toggle.click === 'function') {
      toggle.click();
    }
  }

  window.addEventListener('eazy-guide-enter', function () {
    if (openCreatorChatFromMascot._timer) {
      clearTimeout(openCreatorChatFromMascot._timer);
      openCreatorChatFromMascot._timer = null;
    }
  });

  el.addEventListener('click', openCreatorChatFromMascot);
  if (!getSnapSlot()) return;

  var _eazyDocked = false;
  var useCluster = !!cluster;
  var genOverlayCount = 0;

  function isComposeCenterActive() {
    if (_eazyDocked || !cluster) return false;
    return genOverlayCount > 0;
  }

  function getSpeechVisible() {
    var w = document.getElementById('creatorHeaderEazySpeech');
    return !!(w && w.classList.contains('is-visible'));
  }

  function syncEazyClusterFacing() {
    if (!el || _eazyDocked) return;
    var inner = el.querySelector('.eazy-mascot__inner');
    if (!inner) return;
    if (!getSpeechVisible()) {
      if (cluster) cluster.classList.remove('creator-eazy-cluster--speech-after');
      return;
    }
    if (!cluster) return;
    var r = cluster.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    var cx = r.left + r.width / 2;
    /* Cluster center right of viewport half: bubble left of mascot, tail on right (::after default). */
    var lookLeft = cx >= window.innerWidth * 0.5;
    inner.classList.toggle('eazy-mascot__inner--look-left', lookLeft);
    if (lookLeft) {
      cluster.classList.remove('creator-eazy-cluster--speech-after');
    } else {
      cluster.classList.add('creator-eazy-cluster--speech-after');
    }
  }

  function scheduleEazyFacingSync() {
    try {
      requestAnimationFrame(function () {
        requestAnimationFrame(syncEazyClusterFacing);
      });
    } catch (e) {
      syncEazyClusterFacing();
    }
  }

  function reconcileComposeMode() {
    if (!cluster) return;
    /* Avoid fighting user drag: compose-center / position resets */
    if (cluster.classList.contains('creator-eazy-cluster--dragging')) return;
    if (_eazyDocked || el.classList.contains('eazy-mascot--docked')) {
      cluster.classList.remove('creator-eazy-cluster--compose-center');
      if (!cluster.classList.contains('creator-eazy-cluster--docked-speech-below')) {
        cluster.classList.remove('creator-eazy-cluster--speech-after');
      }
      return;
    }
    var want = isComposeCenterActive();
    var userPlaced =
      cluster.classList.contains('creator-eazy-cluster--positioned') &&
      cluster.style.left &&
      !isNaN(parseFloat(cluster.style.left));
    if (want && !userPlaced) {
      cluster.classList.remove('creator-eazy-cluster--positioned');
      cluster.style.left = '';
      cluster.style.top = '';
      cluster.style.transform = '';
    }
    cluster.classList.toggle(
      'creator-eazy-cluster--compose-center',
      want && !userPlaced
    );
    if (!want && !cluster.classList.contains('creator-eazy-cluster--dragging')) {
      var cp = loadClusterPosition();
      if (cp) {
        var cc = clampClusterPosition(cp.left, cp.top);
        applyClusterPosition(cc.left, cc.top);
      } else {
        clearClusterPositionStyle();
      }
    }
    scheduleEazyFacingSync();
  }

  try {
    window.setEazyComposeUiActive = function () {
      try {
        if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
      } catch (e) {}
      scheduleEazyFacingSync();
    };
    window.syncEazyClusterFacing = syncEazyClusterFacing;
    window.scheduleEazyFacingSync = scheduleEazyFacingSync;
    window.reconcileComposeMode = reconcileComposeMode;
    window.__eazyGenJobOverlayActive = function () {
      return genOverlayCount > 0;
    };
    /** Optional skipRelocate: avoid recursion when creator-mobile.js calls from relocateCreatorEazyCluster */
    window.undockEazyMascot = function (skipRelocate, preserveDockPreference) {
      undockEazy(skipRelocate === true, preserveDockPreference === true);
    };
    window.dockEazyMascot = function (animate) {
      dockEazy(animate === undefined ? true : animate);
    };
  } catch (e) {}

  function toClientCoords(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function loadPosition() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (!s) return null;
      var pos = JSON.parse(s);
      if (typeof pos.left === 'number' && typeof pos.top === 'number') return pos;
    } catch (e) {}
    return null;
  }

  function savePosition(left, top) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: left, top: top }));
    } catch (e) {}
    scheduleMascotSyncToServer();
  }

  function loadClusterPosition() {
    try {
      var s = localStorage.getItem(CLUSTER_KEY);
      if (!s) return null;
      var pos = JSON.parse(s);
      if (typeof pos.left === 'number' && typeof pos.top === 'number') return pos;
    } catch (e) {}
    return null;
  }

  function saveClusterPosition(left, top) {
    try {
      localStorage.setItem(CLUSTER_KEY, JSON.stringify({ left: left, top: top }));
    } catch (e) {}
    scheduleMascotSyncToServer();
  }

  function applyClusterPosition(left, top) {
    if (!cluster) return;
    cluster.style.left = left + 'px';
    cluster.style.top = top + 'px';
    cluster.style.right = 'auto';
    cluster.style.bottom = 'auto';
    cluster.style.transform = 'none';
    cluster.classList.add('creator-eazy-cluster--positioned');
  }

  function clearClusterPositionStyle() {
    if (!cluster) return;
    cluster.style.left = '';
    cluster.style.top = '';
    cluster.style.right = '';
    cluster.style.bottom = '';
    cluster.style.transform = '';
    cluster.classList.remove('creator-eazy-cluster--positioned');
  }

  /** Sum of flex children + gaps — not stretched row width — so drag can use full viewport */
  function getClusterContentSize() {
    if (!cluster) return { w: 220, h: 80 };
    var r = cluster.getBoundingClientRect();
    var w = r.width;
    var h = r.height;
    var ch = cluster.children;
    var sumW = 0;
    var maxChildH = 0;
    var i;
    for (i = 0; i < ch.length; i++) {
      var br = ch[i].getBoundingClientRect();
      sumW += br.width;
      if (br.height > maxChildH) maxChildH = br.height;
    }
    var gap = 12;
    var gaps = ch.length > 1 ? gap * (ch.length - 1) : 0;
    var intrinsicW = sumW + gaps;
    if (intrinsicW > 0 && (w > window.innerWidth * 0.45 || intrinsicW < w * 0.85)) {
      w = intrinsicW;
    }
    if (maxChildH > 0) h = Math.max(h, maxChildH);
    w = Math.max(56, Math.min(w, window.innerWidth - 16));
    h = Math.max(48, Math.min(h, window.innerHeight - 16));
    return { w: w, h: h };
  }

  function clampClusterPosition(x, y) {
    if (!cluster) return { left: x, top: y };
    var pad = 8;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var sz = getClusterContentSize();
    var w = sz.w;
    var h = sz.h;
    return {
      left: Math.max(pad, Math.min(vw - w - pad, x)),
      top: Math.max(pad, Math.min(vh - h - pad, y))
    };
  }

  function placeUndockedMascotInCluster() {
    if (!useCluster || !cluster || _eazyDocked) return;
    var sl = getSnapSlot();
    if (sl && el.parentNode === sl) return;
    if (el.parentNode !== cluster) cluster.appendChild(el);
    cluster.classList.add('creator-eazy-cluster--has-real-mascot');
  }

  function isDocked() {
    try { return localStorage.getItem(DOCK_KEY) === '1'; } catch (e) { return false; }
  }

  function saveDockState(docked) {
    try { localStorage.setItem(DOCK_KEY, docked ? '1' : '0'); } catch (e) {}
    scheduleMascotSyncToServer();
  }

  var MASCOT_SYNC_DEBOUNCE_MS = 2500;
  var mascotSyncTimer = null;
  function getMascotSyncUserId() {
    try {
      if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID) {
        return String(window.__EAZ_OWNER_ID).trim();
      }
    } catch (e) {}
    try {
      if (window.EazyBot && window.EazyBot.getUserId) return window.EazyBot.getUserId();
    } catch (e2) {}
    return null;
  }
  function getMascotSyncApiBase() {
    return (
      (window.CreatorChatActions && window.CreatorChatActions.API_BASE) ||
      'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch'
    );
  }
  function scheduleMascotSyncToServer() {
    if (mascotSyncTimer) clearTimeout(mascotSyncTimer);
    mascotSyncTimer = setTimeout(function () {
      mascotSyncTimer = null;
      pushMascotStateToServer();
    }, MASCOT_SYNC_DEBOUNCE_MS);
  }
  function pushMascotStateToServer() {
    var userId = getMascotSyncUserId();
    if (!userId) return;
    var payload = { docked: isDocked() };
    try {
      var m = localStorage.getItem(STORAGE_KEY);
      if (m) payload.mascot = JSON.parse(m);
    } catch (e) {}
    try {
      var c = localStorage.getItem(CLUSTER_KEY);
      if (c) payload.cluster = JSON.parse(c);
    } catch (e2) {}
    try {
      var cr = localStorage.getItem('eazy_compose_row_drag');
      if (cr) payload.composeRow = JSON.parse(cr);
    } catch (e3) {}
    fetch(getMascotSyncApiBase() + '?op=eazy-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        user_id: userId,
        preferences: { eazy_mascot_creator: payload }
      })
    }).catch(function () {});
  }
  function tryLoadMascotStateFromServer() {
    var userId = getMascotSyncUserId();
    if (!userId) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(CLUSTER_KEY)) return;
    } catch (e) {}
    fetch(getMascotSyncApiBase() + '?op=eazy-memory&user_id=' + encodeURIComponent(userId), {
      credentials: 'include'
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || !data.memory) return;
        var prefs =
          typeof data.memory.preferences === 'string'
            ? JSON.parse(data.memory.preferences)
            : data.memory.preferences;
        if (!prefs || !prefs.eazy_mascot_creator) return;
        var st = prefs.eazy_mascot_creator;
        try {
          if (st.mascot && typeof st.mascot.left === 'number' && typeof st.mascot.top === 'number') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(st.mascot));
          }
          if (st.cluster && typeof st.cluster.left === 'number' && typeof st.cluster.top === 'number') {
            localStorage.setItem(CLUSTER_KEY, JSON.stringify(st.cluster));
          }
          if (st.composeRow && typeof st.composeRow.x === 'number' && typeof st.composeRow.y === 'number') {
            localStorage.setItem('eazy_compose_row_drag', JSON.stringify(st.composeRow));
          }
          if (st.docked === true) {
            localStorage.setItem(DOCK_KEY, '1');
            dockEazy(false);
          } else if (st.docked === false) {
            localStorage.setItem(DOCK_KEY, '0');
          }
        } catch (e2) {}
        try {
          if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
        } catch (e3) {}
        reconcileComposeMode();
      })
      .catch(function () {});
  }

  function distToSlot(cx, cy) {
    var sl = getSnapSlot();
    if (!sl) return 99999;
    var r = sl.getBoundingClientRect();
    var sx = r.left + r.width / 2;
    var sy = r.top + r.height / 2;
    return Math.sqrt((cx - sx) * (cx - sx) + (cy - sy) * (cy - sy));
  }

  function applyPosition(left, top) {
    el.classList.add('eazy-mascot--positioned');
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function applyDefault() {
    el.classList.remove('eazy-mascot--positioned');
    el.style.left = '';
    el.style.top = '';
  }

  function clampPosition(x, y) {
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var pad = 8;
    return {
      left: Math.max(pad, Math.min(window.innerWidth - w - pad, x)),
      top: Math.max(pad, Math.min(window.innerHeight - h - pad, y))
    };
  }

  function isDesktopCreatorMode() {
    try {
      return !!(window.matchMedia && window.matchMedia('(min-width: 992px)').matches && document.getElementById('creatorDesktopApp'));
    } catch (_e) {
      return false;
    }
  }

  function getUndockHost() {
    if (isDesktopCreatorMode()) return document.body;
    var mobileApp = document.querySelector('.creator-mobile-app');
    return mobileApp || document.body;
  }

  var GHOST_SVG = '<svg class="eazy-snap-slot__indent" viewBox="18 16 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="eazy-hole-grad" x1="0.3" y1="0.2" x2="0.7" y2="0.9"><stop offset="0%" stop-color="rgba(25,18,45,0.9)"/><stop offset="100%" stop-color="rgba(12,8,22,0.95)"/></linearGradient><linearGradient id="eazy-hole-inner" x1="0.35" y1="0.25" x2="0.65" y2="0.85"><stop offset="0%" stop-color="rgba(20,14,38,0.95)"/><stop offset="100%" stop-color="rgba(10,6,18,0.98)"/></linearGradient><filter id="eazy-hole-shadow" x="-15%" y="-15%" width="130%" height="130%"><feOffset in="SourceAlpha" dx="1.5" dy="2"/><feGaussianBlur stdDeviation="1.2" result="blur"/><feFlood flood-color="rgba(0,0,0,0.35)"/><feComposite in2="blur" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#eazy-hole-shadow)"><path class="eazy-snap-slot__recess" d="M30 62c0-26 20-44 44-44 22 0 38 16 38 38 0 25-19 44-44 44-5 0-10-.8-14.5-2.2l-16.5 9.2 5.8-16.8C35.7 83 30 73.2 30 62Z"/><circle class="eazy-snap-slot__recess" cx="50" cy="28" r="7"/><path class="eazy-snap-slot__recess-inner" d="M56 39c-15 6-24 20-24 35 0 19 16 34 36 34 20 0 36-16 36-36 0-21-17-38-38-38-4.3 0-8.4.7-10 .9Z"/><circle class="eazy-snap-slot__recess-eye" cx="72" cy="62" r="6"/><circle class="eazy-snap-slot__recess-eye" cx="90" cy="54" r="5"/></g></svg>';

  function dockEazy(animate) {
    var snapSlot =
      el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('eazy-snap-slot')
        ? el.parentNode
        : getSnapSlot();
    if (!snapSlot) return;
    _eazyDocked = true;
    if (animate === undefined) animate = true;
    el.classList.remove('eazy-mascot--snap-mode', 'eazy-mascot--dragging', 'eazy-mascot--positioned');
    el.classList.add('eazy-mascot--docked');
    snapSlot.classList.remove('is-active', 'is-near');
    snapSlot.classList.add('is-docked');
    snapSlot.style.setProperty('--snap-glow', '0');
    while (snapSlot.firstChild) snapSlot.removeChild(snapSlot.firstChild);
    snapSlot.appendChild(el);
    if (cluster) cluster.classList.remove('creator-eazy-cluster--has-real-mascot');
    el.style.left = '';
    el.style.top = '';
    el.style.position = '';
    el.style.animation = 'eazy-dock-flash 0.4s ease-out';
    setTimeout(function () { el.style.animation = ''; }, 400);
    var header = document.querySelector('.creator-header');
    if (header) {
      header.classList.remove('creator-header--snap-vibrate');
      header.style.removeProperty('--snap-vibrate');
      header.classList.add('creator-header--cracked');
      if (animate) {
        header.classList.add('creator-header--dock-bang');
        header.style.animation = 'eazy-header-earthquake 0.6s ease-out';
        setTimeout(function () {
          header.style.animation = '';
          header.classList.remove('creator-header--dock-bang');
        }, 600);
        try { navigator.vibrate([50, 80, 50, 80, 100]); } catch (e) {}
      }
    }
    saveDockState(true);
    try {
      localStorage.removeItem(COMPOSE_TEMP_UNDOCK_KEY);
    } catch (e0) {}
    if (animate && typeof window.creditEazySnapReward === 'function') {
      window.creditEazySnapReward().then(function (ok) {
        if (ok && typeof window.showEazySnapRewardToast === 'function') {
          window.showEazySnapRewardToast();
        }
      }).catch(function () {});
    }
    reconcileComposeMode();
    try {
      if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
    } catch (e) {}
  }

  function undockEazy(skipRelocate, preserveDockPreference) {
    var snapSlot = el.parentNode;
    if (!snapSlot || !snapSlot.classList || !snapSlot.classList.contains('eazy-snap-slot')) return;
    _eazyDocked = false;
    el.classList.remove('eazy-mascot--docked');
    snapSlot.classList.remove('is-docked');
    snapSlot.removeChild(el);
    snapSlot.insertAdjacentHTML('beforeend', GHOST_SVG);
    var header = document.querySelector('.creator-header');
    if (header) header.classList.remove('creator-header--cracked');

    if (useCluster) {
      placeUndockedMascotInCluster();
      el.classList.add('eazy-mascot--positioned');
      el.style.left = '';
      el.style.top = '';
      el.style.position = '';
    } else {
      var host = getUndockHost();
      host.appendChild(el);
      var pos = loadPosition();
      if (pos) {
        var c = clampPosition(pos.left, pos.top);
        applyPosition(c.left, c.top);
      } else {
        applyDefault();
      }
    }
    if (preserveDockPreference) {
      try {
        localStorage.setItem(COMPOSE_TEMP_UNDOCK_KEY, '1');
      } catch (eP) {}
    } else {
      saveDockState(false);
      try {
        localStorage.removeItem(COMPOSE_TEMP_UNDOCK_KEY);
      } catch (eQ) {}
    }
    reconcileComposeMode();
    if (!skipRelocate) {
      try {
        if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
      } catch (e) {}
    }
  }

  function getVibrateIntensity(distance) {
    if (distance >= SNAP_VIBRATE_MAX_DISTANCE) return 0.2;
    var t = 1 - distance / SNAP_VIBRATE_MAX_DISTANCE;
    return 0.2 + t * 0.52;
  }

  function activateSnapMode() {
    var snapSlot = getSnapSlot();
    if (!snapSlot) return;
    if (cluster) cluster.classList.remove('creator-eazy-cluster--compose-center');
    snapSlot.classList.add('is-active');
    snapSlot.classList.remove('is-near');
    snapSlot.style.setProperty('--snap-glow', '0');
    el.classList.add('eazy-mascot--snap-mode');
    var header = document.querySelector('.creator-header');
    if (header) {
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = distToSlot(cx, cy);
      header.classList.add('creator-header--snap-vibrate');
      header.style.setProperty('--snap-vibrate', getVibrateIntensity(d).toFixed(3));
    }
    try { navigator.vibrate(30); } catch (e) {}
  }

  function deactivateSnapMode() {
    el.classList.remove('eazy-mascot--snap-mode');
    ['eazy-snap-slot--mobile', 'eazy-snap-slot--desktop'].forEach(function (id) {
      var s = document.getElementById(id);
      if (s) {
        s.classList.remove('is-active', 'is-near');
        s.style.setProperty('--snap-glow', '0');
      }
    });
    var header = document.querySelector('.creator-header');
    if (header) {
      header.classList.remove('creator-header--snap-vibrate');
      header.style.removeProperty('--snap-vibrate');
    }
    reconcileComposeMode();
  }

  function persistDragPosition() {
    if (useCluster && !_eazyDocked && cluster) {
      var cl = parseFloat(cluster.style.left);
      var ct = parseFloat(cluster.style.top);
      if (!isNaN(cl) && !isNaN(ct)) {
        saveClusterPosition(cl, ct);
        saveDockState(false);
        try {
          localStorage.removeItem(COMPOSE_TEMP_UNDOCK_KEY);
        } catch (eR) {}
        return;
      }
    }
    if (isComposeCenterActive()) return;
    var l = parseFloat(el.style.left);
    var t = parseFloat(el.style.top);
    if (!isNaN(l) && !isNaN(t)) {
      savePosition(l, t);
      saveDockState(false);
      try {
        localStorage.removeItem(COMPOSE_TEMP_UNDOCK_KEY);
      } catch (eS) {}
    }
  }

  (function initDrag() {
    var startX;
    var startY;
    var lastCx;
    var lastCy;
    var dragging = false;
    var snapModeActive = false;
    var longPressTimer = null;
    var offsetX;
    var offsetY;
    var pointerType = null;
    var pressStartedAt = 0;
    var longPressTriggered = false;

    function startDrag(e) {
      e.preventDefault();
      pressStartedAt = Date.now();
      longPressTriggered = false;
      if (_eazyDocked) {
        if (window.EazyGuide && window.EazyGuide.shouldBlockUndock && window.EazyGuide.shouldBlockUndock()) {
          return;
        }
        startX = toClientCoords(e).x;
        startY = toClientCoords(e).y;
        longPressTimer = setTimeout(function () {
          longPressTimer = null;
          longPressTriggered = true;
          suppressClickUntil = Date.now() + 420;
          undockEazy();
          if (useCluster && cluster) {
            var cr = cluster.getBoundingClientRect();
            offsetX = startX - cr.left;
            offsetY = startY - cr.top;
          } else {
            offsetX = 19;
            offsetY = 19;
            el.style.position = 'fixed';
            el.style.left = startX - 19 + 'px';
            el.style.top = startY - 19 + 'px';
          }
          lastCx = startX;
          lastCy = startY;
          dragging = true;
          activateSnapMode();
        }, LONG_PRESS_MS);
        return;
      }
      var p = toClientCoords(e);
      if (useCluster && cluster) {
        placeUndockedMascotInCluster();
        var cRect = cluster.getBoundingClientRect();
        offsetX = p.x - cRect.left;
        offsetY = p.y - cRect.top;
      } else {
        var rect = el.getBoundingClientRect();
        if (!el.classList.contains('eazy-mascot--positioned') && !el.classList.contains('eazy-mascot--docked')) {
          el.classList.add('eazy-mascot--positioned');
          el.style.left = rect.left + 'px';
          el.style.top = rect.top + 'px';
        }
        offsetX = p.x - rect.left;
        offsetY = p.y - rect.top;
      }
      startX = p.x;
      startY = p.y;
      dragging = false;
      longPressTimer = setTimeout(function () {
        longPressTimer = null;
        longPressTriggered = true;
        suppressClickUntil = Date.now() + 420;
        activateSnapMode();
      }, LONG_PRESS_MS);
    }

    function onMove(cx, cy) {
      lastCx = cx;
      lastCy = cy;
      var dx = cx - startX;
      var dy = cy - startY;
      if (!dragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        dragging = true;
        suppressClickUntil = Date.now() + 420;
        el.classList.add('eazy-mascot--dragging');
        if (useCluster && cluster) cluster.classList.add('creator-eazy-cluster--dragging');
        if (
          useCluster &&
          cluster &&
          cluster.classList.contains('creator-eazy-cluster--compose-center') &&
          !el.classList.contains('eazy-mascot--snap-mode')
        ) {
          var cr0 = cluster.getBoundingClientRect();
          cluster.classList.remove('creator-eazy-cluster--compose-center');
          applyClusterPosition(cr0.left, cr0.top);
          offsetX = cx - cr0.left;
          offsetY = cy - cr0.top;
        }
      }
      if (!dragging) return;

      if (useCluster && !_eazyDocked && cluster) {
        var nl = cx - offsetX;
        var nt = cy - offsetY;
        var cc = clampClusterPosition(nl, nt);
        applyClusterPosition(cc.left, cc.top);
      } else {
        el.style.left = cx - offsetX + 'px';
        el.style.top = cy - offsetY + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      }

      if (el.classList.contains('eazy-mascot--snap-mode')) {
        var d = distToSlot(cx, cy);
        var nearSlot = getSnapSlot();
        if (nearSlot) {
          nearSlot.classList.toggle('is-near', d < SNAP_NEAR_DISTANCE);
          var intensity = 1 - Math.min(1, d / SNAP_VIBRATE_MAX_DISTANCE);
          nearSlot.style.setProperty('--snap-glow', intensity.toFixed(2));
        }
        var header = document.querySelector('.creator-header');
        if (header) {
          header.style.setProperty('--snap-vibrate', getVibrateIntensity(d).toFixed(3));
        }
      }
    }

    function onEnd() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      var shouldOpenFromTouchTap =
        pointerType === 'touch' &&
        !dragging &&
        !longPressTriggered &&
        Date.now() - pressStartedAt < LONG_PRESS_MS;
      snapModeActive = el.classList.contains('eazy-mascot--snap-mode');
      el.classList.remove('eazy-mascot--dragging');
      if (useCluster && cluster) cluster.classList.remove('creator-eazy-cluster--dragging');

      if (snapModeActive && dragging) {
        var d = distToSlot(lastCx, lastCy);
        if (d < SNAP_DISTANCE) {
          dockEazy();
        } else {
          persistDragPosition();
        }
        deactivateSnapMode();
        try {
          if (!_eazyDocked && typeof window.syncCreatorMobileEazyLookLeft === 'function') {
            window.syncCreatorMobileEazyLookLeft();
          }
        } catch (e2) {}
      } else if (dragging) {
        persistDragPosition();
        lastDragAt = Date.now();
        scheduleEazyFacingSync();
        try {
          if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
            window.syncCreatorMobileEazyLookLeft();
          }
        } catch (e) {}
      }
      if (dragging || longPressTriggered) {
        suppressClickUntil = Date.now() + 420;
      }
      dragging = false;
      snapModeActive = false;
      if (shouldOpenFromTouchTap) {
        openCreatorChatFromMascot();
      }
    }

    el.addEventListener('mousedown', function (e) {
      pointerType = 'mouse';
      startDrag(e);
      function mm(e2) { onMove(e2.clientX, e2.clientY); }
      function mu() {
        onEnd();
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
      }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });

    el.addEventListener(
      'touchstart',
      function (e) {
        pointerType = 'touch';
        startDrag(e);
        function tm(e2) {
          e2.preventDefault();
          var t2 = e2.touches[0];
          onMove(t2.clientX, t2.clientY);
        }
        function te() {
          onEnd();
          document.removeEventListener('touchmove', tm);
          document.removeEventListener('touchend', te);
        }
        document.addEventListener('touchmove', tm, { passive: false });
        document.addEventListener('touchend', te);
      },
      { passive: false }
    );
  })();

  if (isDocked()) {
    dockEazy(false);
  } else if (useCluster) {
    placeUndockedMascotInCluster();
    el.classList.add('eazy-mascot--positioned');
    el.style.left = '';
    el.style.top = '';
    el.style.position = '';
    reconcileComposeMode();
  } else {
    var pos = loadPosition();
    if (pos) {
      var c = clampPosition(pos.left, pos.top);
      applyPosition(c.left, c.top);
    } else {
      applyDefault();
    }
  }

  try {
    window.addEventListener('creatorJobPollingStarted', function (ev) {
      if (ev && ev.detail && ev.detail.noPulse) return;
      genOverlayCount++;
      reconcileComposeMode();
      try {
        if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
      } catch (e) {}
    });
    window.addEventListener('creatorJobPollingStopped', function () {
      genOverlayCount = Math.max(0, genOverlayCount - 1);
      reconcileComposeMode();
      try {
        if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
      } catch (e2) {}
    });
    var resizeT = null;
    window.addEventListener('resize', function () {
      if (resizeT) clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        resizeT = null;
        scheduleEazyFacingSync();
      }, 80);
    });
  } catch (e) {}

  try {
    tryLoadMascotStateFromServer();
  } catch (e2) {}
})();
