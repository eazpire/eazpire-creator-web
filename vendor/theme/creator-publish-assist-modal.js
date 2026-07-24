/**
 * Publish Assist modal (IDEA-050) — Offer / Request / Pending
 */
(function () {
  'use strict';

  var API_BASE = '/apps/creator-dispatch';
  var root = null;
  var currentTab = 'offer';
  var selectedPartnerId = null;
  var partners = [];
  var pendingCount = 0;

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
    // Nested Shopify-style: CreatorI18n.publish_assist.* or creator.publish_assist.*
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
        var badge = Number(p.pending_count) > 0
          ? '<span class="pa-sidebar__badge">' + Number(p.pending_count) + '</span>'
          : '';
        html +=
          '<button type="button" class="pa-sidebar__item' + (active ? ' is-active' : '') +
          '" data-pa-partner="' + escapeHtml(p.owner_id) + '">' +
          '<span translate="no" data-eaz-creator-name="1">' + escapeHtml(p.display_name || p.owner_id) + '</span>' +
          badge + '</button>';
      });
      return html;
    }

    listEl.innerHTML =
      renderGroup('creator.publish_assist.group_recruits', 'You invited', recruits) +
      renderGroup('creator.publish_assist.group_recruiters', 'Invited you', recruiters);

    listEl.querySelectorAll('[data-pa-partner]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedPartnerId = btn.getAttribute('data-pa-partner');
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
    var p = partners.find(function (x) { return String(x.owner_id) === String(selectedPartnerId); });
    if (!p) {
      banner.hidden = true;
      nameEl.textContent = '';
      return;
    }
    banner.hidden = false;
    nameEl.textContent = p.display_name || p.owner_id;
    if (window.EazCreatorNameGuard && typeof window.EazCreatorNameGuard.mark === 'function') {
      window.EazCreatorNameGuard.mark(nameEl);
    }
  }

  function renderItemCards(items, mode) {
    var list = root.querySelector('#pa-list');
    var empty = root.querySelector('#pa-empty');
    if (!list) return;
    if (!items.length) {
      setEmpty(t(
        mode === 'offer' ? 'creator.publish_assist.empty_offer' :
          mode === 'request' ? 'creator.publish_assist.empty_request' :
            'creator.publish_assist.empty_pending',
        mode === 'offer' ? 'No offerable designs for this partner.' :
          mode === 'request' ? 'No requestable designs for this partner.' :
            'No pending requests.'
      ));
      return;
    }
    if (empty) empty.hidden = true;
    list.hidden = false;

    list.innerHTML = items.map(function (item) {
      if (mode === 'pending') {
        var sideLabel = item.side === 'incoming'
          ? t('creator.publish_assist.side_incoming', 'Incoming')
          : t('creator.publish_assist.side_outgoing', 'Outgoing');
        var actions = '';
        if (item.side === 'incoming' && item.status === 'pending') {
          actions =
            '<button type="button" class="pa-btn pa-btn--primary" data-pa-accept="' + escapeHtml(item.id) + '">' +
            escapeHtml(t('creator.publish_assist.accept', 'Accept')) + '</button>' +
            '<button type="button" class="pa-btn pa-btn--danger" data-pa-decline="' + escapeHtml(item.id) + '">' +
            escapeHtml(t('creator.publish_assist.decline', 'Decline')) + '</button>';
        } else if (item.side === 'outgoing' && item.status === 'pending') {
          actions =
            '<button type="button" class="pa-btn pa-btn--ghost" data-pa-decline="' + escapeHtml(item.id) + '">' +
            escapeHtml(t('creator.publish_assist.cancel', 'Cancel')) + '</button>';
        }
        var thumb = item.thumb_url
          ? '<img class="pa-card__thumb" src="' + escapeHtml(item.thumb_url) + '" alt="" loading="lazy">'
          : '<div class="pa-card__thumb pa-card__thumb--placeholder">Design</div>';
        return (
          '<article class="pa-card">' + thumb +
          '<div class="pa-card__body">' +
          '<span class="pa-card__side">' + escapeHtml(sideLabel) + ' · ' + escapeHtml(item.direction || '') + '</span>' +
          '<h4 class="pa-card__title">' + escapeHtml(item.design_title || item.design_id) + '</h4>' +
          '<p class="pa-card__meta">' + escapeHtml(item.variant_label || ((item.color_slug || '') + ' / ' + (item.size || ''))) +
          (item.partner_display_name ? ' · ' + escapeHtml(item.partner_display_name) : '') + '</p>' +
          '</div><div class="pa-card__actions">' + actions + '</div></article>'
        );
      }

      var cta = mode === 'offer'
        ? t('creator.publish_assist.send_offer', 'Send offer')
        : t('creator.publish_assist.send_request', 'Send request');
      var thumb2 = item.thumb_url
        ? '<img class="pa-card__thumb" src="' + escapeHtml(item.thumb_url) + '" alt="" loading="lazy">'
        : '<div class="pa-card__thumb pa-card__thumb--placeholder">Design</div>';
      return (
        '<article class="pa-card" data-pa-design="' + escapeHtml(item.design_id) + '"' +
        ' data-pa-product="' + escapeHtml(item.product_key || '') + '"' +
        ' data-pa-color="' + escapeHtml(item.color_slug || '') + '"' +
        ' data-pa-size="' + escapeHtml(item.size || '') + '"' +
        ' data-pa-label="' + escapeHtml(item.variant_label || '') + '">' +
        thumb2 +
        '<div class="pa-card__body">' +
        '<h4 class="pa-card__title">' + escapeHtml(item.design_title || item.design_id) + '</h4>' +
        '<p class="pa-card__meta">' + escapeHtml(item.variant_label || ((item.color_slug || '') + ' / ' + (item.size || ''))) + '</p>' +
        '</div><div class="pa-card__actions">' +
        '<button type="button" class="pa-btn pa-btn--primary" data-pa-send="' + mode + '">' +
        escapeHtml(cta) + '</button></div></article>'
      );
    }).join('');

    list.querySelectorAll('[data-pa-send]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.pa-card');
        if (!card) return;
        sendAssist(btn.getAttribute('data-pa-send'), {
          design_id: card.getAttribute('data-pa-design'),
          product_key: card.getAttribute('data-pa-product'),
          color_slug: card.getAttribute('data-pa-color'),
          size: card.getAttribute('data-pa-size'),
          variant_label: card.getAttribute('data-pa-label')
        }, btn);
      });
    });
    list.querySelectorAll('[data-pa-accept]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveAssist(btn.getAttribute('data-pa-accept'), 'accept', btn);
      });
    });
    list.querySelectorAll('[data-pa-decline]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        resolveAssist(btn.getAttribute('data-pa-decline'), 'decline', btn);
      });
    });
  }

  function sendAssist(direction, payload, btn) {
    if (!selectedPartnerId) return;
    if (btn) btn.disabled = true;
    apiPost('create-publish-assist-request', {
      partner_id: selectedPartnerId,
      direction: direction,
      design_id: payload.design_id,
      product_key: payload.product_key,
      color_slug: payload.color_slug,
      size: payload.size,
      variant_label: payload.variant_label
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (!res || !res.ok) {
        var msg = (res && res.message) || t('creator.publish_assist.error_send', 'Could not send. Check your Creators daily limit in the skill tree.');
        alert(msg);
        return;
      }
      loadPartners().then(loadTabContent);
    }).catch(function () {
      if (btn) btn.disabled = false;
      alert(t('creator.publish_assist.error_send', 'Could not send. Check your Creators daily limit in the skill tree.'));
    });
  }

  function resolveAssist(id, action, btn) {
    if (!id) return;
    if (btn) btn.disabled = true;
    apiPost('resolve-publish-assist-request', { id: id, action: action }).then(function (res) {
      if (btn) btn.disabled = false;
      if (!res || !res.ok) {
        alert((res && res.message) || t('creator.publish_assist.error_resolve', 'Could not update request.'));
        return;
      }
      loadPartners().then(loadTabContent);
    }).catch(function () {
      if (btn) btn.disabled = false;
      alert(t('creator.publish_assist.error_resolve', 'Could not update request.'));
    });
  }

  function loadPartners() {
    return api('list-publish-assist-partners').then(function (res) {
      partners = (res && res.ok && res.partners) || [];
      pendingCount = partners.reduce(function (sum, p) {
        return sum + (Number(p.pending_count) || 0);
      }, 0);
      if (selectedPartnerId && !partners.some(function (p) {
        return String(p.owner_id) === String(selectedPartnerId);
      })) {
        selectedPartnerId = null;
      }
      if (!selectedPartnerId && partners.length) {
        selectedPartnerId = partners[0].owner_id;
      }
      renderPartners();
      updatePartnerBanner();
      updatePendingBadge();
    }).catch(function () {
      partners = [];
      renderPartners();
    });
  }

  function loadTabContent() {
    updateTabHint();
    if (currentTab === 'pending') {
      setLoading(true);
      return api('list-publish-assist-pending').then(function (res) {
        setLoading(false);
        var items = (res && res.ok && res.pending) || [];
        pendingCount = items.filter(function (i) {
          return i.side === 'incoming' && i.status === 'pending';
        }).length;
        updatePendingBadge();
        renderItemCards(items, 'pending');
      }).catch(function () {
        setLoading(false);
        setEmpty(t('creator.publish_assist.error_load', 'Could not load data.'));
      });
    }

    if (!selectedPartnerId) {
      setEmpty(t('creator.publish_assist.select_partner', 'Select a community member to continue.'));
      return Promise.resolve();
    }

    setLoading(true);
    var op = currentTab === 'offer'
      ? 'list-publish-assist-offerables'
      : 'list-publish-assist-requestables';
    return api(op, { partner_id: selectedPartnerId }).then(function (res) {
      setLoading(false);
      var items = (res && res.ok && (res.offerables || res.requestables)) || [];
      renderItemCards(items, currentTab);
    }).catch(function () {
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
    setTab(currentTab);
    loadPartners().then(loadTabContent);
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
