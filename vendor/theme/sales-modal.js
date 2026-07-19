/**
 * Creator Sales Modal – Theme Integration
 * Nutzt window.__EAZ_OWNER_ID, window.CREATOR_API_CONFIG
 */
(function() {
  'use strict';

  function getApiBase() {
    if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
      return window.CREATOR_API_CONFIG.BASE_URL;
    }
    const meta = document.querySelector('meta[name="creator-api-base"]');
    return (meta && meta.getAttribute('content')) || 'https://creator-engine.eazpire.workers.dev';
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID) {
      return String(window.__EAZ_OWNER_ID);
    }
    const meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  let currentDays = 90;
  let networkDays = 30;
  let lastFocusedBeforeOpen = null;

  const overlay = document.getElementById('slmOverlay');
  const closeBtn = document.getElementById('slmClose');
  const dateFrom = document.getElementById('slmDateFrom');
  const dateTo = document.getElementById('slmDateTo');
  const presetBtns = document.querySelectorAll('.slm-preset:not(.slm-network-preset)');
  const networkPresetBtns = document.querySelectorAll('.slm-network-preset');
  const networkDateFrom = document.getElementById('slmNetworkDateFrom');
  const networkDateTo = document.getElementById('slmNetworkDateTo');
  const productsList = document.getElementById('slmProductsList');

  const datepickerOverlay = document.getElementById('slmDatepickerOverlay');
  const datepickerGrid = document.getElementById('slmDatepickerGrid');
  const datepickerMonthYear = document.getElementById('slmDatepickerMonthYear');
  const datepickerPrev = document.getElementById('slmDatepickerPrev');
  const datepickerNext = document.getElementById('slmDatepickerNext');
  const datepickerClear = document.getElementById('slmDatepickerClear');
  const datepickerToday = document.getElementById('slmDatepickerToday');
  let datepickerTarget = null;
  let datepickerView = new Date();

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function openDatepicker(inputEl) {
    if (!datepickerOverlay) return;
    datepickerTarget = inputEl;
    const val = inputEl.value;
    datepickerView = val ? new Date(val + 'T12:00:00') : new Date();
    renderDatepicker();
    datepickerOverlay.classList.add('is-open');
  }

  function closeDatepicker() {
    if (datepickerOverlay) datepickerOverlay.classList.remove('is-open');
    datepickerTarget = null;
  }

  function renderDatepicker() {
    if (!datepickerGrid || !datepickerMonthYear) return;
    const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    datepickerMonthYear.textContent = months[datepickerView.getMonth()] + ' ' + datepickerView.getFullYear();

    const year = datepickerView.getFullYear();
    const month = datepickerView.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstWeekday = (first.getDay() + 6) % 7;
    const lastDate = last.getDate();
    const selVal = datepickerTarget ? datepickerTarget.value : null;
    const todayYMD = toYMD(new Date());
    const prevMonthLast = new Date(year, month, 0).getDate();
    let html = '';
    let dayNum = 1 - firstWeekday;
    for (let i = 0; i < 42; i++) {
      let d, ymd, isOther = false;
      if (dayNum < 1) {
        d = prevMonthLast + dayNum;
        ymd = toYMD(new Date(year, month - 1, d));
        isOther = true;
      } else if (dayNum > lastDate) {
        d = dayNum - lastDate;
        ymd = toYMD(new Date(year, month + 1, d));
        isOther = true;
      } else {
        d = dayNum;
        ymd = toYMD(new Date(year, month, d));
      }
      let cls = 'slm-datepicker__day';
      if (isOther) cls += ' slm-datepicker__day--other';
      if (selVal === ymd) cls += ' slm-datepicker__day--selected';
      if (todayYMD === ymd && selVal !== ymd) cls += ' slm-datepicker__day--today';
      html += '<button type="button" class="' + cls + '" data-date="' + ymd + '">' + d + '</button>';
      dayNum++;
    }
    datepickerGrid.innerHTML = html;
    datepickerGrid.querySelectorAll('.slm-datepicker__day').forEach(btn => {
      btn.addEventListener('click', () => {
        if (datepickerTarget) { datepickerTarget.value = btn.dataset.date; updateDatePreview(); }
        closeDatepicker();
      });
    });
  }

  if (datepickerOverlay && dateFrom) {
    dateFrom.addEventListener('click', (e) => { e.preventDefault(); openDatepicker(dateFrom); });
  }
  if (datepickerOverlay && dateTo) {
    dateTo.addEventListener('click', (e) => { e.preventDefault(); openDatepicker(dateTo); });
  }
  if (datepickerPrev) datepickerPrev.addEventListener('click', () => { datepickerView.setMonth(datepickerView.getMonth() - 1); renderDatepicker(); });
  if (datepickerNext) datepickerNext.addEventListener('click', () => { datepickerView.setMonth(datepickerView.getMonth() + 1); renderDatepicker(); });
  if (datepickerToday) datepickerToday.addEventListener('click', () => { if (datepickerTarget) { datepickerTarget.value = toYMD(new Date()); updateDatePreview(); } closeDatepicker(); });
  if (datepickerClear) datepickerClear.addEventListener('click', () => { if (datepickerTarget) { datepickerTarget.value = ''; updateDatePreview(); } closeDatepicker(); });
  if (datepickerOverlay) datepickerOverlay.addEventListener('click', (e) => { if (e.target === datepickerOverlay) closeDatepicker(); });

  const SCREENS = {
    overview: { titleKey: 'modal_title', subtitleKey: 'modal_subtitle' },
    earnings: { titleKey: 'screen_earnings', subtitleKey: 'sales_subtitle' },
    network: { titleKey: 'screen_network', subtitleKey: null },
    payouts: { titleKey: 'screen_payouts', subtitleKey: null },
    request: { titleKey: 'screen_request', subtitleKey: null }
  };

  const i18nScreen = (key) => {
    const attr = 'data-i18n-' + key.replace(/_/g, '-');
    const val = overlay ? overlay.getAttribute(attr) : null;
    if (val && val !== '') return val;
    const map = {
      modal_title: 'Balance & Payouts',
      modal_subtitle: 'Your credit from sales and the community',
      screen_overview: 'Overview',
      screen_earnings: 'Sales',
      screen_network: 'Community',
      screen_payouts: 'Payouts',
      screen_request: 'Request payout',
      sales_subtitle: 'Overview of your sales by platform',
      network_period: 'Period'
    };
    return map[key] || key;
  };

  let navStack = [];
  const titleEl = document.getElementById('slmTitle');
  const subtitleEl = document.getElementById('slmSubtitle');

  function navigateTo(screenId) {
    const screens = document.querySelectorAll('.slm-screen');
    const target = document.getElementById('slmScreen' + screenId.charAt(0).toUpperCase() + screenId.slice(1));
    if (!target) return;

    const current = document.querySelector('.slm-screen.is-active');
    if (current) {
      navStack.push(current.dataset.screen);
      current.classList.remove('is-active');
    }
    target.classList.add('is-active');

    const info = SCREENS[screenId];
    if (titleEl && info) titleEl.textContent = i18nScreen(info.titleKey);
    if (subtitleEl) subtitleEl.textContent = info && info.subtitleKey ? i18nScreen(info.subtitleKey) : '';
    if (subtitleEl && !info.subtitleKey) subtitleEl.style.display = 'none';
    else if (subtitleEl) subtitleEl.style.display = '';

    if (screenId === 'earnings') {
      loadSalesData();
    }
    if (screenId === 'network') {
      initNetworkDates();
      updateNetworkPeriodPreview();
      loadNetworkData();
    }
    document.querySelectorAll('#slmDrawer .slm-drawer__item').forEach(item => {
      item.classList.toggle('is-active', item.dataset.nav === screenId);
    });
  }

  function resetToOverview() {
    navStack = [];
    document.querySelectorAll('.slm-screen').forEach(s => s.classList.remove('is-active'));
    const overview = document.getElementById('slmScreenOverview');
    if (overview) overview.classList.add('is-active');
    if (titleEl) titleEl.textContent = i18nScreen('modal_title');
    if (subtitleEl) subtitleEl.textContent = i18nScreen('modal_subtitle');
    if (subtitleEl) subtitleEl.style.display = '';
    document.querySelectorAll('#slmDrawer .slm-drawer__item').forEach((item, i) => {
      item.classList.toggle('is-active', item.dataset.nav === 'overview');
    });
  }

  window.openSalesModal = function(eventOrScreen, initialScreen) {
    var ev = (eventOrScreen && typeof eventOrScreen.preventDefault === 'function') ? eventOrScreen : null;
    var screen = (typeof eventOrScreen === 'string' ? eventOrScreen : null) || initialScreen;
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    if (!overlay) return;
    lastFocusedBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resetToOverview();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (screen === 'earnings') {
      navStack = [];
      document.querySelectorAll('.slm-screen').forEach(s => s.classList.remove('is-active'));
      var target = document.getElementById('slmScreenEarnings');
      if (target) target.classList.add('is-active');
      var info = SCREENS.earnings;
      if (titleEl && info) titleEl.textContent = i18nScreen(info.titleKey);
      if (subtitleEl) subtitleEl.textContent = info && info.subtitleKey ? i18nScreen(info.subtitleKey) : '';
      if (subtitleEl && !info.subtitleKey) subtitleEl.style.display = 'none';
      else if (subtitleEl) subtitleEl.style.display = '';
      document.querySelectorAll('#slmDrawer .slm-drawer__item').forEach(function(i) { i.classList.toggle('is-active', i.dataset.nav === 'earnings'); });
      loadSalesData();
    } else {
      loadOverviewData();
      loadSalesData();
    }
  };

  function closeModal() {
    const activeEl = document.activeElement;
    if (overlay && activeEl instanceof HTMLElement && overlay.contains(activeEl)) {
      activeEl.blur();
    }
    if (overlay) overlay.classList.remove('is-open');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
    closeSlmDrawer();
    document.body.style.overflow = '';
    if (lastFocusedBeforeOpen && typeof lastFocusedBeforeOpen.focus === 'function') {
      lastFocusedBeforeOpen.focus();
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  const slmDrawerBtn = document.getElementById('slmDrawerBtn');
  const slmDrawer = document.getElementById('slmDrawer');
  const slmDrawerBackdrop = document.getElementById('slmDrawerBackdrop');

  function openSlmDrawer() {
    if (slmDrawer) slmDrawer.classList.add('is-open');
    if (slmDrawerBackdrop) slmDrawerBackdrop.classList.add('is-visible');
  }
  function closeSlmDrawer() {
    if (slmDrawer) slmDrawer.classList.remove('is-open');
    if (slmDrawerBackdrop) slmDrawerBackdrop.classList.remove('is-visible');
  }

  if (slmDrawerBtn) slmDrawerBtn.addEventListener('click', openSlmDrawer);
  if (slmDrawerBackdrop) slmDrawerBackdrop.addEventListener('click', closeSlmDrawer);
  document.getElementById('slmDrawerClose')?.addEventListener('click', closeSlmDrawer);

  document.querySelectorAll('#slmDrawer .slm-drawer__item').forEach(item => {
    item.addEventListener('click', () => {
      const screen = item.dataset.nav;
      if (screen) {
        navStack = [];
        const screens = document.querySelectorAll('.slm-screen');
        screens.forEach(s => s.classList.remove('is-active'));
        const target = document.getElementById('slmScreen' + screen.charAt(0).toUpperCase() + screen.slice(1));
        if (target) target.classList.add('is-active');
        const info = SCREENS[screen];
        if (titleEl && info) titleEl.textContent = i18nScreen(info.titleKey);
        if (subtitleEl) subtitleEl.textContent = info && info.subtitleKey ? i18nScreen(info.subtitleKey) : '';
        if (subtitleEl && !info.subtitleKey) subtitleEl.style.display = 'none';
        else if (subtitleEl) subtitleEl.style.display = '';
        if (screen === 'overview' || screen === 'request' || screen === 'payouts') loadOverviewData();
        if (screen === 'request') {
          loadPayoutDetails().then(function () { if (typeof renderPayoutMethods === 'function') renderPayoutMethods(availableAmountBase); });
        }
        if (screen === 'earnings') loadSalesData();
        if (screen === 'network') {
          initNetworkDates();
          updateNetworkPeriodPreview();
          loadNetworkData();
        }
      }
      document.querySelectorAll('#slmDrawer .slm-drawer__item').forEach(i => i.classList.remove('is-active'));
      item.classList.add('is-active');
      closeSlmDrawer();
    });
  });

  if (overlay) {
    overlay.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const screen = el.dataset.nav;
        if (screen) navigateTo(screen);
      });
    });
  }

  const networkListEl = document.getElementById('slmNetworkList');

  async function loadNetworkData() {
    const ownerId = getOwnerId();
    if (!ownerId || !networkListEl) return;
    const days = networkDays;
    const i18n = {
      loading: networkListEl.dataset.i18nLoading || 'Loading...',
      empty: networkListEl.dataset.i18nEmpty || 'No network activity in this period',
      referral: networkListEl.dataset.i18nReferral || 'Referral Sale',
      tier2: networkListEl.dataset.i18nTier2 || 'Tier-2',
      level: networkListEl.dataset.i18nLevel || 'Level %{n}',
      earned: networkListEl.dataset.i18nEarned || 'Commission'
    };
    networkListEl.innerHTML = '<div class="slm-loading"><div class="slm-loading-spinner"></div><span>' + i18n.loading + '</span></div>';
    try {
      const url = getApiBase() + '/apps/creator-dispatch?op=get-creator-payout-overview&owner_id=' + encodeURIComponent(ownerId) + '&days=' + days;
      const res = await fetch(url);
      const data = await res.json();
      const baseCurrency = normalizeCurrencyCode(data.baseCurrency || data.currency || 'EUR', 'EUR');
      const displayCurrency = normalizeCurrencyCode(data.earningsCurrency || 'USD', 'USD');
      const networkCount = data.ok && typeof data.networkCount === 'number' ? data.networkCount : 0;
      const networkAmount = data.ok && typeof data.networkAmount === 'number' ? data.networkAmount : 0;
      const countEl = document.getElementById('slmNetworkSalesCount');
      const profitEl = document.getElementById('slmNetworkProfit');
      if (countEl) countEl.textContent = networkCount.toLocaleString();
      if (profitEl) profitEl.textContent = formatMoney(convertAmount(networkAmount, baseCurrency, displayCurrency), displayCurrency);
      const networkActivity = (data.ok && Array.isArray(data.activity)) ? data.activity.filter(function(it) { return it.type === 'network'; }) : [];
      function typeLabel(item) {
        if (item.networkLevel === 1) return i18n.referral;
        if (item.networkLevel === 2) return i18n.tier2;
        if (item.networkLevel >= 3) return i18n.level.replace(/%\{n\}/g, String(item.networkLevel));
        return i18n.referral;
      }
      if (networkActivity.length > 0) {
        networkListEl.innerHTML = networkActivity.map(function(it) {
          const label = typeLabel(it);
          const date = it.date ? it.date.split('.').slice(0, 2).join('.') + '.' : '—';
          const convertedAmount = convertAmount(Number(it.amount || 0), baseCurrency, displayCurrency);
          const amount = (convertedAmount >= 0 ? '+' : '') + formatMoney(Math.abs(convertedAmount), displayCurrency);
          const img = it.productImageUrl
            ? '<img src="' + it.productImageUrl.replace(/"/g, '&quot;') + '" alt="" loading="lazy">'
            : '<div class="slm-product__image-placeholder">📦</div>';
          const title = (it.productTitle || ('#' + (it.orderId || '—'))).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const levelUser = [label, it.username || ''].filter(Boolean).join(' · ');
          return '<div class="slm-product slm-product--network" data-order-id="' + (it.orderId || '').replace(/"/g, '&quot;') + '">' +
            '<div class="slm-product__image"><div class="slm-product__badge-overlay">' + levelUser.replace(/</g, '&lt;') + '</div>' + img + '</div>' +
            '<div class="slm-product__info">' +
            '<div class="slm-product__name"><span class="slm-product__name-text">' + title + '</span></div>' +
            '<div class="slm-product__meta"><span class="slm-product__date">' + date + '</span></div>' +
            '</div>' +
            '<div class="slm-product__revenue"><span class="slm-product__revenue-label">' + (i18n.referral || 'Earned').replace(/</g, '&lt;') + '</span><span class="slm-product__revenue-value">' + amount + '</span></div>' +
            '</div>';
        }).join('');
      } else {
        networkListEl.innerHTML = '<div class="slm-empty"><div class="slm-empty-icon">🔗</div><div class="slm-empty-text">' + i18n.empty.replace(/</g, '&lt;') + '</div></div>';
      }
    } catch (e) {
      console.warn('[Sales Modal] Network load failed:', e);
      networkListEl.innerHTML = '<div class="slm-empty"><div class="slm-empty-icon">⚠️</div><div class="slm-empty-text">' + (i18n.empty || 'Error loading').replace(/</g, '&lt;') + '</div></div>';
    }
  }

  const submitRequestBtn = document.getElementById('slmSubmitRequest');
  const withdrawModal = document.getElementById('slmWithdrawModal');
  const withdrawBalanceEl = document.getElementById('slmWithdrawBalanceText');
  const withdrawAmountInput = document.getElementById('slmWithdrawAmount');
  const withdrawConfirmBtn = document.getElementById('slmWithdrawConfirm');
  const withdrawCancelBtn = document.getElementById('slmWithdrawCancel');
  const successModal = document.getElementById('slmSuccessModal');
  const successOkBtn = document.getElementById('slmSuccessOk');
  const convertAnimation = document.getElementById('slmConvertAnimation');

  const bonusPreviewEl = document.getElementById('slmWithdrawBonusPreview');
  const withdrawInfoFooterEl = document.getElementById('slmWithdrawInfoFooter');
  const withdrawInfoValueEl = document.getElementById('slmWithdrawInfoValue');
  const withdrawSwitchFooterEl = document.getElementById('slmWithdrawSwitchFooter');
  const withdrawSwitchLabelEl = document.getElementById('slmWithdrawSwitchLabel');
  const withdrawSwitchToShopBtn = document.getElementById('slmWithdrawSwitchToShop');
  let currentWithdrawMethod = 'shop_credit';

  function selectShopCreditInRequest() {
    const shopRadio = document.querySelector('input[name="slm_payout_method"][value="shop_credit"]');
    if (shopRadio) shopRadio.checked = true;
    currentPayoutMethod = 'shop_credit';
    currentPayoutDetailId = null;
    pendingPayoutDetailId = null;
  }

  function updateWithdrawBonusPreview(amountValue, maxValue, method, currencyCode) {
    if (!bonusPreviewEl || !withdrawModal) return;
    var code = normalizeCurrencyCode(currencyCode || requestDisplayCurrency || 'EUR', 'EUR');
    if (method === 'wise') {
      bonusPreviewEl.textContent = '';
      bonusPreviewEl.style.display = 'none';
      if (withdrawInfoFooterEl) withdrawInfoFooterEl.classList.remove('is-visible');
      if (withdrawSwitchFooterEl && withdrawSwitchLabelEl) {
        if (amountValue > 0 && amountValue <= (maxValue || 99999)) {
          const total = Math.round(amountValue * 110) / 100;
          const tpl = withdrawModal.dataset.i18nWithdrawShopCreditPreview || 'As shop credit, you would receive %{total}.';
          withdrawSwitchLabelEl.textContent = tpl.replace('%{total}', formatMoney(total, code));
          withdrawSwitchFooterEl.classList.add('is-visible');
        } else {
          withdrawSwitchLabelEl.textContent = '';
          withdrawSwitchFooterEl.classList.remove('is-visible');
        }
      }
      return;
    }
    if (withdrawSwitchFooterEl) withdrawSwitchFooterEl.classList.remove('is-visible');
    if (withdrawSwitchLabelEl) withdrawSwitchLabelEl.textContent = '';
    const tpl = withdrawModal.dataset.i18nWithdrawBonusPreview || '%{base} + 10% = %{total}';
    if (amountValue > 0 && amountValue <= (maxValue || 99999)) {
      const total = Math.round(amountValue * 110) / 100;
      bonusPreviewEl.textContent = tpl.replace('%{base}', formatMoney(amountValue, code)).replace('%{total}', formatMoney(total, code));
      bonusPreviewEl.style.display = '';
      if (withdrawInfoValueEl) withdrawInfoValueEl.textContent = formatMoney(total, code);
      if (withdrawInfoFooterEl) withdrawInfoFooterEl.classList.add('is-visible');
    } else {
      bonusPreviewEl.textContent = '';
      bonusPreviewEl.style.display = 'none';
      if (withdrawInfoFooterEl) withdrawInfoFooterEl.classList.remove('is-visible');
    }
  }
  function openWithdrawModal(availableAmount, method, currencyCode, baseAmount) {
    if (!withdrawModal || !withdrawBalanceEl) return;
    currentWithdrawMethod = method || 'shop_credit';
    const code = normalizeCurrencyCode(currencyCode || requestDisplayCurrency || 'EUR', 'EUR');
    const sym = getCurrencySym(code);
    requestDisplayCurrency = code;
    const tpl = (withdrawModal.dataset.i18nBalance || 'You have %{amount} available.').replace('%{amount}', '<strong>' + formatMoney(availableAmount, code) + '</strong>');
    withdrawBalanceEl.innerHTML = tpl;
    if (withdrawAmountInput) {
      withdrawAmountInput.value = '';
      withdrawAmountInput.placeholder = Number(availableAmount || 0).toFixed(2);
      withdrawAmountInput.dataset.max = String(availableAmount);
      withdrawAmountInput.dataset.maxBase = String(baseAmount != null ? baseAmount : availableAmount);
      withdrawAmountInput.dataset.currency = code;
    }
    var withdrawCurrencyEl = document.querySelector('.slm-withdraw-modal__currency');
    if (withdrawCurrencyEl) {
      withdrawCurrencyEl.textContent = sym;
    }
    if (withdrawInfoFooterEl) withdrawInfoFooterEl.classList.remove('is-visible');
    if (withdrawInfoValueEl) withdrawInfoValueEl.textContent = formatMoney(0, code);
    if (withdrawSwitchFooterEl) withdrawSwitchFooterEl.classList.remove('is-visible');
    if (withdrawSwitchLabelEl) withdrawSwitchLabelEl.textContent = '';
    updateWithdrawBonusPreview(0, availableAmount, currentWithdrawMethod, code);
    withdrawModal.classList.add('is-open');
    withdrawModal.setAttribute('aria-hidden', 'false');
    if (withdrawAmountInput) setTimeout(function () { withdrawAmountInput.focus(); }, 120);
  }

  function closeWithdrawModal() {
    if (withdrawModal) {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement && withdrawModal.contains(activeEl)) {
        activeEl.blur();
      }
      withdrawModal.classList.remove('is-open');
      withdrawModal.setAttribute('aria-hidden', 'true');
    }
  }

  const successDetailEl = document.getElementById('slmSuccessDetail');
  function openSuccessModal(detailText) {
    if (!successModal) return;
    if (successDetailEl) successDetailEl.textContent = detailText || '';
    successModal.classList.add('is-open');
    successModal.setAttribute('aria-hidden', 'false');
  }

  function closeSuccessModal() {
    if (successModal) {
      successModal.classList.remove('is-open');
      successModal.setAttribute('aria-hidden', 'true');
    }
    if (typeof loadOverviewData === 'function') loadOverviewData();
    if (typeof window.openSalesModal === 'function') window.openSalesModal(null, 'overview');
  }

  function showConvertAnimation(show, mode, amountText) {
    if (convertAnimation) {
      var animText = convertAnimation.querySelector('.slm-convert-animation__text');
      if (show) {
        var state = mode || 'loading';
        convertAnimation.classList.toggle('is-celebration', state === 'celebration');
        convertAnimation.classList.add('is-open');
        convertAnimation.setAttribute('aria-hidden', 'false');
        if (animText) {
          if (state === 'celebration') {
            var title = convertAnimation.dataset.i18nCelebrateTitle || 'Congratulations!';
            var subtitle = convertAnimation.dataset.i18nCelebrateSubtitle || 'Your shop credit is available now.';
            animText.textContent = amountText ? title + ' ' + amountText + ' • ' + subtitle : title + ' ' + subtitle;
          } else if (state === 'wise') {
            animText.textContent = convertAnimation.dataset.i18nWiseProcessing || 'Requesting bank payout...';
          } else {
            animText.textContent = window.CreatorI18n?.salesModalConverting || 'Converting to shop credit...';
          }
        }
      } else {
        convertAnimation.classList.remove('is-open');
        convertAnimation.classList.remove('is-celebration');
        convertAnimation.setAttribute('aria-hidden', 'true');
      }
    }
  }

  let currentPayoutMethod = 'shop_credit';
  let currentPayoutDetailId = null;
  let payoutMethodsCache = [];
  let overviewBaseCurrency = 'EUR';
  let earningsDisplayCurrency = 'USD';
  let availableAmountBase = 0;
  let requestDisplayCurrency = 'EUR';
  const FX_TO_USD = { USD: 1, EUR: 1.08, CHF: 1.12, GBP: 1.27 };

  function normalizeCurrencyCode(code, fallback) {
    var c = String(code || '').trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(FX_TO_USD, c)) return c;
    return String(fallback || 'EUR').trim().toUpperCase();
  }

  function getCurrencySym(code) {
    var c = normalizeCurrencyCode(code || (overlay && overlay.dataset.currencyCode) || 'EUR', 'EUR');
    if (c === 'USD') return '$';
    if (c === 'EUR') return '€';
    if (c === 'GBP') return '£';
    if (c === 'CHF') return 'CHF';
    return c;
  }

  function formatMoney(amount, currencyCode) {
    var n = Number(amount || 0);
    var code = normalizeCurrencyCode(currencyCode || 'EUR', 'EUR');
    var sym = getCurrencySym(code);
    if (sym === '$' || sym === '£') return sym + n.toFixed(2);
    return n.toFixed(2) + ' ' + sym;
  }

  function convertAmount(amount, fromCurrency, toCurrency) {
    var n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    var from = normalizeCurrencyCode(fromCurrency, 'EUR');
    var to = normalizeCurrencyCode(toCurrency, 'EUR');
    var fromRate = Number(FX_TO_USD[from] || 0);
    var toRate = Number(FX_TO_USD[to] || 0);
    if (!(fromRate > 0) || !(toRate > 0)) return n;
    var usd = n * fromRate;
    return usd / toRate;
  }

  function getPreferredRequestCurrency() {
    if (currentPayoutMethod === 'wise' && currentPayoutDetailId) {
      for (var i = 0; i < payoutMethodsCache.length; i++) {
        var m = payoutMethodsCache[i];
        if (m && m.method === 'wise' && String(m.id || '') === String(currentPayoutDetailId || '')) {
          return normalizeCurrencyCode(m.currencyPreference || 'EUR', 'EUR');
        }
      }
    }
    for (var j = 0; j < payoutMethodsCache.length; j++) {
      var wm = payoutMethodsCache[j];
      if (wm && wm.method === 'wise') return normalizeCurrencyCode(wm.currencyPreference || 'EUR', 'EUR');
    }
    return normalizeCurrencyCode((overlay && overlay.dataset.currencyCode) || 'EUR', 'EUR');
  }

  async function loadPayoutDetails() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    try {
      const url = getApiBase() + '/apps/creator-dispatch?op=get-creator-payout-details&owner_id=' + encodeURIComponent(ownerId);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.ok) {
        payoutMethodsCache = data.payoutMethods || [];
        return data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function renderPayoutMethods(availBase) {
    const container = document.getElementById('slmRequestWiseMethods');
    const noMethodsEl = document.getElementById('slmPayoutNoMethods');
    const groupEl = document.getElementById('slmRequestMethodGroup');
    const shopRadio = document.querySelector('input[name="slm_payout_method"][value="shop_credit"]');
    if (!container) return;
    const wiseMethods = payoutMethodsCache.filter(function (m) { return m.method === 'wise'; });
    if (wiseMethods.length === 0) {
      container.innerHTML = '';
      if (noMethodsEl) noMethodsEl.style.display = 'block';
      if (groupEl) groupEl.style.display = '';
      currentPayoutMethod = 'shop_credit';
      currentPayoutDetailId = null;
      return;
    }
    if (noMethodsEl) noMethodsEl.style.display = 'none';
    const wiseLabel = overlay?.dataset.i18nPayoutWise || 'Wise';
    container.innerHTML = wiseMethods.map(function (m, i) {
      const reqCurrency = normalizeCurrencyCode(m.currencyPreference || getPreferredRequestCurrency(), 'EUR');
      const convertedAvail = convertAmount(Number(availBase || 0), overviewBaseCurrency, reqCurrency);
      return '<label class="slm-radio-card" data-payout-detail-id="' + (m.id || '').replace(/"/g, '&quot;') + '">' +
        '<input type="radio" name="slm_payout_method" value="wise" class="slm-radio-card__input" data-payout-detail-id="' + (m.id || '').replace(/"/g, '&quot;') + '">' +
        '<div class="slm-radio-card__content">' +
        '<span class="slm-radio-card__title">' + (m.label || wiseLabel).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
        '<span class="slm-radio-card__amount">' + formatMoney(convertedAvail, reqCurrency) + '</span>' +
        '<span class="slm-radio-card__hint">' + (overlay?.dataset.i18nRequestWiseHint || 'Bank transfer via Wise').replace(/</g, '&lt;') + '</span>' +
        '</div></label>';
    }).join('');
    container.querySelectorAll('input[name="slm_payout_method"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        currentPayoutMethod = this.value;
        currentPayoutDetailId = this.dataset.payoutDetailId || null;
        requestDisplayCurrency = getPreferredRequestCurrency();
      });
    });
    currentPayoutMethod = 'shop_credit';
    currentPayoutDetailId = null;
    if (shopRadio) {
      shopRadio.checked = true;
    }
  }

  if (submitRequestBtn) {
    submitRequestBtn.addEventListener('click', async function () {
      const methodEl = document.querySelector('input[name="slm_payout_method"]:checked');
      if (!methodEl) return;
      const method = methodEl.value;
      currentPayoutMethod = method;
      const ownerId = getOwnerId();
      if (!ownerId) {
        alert((overlay && overlay.dataset.i18nConvertError) || 'Please log in.');
        return;
      }
      if (method === 'wise') {
        var wiseMethods = payoutMethodsCache.filter(function (m) { return m.method === 'wise'; });
        if (wiseMethods.length === 0) {
          alert((overlay?.dataset.i18nPayoutDetailsRequired || 'Please add your bank details in Creator Settings first.'));
          return;
        }
        var checkedWise = document.querySelector('input[name="slm_payout_method"][value="wise"]:checked');
        pendingPayoutDetailId = checkedWise ? (checkedWise.dataset.payoutDetailId || wiseMethods[0].id) : wiseMethods[0].id;
        const requestCurrency = getPreferredRequestCurrency();
        const availableInRequestCurrency = convertAmount(availableAmountBase, overviewBaseCurrency, requestCurrency);
        if (availableInRequestCurrency < 5) {
          alert((overlay?.dataset.i18nConvertMin) || 'Minimum 5.00 EUR required.');
          return;
        }
        openWithdrawModal(availableInRequestCurrency, 'wise', requestCurrency, availableAmountBase);
      }
      if (method === 'shop_credit') {
        const requestCurrency = getPreferredRequestCurrency();
        const availableInRequestCurrency = convertAmount(availableAmountBase, overviewBaseCurrency, requestCurrency);
        if (availableInRequestCurrency < 5) {
          alert((overlay && overlay.dataset.i18nConvertMin) || 'Minimum 5.00 EUR required.');
          return;
        }
        openWithdrawModal(availableInRequestCurrency, 'shop_credit', requestCurrency, availableAmountBase);
      }
    });
  }

  var payoutOpenSettingsBtn = document.getElementById('slmPayoutOpenSettings');
  if (payoutOpenSettingsBtn) {
    payoutOpenSettingsBtn.addEventListener('click', function () {
      if (closeBtn) closeBtn.click();
      setTimeout(function () {
        if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
          window.CreatorSettingsV2Modal.open();
          window.CreatorSettingsV2Modal.setTab('payout');
        }
      }, 150);
    });
  }

  var pendingPayoutDetailId = null;
  function buildPayoutErrorSuffix(data) {
    if (!data || typeof data !== 'object') return '';
    const stage = data.stage ? ' [' + data.stage + ']' : '';
    const paypalDebugId = data.paypalDebugId || data.debug_id || null;
    const debugPart = paypalDebugId ? ' [paypal-debug-id: ' + String(paypalDebugId) + ']' : '';
    return stage + debugPart;
  }

  if (withdrawConfirmBtn && withdrawAmountInput) {
    withdrawConfirmBtn.addEventListener('click', async function () {
      const ownerId = getOwnerId();
      if (!ownerId) return;
      const availableDisplay = parseFloat(String(withdrawAmountInput.dataset.max || '0')) || 0;
      const requestCurrency = normalizeCurrencyCode(withdrawAmountInput.dataset.currency || requestDisplayCurrency || 'EUR', 'EUR');
      const raw = String(withdrawAmountInput.value || '').replace(',', '.').trim();
      const amountDisplay = parseFloat(raw) || 0;
      if (amountDisplay < 5) {
        alert((overlay && overlay.dataset.i18nConvertMin) || 'Minimum 5.00 EUR required.');
        return;
      }
      if (amountDisplay > availableDisplay) {
        alert((overlay && overlay.dataset.i18nConvertError) || 'Amount exceeds available balance.');
        return;
      }
      const amountBase = convertAmount(amountDisplay, requestCurrency, overviewBaseCurrency);
      const amountCents = Math.round(amountBase * 100);
      const requestedAmountCents = Math.round(amountDisplay * 100);
      const method = currentWithdrawMethod;
      closeWithdrawModal();
      showConvertAnimation(true, method === 'wise' ? 'wise' : 'loading');
      try {
        if (method === 'wise') {
          const url = getApiBase() + '/apps/creator-dispatch?op=request-wise-payout';
          const body = { ownerId, amountCents, requestedCurrency: requestCurrency, requestedAmountCents };
          if (pendingPayoutDetailId) body.payoutDetailId = pendingPayoutDetailId;
          const dryRunRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, dryRun: true }),
            credentials: 'include'
          });
          const dryRunData = await dryRunRes.json();
          if (!dryRunData.ok) {
            showConvertAnimation(false);
            const dryErr = dryRunData.message || dryRunData.error || (overlay && overlay.dataset.i18nConvertError) || 'Error';
            alert(dryErr + buildPayoutErrorSuffix(dryRunData));
            return;
          }
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'include'
          });
          const data = await res.json();
          showConvertAnimation(false);
          if (data.ok) {
            const successMsg = (overlay && overlay.dataset.i18nConvertSuccessWise) || 'Your payout has been requested. The transfer will be processed soon.';
            openSuccessModal(successMsg);
          } else {
            const err = data.message || data.error || (overlay && overlay.dataset.i18nConvertError) || 'Error';
            alert(err + buildPayoutErrorSuffix(data));
          }
        } else {
          const url = getApiBase() + '/apps/creator-dispatch?op=convert-to-shop-credit';
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId, method: 'shop_credit', amountCents, requestedCurrency: requestCurrency, requestedAmountCents })
          });
          const data = await res.json();
          showConvertAnimation(false);
          if (data.ok) {
            const credited = formatMoney(Math.round(amountDisplay * 110) / 100, requestCurrency);
            showConvertAnimation(true, 'celebration', credited);
            const successMsg = (overlay && overlay.dataset.i18nConvertSuccessStoreCredit) || 'Your store credit has been added. Use it at checkout when signed in.';
            setTimeout(function () {
              showConvertAnimation(false);
              openSuccessModal(successMsg);
            }, 1650);
          } else {
            const err = data.message || data.error || (overlay && overlay.dataset.i18nConvertError) || 'Error';
            alert(err + buildPayoutErrorSuffix(data));
          }
        }
      } catch (e) {
        console.error('[Sales Modal] payout:', e);
        showConvertAnimation(false);
        alert((overlay && overlay.dataset.i18nConvertError) || 'Request failed.');
      }
    });
  }

  const withdrawMaxBtn = document.getElementById('slmWithdrawMax');
  if (withdrawMaxBtn && withdrawAmountInput) {
    withdrawMaxBtn.addEventListener('click', function () {
      const max = parseFloat(withdrawAmountInput.dataset.max || '0');
      if (max > 0) {
        withdrawAmountInput.value = max.toFixed(2);
        updateWithdrawBonusPreview(max, max, currentWithdrawMethod, withdrawAmountInput.dataset.currency || requestDisplayCurrency);
      }
    });
  }
  if (withdrawAmountInput && bonusPreviewEl) {
    withdrawAmountInput.addEventListener('input', function () {
      const raw = String(withdrawAmountInput.value || '').replace(',', '.').trim();
      const amount = parseFloat(raw) || 0;
      const max = parseFloat(withdrawAmountInput.dataset.max || '0');
      updateWithdrawBonusPreview(amount, max, currentWithdrawMethod, withdrawAmountInput.dataset.currency || requestDisplayCurrency);
    });
  }
  if (withdrawSwitchToShopBtn && withdrawAmountInput) {
    withdrawSwitchToShopBtn.addEventListener('click', function () {
      const raw = String(withdrawAmountInput.value || '').replace(',', '.').trim();
      const amount = parseFloat(raw) || 0;
      const max = parseFloat(withdrawAmountInput.dataset.max || '0');
      currentWithdrawMethod = 'shop_credit';
      selectShopCreditInRequest();
      updateWithdrawBonusPreview(amount, max, currentWithdrawMethod, withdrawAmountInput.dataset.currency || requestDisplayCurrency);
    });
  }

  if (withdrawCancelBtn) {
    withdrawCancelBtn.addEventListener('click', closeWithdrawModal);
  }
  if (withdrawModal && withdrawModal.querySelector('.slm-withdraw-modal__backdrop')) {
    withdrawModal.querySelector('.slm-withdraw-modal__backdrop').addEventListener('click', closeWithdrawModal);
  }

  if (successOkBtn) {
    successOkBtn.addEventListener('click', closeSuccessModal);
  }
  if (successModal && successModal.querySelector('.slm-success-modal__backdrop')) {
    successModal.querySelector('.slm-success-modal__backdrop').addEventListener('click', closeSuccessModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (withdrawModal && withdrawModal.classList.contains('is-open')) { closeWithdrawModal(); return; }
    if (successModal && successModal.classList.contains('is-open')) { closeSuccessModal(); return; }
    if (datepickerOverlay && datepickerOverlay.classList.contains('is-open')) { closeDatepicker(); return; }
    if (slmDrawer && slmDrawer.classList.contains('is-open')) { closeSlmDrawer(); return; }
    if (overlay && overlay.classList.contains('is-open')) closeModal();
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentDays = parseInt(btn.dataset.days, 10);
      presetBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const now = new Date();
      const from = currentDays <= 0 ? new Date(2000, 0, 1) : new Date(now.getTime() - currentDays * 24 * 60 * 60 * 1000);
      if (dateFrom) dateFrom.value = toYMD(from);
      if (dateTo) dateTo.value = toYMD(now);
      updateDatePreview();
      loadSalesData();
    });
  });

  if (dateFrom && dateTo) {
    const applySalesDates = () => {
      presetBtns.forEach(b => b.classList.remove('is-active'));
      if (dateFrom.value && dateTo.value) {
        const from = new Date(dateFrom.value + 'T12:00:00');
        const to = new Date(dateTo.value + 'T12:00:00');
        const diff = Math.ceil((to - from) / (24 * 60 * 60 * 1000));
        currentDays = diff > 0 ? diff : 0;
      }
      updateDatePreview();
      loadSalesData();
    };
    dateFrom.addEventListener('change', applySalesDates);
    dateTo.addEventListener('change', applySalesDates);
  }

  networkPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      networkDays = parseInt(btn.dataset.days, 10);
      networkPresetBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const now = new Date();
      const from = networkDays <= 0 ? new Date(2000, 0, 1) : new Date(now.getTime() - networkDays * 24 * 60 * 60 * 1000);
      if (networkDateFrom) networkDateFrom.value = toYMD(from);
      if (networkDateTo) networkDateTo.value = toYMD(now);
      updateNetworkPeriodPreview();
      loadNetworkData();
    });
  });

  if (networkDateFrom && networkDateTo) {
    const applyNetworkDates = () => {
      networkPresetBtns.forEach(b => b.classList.remove('is-active'));
      if (networkDateFrom.value && networkDateTo.value) {
        const from = new Date(networkDateFrom.value + 'T12:00:00');
        const to = new Date(networkDateTo.value + 'T12:00:00');
        const diff = Math.ceil((to - from) / (24 * 60 * 60 * 1000));
        networkDays = diff > 0 ? diff : 0;
      }
      updateNetworkPeriodPreview();
      loadNetworkData();
    };
    networkDateFrom.addEventListener('change', applyNetworkDates);
    networkDateTo.addEventListener('change', applyNetworkDates);
  }

  function updateDatePreview() {
    const previewEl = document.getElementById('slmDatePreview');
    if (!previewEl) return;
    const activePreset = document.querySelector('[data-section="datefilter"] .slm-preset.is-active');
    if (activePreset) {
      const d = activePreset.dataset.days;
      previewEl.textContent = previewEl.getAttribute('data-i18n-' + d) || ('Last ' + d + ' days');
    } else if (dateFrom && dateTo && dateFrom.value && dateTo.value) {
      const fromStr = new Date(dateFrom.value + 'T12:00:00').toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      const toStr = new Date(dateTo.value + 'T12:00:00').toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      previewEl.textContent = fromStr + ' – ' + toStr;
    } else {
      previewEl.textContent = '—';
    }
  }

  function updateNetworkPeriodPreview() {
    const previewEl = document.getElementById('slmNetworkPeriodPreview');
    if (!previewEl) return;
    const activePreset = document.querySelector('[data-section="network-datefilter"] .slm-preset.is-active');
    if (activePreset) {
      const d = activePreset.dataset.days;
      previewEl.textContent = previewEl.getAttribute('data-i18n-' + d) || (d === '0' ? 'All time' : 'Last ' + d + ' days');
    } else if (networkDateFrom && networkDateTo && networkDateFrom.value && networkDateTo.value) {
      const fromStr = new Date(networkDateFrom.value + 'T12:00:00').toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      const toStr = new Date(networkDateTo.value + 'T12:00:00').toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
      previewEl.textContent = fromStr + ' – ' + toStr;
    } else {
      previewEl.textContent = '—';
    }
  }

  function initDates() {
    const now = new Date();
    const from = currentDays <= 0 ? new Date(2000, 0, 1) : new Date(now.getTime() - currentDays * 24 * 60 * 60 * 1000);
    if (dateFrom) dateFrom.value = toYMD(from);
    if (dateTo) dateTo.value = toYMD(now);
  }

  function initNetworkDates() {
    const now = new Date();
    const from = networkDays <= 0 ? new Date(2000, 0, 1) : new Date(now.getTime() - networkDays * 24 * 60 * 60 * 1000);
    if (networkDateFrom) networkDateFrom.value = toYMD(from);
    if (networkDateTo) networkDateTo.value = toYMD(now);
  }

  var convertCfg = {
    eaz_cents_per_eaz: 10,
    fiat_currency: 'USD',
    min_convert_eaz: 100,
    available_eaz: 0,
    pendingAmount: 0
  };

  function fmtEazAmount(n) {
    var v = Number(n || 0);
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  function convertI18n(key, fallback) {
    var map = {
      min: (overlay && overlay.dataset.i18nConvertMinEazc) || 'Minimum {{min}} EAZC required.',
      fail: (overlay && overlay.dataset.i18nConvertFail) || 'Conversion failed.',
      celebrating: (overlay && overlay.dataset.i18nConvertCelebrating) || 'Converting EAZC…',
      celebrateTitle: (overlay && overlay.dataset.i18nConvertCelebrateTitle) || 'Converted!',
      celebrateSubtitle:
        (overlay && overlay.dataset.i18nConvertCelebrateSubtitle) ||
        '{{eazc}} EAZC → {{fiat}} added to your fiat balance.'
    };
    return map[key] || fallback || '';
  }

  function formatFiatUsdFromCents(cents) {
    var usd = Number(cents || 0) / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(usd);
    } catch (_e) {
      return '$' + usd.toFixed(2);
    }
  }

  function getConvertAmount() {
    var amountEl = document.getElementById('slmConvertAmount');
    return Number(amountEl && amountEl.value);
  }

  function updateConvertSyncPreview() {
    var amountEl = document.getElementById('slmConvertAmount');
    var availEl = document.getElementById('slmConvertAvail');
    var fiatEl = document.getElementById('slmConvertFiatSync');
    if (availEl) availEl.textContent = fmtEazAmount(convertCfg.available_eaz) + ' EAZC';
    var amount = Number(amountEl && amountEl.value);
    var rate = convertCfg.eaz_cents_per_eaz || 10;
    if (!amount || amount <= 0 || !rate) {
      if (fiatEl) fiatEl.textContent = formatFiatUsdFromCents(0);
      return;
    }
    var usdCents = Math.round(amount * rate);
    if (fiatEl) fiatEl.textContent = formatFiatUsdFromCents(usdCents);
  }

  function stepConvertAmount(delta) {
    var amountEl = document.getElementById('slmConvertAmount');
    if (!amountEl) return;
    var min = Number(amountEl.min) || 100;
    var max = amountEl.max ? Number(amountEl.max) : null;
    var stepVal = Number(amountEl.step) || 1;
    var current = Number(amountEl.value);
    if (!current || isNaN(current)) current = 0;
    var next = current + delta * stepVal;
    if (next < min) next = min;
    if (max != null && !isNaN(max) && next > max) next = max;
    amountEl.value = String(next);
    amountEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setConvertMsg(text, kind) {
    var el = document.getElementById('slmConvertMsg');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.remove('is-error', 'is-success');
    if (kind) el.classList.add(kind === 'error' ? 'is-error' : 'is-success');
  }

  function closeEazcConfirmModal() {
    var modal = document.getElementById('slmEazcConfirmModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openEazcConfirmModal() {
    var amount = getConvertAmount();
    var min = convertCfg.min_convert_eaz || 100;
    var rate = convertCfg.eaz_cents_per_eaz || 10;
    if (!amount || amount < min) {
      setConvertMsg(convertI18n('min').replace(/\{\{min\}\}/g, String(min)), 'error');
      return;
    }
    if (amount > convertCfg.available_eaz + 1e-9) {
      setConvertMsg(convertI18n('fail'), 'error');
      return;
    }
    setConvertMsg('', null);
    var usdCents = Math.round(amount * rate);
    var after = Math.max(0, convertCfg.available_eaz - amount);
    var eazcEl = document.getElementById('slmEazcConfirmEazc');
    var rateEl = document.getElementById('slmEazcConfirmRate');
    var fiatEl = document.getElementById('slmEazcConfirmFiat');
    var afterEl = document.getElementById('slmEazcConfirmAfter');
    if (eazcEl) eazcEl.textContent = fmtEazAmount(amount) + ' EAZC';
    if (rateEl) rateEl.textContent = formatFiatUsdFromCents(rate) + ' / EAZC';
    if (fiatEl) fiatEl.textContent = formatFiatUsdFromCents(usdCents);
    if (afterEl) afterEl.textContent = fmtEazAmount(after) + ' EAZC';
    var modal = document.getElementById('slmEazcConfirmModal');
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function showEazcConvertCelebration(eazcAmount, fiatText) {
    if (!convertAnimation) return;
    var animText = convertAnimation.querySelector('.slm-convert-animation__text');
    convertAnimation.classList.add('is-open', 'is-celebration', 'is-eazc-convert');
    convertAnimation.setAttribute('aria-hidden', 'false');
    if (animText) {
      var title = convertAnimation.dataset.i18nEazcCelebrateTitle || convertI18n('celebrateTitle');
      var subtitleTpl =
        convertAnimation.dataset.i18nEazcCelebrateSubtitle || convertI18n('celebrateSubtitle');
      var subtitle = subtitleTpl
        .replace(/\{\{eazc\}\}/g, fmtEazAmount(eazcAmount))
        .replace(/\{\{fiat\}\}/g, fiatText);
      animText.textContent = title + ' — ' + subtitle;
    }
  }

  async function confirmEazcConvert() {
    var ownerId = getOwnerId();
    var amountEl = document.getElementById('slmConvertAmount');
    var amount = getConvertAmount();
    var rate = convertCfg.eaz_cents_per_eaz || 10;
    var usdCents = Math.round(amount * rate);
    var fiatText = formatFiatUsdFromCents(usdCents);
    closeEazcConfirmModal();
    if (!ownerId || !amount) return;
    if (convertAnimation) {
      var animText = convertAnimation.querySelector('.slm-convert-animation__text');
      convertAnimation.classList.add('is-open');
      convertAnimation.classList.remove('is-celebration');
      convertAnimation.setAttribute('aria-hidden', 'false');
      if (animText) {
        animText.textContent =
          convertAnimation.dataset.i18nEazcCelebrating || convertI18n('celebrating');
      }
    }
    try {
      var url = getApiBase() + '/apps/creator-dispatch?op=convert-eaz-to-fiat';
      var res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId, amount_eaz: amount })
      });
      var data = await res.json();
      if (!data || !data.ok) throw new Error((data && data.error) || 'failed');
      if (amountEl) amountEl.value = '';
      updateConvertSyncPreview();
      showEazcConvertCelebration(amount, fiatText);
      await loadOverviewData();
      if (typeof window.reloadCreatorDashboardBalances === 'function') {
        window.reloadCreatorDashboardBalances();
      } else if (typeof window.loadCreatorSalesBalance === 'function') {
        window.loadCreatorSalesBalance(0);
      }
      setTimeout(function () {
        showConvertAnimation(false);
        if (convertAnimation) convertAnimation.classList.remove('is-eazc-convert');
      }, 2200);
    } catch (_e) {
      showConvertAnimation(false);
      if (convertAnimation) convertAnimation.classList.remove('is-eazc-convert');
      setConvertMsg(convertI18n('fail'), 'error');
    }
  }

  function bindConvertUi() {
    if (!overlay || overlay.__slmConvertBound) return;
    overlay.__slmConvertBound = true;
    var amountEl = document.getElementById('slmConvertAmount');
    var convertBtn = document.getElementById('slmConvertBtn');
    var confirmOk = document.getElementById('slmEazcConfirmOk');
    var confirmModal = document.getElementById('slmEazcConfirmModal');
    if (amountEl) {
      amountEl.addEventListener('input', updateConvertSyncPreview);
      amountEl.addEventListener('change', updateConvertSyncPreview);
    }
    overlay.querySelectorAll('[data-slm-convert-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        stepConvertAmount(Number(btn.getAttribute('data-slm-convert-step')) || 0);
      });
    });
    if (convertBtn) convertBtn.addEventListener('click', openEazcConfirmModal);
    if (confirmOk) confirmOk.addEventListener('click', confirmEazcConvert);
    if (confirmModal) {
      confirmModal.querySelectorAll('[data-slm-eazc-confirm-close]').forEach(function (el) {
        el.addEventListener('click', closeEazcConfirmModal);
      });
    }
  }

  async function loadOverviewData() {
    const ownerId = getOwnerId();
    if (!ownerId) return;
    bindConvertUi();
    const fiatAvailableEl = document.getElementById('slmFiatAvailable');
    const fiatPaidOutEl = document.getElementById('slmFiatPaidOut');
    const fiatLifetimeEl = document.getElementById('slmFiatLifetime');
    const eazcAvailableEl = document.getElementById('slmEazcAvailable');
    const eazcPendingEl = document.getElementById('slmEazcPending');
    const eazcConvertedEl = document.getElementById('slmEazcConverted');
    const eazcLifetimeEl = document.getElementById('slmEazcLifetime');
    try {
      const overviewUrl = getApiBase() + '/apps/creator-dispatch?op=get-creator-payout-overview&owner_id=' + encodeURIComponent(ownerId) + '&days=' + currentDays;
      const earnedUrl = getApiBase() + '/apps/creator-dispatch?op=get-earned-balance&owner_id=' + encodeURIComponent(ownerId);
      const [overviewRes, earnedRes] = await Promise.all([fetch(overviewUrl), fetch(earnedUrl)]);
      const data = await overviewRes.json();
      const earned = await earnedRes.json().catch(function () { return null; });
      if (!data.ok) return;
      overviewBaseCurrency = normalizeCurrencyCode(data.baseCurrency || data.currency || 'EUR', 'EUR');
      earningsDisplayCurrency = normalizeCurrencyCode(data.earningsCurrency || 'USD', 'USD');
      const avail = typeof data.availableAmount === 'number' ? data.availableAmount : 0;
      availableAmountBase = avail;
      const availEarnings = convertAmount(avail, overviewBaseCurrency, earningsDisplayCurrency);
      var paidOutTotal = typeof data.payoutsTotal === 'number' ? data.payoutsTotal : 0;
      var lifetimeTotal = typeof data.lifetimeAmount === 'number'
        ? data.lifetimeAmount
        : (avail + paidOutTotal);
      if (fiatAvailableEl) fiatAvailableEl.textContent = formatMoney(availEarnings, earningsDisplayCurrency);
      if (fiatPaidOutEl) {
        fiatPaidOutEl.textContent = formatMoney(
          convertAmount(paidOutTotal, overviewBaseCurrency, earningsDisplayCurrency),
          earningsDisplayCurrency
        );
      }
      if (fiatLifetimeEl) {
        fiatLifetimeEl.textContent = formatMoney(
          convertAmount(lifetimeTotal, overviewBaseCurrency, earningsDisplayCurrency),
          earningsDisplayCurrency
        );
      }

      var requestAvailEl = document.getElementById('slmRequestAvailable');
      requestDisplayCurrency = getPreferredRequestCurrency();
      const availRequest = convertAmount(avail, overviewBaseCurrency, requestDisplayCurrency);
      if (requestAvailEl) {
        requestAvailEl.textContent = availRequest.toFixed(2);
        requestAvailEl.dataset.currency = requestDisplayCurrency;
        requestAvailEl.dataset.amount = String(availRequest);
        requestAvailEl.dataset.amountBase = String(avail);
      }
      var shopAmountEl = document.getElementById('slmRequestShopAmount');
      var shopFormulaEl = document.getElementById('slmRequestShopFormula');
      if (shopAmountEl) shopAmountEl.textContent = formatMoney(availRequest * 1.1, requestDisplayCurrency);
      loadPayoutDetails().then(function () {
        requestDisplayCurrency = getPreferredRequestCurrency();
        if (typeof renderPayoutMethods === 'function') renderPayoutMethods(avail);
      });
      if (shopFormulaEl) shopFormulaEl.textContent = formatMoney(availRequest, requestDisplayCurrency) + ' + 10% = ' + formatMoney(availRequest * 1.1, requestDisplayCurrency);

      if (earned && earned.ok) {
        var eazcAvail = Number(
          earned.balance_eazc_available != null ? earned.balance_eazc_available : earned.balance_earned_available || 0
        );
        var eazcPending = Number(
          earned.balance_eazc_locked != null ? earned.balance_eazc_locked : earned.balance_earned_locked || 0
        );
        var eazcConverted = Number(earned.balance_eazc_converted || 0);
        var eazcLifetime = Number(
          earned.balance_eazc_lifetime != null
            ? earned.balance_eazc_lifetime
            : eazcAvail + eazcPending + eazcConverted
        );
        if (eazcAvailableEl) eazcAvailableEl.textContent = fmtEazAmount(eazcAvail) + ' EAZC';
        if (eazcPendingEl) eazcPendingEl.textContent = fmtEazAmount(eazcPending) + ' EAZC';
        if (eazcConvertedEl) eazcConvertedEl.textContent = fmtEazAmount(eazcConverted) + ' EAZC';
        if (eazcLifetimeEl) eazcLifetimeEl.textContent = fmtEazAmount(eazcLifetime) + ' EAZC';
        convertCfg.eaz_cents_per_eaz = Number(earned.eaz_cents_per_eaz || 10);
        convertCfg.fiat_currency = earned.fiat_currency || 'USD';
        convertCfg.min_convert_eaz = Number(earned.min_convert_eaz || 100);
        convertCfg.available_eaz = eazcAvail;
        convertCfg.pendingAmount = eazcPending;
        var amountInput = document.getElementById('slmConvertAmount');
        if (amountInput) {
          amountInput.min = String(convertCfg.min_convert_eaz);
          amountInput.max = String(Math.max(eazcAvail, convertCfg.min_convert_eaz));
        }
        updateConvertSyncPreview();
      }

      var payoutsListEl = document.getElementById('slmPayoutsList');
      var payoutsEmptyEl = document.getElementById('slmPayoutsEmpty');
      if (payoutsListEl && payoutsEmptyEl) {
        var payouts = Array.isArray(data.payouts) ? data.payouts : [];
        var statusCompleted = (overlay && overlay.dataset.i18nStatusCompleted) || 'Completed';
        var payoutShopLabel = (overlay && overlay.dataset.i18nPayoutShopCredit) || 'Shop credit';
        var payoutBankLabel = (overlay && overlay.dataset.i18nPayoutBank) || 'Bank transfer';
        var payoutWiseLabel = (overlay && overlay.dataset.i18nPayoutWise) || 'Wise';
        if (payouts.length > 0) {
          payoutsEmptyEl.style.display = 'none';
          payoutsListEl.innerHTML = payouts.map(function(p) {
            var methodLabel = p.payoutType === 'shop_credit' ? payoutShopLabel : (p.payoutType === 'wise' ? payoutWiseLabel : payoutBankLabel);
            var dateStr = p.date || '—';
            var payoutCurrency = normalizeCurrencyCode(p.payoutCurrency || requestDisplayCurrency || overviewBaseCurrency, overviewBaseCurrency);
            return '<div class="slm-card slm-card--payout" data-payout-id="' + String(p.id || '').replace(/"/g, '&quot;') + '"><div class="slm-card__main"><span class="slm-card__date">' + dateStr + '</span><span class="slm-card__method">' + methodLabel.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span></div><div class="slm-card__meta"><span class="slm-card__amount">' + formatMoney(Number(p.amount || 0), payoutCurrency) + '</span><span class="slm-card__badge slm-card__badge--done">' + statusCompleted.replace(/</g,'&lt;') + '</span></div></div>';
          }).join('');
        } else {
          payoutsListEl.innerHTML = '';
          payoutsEmptyEl.style.display = 'block';
        }
      }
      if (window.EazCoinBrand && typeof window.EazCoinBrand.applyCoinImages === 'function') {
        window.EazCoinBrand.applyCoinImages(overlay);
      }
    } catch (e) {
      console.warn('[Sales Modal] Overview load failed:', e);
    }
  }

  async function loadSalesData() {
    const ownerId = getOwnerId();
    if (!ownerId) { console.warn('[Sales Modal] No owner ID'); return; }

    const i18n = productsList ? {
      loading: productsList.dataset.i18nLoading || 'Loading sales...',
      empty: productsList.dataset.i18nEmpty || 'No sales in selected period',
      error: productsList.dataset.i18nError || 'Error loading sales',
      revenue: productsList.dataset.i18nRevenue || 'Revenue',
      earnings: productsList.dataset.i18nEarnings || 'Earnings',
      unknown: productsList.dataset.i18nUnknown || 'Unknown Product',
      testSale: productsList.dataset.i18nTestSale || 'Test Sale',
      testBadge: productsList.dataset.i18nTestBadge || 'Test'
    } : {};

    if (productsList) productsList.innerHTML = '<div class="slm-loading"><div class="slm-loading-spinner"></div><span>' + i18n.loading + '</span></div>';

    try {
      const salesUrl = getApiBase() + '/apps/creator-dispatch?op=get-creator-sales&owner_id=' + encodeURIComponent(ownerId) + '&days=' + currentDays;
      const payoutUrl = getApiBase() + '/apps/creator-dispatch?op=get-creator-payout-overview&owner_id=' + encodeURIComponent(ownerId) + '&days=' + currentDays;

      const [salesRes, payoutRes] = await Promise.all([fetch(salesUrl), fetch(payoutUrl)]);
      const eazpireData = await salesRes.json();
      const payoutData = await payoutRes.json().catch(function() { return {}; });
      const amazonData = { ok: true, totalOrders: 0, totalItems: 0, totalRevenue: 0 };

      const eazpireSales = eazpireData.ok ? (eazpireData.totalOrders || 0) : 0;
      const amazonSales = amazonData.ok ? amazonData.totalOrders : 0;
      const totalSales = eazpireSales + amazonSales;
      const eazpireItems = eazpireData.ok ? (eazpireData.totalItems || 0) : 0;
      const amazonItems = amazonData.ok ? amazonData.totalItems : 0;
      const totalItems = eazpireItems + amazonItems;

      const totalSalesEl = document.getElementById('slmTotalSales');
      const totalItemsEl = document.getElementById('slmTotalItems');
      const totalProfitEl = document.getElementById('slmTotalProfit');
      const legendEazpireEl = document.getElementById('slmLegendEazpire');
      const legendAmazonEl = document.getElementById('slmLegendAmazon');
      const productsCountEl = document.getElementById('slmProductsCount');

      if (totalSalesEl) totalSalesEl.textContent = totalSales.toLocaleString();
      if (totalItemsEl) totalItemsEl.textContent = totalItems.toLocaleString();

      var creatorEarnings = eazpireData.ok && typeof eazpireData.totalCreatorEarnings === 'number' ? eazpireData.totalCreatorEarnings : null;
      if ((creatorEarnings == null || creatorEarnings === 0) && payoutData.ok && typeof payoutData.salesAmount === 'number' && payoutData.salesAmount > 0) {
        creatorEarnings = payoutData.salesAmount;
      }
      const sourceCurrency = normalizeCurrencyCode(eazpireData.currency || payoutData.baseCurrency || payoutData.currency || 'EUR', 'EUR');
      const earningsCurrency = normalizeCurrencyCode((payoutData && payoutData.earningsCurrency) || 'USD', 'USD');
      const convertedCreatorEarnings = creatorEarnings != null ? convertAmount(creatorEarnings, sourceCurrency, earningsCurrency) : null;
      if (totalProfitEl) totalProfitEl.textContent = convertedCreatorEarnings != null ? formatMoney(convertedCreatorEarnings, earningsCurrency) : '–';
      if (legendEazpireEl) legendEazpireEl.textContent = eazpireSales.toLocaleString();
      if (legendAmazonEl) legendAmazonEl.textContent = amazonSales.toLocaleString();

      const barEazpire = document.getElementById('slmBarEazpire');
      const barAmazon = document.getElementById('slmBarAmazon');
      const valueEazpire = document.getElementById('slmValueEazpire');
      const valueAmazon = document.getElementById('slmValueAmazon');
      const maxVal = Math.max(eazpireSales, amazonSales, 1);
      if (barEazpire) barEazpire.style.width = Math.max((eazpireSales / maxVal) * 100, 2) + '%';
      if (barAmazon) barAmazon.style.width = Math.max((amazonSales / maxVal) * 100, 2) + '%';
      if (valueEazpire) valueEazpire.textContent = eazpireSales.toLocaleString();
      if (valueAmazon) valueAmazon.textContent = amazonSales.toLocaleString();

      if (eazpireData.ok && eazpireData.products && eazpireData.products.length > 0) {
        productsList.innerHTML = eazpireData.products.map(p => {
          const displayName = (p.isTest ? i18n.testSale : (p.name || i18n.unknown)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          const placeholderIcon = p.isTest ? '🧪' : '📦';
          const img = p.image ? '<img src="' + p.image + '" alt="" loading="lazy">' : '<div class="slm-product__image-placeholder' + (p.isTest ? ' slm-product__image-placeholder--test' : '') + '">' + placeholderIcon + '</div>';
          const platform = p.platform || 'eazpire';
          const hasEarnings = typeof p.creatorEarnings === 'number' && p.creatorEarnings >= 0;
          const amount = hasEarnings ? p.creatorEarnings : (p.revenue || 0);
          const label = hasEarnings ? i18n.earnings : i18n.revenue;
          const rev = convertAmount(amount, sourceCurrency, earningsCurrency).toFixed(2);
          const testBadge = p.isTest ? ' <span class="slm-product__test-badge">' + (i18n.testBadge || 'Test').replace(/</g,'&lt;') + '</span>' : '';
          return '<div class="slm-product' + (p.isTest ? ' slm-product--test' : '') + '"><div class="slm-product__image">' + img + '</div><div class="slm-product__info"><div class="slm-product__name"><span class="slm-product__name-text">' + displayName + '</span>' + testBadge + '</div><div class="slm-product__meta"><span class="slm-product__platform slm-product__platform--' + platform + '">' + platform + '</span><span>' + (p.quantity || 1) + 'x</span><span class="slm-product__date">' + (p.date || '') + '</span></div></div><div class="slm-product__revenue"><span class="slm-product__revenue-label">' + label + '</span><span class="slm-product__revenue-value">' + formatMoney(Number(rev), earningsCurrency) + '</span></div></div>';
        }).join('');
      } else if (productsList) {
        productsList.innerHTML = '<div class="slm-empty"><div class="slm-empty-icon">📦</div><div class="slm-empty-text">' + i18n.empty + '</div></div>';
      }
      if (productsCountEl) productsCountEl.textContent = (eazpireData.products ? eazpireData.products.length : 0).toString();
    } catch (err) {
      console.error('[Sales Modal]', err);
      if (productsList) productsList.innerHTML = '<div class="slm-empty"><div class="slm-empty-icon">⚠️</div><div class="slm-empty-text">' + i18n.error + '</div></div>';
    }
  }

  document.querySelectorAll('.slm-section[data-section]:not([data-section="balance"]) .slm-section__header').forEach(header => {
    if (header.style.pointerEvents === 'none') return;
    header.addEventListener('click', () => {
      const section = header.closest('.slm-section');
      if (!section) return;
      section.classList.toggle('is-collapsed');
      header.setAttribute('aria-expanded', !section.classList.contains('is-collapsed'));
    });
  });

  initDates();
  updateDatePreview();
  initNetworkDates();
  updateNetworkPeriodPreview();
})();
