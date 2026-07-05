/**
 * Creator Settings → Creator Wear: status, connect, disconnect.
 */
(function () {
  'use strict';

  var API_BASE = 'https://creator-engine.eazpire.workers.dev';
  var scannerActive = false;
  var streamRef = null;
  var detectTimer = null;

  function resolveOwnerId() {
    try {
      if (typeof window._resolveEazOwnerId === 'function') {
        var r = window._resolveEazOwnerId();
        if (r != null && String(r).trim()) return String(r).trim();
      }
      if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
      if (window.logged_in_customer_id != null) return String(window.logged_in_customer_id).trim();
      if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId).trim();
    } catch (_e) {}
    return '';
  }

  function parseWearToken(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    try {
      if (/^eazpire:\/\//i.test(s)) {
        var u = new URL(s.replace(/^eazpire:\/\//i, 'https://eazpire.local/'));
        return u.searchParams.get('t');
      }
      if (s.indexOf('wear-pair') !== -1) {
        var u2 = new URL(s);
        return u2.searchParams.get('t');
      }
    } catch (_e) {}
    var m = s.match(/[?&]t=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function isMissingTranslationString(s) {
    var t = String(s || '').toLowerCase();
    return (
      !t ||
      t.indexOf('translation missing') !== -1 ||
      t.indexOf('übersetzung fehlt') !== -1 ||
      t.indexOf('traduction manquante') !== -1
    );
  }

  function wearT(key, fallback) {
    var i18n = window.CreatorI18n || {};
    var v = i18n[key] && String(i18n[key]).trim();
    if (v && !isMissingTranslationString(v)) return v;
    return fallback;
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('csmWearStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('csm-wear-status--error', !!isError);
  }

  function setStatusBlock(html) {
    var el = document.getElementById('csmWearStatusBlock');
    if (!el) return;
    el.innerHTML = html || '';
  }

  function formatWhen(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch (_e) {
      return '';
    }
  }

  function appendOwnerAuth(url) {
    var oid = resolveOwnerId();
    if (oid) {
      url.searchParams.set('logged_in_customer_id', oid);
      url.searchParams.set('owner_id', oid);
    }
    return oid;
  }

  function updateButtons(connected, connectReady) {
    var connect = document.getElementById('csmWearConnectBtn');
    var disconnect = document.getElementById('csmWearDisconnectBtn');
    var ready = connectReady !== false;
    if (connect) connect.hidden = !!connected || !ready;
    if (disconnect) disconnect.hidden = !connected;
  }

  function openSettingsTab(tabName) {
    try {
      if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.setTab === 'function') {
        window.CreatorSettingsV2Modal.setTab(tabName);
      }
    } catch (_e) {}
  }

  function renderPrerequisites(prerequisites) {
    var block = document.getElementById('csmWearPrereqBlock');
    if (!block) return;
    var missing = (prerequisites && prerequisites.missing) || [];
    if (!missing.length || prerequisites.connect_ready === true) {
      block.hidden = true;
      block.innerHTML = '';
      return;
    }
    var items = '';
    if (missing.indexOf('creator_code') !== -1) {
      items +=
        '<div class="csm-wear-prereq__item">' +
        '<p class="csm-wear-prereq__item-title">' +
        wearT('wear_prereq_creator_code', 'Redeem a Creator Code') +
        '</p><p class="csm-wear-prereq__item-how">' +
        wearT('wear_prereq_creator_code_how', 'Open Creator Settings → Creator Codes and enter your code.') +
        '</p><button type="button" class="csm-wear-prereq__item-cta" data-wear-prereq-tab="creator-codes">' +
        wearT('wear_prereq_go_creator_code', 'Go to Creator Codes') +
        '</button></div>';
    }
    if (missing.indexOf('creator_name') !== -1) {
      items +=
        '<div class="csm-wear-prereq__item">' +
        '<p class="csm-wear-prereq__item-title">' +
        wearT('wear_prereq_creator_name', 'Add at least one Creator Name') +
        '</p><p class="csm-wear-prereq__item-how">' +
        wearT('wear_prereq_creator_name_how', 'Open Creator Settings → Creator Names and add your public display name.') +
        '</p><button type="button" class="csm-wear-prereq__item-cta" data-wear-prereq-tab="creator-names">' +
        wearT('wear_prereq_go_creator_names', 'Go to Creator Names') +
        '</button></div>';
    }
    block.innerHTML =
      '<h5 class="csm-wear-prereq__title">' +
      wearT('wear_prereq_title', 'Before you can connect') +
      '</h5><p class="csm-wear-prereq__intro">' +
      wearT('wear_prereq_intro', 'Complete these steps in Creator Settings:') +
      '</p>' +
      items;
    block.hidden = false;
    block.querySelectorAll('[data-wear-prereq-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-wear-prereq-tab');
        if (tab) openSettingsTab(tab);
      });
    });
  }

  async function fetchWearStatus() {
    var ownerId = resolveOwnerId();
    if (!ownerId) {
      setStatusBlock('');
      renderPrerequisites(null);
      setStatus(wearT('wear_phone_logged_out', 'This device: not logged in'), true);
      updateButtons(false, false);
      return;
    }
    var url = new URL(API_BASE + '/api/wear-pair/status');
    appendOwnerAuth(url);
    try {
      var res = await fetch(url.toString(), { credentials: 'include' });
      var data = await res.json();
      var prereq = data.prerequisites || null;
      var connectReady = data.connect_ready !== false && (!prereq || prereq.connect_ready !== false);
      renderPrerequisites(prereq);

      if (data.connected) {
        var name = data.device_name || data.device_id || 'Watch';
        try {
          localStorage.setItem('eaz_wear_last_device', String(name));
          if (data.connected_at) {
            localStorage.setItem('eaz_wear_connected_at', String(data.connected_at));
          }
        } catch (_e) {}
        var whenStr = formatWhen(data.connected_at);
        var block =
          '<p class="csm-wear-status-line csm-wear-status-line--ok">' +
          wearT('wear_phone_logged_in', 'This device: logged in') +
          '</p><p class="csm-wear-status-line">' +
          wearT('wear_connected_watch', 'Connected watch: {{name}}').replace('{{name}}', name) +
          '</p>';
        if (whenStr) {
          block +=
            '<p class="csm-wear-status-line">' +
            wearT('wear_connected_at', 'Connected: {{when}}').replace('{{when}}', whenStr) +
            '</p>';
        }
        setStatusBlock(block);
        setStatus('', false);
        updateButtons(true, true);
      } else {
        setStatusBlock(
          '<p class="csm-wear-status-line">' +
            wearT('wear_phone_logged_in', 'This device: logged in') +
            '</p><p class="csm-wear-status-line">' +
            wearT('wear_not_connected', 'No watch connected to your account.') +
            '</p>'
        );
        setStatus('', false);
        updateButtons(false, connectReady);
      }
    } catch (_e) {
      setStatusBlock('');
      renderPrerequisites(null);
      setStatus(wearT('wear_phone_logged_in', 'This device: logged in'), false);
      updateButtons(false, false);
    }
  }

  async function claimToken(token) {
    var ownerId = resolveOwnerId();
    if (!ownerId) {
      setStatus(wearT('wear_login_required', 'Log in on this device first.'), true);
      return;
    }
    setStatus('Connecting…', false);
    var url = new URL(API_BASE + '/api/wear-pair/claim');
    appendOwnerAuth(url);
    var res = await fetch(url.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token, phone_device_name: 'Web' }),
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_e) {}
    if (data.ok) {
      setStatus(wearT('wear_connected_ok', 'Watch connected. Open the Wear app on your watch.'), false);
      await fetchWearStatus();
    } else if (data.error === 'wear_prerequisites_not_met') {
      renderPrerequisites(data.prerequisites || { missing: data.missing || [] });
      updateButtons(false, false);
      setStatus(wearT('wear_prereq_title', 'Before you can connect'), true);
    } else {
      setStatus(data.error || 'Connection failed', true);
    }
  }

  async function disconnectWear() {
    var ownerId = resolveOwnerId();
    if (!ownerId) return;
    setStatus('Disconnecting…', false);
    var url = new URL(API_BASE + '/api/wear-pair/disconnect');
    appendOwnerAuth(url);
    try {
      var res = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      var data = await res.json();
      if (data.ok) {
        try {
          localStorage.removeItem('eaz_wear_last_device');
          localStorage.removeItem('eaz_wear_connected_at');
        } catch (_e) {}
        setStatus(wearT('wear_disconnected', 'Watch disconnected.'), false);
        await fetchWearStatus();
      } else {
        setStatus(data.error || 'Disconnect failed', true);
      }
    } catch (e) {
      setStatus(String(e.message || e), true);
    }
  }

  function stopScanner() {
    scannerActive = false;
    if (detectTimer) {
      clearInterval(detectTimer);
      detectTimer = null;
    }
    if (streamRef) {
      streamRef.getTracks().forEach(function (t) {
        t.stop();
      });
      streamRef = null;
    }
    var wrap = document.getElementById('csmWearScanner');
    if (wrap) wrap.hidden = true;
  }

  async function startScanner() {
    if (!resolveOwnerId()) {
      setStatus(wearT('wear_login_required', 'Log in on this device first.'), true);
      return;
    }
    var statusUrl = new URL(API_BASE + '/api/wear-pair/status');
    appendOwnerAuth(statusUrl);
    try {
      var preRes = await fetch(statusUrl.toString(), { credentials: 'include' });
      var preData = await preRes.json();
      var pre = preData.prerequisites;
      if (pre && pre.connect_ready === false) {
        renderPrerequisites(pre);
        updateButtons(false, false);
        setStatus(wearT('wear_prereq_title', 'Before you can connect'), true);
        return;
      }
    } catch (_e) {}
    if (!window.isSecureContext) {
      setStatus('Camera requires HTTPS.', true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Camera not available in this browser. Use the Eazpire Android app.', true);
      return;
    }
    var wrap = document.getElementById('csmWearScanner');
    var video = document.getElementById('csmWearScannerVideo');
    if (!wrap || !video) return;
    wrap.hidden = false;
    scannerActive = true;
    try {
      streamRef = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      video.srcObject = streamRef;
      await video.play();
    } catch (e) {
      stopScanner();
      setStatus('Camera permission denied.', true);
      return;
    }

    var Detector = window.BarcodeDetector;
    if (!Detector) {
      stopScanner();
      setStatus('QR scanning is not supported here. Use the Eazpire Android app → Creator Wear → Connect.', true);
      return;
    }
    var detector = new Detector({ formats: ['qr_code'] });
    detectTimer = setInterval(async function () {
      if (!scannerActive || video.readyState < 2) return;
      try {
        var codes = await detector.detect(video);
        for (var i = 0; i < codes.length; i++) {
          var token = parseWearToken(codes[i].rawValue);
          if (token) {
            stopScanner();
            await claimToken(token);
            return;
          }
        }
      } catch (_e) {}
    }, 500);
  }

  function bind() {
    var connect = document.getElementById('csmWearConnectBtn');
    var disconnect = document.getElementById('csmWearDisconnectBtn');
    var close = document.getElementById('csmWearScannerClose');
    if (connect) connect.addEventListener('click', startScanner);
    if (disconnect) disconnect.addEventListener('click', disconnectWear);
    if (close) close.addEventListener('click', stopScanner);
  }

  function init() {
    bind();
    fetchWearStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('creator-settings-v2-opened', fetchWearStatus);
  window.addEventListener('creator-settings-v2-tab-changed', function (e) {
    if (e && e.detail && e.detail.tab === 'creator-wear') {
      fetchWearStatus();
      stopScanner();
    }
  });
})();
