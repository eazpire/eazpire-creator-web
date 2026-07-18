/**
 * Creator Settings — EAZ panel: balance split, transaction log, package grid.
 */
(function () {
  'use strict';

  var FREE_CAP_FALLBACK = 50;
  var DAY_MS = 86400000;
  var countdownTimer = null;
  var transactionsCache = [];
  var starterPackLoading = false;
  var starterPackCachedGen = [];
  var starterPackCachedUp = [];
  var starterPackKind = 'generated';

  function fmtEaz(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    var v = Number(n);
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  function fmtUsd(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n));
    } catch (e) {
      return Number(n).toFixed(2) + ' USD';
    }
  }

  function toggleEazLockBanners(show) {
    document.querySelectorAll('[data-eaz-lock-banner]').forEach(function (el) {
      el.hidden = !show;
    });
  }

  function openCreatorCodesTab() {
    if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
      if (typeof window.CreatorSettingsV2Modal.isOpen === 'function' && window.CreatorSettingsV2Modal.isOpen()) {
        window.CreatorSettingsV2Modal.setTab('creator-codes');
      } else {
        window.CreatorSettingsV2Modal.open({ tab: 'creator-codes' });
      }
    }
  }

  function syncEazBalanceCtaLockedState(locked) {
    var ctaBuy = document.getElementById('creatorEazCtaBuy');
    if (!ctaBuy) return;
    var def = ctaBuy.getAttribute('data-default-label') || '';
    var enterLbl =
      window.CreatorI18n && window.CreatorI18n.eaz_enter_creator_code_cta
        ? window.CreatorI18n.eaz_enter_creator_code_cta
        : 'Enter Creator Code';
    ctaBuy.textContent = locked ? enterLbl : def;
  }

  function pkgUsdPrice(p) {
    if (p == null) return null;
    if (p.priceUSD != null) return Number(p.priceUSD);
    if (p.priceEUR != null) return Number(p.priceEUR);
    return null;
  }

  function tpl(str, map) {
    var out = String(str || '');
    Object.keys(map).forEach(function (k) {
      out = out.replace(new RegExp('\\{\\{\\s*' + k + '\\s*\\}\\}', 'gi'), String(map[k]));
    });
    return out;
  }

  function formatTime(isoOrMs) {
    try {
      var d = new Date(isoOrMs);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
      return '';
    }
  }

  function parsePackages() {
    var panel = document.getElementById('creatorEazPanel');
    var raw = panel && panel.getAttribute('data-eaz-packages');
    if (raw) {
      try {
        var fromAttr = JSON.parse(raw);
        if (Array.isArray(fromAttr) && fromAttr.length) {
          fromAttr = fromAttr.slice().sort(function (a, b) { return (a.eaz || 0) - (b.eaz || 0); });
          return fromAttr.slice(0, 3);
        }
      } catch (e) { /* fall through */ }
    }
    var el = document.getElementById('creator-eaz-packages-json');
    if (!el) return [];
    try {
      var arr = JSON.parse(el.textContent || '[]');
      if (!Array.isArray(arr)) return [];
      arr = arr.slice().sort(function (a, b) { return (a.eaz || 0) - (b.eaz || 0); });
      return arr.slice(0, 3);
    } catch (e) {
      return [];
    }
  }

  function getSubtabButtons() {
    return document.querySelectorAll('.creator-eaz-tab[data-eaz-subtab]');
  }

  function selectLogFilter(filter) {
    var f = filter || 'all';
    document.querySelectorAll('.creator-eaz-log-subtab[data-eaz-log-filter]').forEach(function (b) {
      var on = (b.getAttribute('data-eaz-log-filter') || '') === f;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function isStarterPackEligible(data) {
    return !!(
      data &&
      data.ok !== false &&
      data.is_creator !== true &&
      data.eaz_wallet_active === false &&
      data.trial_mode === true &&
      Number(data.display_level || 1) === 1 &&
      Number(data.xp_level != null ? data.xp_level : 1) === 1 &&
      data.trial_generate_cap != null &&
      data.trial_upload_cap != null
    );
  }

  function syncStarterPackTabVisibility(data) {
    var tab = document.getElementById('eaz-tab-starter');
    if (!tab) return;
    var eligible = isStarterPackEligible(data);
    tab.hidden = !eligible;
    var panelRoot = document.getElementById('creatorEazPanel');
    if (panelRoot) panelRoot.setAttribute('data-starter-eligible', eligible ? 'true' : 'false');
    if (!eligible && tab.classList.contains('is-active')) {
      setSubTab('balance', true);
    }
  }

  function applyStarterPackKind(kind) {
    starterPackKind = kind === 'uploaded' ? 'uploaded' : 'generated';
    document.querySelectorAll('.creator-eaz-starter-kind-btn[data-starter-kind]').forEach(function (b) {
      var on = (b.getAttribute('data-starter-kind') || '') === starterPackKind;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var grid = document.getElementById('eazStarterGrid');
    if (grid) {
      grid.setAttribute(
        'aria-labelledby',
        starterPackKind === 'uploaded' ? 'eazStarterKindUploaded' : 'eazStarterKindGenerated'
      );
    }
    var items = starterPackKind === 'uploaded' ? starterPackCachedUp : starterPackCachedGen;
    renderStarterPackThumbs(items);
  }

  function renderStarterPackThumbs(items) {
    var grid = document.getElementById('eazStarterGrid');
    var empty = document.getElementById('eazStarterEmpty');
    if (!grid) return;
    grid.innerHTML = '';
    var list = items && items.length ? items : [];
    if (!list.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.forEach(function (it) {
      var cell = document.createElement('div');
      cell.className = 'creator-eaz-starter-thumb';
      cell.setAttribute('role', 'listitem');
      var inner = document.createElement('div');
      inner.className = 'creator-eaz-starter-thumb-inner';
      if (it.preview_url) {
        var img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = it.preview_url;
        inner.appendChild(img);
      }
      cell.appendChild(inner);
      if (!it.preview_url) {
        cell.classList.add('creator-eaz-starter-thumb--empty');
      }
      grid.appendChild(cell);
    });
  }

  function renderStarterNotApplicableSummary() {
    var msg =
      window.CreatorI18n && window.CreatorI18n.eaz_starter_not_applicable
        ? window.CreatorI18n.eaz_starter_not_applicable
        : '—';
    var genLine = document.getElementById('eazStarterGenLine');
    var upLine = document.getElementById('eazStarterUploadLine');
    if (genLine) genLine.textContent = msg;
    if (upLine) upLine.textContent = msg;
    starterPackCachedGen = [];
    starterPackCachedUp = [];
    var kindEl = document.querySelector('.creator-eaz-starter-kind');
    if (kindEl) kindEl.hidden = true;
    renderStarterPackThumbs([]);
  }

  function starterSummaryLine(used, cap, rem) {
    var tplSum = window.CreatorI18n && window.CreatorI18n.eaz_starter_summary_tpl;
    if (tplSum && String(tplSum).trim()) {
      return tpl(tplSum, {
        used: String(used),
        cap: String(cap),
        remaining: String(rem),
      });
    }
    return String(used) + '/' + String(cap) + ' · ' + String(rem) + ' left';
  }

  function applyBalanceStarterSummary(data) {
    if (!data || data.trial_generate_cap == null || data.trial_upload_cap == null) return;
    var genLine = document.getElementById('eazBalanceGenLine');
    var upLine = document.getElementById('eazBalanceUploadLine');
    if (genLine) {
      genLine.textContent = starterSummaryLine(
        Number(data.trial_generate_used || 0),
        Number(data.trial_generate_cap || 0),
        Number(data.trial_generate_remaining || 0)
      );
    }
    if (upLine) {
      upLine.textContent = starterSummaryLine(
        Number(data.trial_upload_used || 0),
        Number(data.trial_upload_cap || 0),
        Number(data.trial_upload_remaining || 0)
      );
    }
  }

  function toggleBalancePaneMode(locked, data) {
    var starterView = document.getElementById('eazBalanceStarterView');
    var walletView = document.getElementById('eazBalanceWalletView');
    if (starterView) starterView.hidden = !locked;
    if (walletView) walletView.hidden = !!locked;
    if (locked) applyBalanceStarterSummary(data);
  }

  function setSubTab(name, skipFocus, skipLogsFetch) {
    var sub = name || 'balance';
    var starterTab = document.getElementById('eaz-tab-starter');
    if (sub === 'starter' && starterTab && starterTab.hidden) {
      sub = 'balance';
    }
    getSubtabButtons().forEach(function (btn) {
      var is = btn.getAttribute('data-eaz-subtab') === sub;
      btn.classList.toggle('is-active', is);
      btn.setAttribute('aria-selected', is ? 'true' : 'false');
    });
    document.querySelectorAll('.creator-eaz-panel-pane[data-eaz-pane]').forEach(function (pane) {
      var is = pane.getAttribute('data-eaz-pane') === sub;
      pane.classList.toggle('is-active', is);
      if (is) pane.removeAttribute('hidden'); else pane.setAttribute('hidden', 'hidden');
    });
    if (sub === 'logs' && !skipLogsFetch) loadTransactions();
    if (sub === 'starter') loadStarterPack();
    if (sub === 'costs') renderEazCostsTab();
    if (!skipFocus) {
      var activeBtn = document.querySelector('.creator-eaz-tab.is-active');
      if (activeBtn) activeBtn.focus();
    }
  }

  function ownerId() {
    if (typeof window._resolveEazOwnerId === 'function') return window._resolveEazOwnerId();
    return window.__EAZ_OWNER_ID || null;
  }

  var earnedConvertCfg = { eaz_cents_per_eaz: 10, fiat_currency: 'USD', min_convert_eaz: 100 };
  var earnedAvailableEaz = 0;

  function presentmentCurrency() {
    if (window.EazShopMoney && typeof window.EazShopMoney.presentmentCurrency === 'function') {
      return window.EazShopMoney.presentmentCurrency();
    }
    return earnedConvertCfg.fiat_currency || 'USD';
  }

  function formatFiatFromUsdCents(usdCents) {
    var target = presentmentCurrency();
    var cents = usdCents;
    if (window.EazShopMoney && typeof window.EazShopMoney.convertCentsBetweenCurrencies === 'function') {
      cents = window.EazShopMoney.convertCentsBetweenCurrencies(usdCents, 'USD', target);
    }
    if (window.EazShopMoney && typeof window.EazShopMoney.formatPriceCents === 'function') {
      return window.EazShopMoney.formatPriceCents(cents, target);
    }
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: target,
      }).format(cents / 100);
    } catch (_e) {
      return (cents / 100).toFixed(2) + ' ' + target;
    }
  }

  function updateCreatorConvertAvailDisplay() {
    var availEl = document.getElementById('creatorEazConvertAvail');
    var eazcAvailEl = document.getElementById('creatorEazcConvertAvail');
    var val = fmtEaz(earnedAvailableEaz) + ' EAZC';
    if (availEl) availEl.textContent = val;
    if (eazcAvailEl) eazcAvailEl.textContent = val;
  }

  function updateEazcToEazgPreview() {
    var preview = document.getElementById('creatorEazcToEazgPreview');
    var amountEl = document.getElementById('creatorEazcToEazgAmount');
    if (!preview) return;
    updateCreatorConvertAvailDisplay();
    var amount = Number(amountEl && amountEl.value);
    if (!amount || amount <= 0) {
      preview.textContent = '';
      return;
    }
    var tpl =
      (window.CreatorI18n && window.CreatorI18n.eazc_convert_to_eazg_preview) ||
      'You receive {{amount}} EAZV (1:1)';
    preview.textContent = tpl.replace(/\{\{amount\}\}/g, fmtEaz(amount));
  }

  async function apiFetch(op, params) {
    if (typeof window.creatorApiFetch !== 'function') throw new Error('creatorApiFetch unavailable');
    return window.creatorApiFetch(op, params || {});
  }

  async function apiPost(op, body) {
    if (typeof window.creatorApiFetch !== 'function') throw new Error('creatorApiFetch unavailable');
    return window.creatorApiFetch(op, {}, { method: 'POST', body: body || {} });
  }

  function updateCreatorConvertPreview() {
    var preview = document.getElementById('creatorEazConvertPreview');
    var amountEl = document.getElementById('creatorEazConvertAmount');
    if (!preview) return;
    var amount = Number(amountEl && amountEl.value);
    var rate = earnedConvertCfg.eaz_cents_per_eaz || 10;
    updateCreatorConvertAvailDisplay();
    if (!amount || amount <= 0 || !rate) {
      preview.textContent = '';
      return;
    }
    var usdCents = Math.round(amount * rate);
    var tpl = (window.CreatorI18n && window.CreatorI18n.eaz_convert_preview) || '≈ {{amount}}';
    preview.textContent = tpl.replace(/\{\{amount\}\}/g, formatFiatFromUsdCents(usdCents));
  }

  async function runEazcToEazgConvert() {
    var oid = ownerId();
    var amountEl = document.getElementById('creatorEazcToEazgAmount');
    var amount = Number(amountEl && amountEl.value);
    var min = 1;
    if (!oid || !amount || amount < min || amount > earnedAvailableEaz + 1e-9) {
      var minMsg =
        (window.CreatorI18n && window.CreatorI18n.eazc_convert_min_tpl) ||
        'Minimum {{min}} EAZC required.';
      alert(minMsg.replace(/\{\{min\}\}/g, String(min)));
      return;
    }
    var confirmTpl =
      (window.CreatorI18n && window.CreatorI18n.eazc_convert_to_eazg_confirm) ||
      'Convert {{amount}} EAZC to {{amount}} EAZV? This reduces your cash-out balance.';
    if (!window.confirm(confirmTpl.replace(/\{\{amount\}\}/g, fmtEaz(amount)))) return;
    try {
      var res = await apiPost('convert-eazc-to-eazg', { owner_id: oid, amount_eaz: amount });
      if (!res || !res.ok) throw new Error((res && res.error) || 'failed');
      if (amountEl) amountEl.value = '';
      updateEazcToEazgPreview();
      alert((window.CreatorI18n && window.CreatorI18n.eaz_convert_success) || 'Conversion complete.');
      await loadBalance();
      if (typeof window.reloadCreatorFooterEazBalance === 'function') {
        window.reloadCreatorFooterEazBalance();
      }
    } catch (_e) {
      alert((window.CreatorI18n && window.CreatorI18n.eaz_convert_fail) || 'Conversion failed.');
    }
  }

  async function runEarnedConvert(op) {
    var oid = ownerId();
    var amountEl = document.getElementById('creatorEazConvertAmount');
    var amount = Number(amountEl && amountEl.value);
    var min = earnedConvertCfg.min_convert_eaz || 100;
    if (!oid || !amount || amount < min) {
      var minMsg = (window.CreatorI18n && window.CreatorI18n.eaz_convert_min_tpl) || 'Minimum {{min}} EAZC.';
      alert(minMsg.replace(/\{\{min\}\}/g, String(min)));
      return;
    }
    try {
      var res = await apiPost(op, { owner_id: oid, amount_eaz: amount });
      if (!res || !res.ok) throw new Error((res && res.error) || 'failed');
      if (amountEl) amountEl.value = '';
      updateCreatorConvertPreview();
      alert((window.CreatorI18n && window.CreatorI18n.eaz_convert_success) || 'Conversion complete.');
      await loadBalance();
    } catch (_e) {
      alert((window.CreatorI18n && window.CreatorI18n.eaz_convert_fail) || 'Conversion failed.');
    }
  }

  async function loadStarterPack() {
    var oid = ownerId();
    var loadEl = document.getElementById('eazStarterLoading');
    if (!oid) return;
    if (starterPackLoading) return;
    starterPackLoading = true;
    if (loadEl) loadEl.hidden = false;
    try {
      var data = await apiFetch('get-trial-starter-pack', { owner_id: oid });
      if (!data || !data.ok || !data.starter_pack_applicable) {
        renderStarterNotApplicableSummary();
        return;
      }
      var tplSum = window.CreatorI18n && window.CreatorI18n.eaz_starter_summary_tpl;
      function summaryLine(used, cap, rem) {
        if (tplSum && String(tplSum).trim()) {
          return tpl(tplSum, {
            used: String(used),
            cap: String(cap),
            remaining: String(rem),
          });
        }
        return String(used) + '/' + String(cap) + ' · ' + String(rem) + ' left';
      }
      var genLine = document.getElementById('eazStarterGenLine');
      var upLine = document.getElementById('eazStarterUploadLine');
      if (genLine) {
        genLine.textContent = summaryLine(
          Number(data.trial_generate_used || 0),
          Number(data.trial_generate_cap || 0),
          Number(data.trial_generate_remaining || 0)
        );
      }
      if (upLine) {
        upLine.textContent = summaryLine(
          Number(data.trial_upload_used || 0),
          Number(data.trial_upload_cap || 0),
          Number(data.trial_upload_remaining || 0)
        );
      }
      starterPackCachedGen = Array.isArray(data.generated_items) ? data.generated_items : [];
      starterPackCachedUp = Array.isArray(data.uploaded_items) ? data.uploaded_items : [];
      var kindWrap = document.querySelector('.creator-eaz-starter-kind');
      if (kindWrap) kindWrap.hidden = false;
      applyStarterPackKind(starterPackKind === 'uploaded' ? 'uploaded' : 'generated');
    } catch (e) {
      console.warn('[EAZ starter]', e);
      renderStarterNotApplicableSummary();
    } finally {
      starterPackLoading = false;
      if (loadEl) loadEl.hidden = true;
    }
  }

  function clearCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown(labelEl, progressBarEl, progressFillEl, nextMs) {
    clearCountdown();

    function tick() {
      var now = Date.now();
      var left = Math.max(0, Math.floor((nextMs - now) / 1000));
      var periodMs = DAY_MS;
      var pctRemain = Math.max(0, Math.min(1, (nextMs - now) / periodMs));

      if (progressFillEl) {
        progressFillEl.style.width = pctRemain * 100 + '%';
      }
      if (progressBarEl) {
        progressBarEl.setAttribute('aria-valuenow', String(Math.round(pctRemain * 100)));
      }

      var h = Math.floor(left / 3600);
      var m = Math.floor((left % 3600) / 60);
      var s = left % 60;
      var pad = function (x) { return (x < 10 ? '0' : '') + x; };
      var timeStr = h + ':' + pad(m) + ':' + pad(s);
      var msg = window.CreatorI18n && window.CreatorI18n.eazUntilReset;
      var textLine = msg ? tpl(msg, { time: timeStr }).replace(/\{\{\s*time\s*\}\}/gi, timeStr) : timeStr;
      if (labelEl) {
        labelEl.textContent = textLine;
      }
      if (progressBarEl) {
        progressBarEl.setAttribute('aria-valuetext', textLine);
      }
      if (left <= 0) {
        clearCountdown();
        loadBalance();
      }
    }

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function applyEazCostsFromBalance(data) {
    var panel = document.getElementById('creatorEazPanel');
    if (!panel || !data) return;
    var ec = data.eaz_costs;
    if (ec) {
      panel.__eazCosts = ec;
      if (ec.design_generate != null) {
        panel.setAttribute('data-cost-design-generate', String(ec.design_generate));
      }
      if (ec.design_upload != null) {
        panel.setAttribute('data-cost-design-upload', String(ec.design_upload));
      }
    }
    if (data.eaz_costs_base) panel.__eazCostsBase = data.eaz_costs_base;
    if (data.mascot_eaz_discount_pct != null) {
      panel.__mascotEazDiscountPct = Number(data.mascot_eaz_discount_pct) || 0;
    }
    if (data.eaz_feature_active) panel.__eazFeatureActive = data.eaz_feature_active;
    var costsPane = document.getElementById('eaz-panel-costs');
    if (costsPane && costsPane.classList.contains('is-active')) renderEazCostsTab();
  }

  function renderEazCostsTab() {
    var list = document.getElementById('creatorEazCostsList');
    var loading = document.getElementById('creatorEazCostsLoading');
    var panel = document.getElementById('creatorEazPanel');
    if (!list || !panel) return;

    var catalog = window.EazCostCatalog;
    if (!catalog || !catalog.CATALOG) {
      list.innerHTML = '';
      return;
    }

    var costsMap = panel.__eazCosts || catalog.DEFAULT_COSTS || {};
    var baseMap = panel.__eazCostsBase || catalog.DEFAULT_COSTS || {};
    var discountPct = Number(panel.__mascotEazDiscountPct) || 0;
    var activeMap = panel.__eazFeatureActive || {};
    var freeLbl =
      window.CreatorI18n && window.CreatorI18n.eaz_cost_free
        ? window.CreatorI18n.eaz_cost_free
        : 'Free';

    list.innerHTML = '';
    catalog.CATALOG.forEach(function (item) {
      var feature = item.feature;
      var cost = catalog.resolveCost(costsMap, feature);
      var baseCost = catalog.resolveCost(baseMap, feature);
      var explicitOff = activeMap[feature] === false;
      var isFree = explicitOff || (Number.isFinite(cost) && cost <= 0);
      var hasDiscount = !isFree && discountPct > 0 && baseCost > cost + 1e-9;
      var row = document.createElement('li');
      row.className = 'creator-eaz-costs-row';
      row.setAttribute('role', 'listitem');

      var name = document.createElement('span');
      name.className = 'creator-eaz-costs-row__label';
      name.textContent = catalog.labelFor(item);

      var priceWrap = document.createElement('span');
      priceWrap.className = 'creator-eaz-costs-row__value';

      if (isFree) {
        priceWrap.textContent = freeLbl;
      } else if (hasDiscount) {
        var baseEl = document.createElement('span');
        baseEl.className = 'creator-eaz-costs-row__base';
        baseEl.textContent = catalog.fmtEaz(baseCost) + ' EAZV';

        var discEl = document.createElement('span');
        discEl.className = 'creator-eaz-costs-row__discount';
        discEl.textContent = '\u2212' + Math.round(discountPct * 100) + '%';

        var effEl = document.createElement('span');
        effEl.className = 'creator-eaz-costs-row__effective';
        effEl.textContent = catalog.fmtEaz(cost) + ' EAZV';

        priceWrap.appendChild(baseEl);
        priceWrap.appendChild(discEl);
        priceWrap.appendChild(effEl);
      } else {
        priceWrap.textContent = catalog.fmtEaz(cost) + ' EAZV';
      }

      row.appendChild(name);
      row.appendChild(priceWrap);
      list.appendChild(row);
    });

    if (loading) loading.hidden = true;
  }

  async function loadBalance() {
    var oid = ownerId();
    var refillEl = document.getElementById('creatorEazRefill');
    var cdLabel = document.getElementById('creatorEazCountdown');
    var bar = document.getElementById('creatorEazProgressBar');
    var fill = document.getElementById('creatorEazProgressFill');
    if (!oid) {
      if (refillEl) refillEl.textContent = '';
      if (cdLabel) cdLabel.textContent = '';
      if (fill) fill.style.width = '0%';
      return;
    }
    try {
      var data = await apiFetch('get-balance', { owner_id: oid });
      if (!data || !data.ok) {
        syncStarterPackTabVisibility({ ok: false });
        if (typeof window.applyCreatorFooterStarterUi === 'function') {
          window.applyCreatorFooterStarterUi({ ok: false });
        }
        return;
      }

      if (typeof window.applyCreatorFooterStarterUi === 'function') {
        window.applyCreatorFooterStarterUi(data);
      }

      applyEazCostsFromBalance(data);

      if (data.eaz_wallet_active === false) {
        clearCountdown();
        toggleBalancePaneMode(true, data);
        var tElL = document.getElementById('creatorEazEazgTotal');
        var fElL = document.getElementById('creatorEazFree');
        var pElL = document.getElementById('creatorEazPurchased');
        if (tElL) tElL.textContent = '—';
        if (fElL) fElL.textContent = '—';
        if (pElL) pElL.textContent = '—';
        if (refillEl) refillEl.textContent = '';
        if (cdLabel) cdLabel.textContent = '';
        if (fill) fill.style.width = '0%';
        var eazPanLock = document.getElementById('creatorEazPanel');
        if (eazPanLock) {
          eazPanLock.setAttribute('data-eaz-wallet-active', 'false');
          eazPanLock.setAttribute('data-free-cap', '0');
        }
        document.querySelectorAll('.creator-eaz-free-cap').forEach(function (x) {
          x.textContent = '0';
        });
        toggleEazLockBanners(true);
        syncEazBalanceCtaLockedState(true);
        syncStarterPackTabVisibility(data);
        buildGrid();
        var stPaneL = document.getElementById('eaz-panel-starter');
        if (stPaneL && stPaneL.classList.contains('is-active') && isStarterPackEligible(data)) {
          loadStarterPack();
        }
        return;
      }

      toggleEazLockBanners(false);
      syncEazBalanceCtaLockedState(false);
      toggleBalancePaneMode(false, data);
      var eazPanOn = document.getElementById('creatorEazPanel');
      if (eazPanOn) eazPanOn.setAttribute('data-eaz-wallet-active', 'true');

      var cap = data.free_cap != null ? Number(data.free_cap) : FREE_CAP_FALLBACK;
      var free = data.balance_free;
      var purch = data.balance_purchased;
      var eazg =
        data.balance_eazg != null
          ? Number(data.balance_eazg)
          : Math.round((Number(free || 0) + Number(purch || 0)) * 100) / 100;

      var gEl = document.getElementById('creatorEazEazgTotal');
      var fEl = document.getElementById('creatorEazFree');
      var pEl = document.getElementById('creatorEazPurchased');
      if (gEl) gEl.textContent = fmtEaz(eazg);
      if (fEl) fEl.textContent = fmtEaz(free);
      if (pEl) pEl.textContent = fmtEaz(purch);

      var eazcTotal =
        data.balance_eazc_total != null ? data.balance_eazc_total : data.balance_earned_total;
      var eazcAvail =
        data.balance_eazc_available != null
          ? data.balance_eazc_available
          : data.balance_earned_available;
      var eazcLocked =
        data.balance_eazc_locked != null ? data.balance_eazc_locked : data.balance_earned_locked;

      var eTotal = document.getElementById('creatorEazEarnedTotal');
      var eAvail = document.getElementById('creatorEazEarnedAvailable');
      var eLocked = document.getElementById('creatorEazEarnedLocked');
      if (eTotal) eTotal.textContent = fmtEaz(eazcTotal);
      if (eAvail) eAvail.textContent = fmtEaz(eazcAvail);
      if (eLocked) eLocked.textContent = fmtEaz(eazcLocked);

      var convertToEazgBlock = document.getElementById('creatorEazcToEazgConvert');
      var availEarned = Number(eazcAvail || 0);
      earnedAvailableEaz = availEarned;
      if (convertToEazgBlock) {
        convertToEazgBlock.hidden = !(availEarned >= 1);
        var eazcAmountInput = document.getElementById('creatorEazcToEazgAmount');
        if (eazcAmountInput) eazcAmountInput.max = String(availEarned);
        updateEazcToEazgPreview();
      }
      // Cash out lives in Balance & Payouts (sales modal), not Settings → EAZ.

      document.querySelectorAll('.creator-eaz-free-cap').forEach(function (x) {
        x.textContent = String(cap);
      });

      var eazPan = document.getElementById('creatorEazPanel');
      if (eazPan) {
        eazPan.setAttribute('data-free-cap', String(cap));
      }

      buildGrid();

      var nextAmt = data.next_free_refill_amount;
      var nextAt = data.next_free_refill_at;
      if (refillEl) {
        var pfx = window.CreatorI18n && window.CreatorI18n.eazRefillPrefix;
        var n = fmtEaz(nextAmt != null ? nextAmt : 0);
        refillEl.textContent = pfx ? pfx.replace(/%\{N\}/g, n).replace(/%N/g, n) : 'Up to ' + n + ' EAZV at the next daily reset.';
      }
      if (nextAt && cdLabel && bar && fill) {
        startCountdown(cdLabel, bar, fill, Number(nextAt));
      }
      syncStarterPackTabVisibility(data);
      var stPane = document.getElementById('eaz-panel-starter');
      if (stPane && stPane.classList.contains('is-active') && isStarterPackEligible(data)) {
        loadStarterPack();
      }
    } catch (e) {
      console.warn('[EAZ panel] balance', e);
      syncStarterPackTabVisibility({ ok: false });
    }
  }

  function logRowMatches(filter, r) {
    if (filter === 'all') return true;
    var bucket = String(r.eaz_bucket || '').trim();
    var t = String(r.type || '');
    if (filter === 'usage') return t === 'debit';
    if (filter === 'purchased')
      return (t === 'credit' || t === 'refund' || t === 'adjustment') && bucket === 'purchased';
    if (filter === 'free')
      return (t === 'credit' || t === 'refund' || t === 'adjustment') && bucket === 'free';
    return true;
  }

  function formatLedgerReason(r) {
    if (r.reason === 'eaz_pack_dry_run' && window.CreatorI18n && window.CreatorI18n.eazLedgerReasonEazPackDryRun) {
      return window.CreatorI18n.eazLedgerReasonEazPackDryRun;
    }
    if (r.reason === 'eaz_convert:to_eazg') return 'EAZC → EAZV';
    if (r.reason === 'eaz_convert:from_eazc') return 'EAZC → EAZV credit';
    if (r.reason === 'eaz_convert:fiat') return 'EAZC → fiat';
    if (r.reason === 'eaz_convert:gift_card') return 'EAZC → gift card';
    return String(r.reason || r.type || '').slice(0, 96);
  }

  function getActiveLogFilter() {
    var active = document.querySelector('.creator-eaz-log-subtab.is-active[data-eaz-log-filter]');
    return (active && active.getAttribute('data-eaz-log-filter')) || 'all';
  }

  function renderTransactionRows(filter) {
    var list = document.getElementById('creatorEazLogsList');
    var empty = document.getElementById('creatorEazLogsEmpty');
    if (!list) return;
    list.innerHTML = '';
    var rows = transactionsCache.filter(function (r) {
      return logRowMatches(filter, r);
    });
    var total = transactionsCache.length;
    if (!total) {
      if (empty) {
        empty.hidden = false;
        empty.textContent =
          (window.CreatorI18n && window.CreatorI18n.eazLogsEmptyDefault) || 'No transactions yet.';
      }
      return;
    }
    if (!rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent =
          (window.CreatorI18n && window.CreatorI18n.eazLogsEmptyFiltered) || 'No entries in this category.';
      }
      return;
    }
    if (empty) empty.hidden = true;
    rows.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'creator-eaz-log-row';
      var amt = Number(r.amount_eaz) || 0;
      var sign = r.type === 'credit' || r.type === 'refund' ? '+' : '−';
      var meta = r.meta || {};
      var split = '';
      if (meta.debit_free != null || meta.debit_purchased != null) {
        var splitTpl = window.CreatorI18n && window.CreatorI18n.eazLogDebitSplitTpl;
        if (splitTpl && splitTpl.trim()) {
          split = ' (' + tpl(splitTpl, {
            free: fmtEaz(meta.debit_free || 0),
            purchased: fmtEaz(meta.debit_purchased || 0),
          }) + ')';
        } else {
          split =
            ' (Free ' + fmtEaz(meta.debit_free || 0) + ' / Purchased ' + fmtEaz(meta.debit_purchased || 0) + ')';
        }
      }
      var reasonLine = formatLedgerReason(r);
      var main = document.createElement('div');
      main.innerHTML =
        '<strong>' + sign + fmtEaz(Math.abs(amt)) + '</strong> · ' + (reasonLine + split);
      var sub = document.createElement('div');
      sub.className = 'creator-eaz-log-meta';
      sub.textContent = formatTime(r.created_at) || '';
      li.appendChild(main);
      li.appendChild(sub);
      list.appendChild(li);
    });
  }

  async function loadTransactions() {
    var oid = ownerId();
    var list = document.getElementById('creatorEazLogsList');
    if (!oid || !list) return;
    try {
      var data = await apiFetch('get-transactions', { owner_id: oid, limit: 200 });
      transactionsCache = (data && data.transactions) || [];
      renderTransactionRows(getActiveLogFilter());
    } catch (e) {
      console.warn('[EAZ panel] transactions', e);
    }
  }

  function resolveDispatchBase() {
    var cfg = window.CREATOR_API_CONFIG || {};
    if (typeof cfg.getDispatchUrl === 'function') {
      try {
        var u = cfg.getDispatchUrl();
        if (u) return u;
      } catch (e1) {}
    }
    try {
      var hn = window.location && window.location.hostname;
      if (hn === 'www.eazpire.com' || hn === 'eazpire.com') {
        return window.location.origin.replace(/\/$/, '') + '/__eaz/creator-dispatch';
      }
    } catch (e2) {}
    var base = (cfg.BASE_URL || 'https://creator-engine.eazpire.workers.dev').replace(/\/$/, '');
    return base + '/apps/creator-dispatch';
  }

  function openEazStripeCheckout(eazAmt) {
    var oid = ownerId();
    var msgNeed =
      window.CreatorI18n && window.CreatorI18n.eazCheckoutNeedAccount
        ? window.CreatorI18n.eazCheckoutNeedAccount
        : 'Sign in to continue to checkout.';
    var msgFail =
      window.CreatorI18n && window.CreatorI18n.eazStripeFailed
        ? window.CreatorI18n.eazStripeFailed
        : 'Checkout could not start. Please try again in a moment.';
    if (!oid) {
      alert(msgNeed);
      return;
    }
    var checkoutUrl = new URL(resolveDispatchBase());
    checkoutUrl.searchParams.set('op', 'eaz-stripe-checkout');
    checkoutUrl.searchParams.set('path_prefix', '/apps/creator-dispatch');
    checkoutUrl.searchParams.set('owner_id', String(oid));
    fetch(checkoutUrl.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ eaz: Number(eazAmt) }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (data) {
        if (data && data.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        alert(msgFail);
      })
      .catch(function (e) {
        console.warn('[EAZ Stripe]', e);
        alert(msgFail);
      });
  }

  async function runAdminEazPackDryRun(eazAmt) {
    var oid = ownerId();
    var msgNeed =
      window.CreatorI18n && window.CreatorI18n.eazCheckoutNeedAccount
        ? window.CreatorI18n.eazCheckoutNeedAccount
        : 'Sign in to continue to checkout.';
    var msgConfirm =
      window.CreatorI18n && window.CreatorI18n.eazAdminTestBuyConfirm
        ? window.CreatorI18n.eazAdminTestBuyConfirm
        : 'Simulate this pack? No Stripe charge.';
    var msgFail =
      window.CreatorI18n && window.CreatorI18n.eazAdminTestBuyFail
        ? window.CreatorI18n.eazAdminTestBuyFail
        : 'Dry run failed.';
    if (!oid) {
      alert(msgNeed);
      return;
    }
    if (!eazAmt || !isFinite(eazAmt)) return;
    if (typeof window.creatorApiFetch !== 'function') {
      alert(msgFail);
      return;
    }
    if (!confirm(msgConfirm)) return;
    try {
      var data = await window.creatorApiFetch(
        'eaz-pack-dry-run',
        { owner_id: String(oid) },
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ eaz: Number(eazAmt) }),
        }
      );
      if (!data || !data.ok) {
        alert(msgFail);
        return;
      }
      selectLogFilter('purchased');
      await loadTransactions();
      setSubTab('logs', true, true);
      loadBalance();
    } catch (err) {
      console.warn('[EAZ dry run]', err);
      var msg = msgFail;
      if (
        window.CreatorI18n &&
        window.CreatorI18n.eazAdminTestBuyForbidden &&
        String(err && err.message).indexOf('403') !== -1
      ) {
        msg = window.CreatorI18n.eazAdminTestBuyForbidden;
      }
      alert(msg);
    }
  }

  function buildGrid() {
    var grid = document.getElementById('creatorEazGrid');
    var panel = document.getElementById('creatorEazPanel');
    if (!grid || !panel) return;
    grid.innerHTML = '';

    var walletLocked = panel.getAttribute('data-eaz-wallet-active') === 'false';

    var cost = parseFloat(panel.getAttribute('data-cost-design-generate'));
    if (!isFinite(cost) || cost <= 0) cost = 10;
    var uploadCost = parseFloat(panel.getAttribute('data-cost-design-upload'));
    if (!isFinite(uploadCost) || uploadCost <= 0) uploadCost = 1;
    var rawCap = parseFloat(panel.getAttribute('data-free-cap'));
    var freeCap;
    if (walletLocked) {
      freeCap = FREE_CAP_FALLBACK;
    } else {
      freeCap = !isFinite(rawCap) || rawCap <= 0 ? FREE_CAP_FALLBACK : rawCap;
    }
    var freeUploads = uploadCost > 0 ? Math.floor(freeCap / uploadCost) : 0;

    var pkgs = parsePackages();
    if (!pkgs.length) return;

    var gensTpl = window.CreatorI18n && window.CreatorI18n.eazPkgGensTpl;
    var discountTpl = window.CreatorI18n && window.CreatorI18n.eazPkgDiscount;
    var priceTpl = window.CreatorI18n && window.CreatorI18n.eazPkgPriceUsd;
    var reco = window.CreatorI18n && window.CreatorI18n.eazPkgRecommended;
    var shopTxt =
      window.CreatorI18n && window.CreatorI18n.eazShopCta ? window.CreatorI18n.eazShopCta : 'Buy Now';
    var enterCodeTxt =
      window.CreatorI18n && window.CreatorI18n.eaz_enter_creator_code_cta
        ? window.CreatorI18n.eaz_enter_creator_code_cta
        : 'Enter Creator Code';
    var testBuyTxt =
      window.CreatorI18n && window.CreatorI18n.eazAdminTestBuy ? window.CreatorI18n.eazAdminTestBuy : 'Test (dry run)';
    var showAdminTest = panel.getAttribute('data-eaz-admin-test') === 'true';
    var per10Tpl = window.CreatorI18n && window.CreatorI18n.eazPkgPer10Tpl;
    var baselineTpl = window.CreatorI18n && window.CreatorI18n.eazPkgBaseline;

    var base = pkgs[0];
    var baseUsd = base ? pkgUsdPrice(base) : null;
    var basePpu =
      baseUsd != null && base && base.eaz ? Number(baseUsd) / Number(base.eaz) : null;

    pkgs.forEach(function (p, index) {
      var card = document.createElement('article');
      card.className = 'creator-eaz-pkg-card';
      card.setAttribute('role', 'listitem');
      var isStarter = index === 0;

      if (p.recommended) {
        card.classList.add('creator-eaz-pkg-card--recommended');
        var badge = document.createElement('span');
        badge.className = 'creator-eaz-pkg-badge';
        badge.textContent = reco || 'Recommended';
        card.appendChild(badge);
      }

      var eazNum = Number(p.eaz) || 0;
      var gens = cost > 0 ? Math.floor(eazNum / cost) : 0;
      var packUploads = uploadCost > 0 ? Math.floor(eazNum / uploadCost) : 0;

      var stack = document.createElement('div');
      stack.className = 'creator-eaz-pkg-stack';

      var header = document.createElement('div');
      header.className = 'creator-eaz-pkg-header';
      var title = document.createElement('div');
      title.className = 'creator-eaz-pkg-title';
      var titleRow = document.createElement('div');
      titleRow.className = 'creator-eaz-pkg-title-row';
      var coinImg = document.createElement('img');
      coinImg.className = 'creator-eaz-pkg-coin';
      coinImg.alt = '';
      coinImg.width = 22;
      coinImg.height = 22;
      coinImg.setAttribute('data-eaz-coin', 'eazv');
      coinImg.src =
        window.EazCoinBrand && window.EazCoinBrand.urlEazv
          ? window.EazCoinBrand.urlEazv()
          : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch?op=platform-asset-public&slot=eazv_coin_logo';
      titleRow.appendChild(coinImg);
      var titleText = document.createElement('span');
      titleText.textContent = p.label || eazNum + ' EAZV';
      titleRow.appendChild(titleText);
      title.appendChild(titleRow);
      var priceEl = document.createElement('div');
      priceEl.className = 'creator-eaz-pkg-pack-price';
      var usdAmt = pkgUsdPrice(p);
      if (usdAmt != null) {
        var priceStr = fmtUsd(usdAmt);
        priceEl.textContent = priceTpl ? tpl(priceTpl, { price: priceStr }) : priceStr;
      }
      header.appendChild(title);
      header.appendChild(priceEl);
      stack.appendChild(header);

      var per10Line = document.createElement('div');
      per10Line.className = 'creator-eaz-pkg-line creator-eaz-pkg-line--per10';
      if (usdAmt != null && eazNum > 0) {
        var per10Val = (Number(usdAmt) / eazNum) * 10;
        var per10Str = fmtUsd(per10Val);
        per10Line.textContent =
          per10Tpl && per10Tpl.trim()
            ? tpl(per10Tpl, { price: per10Str })
            : per10Str + ' per 10 EAZV';
      } else {
        per10Line.textContent = '\u2014';
        per10Line.classList.add('creator-eaz-pkg-line--placeholder');
      }
      stack.appendChild(per10Line);

      var gensLine = document.createElement('div');
      gensLine.className = 'creator-eaz-pkg-line creator-eaz-pkg-line--gens';
      var ucStr = uploadCost % 1 === 0 ? String(Math.round(uploadCost)) : fmtEaz(uploadCost);
      var gensMap = {
        count: String(gens),
        cost: String(cost),
        upload_cost: ucStr,
        upload_count: String(packUploads),
        free_cap: fmtEaz(freeCap),
        free_uploads: String(freeUploads),
      };
      gensLine.textContent =
        gensTpl && gensTpl.trim()
          ? tpl(gensTpl, gensMap)
          : 'Up to ' +
            gens +
            ' design generations (' +
            cost +
            ' EAZV each)\nUp to ' +
            packUploads +
            ' uploads (' +
            ucStr +
            ' EAZV each)\nFree pool: up to ' +
            freeUploads +
            ' uploads (' +
            fmtEaz(freeCap) +
            ' EAZV cap)';
      stack.appendChild(gensLine);

      var discSlot = document.createElement('div');
      discSlot.className = 'creator-eaz-pkg-discount-slot';
      discSlot.setAttribute('role', 'presentation');

      if (isStarter) {
        discSlot.classList.add('creator-eaz-pkg-discount-slot--baseline');
        discSlot.textContent =
          baselineTpl && baselineTpl.trim()
            ? baselineTpl
            : 'Compared to starter pack (reference tier)';
      } else if (basePpu != null && usdAmt != null && eazNum > 0) {
        var ppu = Number(usdAmt) / eazNum;
        if (ppu + 1e-9 < basePpu) {
          var discPct = Math.round((1 - ppu / basePpu) * 100);
          if (discPct > 0) {
            discSlot.classList.add('creator-eaz-pkg-discount-slot--filled');
            discSlot.textContent = discountTpl
              ? tpl(discountTpl, { pct: String(discPct) })
              : discPct + '% better value vs smallest pack';
          }
        }
      }

      if (!discSlot.classList.contains('creator-eaz-pkg-discount-slot--filled') &&
        !discSlot.classList.contains('creator-eaz-pkg-discount-slot--baseline')) {
        discSlot.classList.add('creator-eaz-pkg-discount-slot--empty');
        discSlot.textContent = '\u2007';
      }

      stack.appendChild(discSlot);
      card.appendChild(stack);

      var actions = document.createElement('div');
      actions.className = 'creator-eaz-pkg-actions';

      var ctaBtn = document.createElement('button');
      ctaBtn.type = 'button';
      if (walletLocked) {
        ctaBtn.className = 'creator-eaz-pkg-cta creator-eaz-pkg-cta--info';
        ctaBtn.textContent = enterCodeTxt;
        ctaBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          openCreatorCodesTab();
        });
      } else {
        ctaBtn.className = 'creator-eaz-pkg-cta';
        ctaBtn.textContent = shopTxt;
        (function (amt) {
          ctaBtn.addEventListener('click', function () {
            if (!amt || !isFinite(amt)) return;
            openEazStripeCheckout(amt);
          });
        })(eazNum);
      }
      actions.appendChild(ctaBtn);

      if (showAdminTest && !walletLocked) {
        var testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'creator-eaz-pkg-test';
        testBtn.textContent = testBuyTxt;
        testBtn.title = testBuyTxt;
        (function (amt) {
          testBtn.addEventListener('click', function () {
            runAdminEazPackDryRun(amt);
          });
        })(eazNum);
        actions.appendChild(testBtn);
      }

      card.appendChild(actions);

      grid.appendChild(card);
    });
  }

  async function onTabChanged(e) {
    if (!e || !e.detail || e.detail.tab !== 'eaz') return;
    clearCountdown();
    try {
      await loadBalance();
    } catch (_err) {}
    if (e.detail.eazSub) setSubTab(e.detail.eazSub, true);
    else {
      var panelEl = document.getElementById('creatorEazPanel');
      var starterEligible = panelEl && panelEl.getAttribute('data-starter-eligible') === 'true';
      setSubTab(starterEligible ? 'starter' : 'balance', true);
    }
    if (e.detail.eazSub === 'logs' || document.querySelector('#eaz-panel-logs.is-active')) loadTransactions();
  }

  function init() {
    var panel = document.getElementById('creatorEazPanel');
    if (!panel) return;

    if (window.EazCostCatalog && window.EazCostCatalog.DEFAULT_COSTS) {
      panel.__eazCosts = window.EazCostCatalog.DEFAULT_COSTS;
    }

    buildGrid();

    var infoBtn = document.getElementById('eazStarterInfoBtn');
    var infoPanel = document.getElementById('eazStarterInfoPanel');
    if (infoBtn && infoPanel) {
      infoBtn.addEventListener('click', function () {
        var open = infoPanel.hidden;
        infoPanel.hidden = !open;
        infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    document.querySelectorAll('.creator-eaz-starter-kind-btn[data-starter-kind]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-starter-kind');
        applyStarterPackKind(k === 'uploaded' ? 'uploaded' : 'generated');
      });
    });

    getSubtabButtons().forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sub = btn.getAttribute('data-eaz-subtab');
        setSubTab(sub);
      });
    });

    document.querySelectorAll('.creator-eaz-log-subtab[data-eaz-log-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-eaz-log-filter') || 'all';
        selectLogFilter(f);
        renderTransactionRows(f);
      });
    });

    var convertAmount = document.getElementById('creatorEazConvertAmount');
    if (convertAmount) convertAmount.addEventListener('input', updateCreatorConvertPreview);
    var eazcConvertAmount = document.getElementById('creatorEazcToEazgAmount');
    if (eazcConvertAmount) eazcConvertAmount.addEventListener('input', updateEazcToEazgPreview);
    var eazcConvertBtn = document.getElementById('creatorEazcToEazgBtn');
    if (eazcConvertBtn) eazcConvertBtn.addEventListener('click', runEazcToEazgConvert);
    var fiatBtn = document.getElementById('creatorEazConvertFiatBtn');
    if (fiatBtn) fiatBtn.addEventListener('click', function () { runEarnedConvert('convert-eaz-to-fiat'); });
    var gcBtn = document.getElementById('creatorEazConvertGcBtn');
    if (gcBtn) gcBtn.addEventListener('click', function () { runEarnedConvert('convert-eaz-to-gift-card'); });

    window.addEventListener('creator-settings-v2-tab-changed', onTabChanged);
    window.addEventListener('creator-settings-v2-opened', function () {
      var activeNav = document.querySelector('.csm-nav-item.is-active[data-csm-nav="eaz"]');
      if (activeNav) loadBalance();
    });

    window.CreatorSettingsEazPanel = {
      setSubTab: setSubTab,
      refresh: function () {
        loadBalance();
        if (document.querySelector('#eaz-panel-logs:not([hidden])')) loadTransactions();
        var sp = document.getElementById('eaz-panel-starter');
        if (sp && sp.classList.contains('is-active')) loadStarterPack();
        if (document.querySelector('#eaz-panel-costs.is-active')) renderEazCostsTab();
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
