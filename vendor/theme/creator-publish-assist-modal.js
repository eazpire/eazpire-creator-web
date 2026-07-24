/**
 * Publish Assist modal (IDEA-050) — Offer / Request / Pending
 * Product mock hierarchy + daily slot multi-select.
 */
(function () {
  'use strict';

  var API_BASE = '/apps/creator-dispatch';
  var root = null;
  var currentTab = 'offer';
  var selectedPartnerId = null;
  var partners = [];
  var pendingCount = 0;
  var treeDesigns = [];
  var tabLimits = null;
  var bothLimits = { offer: null, request: null };
  /** @type {Map<string, object>} */
  var selected = new Map();
  var expanded = {};

  var HINTS = {
    offer: ['creator.publish_assist.hint_offer', 'Partner designs missing on variants you already unlocked.'],
    request: ['creator.publish_assist.hint_request', 'Your designs on variants only your partner has unlocked.'],
    pending: ['creator.publish_assist.hint_pending', 'Incoming and outgoing publish assist requests.']
  };

  function ownerId() {
    if (typeof window._resolveEazOwnerId === 'function') {
      try {
        var id = window._resolveEazOwnerId();
        if (id) return String(id);
      } catch (_) {}
    }
    return window.__EAZ_OWNER_ID || null;
  }

  function t(key, fallback) {
    var map = window.CreatorI18n || {};
    if (map[key] != null && String(map[key])) return String(map[key]);
    var short = String(key || '').replace(/^creator\.publish_assist\./, '');
    if (map.publish_assist && map.publish_assist[short] != null) {
      return String(map.publish_assist[short]);
    }
    var parts = String(key || '').split('.');
    var node = map;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return fallback;
      node = node[parts[i]];
    }
    return node != null && String(node) ? String(node) : fallback;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Profile Username (never Creator Name). */
  function partnerLabel(p) {
    if (!p) return '';
    return (
      p.username ||
      p.partner_username ||
      p.display_name ||
      p.partner_display_name ||
      p.owner_id ||
      p.partner_id ||
      ''
    );
  }

  function api(op, params) {
    var sp = new URLSearchParams(Object.assign({ op: op, owner_id: ownerId() || '' }, params || {}));
    return fetch(API_BASE + '?' + sp, { credentials: 'same-origin' }).then(function (r) {
      return r.json();
    });
  }

  function apiPost(op, body) {
    var sp = new URLSearchParams({ op: op, owner_id: ownerId() || '' });
    return fetch(API_BASE + '?' + sp, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json();
    });
  }

  function ensureRoot() {
    if (root) return root;
    root = document.getElementById('creatorPublishAssistModal');
    return root;
  }

  function selKey(designId, productKey, colorSlug, size) {
    return [designId, productKey, colorSlug || '', size || ''].join('|');
  }

  function parseZoneFrac(f) {
    if (window.CreatorMockCompositing && typeof window.CreatorMockCompositing.parseZoneFrac === 'function') {
      return window.CreatorMockCompositing.parseZoneFrac(f);
    }
    var o = f || {};
    return {
      l: Number(o.l) || 0.2,
      t: Number(o.t) || 0.2,
      w: Number(o.w) || 0.6,
      h: Number(o.h) || 0.6
    };
  }

  function buildMockHtml(mockUrl, designUrl, printArea, placement) {
    if (!mockUrl) {
      if (!designUrl) {
        return '<div class="pa-mock pa-mock--fallback"><span style="font-size:10px;color:#94a3b8">Mock</span></div>';
      }
      return (
        '<div class="pa-mock pa-mock--fallback"><img src="' +
        escapeHtml(designUrl) +
        '" alt="" loading="lazy"></div>'
      );
    }
    var z = parseZoneFrac(printArea);
    var zoneStyle =
      'left:' + z.l * 100 + '%;top:' + z.t * 100 + '%;width:' + z.w * 100 + '%;height:' + z.h * 100 + '%;';
    var designHtml = designUrl
      ? '<img class="pa-mock__design" src="' +
        escapeHtml(designUrl) +
        '" alt="" decoding="async" draggable="false" data-pa-tr="' +
        escapeHtml(JSON.stringify(placement || {})) +
        '">'
      : '';
    return (
      '<div class="pa-mock">' +
      '<span class="pa-mock__stage">' +
      '<img class="pa-mock__img" src="' +
      escapeHtml(mockUrl) +
      '" alt="" decoding="async" draggable="false">' +
      (designHtml ? '<span class="pa-mock__zone" style="' + zoneStyle + '">' + designHtml + '</span>' : '') +
      '</span></div>'
    );
  }

  function layoutMocks(scope) {
    if (!scope) return;
    scope.querySelectorAll('.pa-mock').forEach(function (thumb) {
      var stage = thumb.querySelector('.pa-mock__stage');
      var mock = thumb.querySelector('.pa-mock__img');
      if (!stage || !mock) return;
      function layout() {
        if (!mock.complete || !mock.naturalWidth || !mock.naturalHeight) return;
        var nw = mock.naturalWidth;
        var nh = mock.naturalHeight;
        var boxW = Math.max(1, thumb.clientWidth);
        var boxH = Math.max(1, thumb.clientHeight);
        var fit = Math.min(boxW / nw, boxH / nh);
        var w = Math.max(1, nw * fit);
        var h = Math.max(1, nh * fit);
        stage.style.width = w + 'px';
        stage.style.height = h + 'px';
        thumb.querySelectorAll('.pa-mock__design').forEach(function (designImg) {
          var zone = designImg.closest('.pa-mock__zone');
          if (!zone) return;
          var tr = {};
          try {
            tr = JSON.parse(designImg.getAttribute('data-pa-tr') || '{}') || {};
          } catch (_) {
            tr = {};
          }
          if (
            window.CreatorMockCompositing &&
            typeof window.CreatorMockCompositing.applyDesignTransformInZone === 'function'
          ) {
            window.CreatorMockCompositing.applyDesignTransformInZone(designImg, zone, tr, {});
          } else {
            designImg.style.width = '80%';
            designImg.style.height = 'auto';
            designImg.style.transform = 'translate(-50%, -50%)';
          }
        });
      }
      if (mock.complete) layout();
      else mock.addEventListener('load', layout, { once: true });
    });
  }

  function remainingSlots() {
    return Math.max(0, Number(tabLimits && tabLimits.remaining) || 0);
  }

  function updateLimitsBar(kind, lim) {
    var item = root.querySelector('[data-pa-limit="' + kind + '"]');
    if (!item) return;
    var fill = item.querySelector('[data-pa-limit-fill]');
    var count = item.querySelector('[data-pa-limit-count]');
    var per = Number(lim && lim.per_day) || 0;
    var used = Number(lim && lim.used_today) || 0;
    var unlocked = !!(lim && lim.parent_unlocked);
    item.classList.toggle('is-locked', !unlocked || per <= 0);
    item.classList.toggle('is-at-limit', unlocked && per > 0 && used >= per);
    var pct = per > 0 ? Math.min(100, Math.round((used / per) * 100)) : 0;
    if (fill) fill.style.width = pct + '%';
    if (count) {
      count.textContent = !unlocked || per <= 0
        ? t('creator.publish_assist.limit_locked', 'Locked')
        : used + '/' + per;
    }
  }

  function refreshLimitsUi() {
    updateLimitsBar('offer', bothLimits.offer);
    updateLimitsBar('request', bothLimits.request);
  }

  function updateFooter() {
    var footer = root.querySelector('#pa-footer');
    var sendBtn = root.querySelector('#pa-btn-send');
    var countEl = root.querySelector('#pa-footer-count');
    var remEl = root.querySelector('#pa-footer-remaining');
    if (!footer || !sendBtn) return;
    if (currentTab === 'pending') {
      footer.hidden = true;
      return;
    }
    footer.hidden = false;
    var n = selected.size;
    var rem = remainingSlots();
    if (countEl) countEl.textContent = String(n);
    if (remEl) remEl.textContent = String(Math.max(0, rem - n));
    sendBtn.disabled = n < 1 || n > rem;
    sendBtn.textContent =
      currentTab === 'request'
        ? t('creator.publish_assist.send_request', 'Send request')
        : t('creator.publish_assist.send_offer', 'Send offer');
  }

  function setLoading(on) {
    var loading = root && root.querySelector('#pa-loading');
    var list = root && root.querySelector('#pa-list');
    var empty = root && root.querySelector('#pa-empty');
    if (loading) loading.hidden = !on;
    if (on) {
      if (list) list.hidden = true;
      if (empty) empty.hidden = true;
    }
  }

  function setEmpty(msg) {
    var empty = root.querySelector('#pa-empty');
    var list = root.querySelector('#pa-list');
    if (list) {
      list.hidden = true;
      list.innerHTML = '';
    }
    if (empty) {
      empty.hidden = false;
      empty.textContent = msg;
    }
    updateFooter();
  }

  function updateTabHint() {
    var hint = root.querySelector('#pa-tab-hint');
    if (!hint) return;
    var pair = HINTS[currentTab] || HINTS.offer;
    hint.setAttribute('data-t', pair[0]);
    hint.textContent = t(pair[0], pair[1]);
  }

  function updatePendingBadge() {
    var badge = root.querySelector('#pa-pending-badge');
    if (!badge) return;
    if (pendingCount > 0) {
      badge.hidden = false;
      badge.textContent = String(pendingCount);
    } else {
      badge.hidden = true;
    }
  }

  function chipHtml(labels, pending) {
    if (!labels || !labels.length) return '';
    return (
      '<div class="pa-row__chips">' +
      labels
        .map(function (lab) {
          return '<span class="pa-chip' + (pending ? ' pa-chip--pending' : '') + '">' + escapeHtml(lab) + '</span>';
        })
        .join('') +
      '</div>'
    );
  }

  function toggleSelect(payload, checked) {
    var key = selKey(payload.design_id, payload.product_key, payload.color_slug, payload.size);
    if (checked) {
      if (selected.has(key)) return true;
      if (selected.size >= remainingSlots()) {
        alert(t('creator.publish_assist.limit_reached', 'Daily slot limit reached. Deselect something or upgrade Creators skills.'));
        return false;
      }
      selected.set(key, payload);
    } else {
      selected.delete(key);
    }
    updateFooter();
    return true;
  }

  function renderTree() {
    var list = root.querySelector('#pa-list');
    var empty = root.querySelector('#pa-empty');
    if (!list) return;
    if (!treeDesigns.length) {
      setEmpty(
        t(
          currentTab === 'offer' ? 'creator.publish_assist.empty_offer' : 'creator.publish_assist.empty_request',
          currentTab === 'offer'
            ? 'No offerable designs for this partner.'
            : 'No requestable designs for this partner.'
        )
      );
      return;
    }
    if (empty) empty.hidden = true;
    list.hidden = false;

    var html = '';
    treeDesigns.forEach(function (design) {
      html += '<section class="pa-design-block">';
      (design.products || []).forEach(function (product) {
        var isProductLevel = !product.colors || !product.colors.length;
        var productExpKey = 'p:' + design.design_id + ':' + product.product_key;
        var productOpen = !!expanded[productExpKey];
        var colorLabels = (product.colors || [])
          .filter(function (c) {
            return (c.sizes || []).some(function (s) { return s.selectable; });
          })
          .map(function (c) { return c.color_label || c.color_slug; });
        var productTitle = (design.design_title || 'Design') + ' · ' + (product.product_title || product.product_key);
        var mock = buildMockHtml(
          product.mock_url,
          design.design_url,
          product.print_area_frac,
          product.placement
        );
        var pKey = selKey(design.design_id, product.product_key, '', '');
        var pSelected = selected.has(pKey);
        var pPending = !!product.pending_offer;

        html +=
          '<div class="pa-row pa-row--product' +
          (isProductLevel ? '' : ' is-expandable') +
          (productOpen ? ' is-open' : '') +
          (pSelected ? ' is-selected' : '') +
          (pPending ? ' is-pending' : '') +
          '" data-pa-expand="' +
          escapeHtml(productExpKey) +
          '">' +
          (isProductLevel ? '<span class="pa-row__chevron" aria-hidden="true"></span>' : '<span class="pa-row__chevron" aria-hidden="true">›</span>') +
          '<div class="pa-row__mock">' +
          mock +
          '</div>' +
          '<div class="pa-row__body">' +
          '<h4 class="pa-row__title">' +
          escapeHtml(productTitle) +
          '</h4>' +
          (isProductLevel
            ? pPending
              ? '<p class="pa-row__pending">' +
                escapeHtml(product.pending_label || t('creator.publish_assist.pending_offer', 'Pending offer')) +
                '</p>'
              : ''
            : chipHtml(colorLabels, false)) +
          '</div>' +
          (isProductLevel && product.selectable
            ? '<input type="checkbox" class="pa-row__check" data-pa-pick' +
              (pSelected ? ' checked' : '') +
              ' data-design="' +
              escapeHtml(design.design_id) +
              '" data-product="' +
              escapeHtml(product.product_key) +
              '" data-color="" data-size="" data-label="' +
              escapeHtml(product.product_title || product.product_key) +
              '" data-title="' +
              escapeHtml(design.design_title || '') +
              '">'
            : '') +
          '</div>';

        if (!isProductLevel) {
          html += '<div class="pa-children' + (productOpen ? ' is-open' : '') + '" data-pa-children="' + escapeHtml(productExpKey) + '">';
          (product.colors || []).forEach(function (color) {
            var colorExpKey = productExpKey + ':c:' + color.color_slug;
            var colorOpen = !!expanded[colorExpKey];
            var sizeLabels = (color.sizes || [])
              .filter(function (s) { return s.selectable; })
              .map(function (s) { return s.size_label || s.size; });
            var colorMock = buildMockHtml(
              color.mock_url || product.mock_url,
              design.design_url,
              color.print_area_frac || product.print_area_frac,
              color.placement || product.placement
            );
            html +=
              '<div class="pa-row pa-row--color is-expandable' +
              (colorOpen ? ' is-open' : '') +
              '" data-pa-expand="' +
              escapeHtml(colorExpKey) +
              '">' +
              '<span class="pa-row__chevron" aria-hidden="true">›</span>' +
              '<div class="pa-row__mock">' +
              colorMock +
              '</div>' +
              '<div class="pa-row__body">' +
              '<h4 class="pa-row__title">' +
              escapeHtml(color.color_label || color.color_slug) +
              '</h4>' +
              chipHtml(sizeLabels, false) +
              '</div></div>';

            html += '<div class="pa-children' + (colorOpen ? ' is-open' : '') + '" data-pa-children="' + escapeHtml(colorExpKey) + '">';
            (color.sizes || []).forEach(function (size) {
              var sKey = selKey(design.design_id, product.product_key, color.color_slug, size.size);
              var sSelected = selected.has(sKey);
              var sPending = !!size.pending_offer;
              var sizeMock = buildMockHtml(
                color.mock_url || product.mock_url,
                design.design_url,
                color.print_area_frac || product.print_area_frac,
                color.placement || product.placement
              );
              html +=
                '<div class="pa-row pa-row--size' +
                (sSelected ? ' is-selected' : '') +
                (sPending ? ' is-pending' : '') +
                '">' +
                '<span class="pa-row__chevron" aria-hidden="true"></span>' +
                '<div class="pa-row__mock">' +
                sizeMock +
                '</div>' +
                '<div class="pa-row__body">' +
                '<h4 class="pa-row__title">' +
                escapeHtml(size.size_label || size.size) +
                '</h4>' +
                (sPending
                  ? '<p class="pa-row__pending">' +
                    escapeHtml(size.pending_label || t('creator.publish_assist.pending_offer', 'Pending offer')) +
                    '</p>'
                  : '') +
                '</div>' +
                (size.selectable
                  ? '<input type="checkbox" class="pa-row__check" data-pa-pick' +
                    (sSelected ? ' checked' : '') +
                    ' data-design="' +
                    escapeHtml(design.design_id) +
                    '" data-product="' +
                    escapeHtml(product.product_key) +
                    '" data-color="' +
                    escapeHtml(color.color_slug) +
                    '" data-size="' +
                    escapeHtml(size.size) +
                    '" data-label="' +
                    escapeHtml((color.color_label || color.color_slug) + ' / ' + (size.size_label || size.size)) +
                    '" data-title="' +
                    escapeHtml(design.design_title || '') +
                    '">'
                  : '') +
                '</div>';
            });
            html += '</div>';
          });
          html += '</div>';
        }
      });
      html += '</section>';
    });

    list.innerHTML = html;
    wireTree(list);
    requestAnimationFrame(function () {
      layoutMocks(list);
    });
    updateFooter();
  }

  function wireTree(list) {
    list.querySelectorAll('[data-pa-expand]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-pa-pick]')) return;
        var key = row.getAttribute('data-pa-expand');
        if (!key) return;
        expanded[key] = !expanded[key];
        row.classList.toggle('is-open', !!expanded[key]);
        var kids = list.querySelector('[data-pa-children="' + key.replace(/"/g, '\\"') + '"]');
        // attribute selector with special chars — use CSS.escape if available
        var esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
        kids = list.querySelector('[data-pa-children="' + esc + '"]');
        if (kids) kids.classList.toggle('is-open', !!expanded[key]);
        requestAnimationFrame(function () {
          layoutMocks(list);
        });
      });
    });

    list.querySelectorAll('[data-pa-pick]').forEach(function (box) {
      box.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      box.addEventListener('change', function () {
        var ok = toggleSelect(
          {
            design_id: box.getAttribute('data-design'),
            product_key: box.getAttribute('data-product'),
            color_slug: box.getAttribute('data-color') || '',
            size: box.getAttribute('data-size') || '',
            variant_label: box.getAttribute('data-label') || '',
            design_title: box.getAttribute('data-title') || ''
          },
          box.checked
        );
        if (!ok) box.checked = false;
        var row = box.closest('.pa-row');
        if (row) row.classList.toggle('is-selected', box.checked);
      });
    });
  }

  function renderPending(items) {
    var list = root.querySelector('#pa-list');
    var empty = root.querySelector('#pa-empty');
    if (!list) return;
    if (!items.length) {
      setEmpty(t('creator.publish_assist.empty_pending', 'No pending requests.'));
      return;
    }
    if (empty) empty.hidden = true;
    list.hidden = false;
    list.innerHTML = items
      .map(function (item) {
        var sideLabel =
          item.side === 'incoming'
            ? t('creator.publish_assist.side_incoming', 'Incoming')
            : t('creator.publish_assist.side_outgoing', 'Outgoing');
        var actions = '';
        if (item.side === 'incoming' && item.status === 'pending') {
          actions =
            '<button type="button" class="pa-btn pa-btn--primary" data-pa-accept="' +
            escapeHtml(item.id) +
            '">' +
            escapeHtml(t('creator.publish_assist.accept', 'Accept')) +
            '</button>' +
            '<button type="button" class="pa-btn pa-btn--danger" data-pa-resolve="' +
            escapeHtml(item.id) +
            '" data-action="decline">' +
            escapeHtml(t('creator.publish_assist.decline', 'Decline')) +
            '</button>';
        } else if (item.side === 'outgoing' && item.status === 'pending') {
          actions =
            '<button type="button" class="pa-btn pa-btn--ghost" data-pa-resolve="' +
            escapeHtml(item.id) +
            '" data-action="cancel">' +
            escapeHtml(t('creator.publish_assist.cancel', 'Cancel')) +
            '</button>';
        }
        var mock = buildMockHtml(null, item.thumb_url || null, null, null);
        return (
          '<article class="pa-card">' +
          '<div class="pa-row__mock">' +
          mock +
          '</div>' +
          '<div class="pa-card__body">' +
          '<span class="pa-card__side">' +
          escapeHtml(sideLabel) +
          ' · ' +
          escapeHtml(item.direction || '') +
          '</span>' +
          '<h4 class="pa-card__title">' +
          escapeHtml(item.design_title || item.design_id) +
          '</h4>' +
          '<p class="pa-card__meta">' +
          escapeHtml(item.variant_label || item.product_key || '') +
          (partnerLabel(item) ? ' · ' + escapeHtml(partnerLabel(item)) : '') +
          '</p></div><div class="pa-card__actions">' +
          actions +
          '</div></article>'
        );
      })
      .join('');

    list.querySelectorAll('[data-pa-accept]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveAssist(btn.getAttribute('data-pa-accept'), 'accept', btn);
      });
    });
    list.querySelectorAll('[data-pa-resolve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveAssist(btn.getAttribute('data-pa-resolve'), btn.getAttribute('data-action') || 'decline', btn);
      });
    });
    updateFooter();
  }

  function sendSelected() {
    if (!selectedPartnerId || !selected.size) return;
    var variants = [];
    selected.forEach(function (v) {
      variants.push({
        product_key: v.product_key,
        color_slug: v.color_slug || '',
        size: v.size || '',
        variant_label: v.variant_label || '',
        design_id: v.design_id,
        design_title: v.design_title || ''
      });
    });
    // Group by design_id — API accepts one design_id + variants, or we send one batch with design_id on first
    // createRequest expects design_id at top level OR per variant — check createRequest
    var byDesign = {};
    variants.forEach(function (v) {
      var id = v.design_id;
      if (!byDesign[id]) byDesign[id] = { design_id: id, design_title: v.design_title, variants: [] };
      byDesign[id].variants.push(v);
    });
    var sendBtn = root.querySelector('#pa-btn-send');
    if (sendBtn) sendBtn.disabled = true;

    var jobs = Object.keys(byDesign).map(function (id) {
      var g = byDesign[id];
      return apiPost('create-publish-assist-request', {
        partner_id: selectedPartnerId,
        direction: currentTab,
        design_id: g.design_id,
        design_title: g.design_title,
        variants: g.variants
      });
    });

    Promise.all(jobs)
      .then(function (results) {
        if (sendBtn) sendBtn.disabled = false;
        var failed = results.filter(function (r) { return !r || !r.ok; });
        if (failed.length) {
          alert(
            (failed[0] && failed[0].message) ||
              t('creator.publish_assist.error_send', 'Could not send. Check your Creators daily limit in the skill tree.')
          );
        }
        selected.clear();
        return loadLimits().then(function () {
          return loadPartners().then(loadTabContent);
        });
      })
      .catch(function () {
        if (sendBtn) sendBtn.disabled = false;
        alert(t('creator.publish_assist.error_send', 'Could not send. Check your Creators daily limit in the skill tree.'));
      });
  }

  function resolveAssist(id, action, btn) {
    if (!id) return;
    if (btn) btn.disabled = true;
    apiPost('resolve-publish-assist-request', { id: id, action: action })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (!res || !res.ok) {
          alert((res && res.message) || t('creator.publish_assist.error_resolve', 'Could not update request.'));
          return;
        }
        return loadLimits().then(function () {
          return loadPartners().then(loadTabContent);
        });
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        alert(t('creator.publish_assist.error_resolve', 'Could not update request.'));
      });
  }

  function loadLimits() {
    return api('get-daily-limits')
      .then(function (res) {
        var axes = (res && res.creators_limits_effective && res.creators_limits_effective.axes) || {};
        bothLimits.offer = axes.daily_offers || null;
        bothLimits.request = axes.daily_requests || null;
        refreshLimitsUi();
      })
      .catch(function () {
        bothLimits.offer = null;
        bothLimits.request = null;
        refreshLimitsUi();
      });
  }

  function loadPartners() {
    return api('list-publish-assist-partners')
      .then(function (res) {
        partners = (res && res.ok && res.partners) || [];
        pendingCount = partners.reduce(function (sum, p) {
          return sum + (Number(p.pending_count) || 0);
        }, 0);
        if (
          selectedPartnerId &&
          !partners.some(function (p) {
            return String(p.owner_id) === String(selectedPartnerId);
          })
        ) {
          selectedPartnerId = null;
        }
        if (!selectedPartnerId && partners.length) {
          selectedPartnerId = partners[0].owner_id;
        }
        renderPartners();
        updatePartnerBanner();
        updatePendingBadge();
      })
      .catch(function () {
        partners = [];
        renderPartners();
      });
  }

  function renderPartners() {
    var listEl = root.querySelector('#pa-partner-list');
    var emptyEl = root.querySelector('#pa-partner-empty');
    if (!listEl) return;
    if (!partners.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    var recruits = partners.filter(function (p) { return p.role === 'recruit'; });
    var recruiters = partners.filter(function (p) { return p.role === 'recruiter'; });

    function renderGroup(titleKey, titleFb, items) {
      if (!items.length) return '';
      var html = '<div class="pa-sidebar__group-title">' + escapeHtml(t(titleKey, titleFb)) + '</div>';
      items.forEach(function (p) {
        var active = String(p.owner_id) === String(selectedPartnerId);
        var badge =
          Number(p.pending_count) > 0
            ? '<span class="pa-sidebar__badge">' + Number(p.pending_count) + '</span>'
            : '';
        html +=
          '<button type="button" class="pa-sidebar__item' +
          (active ? ' is-active' : '') +
          '" data-pa-partner="' +
          escapeHtml(p.owner_id) +
          '"><span translate="no">' +
          escapeHtml(partnerLabel(p)) +
          '</span>' +
          badge +
          '</button>';
      });
      return html;
    }

    listEl.innerHTML =
      renderGroup('creator.publish_assist.group_recruits', 'You invited', recruits) +
      renderGroup('creator.publish_assist.group_recruiters', 'Invited you', recruiters);

    listEl.querySelectorAll('[data-pa-partner]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedPartnerId = btn.getAttribute('data-pa-partner');
        selected.clear();
        expanded = {};
        closeDrawer();
        renderPartners();
        updatePartnerBanner();
        loadTabContent();
      });
    });
  }

  function updatePartnerBanner() {
    var banner = root.querySelector('#pa-partner-banner');
    var nameEl = root.querySelector('#pa-partner-name');
    if (!banner || !nameEl) return;
    var p = partners.find(function (x) {
      return String(x.owner_id) === String(selectedPartnerId);
    });
    if (!p) {
      banner.hidden = true;
      nameEl.textContent = '';
      return;
    }
    banner.hidden = false;
    nameEl.textContent = partnerLabel(p);
    nameEl.removeAttribute('data-eaz-creator-name');
    nameEl.setAttribute('translate', 'no');
  }

  function loadTabContent() {
    updateTabHint();
    selected.clear();
    if (currentTab === 'pending') {
      setLoading(true);
      return api('list-publish-assist-pending')
        .then(function (res) {
          setLoading(false);
          var items = (res && res.ok && res.pending) || [];
          pendingCount = items.filter(function (i) {
            return i.side === 'incoming' && i.status === 'pending';
          }).length;
          updatePendingBadge();
          renderPending(items);
        })
        .catch(function () {
          setLoading(false);
          setEmpty(t('creator.publish_assist.error_load', 'Could not load data.'));
        });
    }

    if (!selectedPartnerId) {
      setEmpty(t('creator.publish_assist.select_partner', 'Select a community member to continue.'));
      return Promise.resolve();
    }

    setLoading(true);
    var op =
      currentTab === 'offer' ? 'list-publish-assist-offerables' : 'list-publish-assist-requestables';
    return api(op, { partner_id: selectedPartnerId })
      .then(function (res) {
        setLoading(false);
        if (!res || !res.ok) {
          setEmpty(t('creator.publish_assist.error_load', 'Could not load data.'));
          return;
        }
        treeDesigns = res.designs || [];
        tabLimits = res.limits || null;
        if (currentTab === 'offer') bothLimits.offer = tabLimits;
        else bothLimits.request = tabLimits;
        refreshLimitsUi();
        renderTree();
      })
      .catch(function () {
        setLoading(false);
        setEmpty(t('creator.publish_assist.error_load', 'Could not load data.'));
      });
  }

  function setTab(tab) {
    currentTab = tab || 'offer';
    root.querySelectorAll('[data-pa-tab]').forEach(function (btn) {
      var on = btn.getAttribute('data-pa-tab') === currentTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    loadTabContent();
  }

  function closeDrawer() {
    var sidebar = root.querySelector('#pa-sidebar');
    var scrim = root.querySelector('#pa-drawer-scrim');
    if (sidebar) sidebar.classList.remove('is-drawer-open');
    if (scrim) scrim.hidden = true;
  }

  function openDrawer() {
    var sidebar = root.querySelector('#pa-sidebar');
    var scrim = root.querySelector('#pa-drawer-scrim');
    if (sidebar) sidebar.classList.add('is-drawer-open');
    if (scrim) scrim.hidden = false;
  }

  function wireOnce() {
    if (!root || root.__paWired) return;
    root.__paWired = true;

    var closeBtn = root.querySelector('#pa-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var menuBtn = root.querySelector('#pa-btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', openDrawer);

    var scrim = root.querySelector('#pa-drawer-scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);

    var rail = root.querySelector('#pa-sidebar-toggle');
    var sidebar = root.querySelector('#pa-sidebar');
    var body = root.querySelector('#pa-body');
    if (rail && sidebar) {
      rail.addEventListener('click', function () {
        var collapsed = sidebar.classList.toggle('is-collapsed');
        if (body) body.classList.toggle('is-sidebar-collapsed', collapsed);
        rail.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        rail.textContent = collapsed ? '›' : '‹';
      });
    }

    root.querySelectorAll('[data-pa-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTab(btn.getAttribute('data-pa-tab'));
      });
    });

    var sendBtn = root.querySelector('#pa-btn-send');
    if (sendBtn) sendBtn.addEventListener('click', sendSelected);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root && !root.hidden) close();
    });
  }

  function open(opts) {
    opts = opts || {};
    if (!ensureRoot()) return;
    wireOnce();
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pa-modal-open');
    if (opts.partner_id) selectedPartnerId = String(opts.partner_id);
    if (opts.tab) currentTab = String(opts.tab);
    selected.clear();
    expanded = {};
    setTab(currentTab);
    loadLimits().then(function () {
      return loadPartners().then(loadTabContent);
    });
  }

  function close() {
    if (!ensureRoot()) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pa-modal-open');
    closeDrawer();
  }

  window.CreatorPublishAssist = {
    open: open,
    close: close,
    setTab: setTab
  };

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-pa-open], [data-cc-publish-assist]');
    if (!trigger) return;
    e.preventDefault();
    open({
      tab: trigger.getAttribute('data-pa-tab') || undefined,
      partner_id: trigger.getAttribute('data-pa-partner') || undefined
    });
  });
})();
