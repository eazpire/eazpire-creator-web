/**
 * Creator Settings - Payout Panel Controller
 * Auszahlungskonto (Wise – weltweit) + Automatische Auszahlung
 */
(function () {
  'use strict';

  var IBAN_COUNTRIES = ['DE', 'AT', 'CH', 'FR', 'NL', 'BE', 'ES', 'IT', 'PL', 'SE', 'NO', 'FI', 'PT', 'IE', 'GR', 'CZ', 'RO', 'HU', 'BG', 'HR', 'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY'];
  var currentRequirements = null;
  var currentRecipientType = null;
  var userSelectedPayoutMode = null;
  var applyPayoutModeUi = null;
  var openPayoutMethodEditModal = null;
  var PICKER_BASE_Z_INDEX = "10000";
  var PICKER_OVER_EDIT_Z_INDEX = "10030";

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

  function getI18n(key, fallback) {
    const overlay = document.getElementById('csmOverlay');
    const dataKey = 'i18n' + key.replace(/(^|_)([a-z])/g, (_, p1, p2) => p2.toUpperCase()).replace(/_/g, '');
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return overlay?.dataset?.[dataKey] ?? (window.getI18n ? window.getI18n(camelKey, fallback) : (window.CreatorI18n?.[camelKey] || fallback));
  }

  function showStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'csm-payout-status' + (isError ? ' csm-payout-status--error' : '');
  }

  function toCountryFlag(code) {
    var cc = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    var first = cc.charCodeAt(0) - 65 + 127462;
    var second = cc.charCodeAt(1) - 65 + 127462;
    return String.fromCodePoint(first) + String.fromCodePoint(second);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function extractLast4(value) {
    var cleaned = String(value || '').replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length < 4) return '';
    return cleaned.slice(-4);
  }

  function setCountryDisplay(displayEl, countryCode, label) {
    if (!displayEl) return;
    var flag = toCountryFlag(countryCode);
    var safeLabel = escapeHtml(label || countryCode || '');
    displayEl.innerHTML = (flag ? '<span class="csm-country-flag">' + flag + '</span> ' : '') + safeLabel;
  }

  function currencyMeta(code) {
    var c = String(code || '').toUpperCase();
    var symbolMap = {
      EUR: 'EUR', USD: '$', GBP: 'GBP', CHF: 'CHF', AUD: 'AUD', CAD: 'CAD', PLN: 'PLN', SEK: 'SEK', NOK: 'NOK',
      CZK: 'CZK', RON: 'RON', HUF: 'HUF', BGN: 'BGN', UAH: 'UAH', MXN: 'MXN', BRL: 'BRL', ARS: 'ARS', CLP: 'CLP',
      COP: 'COP', PEN: 'PEN', CRC: 'CRC', GTQ: 'GTQ', INR: 'INR', CNY: 'CNY', JPY: 'JPY', KRW: 'KRW', SGD: 'SGD',
      HKD: 'HKD', MYR: 'MYR', THB: 'THB', IDR: 'IDR', PHP: 'PHP', PKR: 'PKR', BDT: 'BDT', NPR: 'NPR', LKR: 'LKR',
      NZD: 'NZD', AED: 'AED', ILS: 'ILS', TRY: 'TRY', ZAR: 'ZAR', EGP: 'EGP', NGN: 'NGN', KES: 'KES', GHS: 'GHS',
      MAD: 'MAD', TZS: 'TZS', UGX: 'UGX'
    };
    var countryMap = {
      EUR: 'EU', USD: 'US', GBP: 'GB', CHF: 'CH', AUD: 'AU', CAD: 'CA', PLN: 'PL', SEK: 'SE', NOK: 'NO', CZK: 'CZ',
      RON: 'RO', HUF: 'HU', BGN: 'BG', UAH: 'UA', MXN: 'MX', BRL: 'BR', ARS: 'AR', CLP: 'CL', COP: 'CO', PEN: 'PE',
      CRC: 'CR', GTQ: 'GT', INR: 'IN', CNY: 'CN', JPY: 'JP', KRW: 'KR', SGD: 'SG', HKD: 'HK', MYR: 'MY', THB: 'TH',
      IDR: 'ID', PHP: 'PH', PKR: 'PK', BDT: 'BD', NPR: 'NP', LKR: 'LK', NZD: 'NZ', AED: 'AE', ILS: 'IL', TRY: 'TR',
      ZAR: 'ZA', EGP: 'EG', NGN: 'NG', KES: 'KE', GHS: 'GH', MAD: 'MA', TZS: 'TZ', UGX: 'UG'
    };
    var representativeCountry = countryMap[c];
    return {
      code: c,
      symbol: symbolMap[c] || c,
      flag: representativeCountry ? toCountryFlag(representativeCountry) : ''
    };
  }

  function setCurrencyDisplay(displayEl, currencyCode) {
    if (!displayEl) return;
    var meta = currencyMeta(currencyCode);
    var icon = meta.flag || meta.symbol;
    displayEl.innerHTML =
      '<span class="csm-country-flag">' + escapeHtml(icon) + '</span> ' +
      '<span>' + escapeHtml(meta.code) + '</span>';
  }

  function applyPickerOverlayLayer(overlayEl, options) {
    if (!overlayEl) return;
    var opts = options || {};
    var overEdit = !!opts.overEdit;
    overlayEl.classList.toggle('is-over-edit', overEdit);
    overlayEl.style.zIndex = overEdit ? PICKER_OVER_EDIT_Z_INDEX : PICKER_BASE_Z_INDEX;
  }

  function resetPickerOverlayLayer(overlayEl) {
    if (!overlayEl) return;
    overlayEl.classList.remove('is-over-edit');
    overlayEl.style.zIndex = '';
  }

  function showIbanForm(show) {
    var ibanSec = document.getElementById('csmPayoutIbanSection');
    var dynSec = document.getElementById('csmPayoutDynamicFields');
    if (ibanSec) ibanSec.style.display = show ? '' : 'none';
    if (dynSec) {
      dynSec.style.display = show ? 'none' : '';
      if (!show && dynSec.children.length === 0) dynSec.innerHTML = '<p class="csm-payout-hint">Loading bank details form...</p>';
    }
  }

  function fetchRequirements(targetCurrency, callback) {
    var apiBase = getApiBase();
    var url = apiBase + '/apps/creator-dispatch?op=get-wise-account-requirements&target=' + encodeURIComponent(targetCurrency) + '&source=EUR&sourceAmount=100';
    fetch(url, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.requirements && data.requirements.length > 0) {
          var rec = data.requirements[0];
          if (rec.type === 'email') rec = data.requirements[1] || rec;
          currentRequirements = rec;
          currentRecipientType = rec.type;
          if (typeof callback === 'function') callback(rec);
        } else {
          currentRequirements = null;
          if (typeof callback === 'function') callback(null);
        }
      })
      .catch(function () { currentRequirements = null; if (typeof callback === 'function') callback(null); });
  }

  function buildDynamicForm(requirements, container) {
    if (!container || !requirements || !requirements.fields) return;
    container.innerHTML = '';
    var details = {};
    requirements.fields.forEach(function (field) {
      (field.group || []).forEach(function (g) {
        if (!g.key || g.key === 'accountHolderName') return;
        var wrap = document.createElement('label');
        wrap.className = 'csm-payout-field';
        var label = document.createElement('span');
        label.className = 'csm-payout-field__label';
        label.textContent = g.name || g.key;
        wrap.appendChild(label);
        var input;
        if (g.type === 'select' || (g.valuesAllowed && g.valuesAllowed.length > 0)) {
          input = document.createElement('select');
          input.className = 'csm-payout-field__input';
          input.dataset.key = g.key;
          var opts = g.valuesAllowed || [];
          opts.forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.key || '';
            o.textContent = opt.name || opt.key;
            input.appendChild(o);
          });
        } else if (g.type === 'radio') {
          var radWrap = document.createElement('div');
          radWrap.className = 'csm-payout-radio-group';
          (g.valuesAllowed || []).forEach(function (opt) {
            var lab = document.createElement('label');
            lab.className = 'csm-payout-radio';
            var inp = document.createElement('input');
            inp.type = 'radio';
            inp.name = 'csm_dyn_' + g.key.replace(/\./g, '_');
            inp.value = opt.key || '';
            inp.dataset.key = g.key;
            lab.appendChild(inp);
            lab.appendChild(document.createTextNode(opt.name || opt.key));
            radWrap.appendChild(lab);
          });
          wrap.appendChild(radWrap);
          container.appendChild(wrap);
          return;
        } else {
          input = document.createElement('input');
          input.type = g.type === 'date' ? 'date' : 'text';
          input.className = 'csm-payout-field__input';
          input.dataset.key = g.key;
          if (g.placeholder) input.placeholder = g.placeholder;
          if (g.example) input.placeholder = input.placeholder || g.example;
        }
        wrap.appendChild(input);
        container.appendChild(wrap);
      });
    });
  }

  function updateFormForCountry(code) {
    var useIban = IBAN_COUNTRIES.indexOf(code) >= 0;
    showIbanForm(useIban);
    var cSel = document.getElementById('csmPayoutCountry');
    var curSel = document.getElementById('csmPayoutCurrency');
    if (cSel && curSel) {
      var opt = cSel.options[cSel.selectedIndex];
      var cur = opt ? opt.getAttribute('data-currency') : 'EUR';
      if (cur) curSel.value = cur;
      var currencyDisplay = document.getElementById('csmPayoutCurrencyDisplay');
      if (currencyDisplay) setCurrencyDisplay(currencyDisplay, curSel.value);
    }
    if (!useIban && curSel) {
      var dyn = document.getElementById('csmPayoutDynamicFields');
      if (dyn) dyn.innerHTML = '<p class="csm-payout-hint">Loading...</p>';
      fetchRequirements(curSel.value, function (rec) {
        dyn = document.getElementById('csmPayoutDynamicFields');
        if (dyn && rec) {
          buildDynamicForm(rec, dyn);
        } else if (dyn) {
          dyn.innerHTML = '<p class="csm-payout-hint">Could not load form. Try again later.</p>';
        }
      });
    }
  }

  function collectDynamicDetails() {
    var container = document.getElementById('csmPayoutDynamicFields');
    if (!container) return {};
    var details = {};
    var setNested = function (obj, path, val) {
      var parts = path.split('.');
      var o = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        var p = parts[i];
        if (!o[p]) o[p] = {};
        o = o[p];
      }
      o[parts[parts.length - 1]] = val;
    };
    container.querySelectorAll('[data-key]').forEach(function (el) {
      if (el.type === 'radio' && !el.checked) return;
      var key = el.dataset.key;
      var val = el.type === 'checkbox' ? el.checked : (el.value || '').trim();
      if (key && val !== undefined && val !== '') {
        if (key.indexOf('.') >= 0) setNested(details, key, val);
        else details[key] = val;
      }
    });
    return details;
  }

  function renderMethodsList(methods, accountStatus) {
    const list = document.getElementById('csmPayoutMethodsList');
    if (!list) return;
    if (!methods || methods.length === 0) {
      list.innerHTML = '';
      return;
    }
    const editLabel = getI18n('payout_edit', 'Edit');
    const deleteLabel = getI18n('payout_delete', 'Delete');
    list.innerHTML = methods.map(function (m) {
      var meta = '';
      if (m.method === 'paypal') {
        meta = m.paypalEmailMasked || getI18n('payout_account_type_paypal', '');
      } else {
        var last4 = extractLast4(m.ibanMasked);
        meta = last4 ? ('**** ' + last4) : (m.countryCode ? m.currencyPreference + ' ' + m.countryCode : m.method);
      }
      return '<div class="csm-payout-method-card" data-id="' + (m.id || '').replace(/"/g, '&quot;') + '">' +
        '<div class="csm-payout-method-card__info">' +
        '<span class="csm-payout-method-card__label">' + (m.label || 'Standard').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
        '<span class="csm-payout-method-card__meta">' + (meta || '').replace(/</g, '&lt;') + '</span>' +
        '</div>' +
        '<div class="csm-payout-method-card__actions">' +
        '<button type="button" class="csm-payout-method-card__btn csm-payout-edit-btn">' + editLabel + '</button>' +
        '<button type="button" class="csm-payout-method-card__btn csm-payout-method-card__btn--delete csm-payout-delete-btn">' + deleteLabel + '</button>' +
        '</div></div>';
    }).join('');
    list.querySelectorAll('.csm-payout-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const card = btn.closest('.csm-payout-method-card');
        const id = card ? card.dataset.id : null;
        const method = methods.find(function (m) { return m.id === id; });
        if (!method) return;
        if (typeof openPayoutMethodEditModal === 'function') {
          openPayoutMethodEditModal(method);
        }
      });
    });
    list.querySelectorAll('.csm-payout-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const card = btn.closest('.csm-payout-method-card');
        const id = card ? card.dataset.id : null;
        if (!id || !confirm(getI18n('payout_delete_confirm', 'Delete this payout method?'))) return;
        fetch(getApiBase() + '/apps/creator-dispatch?op=save-creator-payout-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerId: getOwnerId(), id: id, delete: true }),
          credentials: 'include'
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.ok) loadPayoutData();
          });
      });
    });
  }

  function loadPayoutData() {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const apiBase = getApiBase();
    const url = apiBase + '/apps/creator-dispatch?op=get-creator-payout-details&owner_id=' + encodeURIComponent(ownerId);

    fetch(url, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;

        const methods = data.payoutMethods || [];
        const accountHolder = document.getElementById('csmPayoutAccountHolder');
        const ibanInput = document.getElementById('csmPayoutIban');
        const currencySel = document.getElementById('csmPayoutCurrency');
        const countrySel = document.getElementById('csmPayoutCountry');
        const accountStatus = document.getElementById('csmPayoutAccountStatus');
        const labelInput = document.getElementById('csmPayoutLabel');
        const editIdInput = document.getElementById('csmPayoutEditId');
        const cancelEditBtn = document.getElementById('csmPayoutCancelEdit');

        renderMethodsList(methods, accountStatus);

        if (editIdInput) editIdInput.value = '';
        if (cancelEditBtn) cancelEditBtn.style.display = 'none';

        if (methods.length > 0) {
          var first = methods[0];
          if (labelInput) labelInput.value = '';
          if (accountHolder) accountHolder.value = '';
          if (ibanInput) { ibanInput.value = ''; ibanInput.placeholder = first.ibanMasked || ''; }
          if (currencySel) {
            currencySel.value = first.currencyPreference || 'EUR';
            var currencyDisplay = document.getElementById('csmPayoutCurrencyDisplay');
            if (currencyDisplay) setCurrencyDisplay(currencyDisplay, currencySel.value);
          }
          if (countrySel && first.countryCode) {
            countrySel.value = first.countryCode;
            var display = document.getElementById('csmPayoutCountryDisplay');
            var opt = countrySel.querySelector('option[value="' + first.countryCode + '"]');
            if (display && opt) setCountryDisplay(display, first.countryCode, opt.textContent || first.countryCode);
            updateFormForCountry(first.countryCode);
          } else if (countrySel) {
            countrySel.value = 'DE';
            var display = document.getElementById('csmPayoutCountryDisplay');
            if (display) setCountryDisplay(display, 'DE', 'Germany');
            updateFormForCountry('DE');
          }
          if (accountStatus) showStatus(accountStatus, getI18n('payout_details_saved', 'Saved'));
        } else {
          if (labelInput) labelInput.value = '';
          if (accountHolder) accountHolder.value = '';
          if (ibanInput) ibanInput.value = '';
          if (currencySel) {
            currencySel.value = 'EUR';
            var currencyDisplay = document.getElementById('csmPayoutCurrencyDisplay');
            if (currencyDisplay) setCurrencyDisplay(currencyDisplay, 'EUR');
          }
          if (countrySel) {
            countrySel.value = 'DE';
            var display = document.getElementById('csmPayoutCountryDisplay');
            if (display) setCountryDisplay(display, 'DE', 'Germany');
            updateFormForCountry('DE');
          }
          if (accountStatus) showStatus(accountStatus, getI18n('payout_account_required', 'Add your bank details for Wise payouts.'), true);
        }

        var wiseMethods = methods.filter(function (m) { return m.method === 'wise'; });
        var autoMethodSelect = document.getElementById('csmPayoutAutoMethodSelect');
        var autoMethodSelectWrap = document.getElementById('csmPayoutAutoMethodSelectWrap');
        if (autoMethodSelect) {
          autoMethodSelect.innerHTML = wiseMethods.map(function (m) {
            return '<option value="' + (m.id || '').replace(/"/g, '&quot;') + '">' + (m.label || 'Standard').replace(/</g, '&lt;') + '</option>';
          }).join('');
          if (wiseMethods.length > 0 && data.autoPayoutDetailId) {
            autoMethodSelect.value = data.autoPayoutDetailId;
          } else if (wiseMethods.length > 0) {
            autoMethodSelect.value = wiseMethods[0].id;
          }
        }
        if (autoMethodSelectWrap) autoMethodSelectWrap.style.display = wiseMethods.length > 1 && data.autoPayoutMethod === 'wise' ? '' : 'none';

        const autoEnable = document.getElementById('csmPayoutAutoEnable');
        const autoOptions = document.getElementById('csmPayoutAutoOptions');
        const shopRadio = document.querySelector('input[name="csm_auto_method"][value="shop_credit"]');
        const wiseRadio = document.querySelector('input[name="csm_auto_method"][value="wise"]');
        const minAmountInput = document.getElementById('csmPayoutMinAmount');

        if (autoEnable) autoEnable.checked = !!data.autoPayoutEnabled;
        if (autoOptions) autoOptions.style.opacity = data.autoPayoutEnabled ? '1' : '0.5';
        var resolvedMode = userSelectedPayoutMode || (data.autoPayoutMethod === 'wise' ? 'wise' : 'shop_credit');
        if (shopRadio) shopRadio.checked = resolvedMode !== 'wise';
        if (wiseRadio) wiseRadio.checked = resolvedMode === 'wise';
        if (typeof applyPayoutModeUi === 'function') {
          applyPayoutModeUi(resolvedMode, { preserveUserSelection: true });
        }
        if (minAmountInput) minAmountInput.value = Math.round((data.autoPayoutMinCents || 5000) / 100);
      })
      .catch(function () {});
  }

  function initCountryModal(mainCountrySel, editCountrySel) {
    var overlay = document.getElementById('csmCountryOverlay');
    var mainTrigger = document.getElementById('csmPayoutCountryTrigger');
    var editTrigger = document.getElementById('csmPayoutEditCountryTrigger');
    var mainDisplay = document.getElementById('csmPayoutCountryDisplay');
    var editDisplay = document.getElementById('csmPayoutEditCountryDisplay');
    var closeBtn = document.getElementById('csmCountryModalClose');
    var searchInput = document.getElementById('csmCountrySearch');
    var listEl = document.getElementById('csmCountryModalList');
    if (!overlay || !mainCountrySel || !listEl) return;
    if (mainTrigger && mainTrigger.dataset.csmCountryBound === '1') return;
    if (mainTrigger) mainTrigger.dataset.csmCountryBound = '1';

    var active = { select: mainCountrySel, display: mainDisplay, onPick: null };

    function populateList(filter) {
      if (!active.select) return;
      var q = (filter || '').toLowerCase().trim();
      var opts = active.select.querySelectorAll('option');
      var rows = [];
      opts.forEach(function (opt) {
        var val = opt.value || '';
        var label = (opt.textContent || '').trim();
        if (q && label.toLowerCase().indexOf(q) < 0 && val.toLowerCase().indexOf(q) < 0) return;
        rows.push({ code: val, label: label });
      });
      if (!rows.length) {
        listEl.innerHTML = '<p class="csm-payout-hint">' + escapeHtml(getI18n('payout_country_no_results', 'No countries match')) + '</p>';
        return;
      }

      function bindCountryItemClicks() {
        listEl.querySelectorAll('.csm-country-modal__item').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var v = btn.dataset.value;
            var l = btn.dataset.label || v;
            active.select.value = v;
            if (active.display) setCountryDisplay(active.display, v, l);
            if (typeof active.onPick === 'function') active.onPick(v);
            active.select.dispatchEvent(new Event('change', { bubbles: true }));
            closeModal();
          });
        });
      }

      if (!window.eazGroupCountryRowsByContinent || !window.eazGetCountryContinent || !window.eazContinentLabels) {
        var htmlFlat = '';
        rows.forEach(function (row) {
          var val = row.code;
          var label = row.label;
          var sel = active.select.value === val ? ' is-selected' : '';
          var flag = toCountryFlag(val);
          htmlFlat += '<button type="button" class="csm-country-modal__item' + sel + '" data-value="' + (val || '').replace(/"/g, '&quot;') + '" data-label="' + (label || '').replace(/"/g, '&quot;') + '">' +
            (flag ? '<span class="csm-country-modal__flag">' + flag + '</span>' : '') +
            '<span class="csm-country-modal__name">' + escapeHtml(label || val) + '</span></button>';
        });
        listEl.innerHTML = htmlFlat;
        bindCountryItemClicks();
        return;
      }

      var selectedVal = active.select.value || '';
      var groups = window.eazGroupCountryRowsByContinent(rows, selectedVal, window.eazContinentLabels());
      var inSearch = !!q;
      var selCont = window.eazGetCountryContinent(selectedVal);
      var html = '';
      groups.forEach(function (g) {
        var expanded = inSearch || g.continent === selCont;
        var lm = window.eazContinentLabels();
        var cname = lm[g.continent] || g.continent;
        html += '<div class="csm-country-modal__continent' + (inSearch ? ' csm-country-modal__continent--search' : '') + '" data-continent="' + escapeHtml(g.continent) + '">';
        html += '<button type="button" class="csm-country-modal__continent-header" aria-expanded="' + (expanded ? 'true' : 'false') + '">';
        html += '<span class="csm-country-modal__continent-label">' + escapeHtml(cname) + '</span></button>';
        html += '<div class="csm-country-modal__continent-body"' + (expanded ? '' : ' hidden') + '>';
        g.items.forEach(function (item) {
          var val = item.code;
          var label = item.label;
          var sel = active.select.value === val ? ' is-selected' : '';
          var flag = toCountryFlag(val);
          html += '<button type="button" class="csm-country-modal__item' + sel + '" data-value="' + (val || '').replace(/"/g, '&quot;') + '" data-label="' + (label || '').replace(/"/g, '&quot;') + '">' +
            (flag ? '<span class="csm-country-modal__flag">' + flag + '</span>' : '') +
            '<span class="csm-country-modal__name">' + escapeHtml(label || val) + '</span></button>';
        });
        html += '</div></div>';
      });
      listEl.innerHTML = html;
      listEl.querySelectorAll('.csm-country-modal__continent-header').forEach(function (hdr) {
        hdr.addEventListener('click', function () {
          var grp = hdr.closest('.csm-country-modal__continent');
          if (grp && grp.classList.contains('csm-country-modal__continent--search')) return;
          var body = grp && grp.querySelector('.csm-country-modal__continent-body');
          if (!body) return;
          var next = hdr.getAttribute('aria-expanded') !== 'true';
          hdr.setAttribute('aria-expanded', next ? 'true' : 'false');
          body.hidden = !next;
        });
      });
      bindCountryItemClicks();
    }

    function countryModalKeyHandler(e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal();
    }
    function closeModal() {
      overlay.classList.remove('is-open');
      resetPickerOverlayLayer(overlay);
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', countryModalKeyHandler);
    }
    function openModalFor(selectEl, displayEl, onPick) {
      active = { select: selectEl, display: displayEl, onPick: onPick || null };
      applyPickerOverlayLayer(overlay, { overEdit: selectEl === editCountrySel });
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      populateList('');
      document.addEventListener('keydown', countryModalKeyHandler);
    }

    overlay.__csmCloseModal = closeModal;
    if (mainTrigger) {
      mainTrigger.addEventListener('click', function () {
        openModalFor(mainCountrySel, mainDisplay, function (code) { updateFormForCountry(code); });
      });
    }
    if (editTrigger && editCountrySel) {
      editTrigger.addEventListener('click', function () {
        openModalFor(editCountrySel, editDisplay, null);
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    if (searchInput) searchInput.addEventListener('input', function () { populateList(this.value); });
  }

  function initCurrencyModal(mainCurrencySel, mainCountrySel, editCurrencySel, editCountrySel) {
    var overlay = document.getElementById('csmCurrencyOverlay');
    var mainTrigger = document.getElementById('csmPayoutCurrencyTrigger');
    var editTrigger = document.getElementById('csmPayoutEditCurrencyTrigger');
    var mainDisplay = document.getElementById('csmPayoutCurrencyDisplay');
    var editDisplay = document.getElementById('csmPayoutEditCurrencyDisplay');
    var closeBtn = document.getElementById('csmCurrencyModalClose');
    var searchInput = document.getElementById('csmCurrencySearch');
    var listEl = document.getElementById('csmCurrencyModalList');
    if (!overlay || !mainCurrencySel || !listEl) return;
    if (mainTrigger && mainTrigger.dataset.csmCurrencyBound === '1') return;
    if (mainTrigger) mainTrigger.dataset.csmCurrencyBound = '1';

    var active = { select: mainCurrencySel, display: mainDisplay, country: mainCountrySel };

    function suggestedCurrency(selectEl, countrySel) {
      if (!countrySel) return '';
      var opt = countrySel.options[countrySel.selectedIndex];
      var code = opt ? String(opt.getAttribute('data-currency') || '').toUpperCase() : '';
      if (!code) return '';
      var exists = Array.prototype.some.call(selectEl.options || [], function (o) {
        return String(o.value || '').toUpperCase() === code;
      });
      return exists ? code : '';
    }

    function populateList(filter) {
      if (!active.select) return;
      var q = (filter || '').toLowerCase().trim();
      var suggested = suggestedCurrency(active.select, active.country);
      var html = '';
      Array.prototype.forEach.call(active.select.options || [], function (opt) {
        var code = String(opt.value || '').toUpperCase();
        var meta = currencyMeta(code);
        var haystack = (code + ' ' + meta.symbol).toLowerCase();
        if (q && haystack.indexOf(q) < 0) return;
        var sel = active.select.value === code ? ' is-selected' : '';
        var isSuggested = suggested && suggested === code ? ' is-suggested' : '';
        var badge = suggested && suggested === code
          ? '<span class="csm-currency-modal__suggested">' + escapeHtml(getI18n('payout_currency_suggested', 'Suggested')) + '</span>'
          : '';
        var icon = meta.flag || meta.symbol;
        html += '<button type="button" class="csm-country-modal__item csm-currency-modal__item' + sel + isSuggested + '" data-value="' + escapeHtml(code) + '">' +
          '<span class="csm-currency-modal__left">' +
          '<span class="csm-currency-modal__icon">' + escapeHtml(icon) + '</span>' +
          '<span class="csm-country-modal__name">' + escapeHtml(code) + '</span>' +
          '<span class="csm-currency-modal__name">' + escapeHtml(meta.symbol) + '</span>' +
          '</span>' + badge + '</button>';
      });
      listEl.innerHTML = html || '<p class="csm-payout-hint">' + (getI18n('payout_currency_no_results', 'No currencies match')) + '</p>';
      listEl.querySelectorAll('.csm-currency-modal__item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var v = String(btn.dataset.value || '').toUpperCase();
          active.select.value = v;
          if (active.display) setCurrencyDisplay(active.display, v);
          active.select.dispatchEvent(new Event('change', { bubbles: true }));
          closeModal();
        });
      });
    }

    function currencyModalKeyHandler(e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal();
    }
    function closeModal() {
      overlay.classList.remove('is-open');
      resetPickerOverlayLayer(overlay);
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', currencyModalKeyHandler);
    }
    function openModalFor(selectEl, displayEl, countrySel) {
      active = { select: selectEl, display: displayEl, country: countrySel || null };
      applyPickerOverlayLayer(overlay, { overEdit: selectEl === editCurrencySel });
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      populateList('');
      document.addEventListener('keydown', currencyModalKeyHandler);
    }

    if (mainTrigger) {
      mainTrigger.addEventListener('click', function () {
        openModalFor(mainCurrencySel, mainDisplay, mainCountrySel);
      });
    }
    if (editTrigger && editCurrencySel) {
      editTrigger.addEventListener('click', function () {
        openModalFor(editCurrencySel, editDisplay, editCountrySel || null);
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.__csmCloseModal = closeModal;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    if (searchInput) searchInput.addEventListener('input', function () { populateList(this.value); });
  }

  function init() {
    const panel = document.getElementById('csmPayoutPanel');
    if (!panel) return;

    const accountHolder = document.getElementById('csmPayoutAccountHolder');
    const ibanInput = document.getElementById('csmPayoutIban');
    const currencySel = document.getElementById('csmPayoutCurrency');
    const countrySel = document.getElementById('csmPayoutCountry');
    const saveAccountBtn = document.getElementById('csmPayoutSaveAccount');
    const accountStatus = document.getElementById('csmPayoutAccountStatus');
    const autoEnable = document.getElementById('csmPayoutAutoEnable');
    const autoOptions = document.getElementById('csmPayoutAutoOptions');
    const saveAutoBtn = document.getElementById('csmPayoutSaveAuto');
    const autoStatus = document.getElementById('csmPayoutAutoStatus');
    const accountSection = document.getElementById('csmPayoutAccountSection');
    const methodsList = document.getElementById('csmPayoutMethodsList');
    const countryOverlay = document.getElementById('csmCountryOverlay');
    const currencyOverlay = document.getElementById('csmCurrencyOverlay');
    const footerStatus = document.getElementById('csmPayoutFooterStatus');
    const accountForm = document.getElementById('csmPayoutAccountForm');
    const accountStatusEl = document.getElementById('csmPayoutAccountStatus');
    const countryTrigger = document.getElementById('csmPayoutCountryTrigger');
    const cancelEditBtn = document.getElementById('csmPayoutCancelEdit');
    const accountTypeValueInput = document.getElementById('csmPayoutAccountTypeValue');
    const accountTypeWiseBtn = document.getElementById('csmPayoutAccountTypeWise');
    const accountTypePayPalBtn = document.getElementById('csmPayoutAccountTypePayPal');
    const payPalEmailField = document.getElementById('csmPayoutPayPalEmailField');
    const payPalEmailInput = document.getElementById('csmPayoutPayPalEmail');
    const editOverlay = document.getElementById('csmPayoutEditOverlay');
    const editCloseBtn = document.getElementById('csmPayoutEditClose');
    const editCancelBtn = document.getElementById('csmPayoutEditCancel');
    const editSaveBtn = document.getElementById('csmPayoutEditSave');
    const editMethodIdInput = document.getElementById('csmPayoutEditMethodId');
    const editLabelInput = document.getElementById('csmPayoutEditLabel');
    const editCountrySelect = document.getElementById('csmPayoutEditCountry');
    const editCountryDisplay = document.getElementById('csmPayoutEditCountryDisplay');
    const editCurrencySelect = document.getElementById('csmPayoutEditCurrency');
    const editCurrencyDisplay = document.getElementById('csmPayoutEditCurrencyDisplay');
    const editAccountHolderInput = document.getElementById('csmPayoutEditAccountHolder');
    const editAccountInput = document.getElementById('csmPayoutEditAccountValue');
    const editMaskedInfoEl = document.getElementById('csmPayoutEditMaskedInfo');
    const editStatusEl = document.getElementById('csmPayoutEditStatus');

    if (!saveAccountBtn || !saveAutoBtn) return;

    var currentEditMethodType = 'wise';

    function currentAccountMethod() {
      return accountTypeValueInput && accountTypeValueInput.value === 'paypal' ? 'paypal' : 'wise';
    }

    function applyAccountMethodUi(method) {
      var isPayPal = method === 'paypal';
      if (accountTypeValueInput) accountTypeValueInput.value = isPayPal ? 'paypal' : 'wise';
      if (accountTypeWiseBtn) accountTypeWiseBtn.classList.toggle('is-selected', !isPayPal);
      if (accountTypePayPalBtn) accountTypePayPalBtn.classList.toggle('is-selected', isPayPal);
      if (payPalEmailField) payPalEmailField.style.display = isPayPal ? '' : 'none';
      if (countryTrigger && countryTrigger.closest('.csm-payout-field')) countryTrigger.closest('.csm-payout-field').classList.toggle('is-hidden', isPayPal);
      if (accountHolder) accountHolder.closest('.csm-payout-field').classList.toggle('is-hidden', isPayPal);
      if (saveAccountBtn) {
        saveAccountBtn.textContent = isPayPal
          ? getI18n('payout_paypal_save', '')
          : getI18n('payout_details_save', saveAccountBtn.textContent);
      }
      if (isPayPal) {
        showIbanForm(false);
      } else {
        updateFormForCountry(countrySel ? countrySel.value : 'DE');
      }
    }

    if (editCountrySelect && countrySel && editCountrySelect.options.length === 0) {
      editCountrySelect.innerHTML = countrySel.innerHTML;
    }
    if (editCurrencySelect && currencySel && editCurrencySelect.options.length === 0) {
      editCurrencySelect.innerHTML = currencySel.innerHTML;
    }
    if (editCountrySelect && editCountryDisplay) {
      var initEditCountryOpt = editCountrySelect.options[editCountrySelect.selectedIndex];
      setCountryDisplay(editCountryDisplay, editCountrySelect.value || 'DE', initEditCountryOpt ? initEditCountryOpt.textContent : 'Germany');
    }
    if (editCurrencySelect && editCurrencyDisplay) {
      setCurrencyDisplay(editCurrencyDisplay, editCurrencySelect.value || 'EUR');
    }

    function setEditStatus(text, isError) {
      if (!editStatusEl) return;
      editStatusEl.textContent = text || '';
      editStatusEl.className = 'csm-payout-status' + (isError ? ' csm-payout-status--error' : '');
    }

    function closeEditModal() {
      if (!editOverlay) return;
      var activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement && editOverlay.contains(activeEl)) {
        activeEl.blur();
      }
      editOverlay.classList.remove('is-open');
      editOverlay.setAttribute('aria-hidden', 'true');
      setEditStatus('', false);
      if (editAccountInput) editAccountInput.value = '';
    }

    function openEditModal(method) {
      if (!editOverlay || !method) return;
      if (editMethodIdInput) editMethodIdInput.value = method.id || '';
      currentEditMethodType = method.method === 'paypal' ? 'paypal' : 'wise';
      if (editLabelInput) editLabelInput.value = method.label || '';
      if (editAccountHolderInput) {
        editAccountHolderInput.value = method.accountHolderName || '';
        editAccountHolderInput.closest('.csm-payout-field').style.display = currentEditMethodType === 'paypal' ? 'none' : '';
      }
      if (editCountrySelect) {
        editCountrySelect.value = method.countryCode || 'DE';
        editCountrySelect.closest('.csm-payout-field').style.display = currentEditMethodType === 'paypal' ? 'none' : '';
      }
      if (editCurrencySelect) editCurrencySelect.value = method.currencyPreference || 'EUR';
      if (editCountrySelect && editCountryDisplay) {
        var editCountryOpt = editCountrySelect.options[editCountrySelect.selectedIndex];
        setCountryDisplay(editCountryDisplay, editCountrySelect.value || 'DE', editCountryOpt ? editCountryOpt.textContent : (editCountrySelect.value || 'DE'));
      }
      if (editCurrencyDisplay && editCurrencySelect) {
        setCurrencyDisplay(editCurrencyDisplay, editCurrencySelect.value || 'EUR');
      }
      if (editMaskedInfoEl) {
        if (currentEditMethodType === 'paypal') {
          editMaskedInfoEl.textContent = method.paypalEmailMasked || '****';
        } else {
          var last4 = extractLast4(method.ibanMasked);
          editMaskedInfoEl.textContent = last4 ? ('**** ' + last4) : (method.ibanMasked || '****');
        }
      }
      if (editAccountInput) {
        editAccountInput.value = '';
        if (currentEditMethodType === 'paypal') {
          editAccountInput.placeholder = getI18n('payout_paypal_email_label', '');
        } else {
          var isIbanCountry = IBAN_COUNTRIES.indexOf((editCountrySelect ? editCountrySelect.value : method.countryCode || 'DE')) >= 0;
          editAccountInput.placeholder = isIbanCountry
            ? getI18n('payout_details_iban', 'IBAN')
            : getI18n('payout_account_number', 'Account number');
        }
      }
      setEditStatus('', false);
      editOverlay.classList.add('is-open');
      editOverlay.setAttribute('aria-hidden', 'false');
      if (editLabelInput) setTimeout(function () { editLabelInput.focus(); }, 60);
    }

    function saveEditedMethod() {
      var ownerId = getOwnerId();
      if (!ownerId) return;
      var methodId = editMethodIdInput ? String(editMethodIdInput.value || '').trim() : '';
      var label = editLabelInput ? String(editLabelInput.value || '').trim() : '';
      var accountHolderName = editAccountHolderInput ? String(editAccountHolderInput.value || '').trim() : '';
      var countryCode = editCountrySelect ? String(editCountrySelect.value || '').trim().toUpperCase() : 'DE';
      var currencyPreference = editCurrencySelect ? String(editCurrencySelect.value || '').trim().toUpperCase() : 'EUR';
      var accountRaw = editAccountInput ? String(editAccountInput.value || '').replace(/\s/g, '').trim() : '';
      if (!methodId) return;
      if (!label) {
        setEditStatus(getI18n('payout_edit_label_required', 'Label is required.'), true);
        return;
      }
      if (!accountRaw || accountRaw.length < 4) {
        setEditStatus(getI18n('payout_edit_reenter_account_required', 'For security, please enter your IBAN/account number again.'), true);
        return;
      }

      var payload = {
        id: methodId,
        ownerId: ownerId,
        label: label,
        payoutMethod: currentEditMethodType === 'paypal' ? 'paypal' : 'wise',
        accountHolderName: accountHolderName,
        currencyPreference: currencyPreference
      };
      if (currentEditMethodType === 'paypal') {
        payload.paypalEmail = accountRaw;
      } else {
        if (!accountHolderName || accountHolderName.length < 2) {
          setEditStatus(getI18n('payout_edit_holder_required', 'Account holder is required.'), true);
          return;
        }
        var isIbanCountry = IBAN_COUNTRIES.indexOf(countryCode) >= 0;
        if (isIbanCountry) {
          payload.iban = accountRaw;
        } else {
          payload.countryCode = countryCode;
          payload.recipientType = 'swift_code';
          payload.details = {
            accountNumber: accountRaw,
            legalType: 'PRIVATE',
            accountHolderName: accountHolderName
          };
        }
      }

      if (editSaveBtn) editSaveBtn.disabled = true;
      setEditStatus('', false);
      fetch(getApiBase() + '/apps/creator-dispatch?op=save-creator-payout-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.ok) {
            setEditStatus(res.message || res.error || 'Error', true);
            return;
          }
          closeEditModal();
          loadPayoutData();
        })
        .catch(function () {
          setEditStatus('Error', true);
        })
        .finally(function () {
          if (editSaveBtn) editSaveBtn.disabled = false;
        });
    }

    if (editCloseBtn) editCloseBtn.addEventListener('click', closeEditModal);
    if (editCancelBtn) editCancelBtn.addEventListener('click', closeEditModal);
    if (editSaveBtn) editSaveBtn.addEventListener('click', saveEditedMethod);
    if (editOverlay) {
      editOverlay.addEventListener('click', function (e) {
        if (e.target === editOverlay) closeEditModal();
      });
    }
    if (editCountrySelect && editAccountInput) {
      editCountrySelect.addEventListener('change', function () {
        if (editCountryDisplay) {
          var o = editCountrySelect.options[editCountrySelect.selectedIndex];
          setCountryDisplay(editCountryDisplay, editCountrySelect.value || 'DE', o ? o.textContent : (editCountrySelect.value || 'DE'));
        }
        var isIbanCountry = IBAN_COUNTRIES.indexOf(editCountrySelect.value || 'DE') >= 0;
        editAccountInput.placeholder = isIbanCountry
          ? getI18n('payout_details_iban', 'IBAN')
          : getI18n('payout_account_number', 'Account number');
      });
    }
    if (editCurrencySelect) {
      editCurrencySelect.addEventListener('change', function () {
        if (editCurrencyDisplay) setCurrencyDisplay(editCurrencyDisplay, editCurrencySelect.value || 'EUR');
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && editOverlay && editOverlay.classList.contains('is-open')) {
        closeEditModal();
      }
    });
    openPayoutMethodEditModal = openEditModal;

    // Type Grid: Shop Credit vs Payout
    var typeGrid = document.getElementById('csmPayoutTypeGrid');
    var typeValueInput = document.getElementById('csmPayoutTypeValue');
    var shopCard = document.getElementById('csmPayoutTypeShop');
    var wiseCard = document.getElementById('csmPayoutTypeWise');
    var autoMethodShop = document.getElementById('csmAutoMethodShop');
    var autoMethodWise = document.getElementById('csmAutoMethodWise');
    var autoMethodSelect = document.getElementById('csmPayoutAutoMethodSelect');
    var autoMethodSelectWrap = document.getElementById('csmPayoutAutoMethodSelectWrap');

    function closeCountryModalSafe() {
      if (!countryOverlay) return;
      if (typeof countryOverlay.__csmCloseModal === 'function') {
        countryOverlay.__csmCloseModal();
      } else {
        countryOverlay.classList.remove('is-open');
        countryOverlay.setAttribute('aria-hidden', 'true');
      }
    }
    function closeCurrencyModalSafe() {
      if (!currencyOverlay) return;
      if (typeof currencyOverlay.__csmCloseModal === 'function') {
        currencyOverlay.__csmCloseModal();
      } else {
        currencyOverlay.classList.remove('is-open');
        currencyOverlay.setAttribute('aria-hidden', 'true');
      }
    }

    function applyPayoutMode(mode, options) {
      var opts = options || {};
      var v = mode === 'wise' ? 'wise' : 'shop_credit';
      if (!opts.preserveUserSelection) {
        userSelectedPayoutMode = v;
      }
      if (shopCard && wiseCard) {
        shopCard.classList.toggle('is-selected', v === 'shop_credit');
        wiseCard.classList.toggle('is-selected', v === 'wise');
      }
      if (typeValueInput) typeValueInput.value = v;
      if (autoMethodShop) autoMethodShop.checked = v === 'shop_credit';
      if (autoMethodWise) autoMethodWise.checked = v === 'wise';
      if (autoMethodSelectWrap && autoMethodSelect) {
        autoMethodSelectWrap.style.display = v === 'wise' && autoMethodSelect.options.length > 1 ? '' : 'none';
      }
      if (accountSection) accountSection.classList.toggle('is-hidden', v !== 'wise');
      if (methodsList) methodsList.style.display = v === 'wise' ? '' : 'none';
      if (accountForm) accountForm.style.display = v === 'wise' ? '' : 'none';
      if (accountStatusEl) accountStatusEl.style.display = v === 'wise' ? '' : 'none';
      if (saveAccountBtn) saveAccountBtn.classList.toggle('is-hidden', v !== 'wise');
      if (cancelEditBtn && v !== 'wise') {
        cancelEditBtn.style.display = 'none';
        cancelEditBtn.classList.add('is-hidden');
      } else if (cancelEditBtn) {
        cancelEditBtn.classList.remove('is-hidden');
      }
      if (v !== 'wise') {
        closeCountryModalSafe();
        closeCurrencyModalSafe();
        if (footerStatus) footerStatus.textContent = '';
      }
      if (autoOptions) autoOptions.style.opacity = autoEnable && autoEnable.checked ? '1' : '0.5';
    }
    applyPayoutModeUi = applyPayoutMode;
    if (shopCard && wiseCard) {
      function setType(val) {
        var v = val === 'wise' ? 'wise' : 'shop_credit';
        applyPayoutMode(v);
      }
      shopCard.addEventListener('click', function () { setType('shop_credit'); });
      wiseCard.addEventListener('click', function () { setType('wise'); });
    }

    var initiallySelectedMode = (document.querySelector('input[name="csm_auto_method"]:checked') || {}).value || (typeValueInput ? typeValueInput.value : 'shop_credit');
    applyPayoutMode(initiallySelectedMode, { preserveUserSelection: true });

    if (accountTypeWiseBtn) {
      accountTypeWiseBtn.addEventListener('click', function () {
        applyAccountMethodUi('wise');
      });
    }
    if (accountTypePayPalBtn) {
      accountTypePayPalBtn.addEventListener('click', function () {
        applyAccountMethodUi('paypal');
      });
    }
    applyAccountMethodUi(currentAccountMethod());

    if (countrySel) {
      initCountryModal(countrySel, editCountrySelect);
      var display = document.getElementById('csmPayoutCountryDisplay');
      var opt = countrySel.options[countrySel.selectedIndex];
      if (display && opt) setCountryDisplay(display, opt.value, opt.textContent || opt.value);
      countrySel.addEventListener('change', function () {
        var o = countrySel.options[countrySel.selectedIndex];
        if (display && o) setCountryDisplay(display, o.value, o.textContent || o.value);
        updateFormForCountry(this.value);
      });
      updateFormForCountry(countrySel.value || 'DE');
    }
    if (currencySel) {
      var mainCurrencyDisplay = document.getElementById('csmPayoutCurrencyDisplay');
      if (mainCurrencyDisplay) setCurrencyDisplay(mainCurrencyDisplay, currencySel.value || 'EUR');
      initCurrencyModal(currencySel, countrySel, editCurrencySelect, editCountrySelect);
      currencySel.addEventListener('change', function () {
        if (mainCurrencyDisplay) setCurrencyDisplay(mainCurrencyDisplay, currencySel.value || 'EUR');
      });
    }
    if (currencySel && countrySel) {
      currencySel.addEventListener('change', function () {
        var code = countrySel.value || 'DE';
        if (IBAN_COUNTRIES.indexOf(code) < 0) updateFormForCountry(code);
      });
    }

    // Tab-Wechsel: Daten laden wenn Payout-Panel sichtbar wird
    window.addEventListener('creator-settings-v2-tab-changed', function (e) {
      if (e.detail && e.detail.tab === 'payout') loadPayoutData();
    });
    window.addEventListener('creator-settings-v2-opened', function () {
      if (window.CreatorSettingsV2Modal && window.CreatorSettingsV2Modal.getCurrentTab() === 'payout') {
        loadPayoutData();
      }
    });

    // Auto-Enable Toggle: Options sichtbar
    if (autoEnable && autoOptions) {
      autoEnable.addEventListener('change', function () {
        autoOptions.style.opacity = autoEnable.checked ? '1' : '0.5';
      });
    }
    document.querySelectorAll('input[name="csm_auto_method"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        applyPayoutMode(this.value);
      });
    });

    // Save Bank Details
    saveAccountBtn.addEventListener('click', function () {
      const payoutMode = typeValueInput ? typeValueInput.value : 'shop_credit';
      if (payoutMode !== 'wise') return;
      const ownerId = getOwnerId();
      if (!ownerId) return;
      const name = accountHolder ? String(accountHolder.value || '').trim() : '';
      const countryCode = countrySel ? countrySel.value : 'DE';
      const currency = currencySel ? currencySel.value : 'EUR';
      const payoutMethod = currentAccountMethod();
      const useIban = IBAN_COUNTRIES.indexOf(countryCode) >= 0;
      const iban = ibanInput ? String(ibanInput.value || '').trim() : '';
      const paypalEmail = payPalEmailInput ? String(payPalEmailInput.value || '').trim() : '';

      if (payoutMethod === 'paypal') {
        if (!paypalEmail) {
          showStatus(accountStatus, getI18n('payout_paypal_email_required', ''), true);
          return;
        }
      } else {
        if (!name || name.length < 2) {
          showStatus(accountStatus, getI18n('payout_edit_holder_required', 'Account holder is required.'), true);
          return;
        }
        if (useIban) {
          if (!iban || iban.replace(/\s/g, '').length < 15) {
            showStatus(accountStatus, getI18n('payout_details_fill_hint', 'Please fill in all bank details below.'), true);
            return;
          }
        } else {
          var dynDetails = collectDynamicDetails();
          if (Object.keys(dynDetails).length === 0) {
            showStatus(accountStatus, getI18n('payout_details_fill_hint', 'Please fill in all bank details below.'), true);
            return;
          }
        }
      }

      var editId = document.getElementById('csmPayoutEditId');
      var labelVal = document.getElementById('csmPayoutLabel') ? String(document.getElementById('csmPayoutLabel').value || '').trim() : 'Standard';
      var body = {
        ownerId: ownerId,
        label: labelVal || 'Standard',
        payoutMethod: payoutMethod,
        accountHolderName: name,
        currencyPreference: currency
      };
      if (editId && editId.value) body.id = editId.value;
      if (payoutMethod === 'paypal') {
        body.paypalEmail = paypalEmail;
      } else {
        if (useIban) {
          body.iban = iban;
        } else {
          body.countryCode = countryCode;
          body.recipientType = currentRecipientType || 'swift_code';
          body.details = collectDynamicDetails();
          body.details.legalType = body.details.legalType || 'PRIVATE';
          body.details.accountHolderName = name;
        }
      }

      saveAccountBtn.disabled = true;
      fetch(getApiBase() + '/apps/creator-dispatch?op=save-creator-payout-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            showStatus(accountStatus, getI18n('payout_details_saved', 'Saved') + (data.ibanMasked ? ' (' + data.ibanMasked + ')' : ''));
            if (ibanInput) { ibanInput.value = ''; ibanInput.placeholder = data.ibanMasked || ''; }
            if (payPalEmailInput && payoutMethod === 'paypal') payPalEmailInput.value = '';
            if (editId) editId.value = '';
            loadPayoutData();
          } else {
            showStatus(accountStatus, data.message || data.error || 'Error', true);
          }
        })
        .catch(function () { showStatus(accountStatus, 'Error', true); })
        .finally(function () { saveAccountBtn.disabled = false; });
    });

    // Save Auto-Payout Settings
    saveAutoBtn.addEventListener('click', function () {
      const ownerId = getOwnerId();
      if (!ownerId) return;

      const enabled = autoEnable ? autoEnable.checked : false;
      const methodEl = document.querySelector('input[name="csm_auto_method"]:checked');
      const method = methodEl ? methodEl.value : 'shop_credit';
      const minInput = document.getElementById('csmPayoutMinAmount');
      const minCents = minInput ? Math.round(parseFloat(minInput.value) || 50) * 100 : 5000;

      var autoMethodSelect = document.getElementById('csmPayoutAutoMethodSelect');
      var detailId = method === 'wise' && autoMethodSelect ? (autoMethodSelect.value || null) : null;

      if (method === 'wise') {
        fetch(getApiBase() + '/apps/creator-dispatch?op=get-creator-payout-details&owner_id=' + encodeURIComponent(ownerId), { credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (enabled && (!data.hasDetails || !data.ok)) {
              showStatus(autoStatus, getI18n('payout_account_required', 'Add your bank details for Wise payouts.'), true);
              return;
            }
            doSaveAuto(ownerId, enabled, method, minCents, detailId);
          });
      } else {
        doSaveAuto(ownerId, enabled, method, minCents, null);
      }
    });

    function doSaveAuto(ownerId, enabled, method, minCents, autoPayoutDetailId) {
      saveAutoBtn.disabled = true;
      var body = {
        ownerId,
        autoPayoutEnabled: enabled,
        autoPayoutMethod: method,
        autoPayoutMinCents: minCents
      };
      if (autoPayoutDetailId) body.autoPayoutDetailId = autoPayoutDetailId;
      fetch(getApiBase() + '/apps/creator-dispatch?op=save-creator-payout-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            userSelectedPayoutMode = method === 'wise' ? 'wise' : 'shop_credit';
            showStatus(autoStatus, getI18n('payout_auto_saved', 'Settings saved'));
          } else {
            showStatus(autoStatus, data.message || data.error || 'Error', true);
          }
        })
        .catch(function () { showStatus(autoStatus, 'Error', true); })
        .finally(function () { saveAutoBtn.disabled = false; });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
