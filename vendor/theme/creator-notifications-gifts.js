/**
 * Creator Notifications – Eazy Gift Pool Category
 * Displays available pool gifts inline in the notification list
 * with a "Claim" button. Also shows already-claimed gift confirmations.
 */
(function () {
  'use strict';

  if (window.__creatorNotificationsGifts) return;
  window.__creatorNotificationsGifts = true;

  var API_BASE = window.__CREATOR_API_BASE || '/apps/creator-dispatch';
  var catKey = 'eazygift';

  function normalizeKey(key) {
    if (window.CNM_normalizeKey) return window.CNM_normalizeKey(key);
    return String(key || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[_-]+/g, '').replace(/[^a-z0-9]/g, '');
  }

  function safeParseJSON(x) {
    try {
      if (!x) return null;
      if (typeof x === 'object') return x;
      if (typeof x === 'string') return JSON.parse(x);
    } catch (e) {}
    return null;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function getOwnerId() {
    return window.__EAZ_OWNER_ID || window.logged_in_customer_id || window.logged_in_customer_iid || null;
  }

  function giftIcon(type) {
    switch (type) {
      case 'design':
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
      case 'eaz':
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
      case 'creator_code':
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
      case 'community_slot':
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';
      default:
        return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
    }
  }

  // Pool gifts loaded from API (available + unclaimed)
  var poolGifts = [];
  var poolLoaded = false;
  var claimsRemaining = 3;

  async function loadPoolGifts() {
    var ownerId = getOwnerId();
    if (!ownerId) return;
    try {
      var resp = await fetch(API_BASE + '?op=get-pool-gifts&owner_id=' + encodeURIComponent(ownerId), { credentials: 'include' });
      var data = await resp.json();
      if (data.ok) {
        poolGifts = data.gifts || [];
        claimsRemaining = data.claims_remaining ?? 3;
        poolLoaded = true;
      }
    } catch (e) {
      console.warn('[GiftPool] Failed to load pool gifts:', e);
    }
  }

  async function claimGift(giftId, btnEl) {
    var ownerId = getOwnerId();
    if (!ownerId) return;

    btnEl.disabled = true;
    btnEl.textContent = '...';

    try {
      var resp = await fetch(API_BASE + '?op=claim-pool-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ owner_id: ownerId, gift_id: giftId })
      });
      var data = await resp.json();

      if (data.ok) {
        btnEl.textContent = t('giftClaimed', 'Erhalten!');
        btnEl.classList.add('cnm-gift-btn--claimed');
        claimsRemaining = Math.max(0, claimsRemaining - 1);

        // Remove from local list
        poolGifts = poolGifts.filter(function (g) { return g.id !== giftId; });

        // Refresh notifications
        if (window.CreatorNotificationsModal && window.CreatorNotificationsModal.refresh) {
          setTimeout(function () { window.CreatorNotificationsModal.refresh(); }, 1000);
        }

        // Refresh balance if it was EAZ
        if (data.delivery && data.delivery.type === 'eaz') {
          window.dispatchEvent(new CustomEvent('eazBalanceUpdated', { detail: { balance: data.delivery.balance_after } }));
        }
      } else if (data.error === 'already_claimed') {
        btnEl.textContent = t('giftGone', 'Schon vergeben!');
        btnEl.classList.add('cnm-gift-btn--gone');
        poolGifts = poolGifts.filter(function (g) { return g.id !== giftId; });
      } else {
        btnEl.textContent = data.error === 'daily_limit_reached' ? t('giftLimitReached', 'Limit erreicht') : t('giftError', 'Fehler');
        btnEl.disabled = false;
      }
    } catch (e) {
      btnEl.textContent = t('giftError', 'Fehler');
      btnEl.disabled = false;
    }
  }

  var CATEGORY_DEF = {
    id: 'eazygift',
    name: t('giftCategoryName', 'Eazy Geschenke'),
    category: 'eazy_gift',

    filterItems: function (allJobs, allNotifications) {
      var items = [];
      var notifs = Array.isArray(allNotifications) ? allNotifications : [];

      // API notifications for already-claimed gifts or gift announcements
      notifs
        .filter(function (n) { return normalizeKey(n?.category || '') === catKey; })
        .forEach(function (notification) {
          var createdTs = notification.created_at ? new Date(notification.created_at).getTime() : Date.now();
          var notifData = safeParseJSON(notification.data);

          items.push({
            id: 'api-' + (notification.notification_id || 'gift-' + createdTs),
            tab: 'notifs',
            cat: 'eazy_gift',
            title: notification.title || t('giftTitle', 'Eazy Geschenk'),
            meta: [notification.message || '', formatDate(createdTs)].filter(Boolean).join(' · '),
            unread: !(notification?.is_read === true || notification?.is_read === 1 || notification?.is_read === '1'),
            ts: createdTs,
            data: { ...notifData, __notif: true },
            isFromAPI: true
          });
        });

      // Add pool gifts as claimable items (interleaved with notifications)
      if (poolLoaded && poolGifts.length > 0) {
        poolGifts.forEach(function (gift) {
          items.push({
            id: 'pool-gift-' + gift.id,
            tab: 'notifs',
            cat: 'eazy_gift',
            title: gift.title || t('giftTitle', 'Eazy Geschenk'),
            meta: [gift.description || '', formatDate(gift.created_at)].filter(Boolean).join(' · '),
            unread: true,
            ts: gift.created_at || Date.now(),
            data: { ...gift, __pool: true },
            isFromAPI: false
          });
        });
      }

      items.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      return items;
    },

    renderItem: function (item, container) {
      var data = item.data || {};
      var isPool = !!data.__pool;
      var giftType = data.gift_type || 'design';

      var itemDiv = document.createElement('div');
      itemDiv.className = 'cnm-item cnm-gift-item' + (item.unread ? ' is-unread' : '') + (isPool ? ' cnm-gift-item--claimable' : '');
      itemDiv.dataset.id = item.id;

      var previewHtml = '';
      if (data.preview_url) {
        previewHtml = '<div class="cnm-gift-preview"><img src="' + escapeHtml(data.preview_url) + '" alt="" loading="lazy"></div>';
      } else {
        previewHtml = '<div class="cnm-gift-icon">' + giftIcon(giftType) + '</div>';
      }

      var actionHtml = '';
      if (isPool) {
        var btnLabel = claimsRemaining > 0 ? t('giftClaim', 'Einlösen') : t('giftLimitReached', 'Limit erreicht');
        actionHtml = '<button class="cnm-gift-btn' + (claimsRemaining <= 0 ? ' cnm-gift-btn--disabled' : '') + '" data-gift-id="' + data.id + '"' + (claimsRemaining <= 0 ? ' disabled' : '') + '>' + escapeHtml(btnLabel) + '</button>';
      }

      var badgeLabel = isPool ? t('giftAvailable', 'Verfügbar') : t('giftReceived', 'Erhalten');
      var badgeClass = isPool ? 'cnm-gift-badge--available' : 'cnm-gift-badge--claimed';

      itemDiv.innerHTML =
        '<div class="cnm-gift-layout">' +
          previewHtml +
          '<div class="cnm-gift-content">' +
            '<div class="cnm-gift-header">' +
              '<span class="cnm-gift-title">' + escapeHtml(item.title) + '</span>' +
              '<span class="cnm-gift-badge ' + badgeClass + '">' + escapeHtml(badgeLabel) + '</span>' +
            '</div>' +
            '<div class="cnm-gift-meta">' + escapeHtml(item.meta) + '</div>' +
            actionHtml +
          '</div>' +
        '</div>';

      // Wire claim button
      var btn = itemDiv.querySelector('.cnm-gift-btn');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          claimGift(data.id, btn);
        });
      }

      // Mark notification as read on click (for non-pool items)
      if (!isPool) {
        itemDiv.addEventListener('click', function () {
          if (window.CreatorNotificationsModal?.markRead) {
            window.CreatorNotificationsModal.markRead(item.id, { category: 'eazy_gift' }).catch(function () {});
          }
        });
      }

      container.appendChild(itemDiv);
    }
  };

  // Auto-load pool gifts when the module initializes
  loadPoolGifts();

  // Refresh pool when notifications modal opens
  window.addEventListener('creator-notifications-opened', function () {
    loadPoolGifts().then(function () {
      if (window.CreatorNotificationsModal?.refresh) {
        window.CreatorNotificationsModal.refresh();
      }
    });
  });

  if (!window.CreatorNotificationCategories) window.CreatorNotificationCategories = {};
  window.CreatorNotificationCategories[catKey] = CATEGORY_DEF;

  // Expose for external use
  window.EazyGiftPool = {
    loadPoolGifts: loadPoolGifts,
    getPoolGifts: function () { return poolGifts; },
    getClaimsRemaining: function () { return claimsRemaining; },
  };

  console.log('[CreatorNotifications] Eazy Gift Pool category loaded');
})();
