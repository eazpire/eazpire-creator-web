/**
 * Creator Social Media Manager modal (IDEA-040 Phase B) — Connect + Facebook OAuth
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var root = null;
  var currentNav = 'overview';
  var channelState = {};
  var oauthPopup = null;
  var oauthPollTimer = null;

  /** Locked product channel list. Facebook is live; others show Coming soon. */
  var CHANNELS = [
    { id: 'facebook', labelKey: 'channel_facebook', label: 'Facebook', short: 'f', connectable: true },
    { id: 'instagram', labelKey: 'channel_instagram', label: 'Instagram', short: 'Ig', connectable: false },
    { id: 'threads', labelKey: 'channel_threads', label: 'Threads', short: '@', connectable: false },
    { id: 'tiktok', labelKey: 'channel_tiktok', label: 'TikTok', short: 'Tk', connectable: false },
    { id: 'youtube', labelKey: 'channel_youtube', label: 'YouTube', short: 'YT', connectable: false },
    { id: 'snapchat', labelKey: 'channel_snapchat', label: 'Snapchat', short: 'Sc', connectable: false },
    { id: 'pinterest', labelKey: 'channel_pinterest', label: 'Pinterest', short: 'P', connectable: false },
    { id: 'tumblr', labelKey: 'channel_tumblr', label: 'Tumblr', short: 't', connectable: false },
    { id: 'linkedin', labelKey: 'channel_linkedin', label: 'LinkedIn', short: 'in', connectable: false },
    { id: 'mastodon', labelKey: 'channel_mastodon', label: 'Mastodon', short: 'M', connectable: false },
    { id: 'bluesky', labelKey: 'channel_bluesky', label: 'Bluesky', short: 'bsky', connectable: false }
  ];

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    return !t || t.indexOf('translation missing') !== -1;
  }

  function i18n(key, fallback) {
    try {
      var smm = window.CreatorI18n && window.CreatorI18n.social_media_manager;
      if (smm && smm[key] != null && !isBadTranslationString(String(smm[key]))) {
        return String(smm[key]);
      }
      var flat = window.CreatorI18n && window.CreatorI18n['creator.social_media_manager.' + key];
      if (flat != null && !isBadTranslationString(String(flat))) return String(flat);
      var mobile = window.CreatorMobileI18n && window.CreatorMobileI18n['social_media_manager_' + key];
      if (mobile != null && !isBadTranslationString(String(mobile))) return String(mobile);
    } catch (e) {}
    return fallback;
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) {
      return String(window.__EAZ_OWNER_ID);
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  function apiUrl(op) {
    var owner = getOwnerId();
    var u = API_BASE + '?op=' + encodeURIComponent(op);
    if (owner) {
      u += '&owner_id=' + encodeURIComponent(owner) + '&logged_in_customer_id=' + encodeURIComponent(owner);
    }
    return u;
  }

  function $(sel, el) {
    return (el || root).querySelector(sel);
  }

  function setConnectMessage(msg, isError) {
    var el = $('#smm-connect-msg');
    if (!el) return;
    if (!msg) {
      el.textContent = '';
      el.hidden = true;
      el.classList.remove('is-error', 'is-info');
      return;
    }
    el.textContent = msg;
    el.hidden = false;
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-info', !isError);
  }

  function closeDrawer() {
    var sidebar = $('#smm-sidebar');
    var scrim = $('#smm-drawer-scrim');
    if (sidebar) sidebar.classList.remove('is-drawer-open');
    if (scrim) scrim.hidden = true;
  }

  function openDrawer() {
    var sidebar = $('#smm-sidebar');
    var scrim = $('#smm-drawer-scrim');
    if (sidebar) sidebar.classList.add('is-drawer-open');
    if (scrim) scrim.hidden = false;
  }

  function setNav(nav) {
    if (!root) return;
    currentNav = nav || 'overview';
    root.querySelectorAll('[data-smm-nav]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-smm-nav') === currentNav);
    });
    root.querySelectorAll('[data-smm-panel]').forEach(function (panel) {
      var match = panel.getAttribute('data-smm-panel') === currentNav;
      panel.classList.toggle('is-active', match);
      if (match) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
    closeDrawer();
    if (currentNav === 'connect') {
      loadConnections();
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderConnectGrid() {
    var grid = $('#smm-connect-grid');
    if (!grid) return;
    var offlineLabel = i18n('status_offline', 'Offline');
    var onlineLabel = i18n('status_online', 'Online');
    var connectLabel = i18n('btn_connect', 'Connect');
    var addLabel = i18n('btn_add', 'Add');
    var disconnectLabel = i18n('btn_disconnect', 'Disconnect');
    var comingSoonLabel = i18n('coming_soon', 'Coming soon');
    var html = '';

    CHANNELS.forEach(function (ch) {
      var st = channelState[ch.id] || { online: false, account_count: 0, connectable: !!ch.connectable };
      var name = i18n(ch.labelKey, ch.label);
      var online = !!st.online && Number(st.account_count || 0) > 0;
      var count = Number(st.account_count || 0) || 0;
      var connectable = ch.connectable !== false && st.connectable !== false;
      var statusText = online
        ? onlineLabel + (count > 0 ? ' · ' + count : '')
        : offlineLabel;
      var actions = '';

      if (!connectable) {
        actions =
          '<button type="button" class="smm-btn smm-btn--card smm-btn--disabled" disabled title="' +
          esc(comingSoonLabel) +
          '">' +
          esc(connectLabel) +
          '</button>' +
          '<span class="smm-channel-card__hint">' +
          esc(comingSoonLabel) +
          '</span>';
      } else if (online) {
        actions =
          '<div class="smm-channel-card__btn-row">' +
          '<button type="button" class="smm-btn smm-btn--card smm-btn--primary" data-smm-action="add" data-smm-channel="' +
          esc(ch.id) +
          '">' +
          esc(addLabel) +
          '</button>' +
          '<button type="button" class="smm-btn smm-btn--card smm-btn--danger" data-smm-action="disconnect" data-smm-channel="' +
          esc(ch.id) +
          '">' +
          esc(disconnectLabel) +
          '</button>' +
          '</div>';
      } else {
        actions =
          '<button type="button" class="smm-btn smm-btn--card smm-btn--primary" data-smm-action="connect" data-smm-channel="' +
          esc(ch.id) +
          '">' +
          esc(connectLabel) +
          '</button>';
      }

      html +=
        '<div class="smm-channel-card ' +
        (online ? 'is-online' : 'is-offline') +
        (connectable ? '' : ' is-coming-soon') +
        '" data-smm-channel="' +
        esc(ch.id) +
        '">' +
        '<span class="smm-channel-card__logo smm-channel-card__logo--' +
        esc(ch.id) +
        '" aria-hidden="true">' +
        esc(ch.short) +
        '</span>' +
        '<span class="smm-channel-card__name">' +
        esc(name) +
        '</span>' +
        '<span class="smm-channel-card__status">' +
        esc(statusText) +
        '</span>' +
        '<div class="smm-channel-card__actions">' +
        actions +
        '</div>' +
        '</div>';
    });
    grid.innerHTML = html;
  }

  async function loadConnections() {
    var owner = getOwnerId();
    if (!owner) {
      setConnectMessage(i18n('error_login_required', 'Please sign in to connect accounts.'), true);
      renderConnectGrid();
      return;
    }
    setConnectMessage(i18n('loading_connections', 'Loading connections…'), false);
    try {
      var res = await fetch(apiUrl('creator-social-connections'), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setConnectMessage(
          data.message || data.error || i18n('error_load_failed', 'Could not load connections.'),
          true
        );
        renderConnectGrid();
        return;
      }
      channelState = {};
      (data.channels || []).forEach(function (ch) {
        channelState[ch.id] = {
          online: !!ch.online,
          account_count: Number(ch.account_count || 0) || 0,
          connectable: !!ch.connectable,
          accounts: ch.accounts || []
        };
      });
      setConnectMessage('', false);
      renderConnectGrid();
    } catch (e) {
      setConnectMessage(i18n('error_network', 'Network error. Please try again.'), true);
      renderConnectGrid();
    }
  }

  function stopOAuthWatch() {
    if (oauthPollTimer) {
      clearInterval(oauthPollTimer);
      oauthPollTimer = null;
    }
    oauthPopup = null;
  }

  function watchOAuthPopup(popup) {
    stopOAuthWatch();
    oauthPopup = popup;
    oauthPollTimer = setInterval(function () {
      try {
        if (!oauthPopup || oauthPopup.closed) {
          stopOAuthWatch();
          loadConnections();
        }
      } catch (e) {
        stopOAuthWatch();
        loadConnections();
      }
    }, 800);
  }

  async function startFacebookOAuth() {
    var owner = getOwnerId();
    if (!owner) {
      setConnectMessage(i18n('error_login_required', 'Please sign in to connect accounts.'), true);
      return;
    }
    setConnectMessage(i18n('oauth_starting', 'Opening Facebook…'), false);
    try {
      var res = await fetch(apiUrl('creator-social-oauth-start'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ channel: 'facebook', owner_id: owner })
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok || !data.authorize_url) {
        var msg =
          data.message ||
          (data.error === 'missing_meta_app_id'
            ? i18n('error_meta_not_configured', 'Facebook App is not configured yet.')
            : data.error === 'channel_not_ready'
              ? i18n('coming_soon', 'Coming soon')
              : i18n('error_oauth_start', 'Could not start Facebook connect.'));
        setConnectMessage(msg, true);
        return;
      }
      var w = 640;
      var h = 720;
      var left = Math.max(0, (window.screen.width - w) / 2);
      var top = Math.max(0, (window.screen.height - h) / 2);
      var popup = window.open(
        data.authorize_url,
        'eazpire_smm_facebook_oauth',
        'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',noopener=no'
      );
      if (!popup) {
        setConnectMessage(
          i18n('error_popup_blocked', 'Popup blocked. Allow popups for this site and try again.'),
          true
        );
        return;
      }
      setConnectMessage(i18n('oauth_waiting', 'Finish connecting in the Facebook window…'), false);
      watchOAuthPopup(popup);
    } catch (e) {
      setConnectMessage(i18n('error_network', 'Network error. Please try again.'), true);
    }
  }

  async function disconnectChannel(channelId) {
    var owner = getOwnerId();
    if (!owner) {
      setConnectMessage(i18n('error_login_required', 'Please sign in to connect accounts.'), true);
      return;
    }
    var okConfirm = window.confirm(
      i18n(
        'confirm_disconnect',
        'Disconnect all linked accounts for this channel from eazpire?'
      )
    );
    if (!okConfirm) return;
    setConnectMessage(i18n('disconnecting', 'Disconnecting…'), false);
    try {
      var res = await fetch(apiUrl('creator-social-disconnect'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ channel: channelId, owner_id: owner })
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setConnectMessage(
          data.message || data.error || i18n('error_disconnect', 'Could not disconnect.'),
          true
        );
        return;
      }
      setConnectMessage(i18n('disconnected', 'Disconnected.'), false);
      await loadConnections();
    } catch (e) {
      setConnectMessage(i18n('error_network', 'Network error. Please try again.'), true);
    }
  }

  function onConnectActionClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-smm-action]') : null;
    if (!btn || !root || !root.contains(btn)) return;
    e.preventDefault();
    var action = btn.getAttribute('data-smm-action');
    var channel = btn.getAttribute('data-smm-channel');
    if (!action || !channel) return;
    if (action === 'connect' || action === 'add') {
      if (channel === 'facebook') startFacebookOAuth();
      else setConnectMessage(i18n('coming_soon', 'Coming soon'), true);
      return;
    }
    if (action === 'disconnect') {
      disconnectChannel(channel);
    }
  }

  function onOAuthMessage(ev) {
    var data = ev && ev.data;
    if (!data || data.type !== 'eazpire-smm-oauth') return;
    stopOAuthWatch();
    if (data.ok) {
      setConnectMessage(
        i18n('oauth_success', 'Account connected.') +
          (data.saved ? ' (' + data.saved + ')' : ''),
        false
      );
    } else {
      setConnectMessage(
        data.error === 'connect_failed'
          ? i18n('error_oauth_failed', 'Facebook connect did not finish. Try again.')
          : String(data.error || i18n('error_oauth_failed', 'Facebook connect did not finish. Try again.')),
        true
      );
    }
    loadConnections();
  }

  function open(opts) {
    opts = opts || {};
    root = document.getElementById('creatorSocialMediaManagerModal');
    if (!root) {
      try {
        console.warn('[SocialMediaManager] modal root #creatorSocialMediaManagerModal not in DOM');
      } catch (e) {}
      return false;
    }
    bindUi();
    renderConnectGrid();
    setNav(opts.nav || 'overview');
    root.hidden = false;
    root.removeAttribute('hidden');
    root.setAttribute('aria-hidden', 'false');
    try {
      document.body.classList.add('smm-modal-open');
    } catch (e) {}
    return true;
  }

  function close() {
    root = document.getElementById('creatorSocialMediaManagerModal');
    if (!root) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    closeDrawer();
    stopOAuthWatch();
    try {
      document.body.classList.remove('smm-modal-open');
    } catch (e) {}
  }

  function bindUi() {
    root = document.getElementById('creatorSocialMediaManagerModal');
    if (!root || root._smmBound) return;
    root._smmBound = true;

    var closeBtn = $('#smm-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var menuBtn = $('#smm-btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', openDrawer);

    var scrim = $('#smm-drawer-scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);

    var sideToggle = $('#smm-sidebar-toggle');
    if (sideToggle) {
      sideToggle.addEventListener('click', function () {
        var sidebar = $('#smm-sidebar');
        if (!sidebar) return;
        var collapsed = sidebar.classList.toggle('is-collapsed');
        sideToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sideToggle.textContent = collapsed ? '›' : '‹';
      });
    }

    root.querySelectorAll('[data-smm-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setNav(btn.getAttribute('data-smm-nav'));
      });
    });

    root.addEventListener('click', onConnectActionClick);

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!root || root.hidden) return;
      var sidebar = $('#smm-sidebar');
      if (sidebar && sidebar.classList.contains('is-drawer-open')) {
        closeDrawer();
        return;
      }
      close();
    });
  }

  function onDelegatedOpenClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-smm-open]') : null;
    if (!btn) return;
    btn._smmOpenBound = true;
    e.preventDefault();
    e.stopPropagation();
    open();
  }

  function boot() {
    bindUi();
    if (!document._smmOpenDelegationBound) {
      document._smmOpenDelegationBound = true;
      document.addEventListener('click', onDelegatedOpenClick, true);
    }
    if (!document._smmOAuthMsgBound) {
      document._smmOAuthMsgBound = true;
      window.addEventListener('message', onOAuthMessage);
    }
    document.addEventListener('creator-marketing-ready', function () {
      bindUi();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.CreatorSocialMediaManager = {
    open: open,
    close: close,
    setNav: function (nav) {
      if (!root || root.hidden) open({ nav: nav });
      else setNav(nav);
    },
    refreshConnections: loadConnections
  };
})();
