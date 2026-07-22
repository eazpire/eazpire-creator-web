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
  var disconnectConfirmPending = null;

  var SUBMODAL_IDS = {
    addMedia: 'smm-add-media',
    asset: 'smm-asset-picker',
    link: 'smm-link-modal',
    target: 'smm-target-confirm',
    disconnect: 'smm-disconnect-confirm'
  };

  var PHONE_UPLOAD_WORKER_FALLBACK = 'https://creator-engine.eazpire.workers.dev';
  var linkExtracted = null;
  var linkPhonePollTimer = null;
  var linkPhoneSessionId = null;

  /** New Post composer state */
  var compose = {
    asset: null,
    targets: [],
    defaultSelected: [],
    channelEnabled: {},
    expandedChannel: null,
    scheduleEnabled: false,
    channelSettings: {
      facebook: { post_type: 'photo', destination: '' },
      tiktok: { privacy_level: 'SELF_ONLY' }
    },
    tiktokPrivacyOptions: ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS', 'PUBLIC_TO_EVERYONE'],
    confirmMode: 'post'
  };

  /** Locked product channel list. Facebook is live; others show Coming soon. */
  var CHANNELS = [
    { id: 'facebook', labelKey: 'channel_facebook', label: 'Facebook', short: 'f', connectable: true },
    { id: 'instagram', labelKey: 'channel_instagram', label: 'Instagram', short: 'Ig', connectable: false },
    { id: 'threads', labelKey: 'channel_threads', label: 'Threads', short: '@', connectable: false },
    { id: 'tiktok', labelKey: 'channel_tiktok', label: 'TikTok', short: 'Tk', connectable: true },
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
      var vs = window.CreatorI18n && window.CreatorI18n.video_studio;
      if (vs && vs[key] != null && !isBadTranslationString(String(vs[key]))) {
        return String(vs[key]);
      }
      var vsFlat = window.CreatorI18n && window.CreatorI18n['creator.video_studio.' + key];
      if (vsFlat != null && !isBadTranslationString(String(vsFlat))) return String(vsFlat);
    } catch (e) {}
    return fallback;
  }

  function isDesktopViewport() {
    try {
      return window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    } catch (e) {
      return window.innerWidth >= 768;
    }
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
    var main = $('#smm-main');
    if (main) {
      main.classList.toggle('is-new-post-active', currentNav === 'new_post');
    }
    if (currentNav === 'connect') {
      loadConnections();
    }
    if (currentNav === 'new_post') {
      initNewPostPanel();
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
    var skillLockedLabel = i18n('skill_not_unlocked', 'Not unlocked yet');
    var html = '';

    CHANNELS.forEach(function (ch) {
      var st = channelState[ch.id] || {
        online: false,
        account_count: 0,
        connectable: !!ch.connectable,
        skill_unlocked: true
      };
      var name = i18n(ch.labelKey, ch.label);
      var online = !!st.online && Number(st.account_count || 0) > 0;
      var count = Number(st.account_count || 0) || 0;
      var skillUnlocked = typeof st.skill_unlocked === 'boolean' ? st.skill_unlocked : true;
      var connectable = !!st.connectable;
      var statusText = online
        ? onlineLabel + (count > 0 ? ' · ' + count : '')
        : offlineLabel;
      var actions = '';
      var hintLabel = !skillUnlocked
        ? skillLockedLabel
        : (!connectable ? comingSoonLabel : '');

      if (!skillUnlocked || !connectable) {
        actions =
          '<button type="button" class="smm-btn smm-btn--card smm-btn--disabled" disabled title="' +
          esc(hintLabel || comingSoonLabel) +
          '">' +
          esc(connectLabel) +
          '</button>' +
          '<span class="smm-channel-card__hint">' +
          esc(hintLabel || comingSoonLabel) +
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
        (skillUnlocked ? '' : ' is-skill-locked') +
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
          skill_unlocked: !!ch.skill_unlocked,
          channel_ready: !!ch.channel_ready,
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

  async function startChannelOAuth(channelId) {
    var owner = getOwnerId();
    if (!owner) {
      setConnectMessage(i18n('error_login_required', 'Please sign in to connect accounts.'), true);
      return;
    }
    var startingKey = channelId === 'tiktok' ? 'oauth_starting_tiktok' : 'oauth_starting';
    var waitingKey = channelId === 'tiktok' ? 'oauth_waiting_tiktok' : 'oauth_waiting';
    var popupName = channelId === 'tiktok' ? 'eazpire_smm_tiktok_oauth' : 'eazpire_smm_facebook_oauth';
    setConnectMessage(i18n(startingKey, channelId === 'tiktok' ? 'Opening TikTok…' : 'Opening Facebook…'), false);
    try {
      var res = await fetch(apiUrl('creator-social-oauth-start'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ channel: channelId, owner_id: owner })
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok || !data.authorize_url) {
        var msg =
          data.message ||
          (data.error === 'missing_meta_app_id'
            ? i18n('error_meta_not_configured', 'Facebook App is not configured yet.')
            : data.error === 'missing_tiktok_client_key'
              ? i18n('error_tiktok_not_configured', 'TikTok App is not configured yet.')
            : data.error === 'channel_not_ready'
              ? i18n('coming_soon', 'Coming soon')
              : channelId === 'tiktok'
                ? i18n('error_oauth_start_tiktok', 'Could not start TikTok connect.')
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
        popupName,
        'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',noopener=no'
      );
      if (!popup) {
        setConnectMessage(
          i18n('error_popup_blocked', 'Popup blocked. Allow popups for this site and try again.'),
          true
        );
        return;
      }
      setConnectMessage(i18n(waitingKey, channelId === 'tiktok' ? 'Finish connecting in the TikTok window…' : 'Finish connecting in the Facebook window…'), false);
      watchOAuthPopup(popup);
    } catch (e) {
      setConnectMessage(i18n('error_network', 'Network error. Please try again.'), true);
    }
  }

  async function startFacebookOAuth() {
    return startChannelOAuth('facebook');
  }

  async function disconnectChannel(channelId) {
    var owner = getOwnerId();
    if (!owner) {
      setConnectMessage(i18n('error_login_required', 'Please sign in to connect accounts.'), true);
      return;
    }
    var okConfirm = await openDisconnectConfirmModal(channelId);
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
      if (channel === 'facebook' || channel === 'tiktok') startChannelOAuth(channel);
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
      var channelLabel = data.channel === 'tiktok' ? 'TikTok' : 'Facebook';
      setConnectMessage(
        data.error === 'connect_failed'
          ? i18n(
              data.channel === 'tiktok' ? 'error_oauth_failed_tiktok' : 'error_oauth_failed',
              channelLabel + ' connect did not finish. Try again.'
            )
          : String(data.error || i18n('error_oauth_failed', 'Facebook connect did not finish. Try again.')),
        true
      );
    }
    loadConnections();
  }

  function channelLabel(channelId) {
    var ch = CHANNELS.find(function (c) {
      return c.id === channelId;
    });
    return ch ? i18n(ch.labelKey, ch.label) : channelId;
  }

  function getMediaKind() {
    if (!compose.asset) return 'image';
    return compose.asset.kind === 'video' ? 'video' : 'image';
  }

  function setNewPostStatus(msg, kind) {
    var el = $('#smm-new-post-status');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error', 'is-success');
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', kind === 'error');
    el.classList.toggle('is-success', kind === 'success');
  }

  function hasAnyConnectedTarget() {
    var onlineCount = 0;
    Object.keys(channelState).forEach(function (id) {
      var st = channelState[id];
      if (st && st.online && Number(st.account_count || 0) > 0) onlineCount += 1;
    });
    return (
      onlineCount > 0 ||
      (compose.targets &&
        compose.targets.some(function (t) {
          return isTargetAvailableForCompose(t);
        }))
    );
  }

  async function loadPostTargets() {
    var owner = getOwnerId();
    if (!owner) return;
    try {
      var res = await fetch(
        apiUrl('creator-social-post-targets') + '&media_kind=' + encodeURIComponent(getMediaKind()),
        { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } }
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok) {
        compose.targets = data.targets || [];
        compose.defaultSelected = data.default_selected || [];
        syncFacebookDestinationDefault(data.facebook_default_destination);
      }
    } catch (e) {}
  }

  function channelLogoShort(channelId) {
    var ch = CHANNELS.find(function (c) {
      return c.id === channelId;
    });
    return ch ? ch.short : String(channelId || '?').slice(0, 2);
  }

  function isFacebookProfileShareTarget(t) {
    if (!t) return false;
    return (
      t.source === 'share' ||
      t.publish_mode === 'share_dialog' ||
      t.id === 'share:facebook_profile'
    );
  }

  function getFacebookDestination() {
    var fb = compose.channelSettings.facebook || {};
    var dest = String(fb.destination || '').trim().toLowerCase();
    if (dest === 'pages' || dest === 'profile' || dest === 'both') return dest;
    var hasPage = (compose.targets || []).some(function (t) {
      return t && t.channel === 'facebook' && !isFacebookProfileShareTarget(t) && isTargetAvailableForCompose(t);
    });
    return hasPage ? 'pages' : 'profile';
  }

  function syncFacebookDestinationDefault(serverDefault) {
    compose.channelSettings.facebook = compose.channelSettings.facebook || { post_type: 'photo' };
    if (!compose.channelSettings.facebook.destination) {
      var fromServer = String(serverDefault || '').trim().toLowerCase();
      if (fromServer === 'pages' || fromServer === 'profile' || fromServer === 'both') {
        compose.channelSettings.facebook.destination = fromServer;
      } else {
        compose.channelSettings.facebook.destination = getFacebookDestination();
      }
    }
  }

  function openFacebookShareDialogs(shareDialogs) {
    var list = Array.isArray(shareDialogs) ? shareDialogs : [];
    list.forEach(function (item, idx) {
      var url = item && item.dialog_url ? String(item.dialog_url) : '';
      if (!url) return;
      try {
        var w = 680;
        var h = 720;
        var left = Math.max(0, (window.screen.width - w) / 2);
        var top = Math.max(0, (window.screen.height - h) / 2);
        var name = 'eazpire_fb_profile_share_' + idx;
        var features =
          'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',scrollbars=yes';
        var popup = window.open(url, name, features);
        if (!popup) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } catch (e) {
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e2) {}
      }
    });
  }

  function isTargetAvailableForCompose(t) {
    if (!t || !t.channel) return false;
    if (t.source === 'share' || isFacebookProfileShareTarget(t)) return !!t.online;
    if (t.source === 'creator') return !!t.online;
    if (t.source === 'admin') return !!t.admin_auto;
    return false;
  }

  function getConnectedChannelsForSettings() {
    var seen = {};
    var out = [];
    (compose.targets || []).forEach(function (t) {
      if (!isTargetAvailableForCompose(t) || seen[t.channel]) return;
      seen[t.channel] = true;
      out.push(t.channel);
    });
    Object.keys(channelState || {}).forEach(function (id) {
      var st = channelState[id];
      if (!st || !st.online || Number(st.account_count || 0) < 1) return;
      if (seen[id]) return;
      var hasTarget = (compose.targets || []).some(function (t) {
        return t && t.channel === id && isTargetAvailableForCompose(t);
      });
      if (!hasTarget) return;
      seen[id] = true;
      out.push(id);
    });
    // Facebook profile share is available without a connected Page (skill-gated via targets).
    if (!seen.facebook) {
      var hasFbShare = (compose.targets || []).some(function (t) {
        return t && t.channel === 'facebook' && isFacebookProfileShareTarget(t) && isTargetAvailableForCompose(t);
      });
      if (hasFbShare) {
        seen.facebook = true;
        out.unshift('facebook');
      }
    }
    return out;
  }

  function syncChannelEnabledDefaults() {
    var channels = getConnectedChannelsForSettings();
    var next = {};
    var defaults = compose.defaultSelected || [];
    channels.forEach(function (ch) {
      if (Object.prototype.hasOwnProperty.call(compose.channelEnabled, ch)) {
        next[ch] = !!compose.channelEnabled[ch];
        return;
      }
      var channelTargets = (compose.targets || []).filter(function (t) {
        return t && t.channel === ch && isTargetAvailableForCompose(t);
      });
      if (!channelTargets.length) {
        next[ch] = false;
        return;
      }
      // First paint: Online ∩ Auto Post (+ brand admin_auto). If none flagged, enable all connected.
      if (defaults.length) {
        next[ch] = channelTargets.some(function (t) {
          return defaults.indexOf(t.id) >= 0;
        });
      } else {
        next[ch] = true;
      }
    });
    compose.channelEnabled = next;
    if (compose.expandedChannel && !next[compose.expandedChannel]) {
      compose.expandedChannel = null;
    }
  }

  function isChannelEnabled(channelId) {
    return !!compose.channelEnabled[channelId];
  }

  function renderAssetViewer() {
    var viewer = $('#smm-new-post-viewer');
    if (!viewer) return;
    if (!compose.asset || !compose.asset.url) {
      viewer.classList.remove('has-asset');
      viewer.innerHTML =
        '<button type="button" class="smm-new-post__upload-area" id="smm-btn-choose-asset" aria-label="' +
        esc(i18n('choose_asset', 'Choose asset')) +
        '">' +
        '<span class="smm-new-post__upload-placeholder">' +
        '<span class="smm-new-post__upload-add" aria-hidden="true">+</span>' +
        '</span></button>';
      return;
    }
    viewer.classList.add('has-asset');
    var mediaHtml =
      compose.asset.kind === 'video'
        ? '<video src="' +
          esc(compose.asset.url) +
          '" controls playsinline preload="metadata" class="smm-new-post__preview-media"></video>'
        : '<img src="' +
          esc(compose.asset.url) +
          '" alt="" class="smm-new-post__preview-media" />';
    viewer.innerHTML =
      '<div class="smm-new-post__upload-area is-filled">' +
      '<div class="smm-new-post__upload-preview">' +
      mediaHtml +
      '<button type="button" class="smm-new-post__preview-change" id="smm-btn-choose-asset" aria-label="' +
      esc(i18n('change_asset', 'Change asset')) +
      '">×</button>' +
      '</div></div>';
  }

  function buildChannelOptionsHtml(ch) {
    var name = channelLabel(ch);
    var html =
      '<div class="smm-channel-panel" data-smm-channel-panel="' +
      esc(ch) +
      '"><h4 class="smm-channel-panel__title">' +
      esc(name) +
      '</h4>';
    if (ch === 'facebook') {
      var postType = (compose.channelSettings.facebook && compose.channelSettings.facebook.post_type) || 'photo';
      var destination = getFacebookDestination();
      var hasPageTarget = (compose.targets || []).some(function (t) {
        return t && t.channel === 'facebook' && !isFacebookProfileShareTarget(t) && isTargetAvailableForCompose(t);
      });
      var hasProfileTarget = (compose.targets || []).some(function (t) {
        return t && t.channel === 'facebook' && isFacebookProfileShareTarget(t) && isTargetAvailableForCompose(t);
      });
      html +=
        '<div class="smm-channel-panel__row">' +
        '<label class="smm-field" style="flex:1;min-width:160px">' +
        '<span class="smm-field__label">' +
        esc(i18n('facebook_destination', 'Post to')) +
        '</span>' +
        '<select class="smm-field__select" data-smm-fb-destination>';
      if (hasPageTarget) {
        html +=
          '<option value="pages"' +
          (destination === 'pages' ? ' selected' : '') +
          '>' +
          esc(i18n('facebook_destination_pages', 'Connected pages')) +
          '</option>';
      }
      if (hasProfileTarget) {
        html +=
          '<option value="profile"' +
          (destination === 'profile' ? ' selected' : '') +
          '>' +
          esc(i18n('facebook_destination_profile', 'My profile (Share dialog)')) +
          '</option>';
      }
      if (hasPageTarget && hasProfileTarget) {
        html +=
          '<option value="both"' +
          (destination === 'both' ? ' selected' : '') +
          '>' +
          esc(i18n('facebook_destination_both', 'Pages + my profile')) +
          '</option>';
      }
      html +=
        '</select></label></div>' +
        '<p class="smm-channel-panel__note">' +
        esc(
          destination === 'profile' || destination === 'both'
            ? i18n(
                'facebook_profile_share_note',
                'Profile posts open Facebook so you can confirm. Add a link for the best preview. Scheduling is for pages only.'
              )
            : i18n('facebook_pages_note', 'Posts to your connected Facebook Pages automatically.')
        ) +
        '</p>';
      if (destination === 'pages' || destination === 'both') {
        html +=
          '<div class="smm-channel-panel__row">' +
          '<label class="smm-field" style="flex:1;min-width:140px">' +
          '<span class="smm-field__label">' +
          esc(i18n('facebook_post_type', 'Post type')) +
          '</span>' +
          '<select class="smm-field__select" data-smm-fb-post-type>' +
          '<option value="photo"' +
          (postType === 'photo' ? ' selected' : '') +
          '>' +
          esc(i18n('facebook_post_photo', 'Photo post')) +
          '</option>' +
          '<option value="link"' +
          (postType === 'link' ? ' selected' : '') +
          '>' +
          esc(i18n('facebook_post_link', 'Link post')) +
          '</option>' +
          '</select></label></div>';
      }
    } else if (ch === 'tiktok') {
      if (getMediaKind() !== 'video') {
        html +=
          '<p class="smm-channel-panel__note">' +
          esc(i18n('tiktok_needs_video', 'TikTok posts require a video asset.')) +
          '</p>';
      }
      var privacy =
        (compose.channelSettings.tiktok && compose.channelSettings.tiktok.privacy_level) || 'SELF_ONLY';
      html +=
        '<div class="smm-channel-panel__row">' +
        '<label class="smm-field" style="flex:1;min-width:160px">' +
        '<span class="smm-field__label">' +
        esc(i18n('tiktok_privacy', 'Privacy')) +
        '</span>' +
        '<select class="smm-field__select" data-smm-tiktok-privacy">';
      compose.tiktokPrivacyOptions.forEach(function (opt) {
        html +=
          '<option value="' +
          esc(opt) +
          '"' +
          (privacy === opt ? ' selected' : '') +
          '>' +
          esc(opt.replace(/_/g, ' ')) +
          '</option>';
      });
      html +=
        '</select></label></div>' +
        '<p class="smm-channel-panel__note">' +
        esc(i18n('tiktok_sandbox_note', 'Sandbox apps may publish private posts until TikTok app review.')) +
        '</p>';
    } else if (ch === 'instagram') {
      html +=
        '<p class="smm-channel-panel__note">' +
        esc(
          getMediaKind() === 'video'
            ? i18n('instagram_video_soon', 'Instagram video posts are not supported in V1.')
            : i18n('instagram_feed_note', 'Single-image feed post via brand account.')
        ) +
        '</p>';
    } else {
      html +=
        '<p class="smm-channel-panel__note">' +
        esc(i18n('channel_publish_soon', 'Publishing to this channel is coming soon.')) +
        '</p>';
    }
    html += '</div>';
    return html;
  }

  function renderChannelOptions() {
    var options = $('#smm-channel-options');
    if (!options) return;
    var ch = compose.expandedChannel;
    if (!ch || !isChannelEnabled(ch)) {
      options.hidden = true;
      options.innerHTML = '';
      return;
    }
    options.hidden = false;
    options.innerHTML = buildChannelOptionsHtml(ch);
    var fbDest = options.querySelector('[data-smm-fb-destination]');
    if (fbDest) {
      fbDest.addEventListener('change', function () {
        compose.channelSettings.facebook = compose.channelSettings.facebook || {};
        compose.channelSettings.facebook.destination = fbDest.value;
        renderChannelOptions();
      });
    }
    var fbSel = options.querySelector('[data-smm-fb-post-type]');
    if (fbSel) {
      fbSel.addEventListener('change', function () {
        compose.channelSettings.facebook = compose.channelSettings.facebook || {};
        compose.channelSettings.facebook.post_type = fbSel.value;
      });
    }
    var ttSel = options.querySelector('[data-smm-tiktok-privacy]');
    if (ttSel) {
      ttSel.addEventListener('change', function () {
        compose.channelSettings.tiktok = compose.channelSettings.tiktok || {};
        compose.channelSettings.tiktok.privacy_level = ttSel.value;
      });
    }
  }

  function renderChannelCarousel() {
    var wrap = $('#smm-channel-carousel');
    if (!wrap) return;
    syncChannelEnabledDefaults();
    var channels = getConnectedChannelsForSettings();
    if (!channels.length) {
      wrap.innerHTML =
        '<p class="smm-channel-panel__note">' +
        esc(
          i18n(
            'no_targets_with_hint',
            'Connect a Facebook Page in Connect, or unlock Facebook in Creator Journey to share to your profile.'
          )
        ) +
        '</p>';
      renderChannelOptions();
      return;
    }
    var onlineLabel = i18n('status_online', 'Online');
    var enabledLabel = i18n('channel_enabled', 'Enabled');
    var disabledLabel = i18n('channel_disabled', 'Disabled');
    var html = '<div class="smm-compose-channel-grid" role="list">';
    channels.forEach(function (ch) {
      var enabled = isChannelEnabled(ch);
      var expanded = enabled && compose.expandedChannel === ch;
      var st = channelState[ch] || {};
      var count = Number(st.account_count || 0) || 0;
      var statusText = enabled
        ? enabledLabel + (count > 0 ? ' · ' + count : '')
        : disabledLabel;
      if (enabled && st.online) {
        statusText = onlineLabel + (count > 0 ? ' · ' + count : '');
      }
      html +=
        '<div class="smm-channel-card smm-compose-channel-card' +
        (enabled ? ' is-online' : ' is-disabled') +
        (expanded ? ' is-expanded' : '') +
        '" role="listitem" data-smm-channel-tile="' +
        esc(ch) +
        '">' +
        '<button type="button" class="smm-compose-channel-card__hit" data-smm-channel-expand="' +
        esc(ch) +
        '"' +
        (enabled ? '' : ' disabled aria-disabled="true"') +
        ' aria-expanded="' +
        (expanded ? 'true' : 'false') +
        '">' +
        '<span class="smm-channel-card__logo smm-channel-card__logo--' +
        esc(ch) +
        '" aria-hidden="true">' +
        esc(channelLogoShort(ch)) +
        '</span>' +
        '<span class="smm-channel-card__name">' +
        esc(channelLabel(ch)) +
        '</span>' +
        '<span class="smm-channel-card__status">' +
        esc(statusText) +
        '</span></button>' +
        '<div class="smm-channel-card__actions">' +
        '<label class="smm-switch smm-switch--compact" title="' +
        esc(i18n('channel_enable', 'Enable channel')) +
        '">' +
        '<input type="checkbox" data-smm-channel-enable="' +
        esc(ch) +
        '"' +
        (enabled ? ' checked' : '') +
        ' />' +
        '<span class="smm-switch__ui" aria-hidden="true"></span>' +
        '</label></div></div>';
    });
    html += '</div>';
    wrap.innerHTML = html;
    renderChannelOptions();
  }

  function setSectionCollapsed(sectionId, collapsed) {
    if (sectionId === 'assets') return;
    var section = document.getElementById('smm-section-' + sectionId);
    var toggle = document.getElementById('smm-' + sectionId + '-toggle');
    var panel =
      sectionId === 'channels'
        ? $('#smm-channels-panel')
        : $('#smm-schedule-panel');
    if (!section || !toggle) return;
    section.classList.toggle('is-collapsed', !!collapsed);
    if (panel) {
      if (sectionId === 'schedule') {
        panel.hidden = !compose.scheduleEnabled || !!collapsed;
      } else {
        panel.hidden = !!collapsed;
      }
    }
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var expandKey = sectionId + '_expand';
    var collapseKey = sectionId + '_collapse';
    var expandFallback =
      sectionId === 'channels' ? 'Expand channels section' : 'Expand schedule section';
    var collapseFallback =
      sectionId === 'channels' ? 'Collapse channels section' : 'Collapse schedule section';
    toggle.setAttribute(
      'aria-label',
      collapsed ? i18n(expandKey, expandFallback) : i18n(collapseKey, collapseFallback)
    );
  }

  function setScheduleEnabled(enabled) {
    compose.scheduleEnabled = !!enabled;
    var enableEl = $('#smm-schedule-enable');
    if (enableEl) enableEl.checked = compose.scheduleEnabled;
    var section = $('#smm-section-schedule');
    if (section) section.classList.toggle('is-schedule-on', compose.scheduleEnabled);
    if (compose.scheduleEnabled) {
      var schedInput = $('#smm-schedule-at');
      if (schedInput && !schedInput.value) schedInput.value = defaultScheduleLocalValue();
      setSectionCollapsed('schedule', false);
    } else {
      setSectionCollapsed('schedule', true);
    }
  }

  async function initNewPostPanel() {
    var emptyEl = $('#smm-new-post-empty');
    var composerEl = $('#smm-new-post-composer');
    if (!emptyEl || !composerEl) return;

    if (!getOwnerId()) {
      emptyEl.hidden = false;
      composerEl.hidden = true;
      return;
    }

    await loadConnections();
    await loadPostTargets();

    if (!hasAnyConnectedTarget()) {
      emptyEl.hidden = false;
      composerEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    composerEl.hidden = false;
    compose.channelEnabled = {};
    compose.expandedChannel = null;
    syncChannelEnabledDefaults();
    renderAssetViewer();
    renderChannelCarousel();
    setSectionCollapsed('channels', false);
    setScheduleEnabled(false);
    setNewPostStatus('', null);
  }

  function closeSubmodal(name) {
    var id = SUBMODAL_IDS[name];
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
  }

  function openSubmodal(name) {
    var id = SUBMODAL_IDS[name];
    var el = id ? document.getElementById(id) : null;
    if (!el) return;
    el.hidden = false;
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function resolveDisconnectConfirm(confirmed) {
    if (!disconnectConfirmPending) return;
    var pending = disconnectConfirmPending;
    disconnectConfirmPending = null;
    closeSubmodal('disconnect');
    pending.resolve(!!confirmed);
  }

  function openDisconnectConfirmModal(channelId) {
    return new Promise(function (resolve) {
      var titleEl = $('#smm-disconnect-confirm-title');
      var bodyEl = $('#smm-disconnect-confirm-body');
      var cancelBtn = $('#smm-btn-disconnect-cancel');
      var confirmBtn = $('#smm-btn-disconnect-confirm');
      var channelName = channelLabel(channelId);
      if (titleEl) {
        titleEl.textContent = i18n('confirm_disconnect_title', 'Disconnect channel?');
      }
      if (bodyEl) {
        bodyEl.textContent = i18n(
          'confirm_disconnect_body',
          i18n(
            'confirm_disconnect',
            'Disconnect all linked accounts for this channel from eazpire?'
          )
        ).replace(/\{channel\}/g, channelName);
      }
      if (cancelBtn) cancelBtn.textContent = i18n('btn_cancel', 'Cancel');
      if (confirmBtn) confirmBtn.textContent = i18n('btn_disconnect', 'Disconnect');
      disconnectConfirmPending = { resolve: resolve, channelId: channelId };
      openSubmodal('disconnect');
      if (confirmBtn) confirmBtn.focus();
    });
  }

  async function loadComposeAssets() {
    var grid = $('#smm-asset-grid');
    var loading = $('#smm-asset-loading');
    var empty = $('#smm-asset-empty');
    if (!grid) return;
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    grid.innerHTML = '';
    try {
      var res = await fetch(apiUrl('creator-social-compose-assets'), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' }
      });
      var data = await res.json().catch(function () {
        return {};
      });
      var items = (data.items || []).filter(function (item) {
        return item && item.kind !== 'audio';
      });
      if (loading) loading.hidden = true;
      if (!items.length) {
        if (empty) empty.hidden = false;
        return;
      }
      items.forEach(function (item) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'smm-asset-item';
        btn.setAttribute('role', 'listitem');
        var thumb = item.thumb_url || item.url;
        if (item.kind === 'video') {
          btn.innerHTML =
            '<video src="' +
            esc(thumb) +
            '" muted preload="metadata"></video>' +
            '<span class="smm-asset-item__badge">video</span>';
        } else {
          btn.innerHTML =
            '<img src="' +
            esc(thumb) +
            '" alt="" loading="lazy" />' +
            '<span class="smm-asset-item__badge">image</span>';
        }
        btn.addEventListener('click', function () {
          applyComposeAsset({
            id: item.id,
            source: item.source,
            kind: item.kind === 'video' ? 'video' : 'image',
            url: item.url,
            label: item.label || item.kind,
            caption_hint: item.caption_hint || null,
            link_url: item.link_url || '',
            product_ids: item.product_ids || [],
            product_urls: item.product_urls || []
          });
        });
        grid.appendChild(btn);
      });
    } catch (e) {
      if (loading) loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.textContent = i18n('error_load_assets', 'Could not load assets.');
      }
    }
  }

  function openAddMediaModal() {
    var phoneBtn = document.getElementById('smm-addsrc-phone');
    if (phoneBtn) phoneBtn.hidden = !isDesktopViewport();
    openSubmodal('addMedia');
  }

  function closeAddMediaModal() {
    closeSubmodal('addMedia');
  }

  function openAssetsLibraryModal() {
    openSubmodal('asset');
    loadComposeAssets();
  }

  function applyComposeAsset(asset) {
    compose.asset = asset;
    renderAssetViewer();
    // Autofill caption + product link from asset metadata (IDEA-044)
    var captionEl = $('#smm-caption');
    var linkEl = $('#smm-link-url');
    if (captionEl && asset && asset.caption_hint && !String(captionEl.value || '').trim()) {
      var hint = String(asset.caption_hint).trim();
      if (hint) {
        captionEl.value = hint.length > 2200 ? hint.slice(0, 2200) : hint;
      }
    }
    if (linkEl && asset) {
      var link =
        (asset.link_url && String(asset.link_url).trim()) ||
        (Array.isArray(asset.product_urls) && asset.product_urls[0]) ||
        '';
      if (link && !String(linkEl.value || '').trim()) {
        linkEl.value = link;
      }
    }
    loadPostTargets().then(function () {
      renderChannelCarousel();
    });
    closeSubmodal('asset');
    closeLinkModal();
    closeAddMediaModal();
  }

  function phoneBridgeApiBase() {
    var cfg = window.CREATOR_API_CONFIG || {};
    if (cfg.PHONE_UPLOAD_BASE_URL) return String(cfg.PHONE_UPLOAD_BASE_URL).replace(/\/+$/, '');
    if (cfg.WORKER_BASE_URL) return String(cfg.WORKER_BASE_URL).replace(/\/+$/, '');
    var base = cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/+$/, '') : '';
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(base)) return base;
    var fromApi = String(API_BASE || '').replace(/\/apps\/creator-dispatch$/i, '').replace(/\/+$/, '');
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(fromApi)) return fromApi;
    return PHONE_UPLOAD_WORKER_FALLBACK;
  }

  function fetchPhoneBridgeJson(url, options) {
    return fetch(url, options || { credentials: 'omit' }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { httpOk: r.ok, data: data };
        });
    });
  }

  function stopLinkPhoneBridge() {
    if (linkPhonePollTimer) {
      clearInterval(linkPhonePollTimer);
      linkPhonePollTimer = null;
    }
    linkPhoneSessionId = null;
  }

  function setSmmLinkStatus(msg, kind) {
    var status = document.getElementById('smm-link-status');
    if (!status) return;
    status.textContent = msg || '';
    status.className = 'smm-link-status' + (kind ? ' ' + kind : '');
  }

  function setSmmDownloadEnabled(on) {
    var btn = document.getElementById('smm-link-submit');
    if (btn) btn.disabled = !on;
  }

  function showSmmLinkPreview(url, kind) {
    var wrap = document.getElementById('smm-link-preview');
    var video = document.getElementById('smm-link-preview-video');
    var img = document.getElementById('smm-link-preview-image');
    if (!wrap) return;
    if (!url) {
      wrap.hidden = true;
      if (video) {
        video.hidden = true;
        video.removeAttribute('src');
      }
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
      }
      return;
    }
    wrap.hidden = false;
    if (kind === 'image' && img) {
      if (video) video.hidden = true;
      img.src = url;
      img.hidden = false;
    } else if (video) {
      if (img) img.hidden = true;
      video.src = url;
      video.hidden = false;
    }
  }

  function closeLinkModal() {
    stopLinkPhoneBridge();
    linkExtracted = null;
    setSmmDownloadEnabled(false);
    showSmmLinkPreview(null);
    closeSubmodal('link');
  }

  function openLinkModal() {
    linkExtracted = null;
    setSmmDownloadEnabled(false);
    showSmmLinkPreview(null);
    setSmmLinkStatus('', '');
    var input = document.getElementById('smm-media-link-url');
    if (input) input.value = '';
    var phoneStatus = document.getElementById('smm-link-phone-status');
    if (phoneStatus) phoneStatus.textContent = '';
    var phoneBox = document.getElementById('smm-link-phone');
    if (phoneBox) phoneBox.hidden = !isDesktopViewport();
    openSubmodal('link');
    if (isDesktopViewport()) startSmmLinkPhoneBridge();
    if (input) setTimeout(function () { input.focus(); }, 0);
  }

  function applySmmPhoneLinkValue(value) {
    var urlInput = document.getElementById('smm-media-link-url');
    var phoneStatus = document.getElementById('smm-link-phone-status');
    if (urlInput) {
      urlInput.value = value;
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_received', 'Link received from phone');
    submitSmmLinkExtract();
  }

  function pollSmmLinkPhoneSession(sessionId, ownerId) {
    var base = phoneBridgeApiBase();
    var u =
      base +
      '/api/creator-phone-upload/session?id=' +
      encodeURIComponent(sessionId) +
      '&owner_id=' +
      encodeURIComponent(ownerId);
    fetchPhoneBridgeJson(u, { credentials: 'omit' })
      .then(function (res) {
        var data = res.data;
        if (!data || !data.ok || linkPhoneSessionId !== sessionId) return;
        if (data.status === 'completed' && data.value) {
          stopLinkPhoneBridge();
          applySmmPhoneLinkValue(data.value);
        } else if (data.status === 'expired') {
          stopLinkPhoneBridge();
        }
      })
      .catch(function () {});
  }

  function startSmmLinkPhoneBridge() {
    var box = document.getElementById('smm-link-phone');
    var qrImg = document.getElementById('smm-link-qr-img');
    var phoneStatus = document.getElementById('smm-link-phone-status');
    if (!box || !isDesktopViewport()) return;
    stopLinkPhoneBridge();
    if (qrImg) {
      qrImg.removeAttribute('src');
      qrImg.alt = '';
    }
    var ownerId = getOwnerId();
    if (!ownerId) {
      if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      return;
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_starting', 'Preparing phone scan…');
    var base = phoneBridgeApiBase();
    fetchPhoneBridgeJson(base + '/api/creator-phone-upload/session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_id: ownerId, purpose: 'video_link' })
    })
      .then(function (res) {
        var session = res.data;
        if (!res.httpOk || !session || !session.ok || !session.session_id) {
          if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
          return;
        }
        linkPhoneSessionId = session.session_id;
        if (qrImg) {
          qrImg.alt = 'Phone scan QR';
          qrImg.src =
            base +
            '/api/creator-phone-upload/qr-image?session=' +
            encodeURIComponent(session.session_id) +
            '&t=' +
            String(Date.now());
        }
        if (phoneStatus) phoneStatus.textContent = i18n('link_phone_ready', 'Scan the QR code with your phone');
        linkPhonePollTimer = setInterval(function () {
          pollSmmLinkPhoneSession(session.session_id, ownerId);
        }, 2000);
        pollSmmLinkPhoneSession(session.session_id, ownerId);
      })
      .catch(function () {
        if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      });
  }

  function detectMediaKind(url) {
    var lower = String(url || '').toLowerCase();
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower) || lower.indexOf('video') !== -1) return 'video';
    return 'image';
  }

  function submitSmmLinkExtract() {
    var input = document.getElementById('smm-media-link-url');
    var raw = input ? String(input.value || '').trim() : '';
    if (!raw || !/^https?:\/\//i.test(raw)) {
      setSmmLinkStatus(i18n('link_error_invalid_url', 'Please enter a valid URL.'), '');
      linkExtracted = null;
      setSmmDownloadEnabled(false);
      showSmmLinkPreview(null);
      return;
    }
    var kind = detectMediaKind(raw);
    linkExtracted = { url: raw, kind: kind };
    setSmmLinkStatus(i18n('link_extract_ready', 'Ready — tap Download to import.'), 'is-success');
    setSmmDownloadEnabled(true);
    showSmmLinkPreview(raw, kind);
  }

  async function submitSmmLinkDownload() {
    if (!linkExtracted || !linkExtracted.url) {
      submitSmmLinkExtract();
      if (!linkExtracted) return;
    }
    var raw = linkExtracted.url;
    var kind = linkExtracted.kind || detectMediaKind(raw);
    setSmmLinkStatus(i18n('link_downloading', 'Downloading…'), 'is-info');
    setSmmDownloadEnabled(false);
    var owner = getOwnerId();
    try {
      if (owner) {
        var res = await fetch(apiUrl('video-studio-link-ingest'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            owner_id: owner,
            url: raw,
            format: kind === 'video' ? 'mp4' : 'image'
          })
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (data.ok && data.asset && data.asset.url) {
          applyComposeAsset({
            id: data.asset.id || 'link_' + Date.now(),
            source: 'link',
            kind: data.asset.kind === 'video' || kind === 'video' ? 'video' : 'image',
            url: data.asset.url,
            label: data.asset.label || 'link',
            caption_hint: data.asset.caption_hint || null,
            link_url: data.asset.link_url || '',
            product_ids: data.asset.product_ids || [],
            product_urls: data.asset.product_urls || []
          });
          return;
        }
      }
      applyComposeAsset({
        id: 'link_' + Date.now(),
        source: 'link',
        kind: kind,
        url: raw,
        label: 'link'
      });
    } catch (e) {
      applyComposeAsset({
        id: 'link_' + Date.now(),
        source: 'link',
        kind: kind,
        url: raw,
        label: 'link'
      });
    }
  }

  function bindAssetSourceUi() {
    function on(id, evt, fn) {
      var el = document.getElementById(id);
      if (el && !el._smmBound) {
        el._smmBound = true;
        el.addEventListener(evt, fn);
      }
    }

    on('smm-addsrc-assets', 'click', function () {
      openAssetsLibraryModal();
    });
    on('smm-addsrc-device', 'click', function () {
      var input = document.getElementById('smm-source-file');
      if (input) input.click();
    });
    on('smm-addsrc-phone', 'click', function () {
      if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
        window.CreatorPhoneUploadModal.open({ purpose: 'social-media-manager' });
      }
    });
    on('smm-addsrc-link', 'click', function () {
      openLinkModal();
    });
    on('smm-link-extract', 'click', submitSmmLinkExtract);
    on('smm-link-submit', 'click', function () {
      submitSmmLinkDownload();
    });
    on('smm-media-link-url', 'keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitSmmLinkExtract();
      }
    });

    var fileInput = document.getElementById('smm-source-file');
    if (fileInput && !fileInput._smmBound) {
      fileInput._smmBound = true;
      fileInput.addEventListener('change', async function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          var isVideo = String(file.type || '').indexOf('video/') === 0;
          var fd = new FormData();
          if (isVideo) {
            fd.append('video', file, file.name || 'upload.mp4');
          } else {
            fd.append('image', file, file.name || 'upload.jpg');
          }
          var op = isVideo ? 'upload-video-motion-ref' : 'upload-hero-image';
          var url = apiUrl(op) + (isVideo ? '' : '&slot=smm_compose');
          var res = await fetch(url, { method: 'POST', credentials: 'include', body: fd });
          var data = await res.json().catch(function () {
            return {};
          });
          var assetUrl = data.url || data.image_url || data.public_url || '';
          if (!data.ok || !assetUrl) {
            throw new Error(data.error || i18n('error_load_assets', 'Upload failed.'));
          }
          applyComposeAsset({
            id: data.id || 'upload_' + Date.now(),
            source: 'upload',
            kind: isVideo ? 'video' : 'image',
            url: assetUrl,
            label: file.name || (isVideo ? 'video' : 'image')
          });
        } catch (err) {
          try {
            console.warn('[SocialMediaManager] device upload failed', err);
          } catch (eLog) {}
        } finally {
          fileInput.value = '';
        }
      });
    }

    window.__eazSmmPhoneApply = function (imageUrl) {
      var smmRoot = document.getElementById('creatorSocialMediaManagerModal');
      if (!smmRoot || smmRoot.hidden || !imageUrl) return false;
      applyComposeAsset({
        id: 'phone_' + Date.now(),
        source: 'phone',
        kind: 'image',
        url: String(imageUrl),
        label: 'phone'
      });
      return true;
    };
  }

  function getSelectedTargetsFromComposer() {
    var destination = getFacebookDestination();
    return (compose.targets || []).filter(function (t) {
      if (!isTargetAvailableForCompose(t) || !t.publish_ready || !isChannelEnabled(t.channel)) {
        return false;
      }
      if (t.channel === 'facebook') {
        var isShare = isFacebookProfileShareTarget(t);
        if (compose.scheduleEnabled && isShare) return false;
        if (destination === 'pages' && isShare) return false;
        if (destination === 'profile' && !isShare) return false;
      }
      return true;
    });
  }

  function formatChannelSettingsSummary(ch) {
    if (ch === 'facebook') {
      var destination = getFacebookDestination();
      var destLabel =
        destination === 'profile'
          ? i18n('facebook_destination_profile', 'My profile (Share dialog)')
          : destination === 'both'
            ? i18n('facebook_destination_both', 'Pages + my profile')
            : i18n('facebook_destination_pages', 'Connected pages');
      if (destination === 'profile') return destLabel;
      var postType = (compose.channelSettings.facebook && compose.channelSettings.facebook.post_type) || 'photo';
      var typeLabel =
        postType === 'link'
          ? i18n('facebook_post_link', 'Link post')
          : i18n('facebook_post_photo', 'Photo post');
      return destLabel + ' · ' + typeLabel;
    }
    if (ch === 'tiktok') {
      var privacy =
        (compose.channelSettings.tiktok && compose.channelSettings.tiktok.privacy_level) || 'SELF_ONLY';
      return i18n('tiktok_privacy', 'Privacy') + ': ' + privacy.replace(/_/g, ' ');
    }
    return '';
  }

  function getEnabledChannelsForConfirm() {
    var seen = {};
    var out = [];
    getSelectedTargetsFromComposer().forEach(function (t) {
      if (!t.channel || seen[t.channel]) return;
      seen[t.channel] = true;
      out.push(t.channel);
    });
    return out;
  }

  function formatPublishFailureMessage(data) {
    if (!data) return i18n('error_submit', 'Could not submit post.');
    if (data.message) return String(data.message);
    if (data.error) return String(data.error);
    var refs = data.external_refs || {};
    var parts = [];
    Object.keys(refs).forEach(function (key) {
      var ref = refs[key];
      if (!ref || ref.ok) return;
      parts.push(String(ref.message || ref.detail || ref.error || key));
    });
    return parts.length ? parts.join(' · ') : i18n('error_submit', 'Could not submit post.');
  }

  function renderConfirmSummary() {
    var wrap = $('#smm-confirm-summary');
    if (!wrap) return;
    var captionEl = $('#smm-caption');
    var linkEl = $('#smm-link-url');
    var caption = captionEl ? String(captionEl.value || '').trim() : '';
    var linkUrl = linkEl ? String(linkEl.value || '').trim() : '';
    var assetLabel = compose.asset
      ? (compose.asset.label || compose.asset.kind || 'asset') +
        (compose.asset.kind ? ' (' + compose.asset.kind + ')' : '')
      : i18n('confirm_summary_none', '—');
    var enabledChannels = getEnabledChannelsForConfirm();
    var channelLines = enabledChannels
      .map(function (ch) {
        var settings = formatChannelSettingsSummary(ch);
        return settings ? channelLabel(ch) + ' — ' + settings : channelLabel(ch);
      })
      .join('<br>');
    var scheduleText = i18n('confirm_summary_immediate', 'Post now');
    if (compose.scheduleEnabled) {
      var schedInput = $('#smm-schedule-at');
      var localVal = schedInput ? String(schedInput.value || '').trim() : '';
      scheduleText = localVal || i18n('confirm_summary_none', '—');
    }
    wrap.innerHTML =
      '<dl class="smm-confirm-summary__list">' +
      '<div><dt>' +
      esc(i18n('confirm_summary_asset', 'Asset')) +
      '</dt><dd>' +
      esc(assetLabel) +
      '</dd></div>' +
      '<div><dt>' +
      esc(i18n('confirm_summary_caption', 'Caption')) +
      '</dt><dd>' +
      esc(caption || i18n('confirm_summary_none', '—')) +
      '</dd></div>' +
      '<div><dt>' +
      esc(i18n('confirm_summary_link', 'Link')) +
      '</dt><dd>' +
      esc(linkUrl || i18n('confirm_summary_none', '—')) +
      '</dd></div>' +
      '<div><dt>' +
      esc(i18n('confirm_summary_channels', 'Channels')) +
      '</dt><dd>' +
      (channelLines || esc(i18n('confirm_summary_none', '—'))) +
      '</dd></div>' +
      '<div><dt>' +
      esc(i18n('confirm_summary_schedule', 'Schedule')) +
      '</dt><dd>' +
      esc(scheduleText) +
      '</dd></div></dl>';
  }

  function openTargetConfirmModal() {
    compose.confirmMode = compose.scheduleEnabled ? 'schedule' : 'post';
    var selected = getSelectedTargetsFromComposer();
    var hasProfileShare = selected.some(function (t) {
      return isFacebookProfileShareTarget(t);
    });
    var onlyProfileShare = selected.length > 0 && selected.every(function (t) {
      return isFacebookProfileShareTarget(t);
    });
    var title = $('#smm-target-confirm-title');
    var submitBtn = $('#smm-btn-confirm-submit');
    if (title) {
      title.textContent = compose.scheduleEnabled
        ? i18n('confirm_schedule_title', 'Schedule post')
        : onlyProfileShare
          ? i18n('confirm_share_profile_title', 'Share to Facebook profile')
          : i18n('confirm_post_title', 'Confirm post');
    }
    if (submitBtn) {
      submitBtn.textContent = compose.scheduleEnabled
        ? i18n('btn_confirm_schedule', 'Confirm & schedule')
        : onlyProfileShare
          ? i18n('btn_confirm_share_profile', 'Open Facebook share')
          : hasProfileShare
            ? i18n('btn_confirm_post_and_share', 'Post & open profile share')
            : i18n('btn_confirm_post', 'Confirm & post');
    }
    var status = $('#smm-target-status');
    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    renderConfirmSummary();
    openSubmodal('target');
  }

  function defaultScheduleLocalValue() {
    var d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  async function submitNewPost() {
    var owner = getOwnerId();
    if (!owner) return;
    if (!compose.asset || !compose.asset.url) {
      setNewPostStatus(i18n('error_pick_asset', 'Choose an asset first.'), 'error');
      return;
    }
    var targets = getSelectedTargetsFromComposer();
    if (!targets.length) {
      var status = $('#smm-target-status');
      if (status) {
        status.hidden = false;
        status.className = 'smm-submodal__status is-error';
        status.textContent = i18n('error_pick_targets', 'Select at least one publishable account.');
      }
      return;
    }

    var captionEl = $('#smm-caption');
    var linkEl = $('#smm-link-url');
    var caption = captionEl ? String(captionEl.value || '').trim() : '';
    var linkUrl = linkEl ? String(linkEl.value || '').trim() : '';
    var payload = {
      owner_id: owner,
      caption: caption,
      link_url: linkUrl,
      media_url: compose.asset.url,
      media_kind: getMediaKind(),
      asset_source: compose.asset.source || '',
      asset_id: compose.asset.id || '',
      targets: targets,
      channel_settings: compose.channelSettings,
      mode: compose.confirmMode
    };

    if (compose.confirmMode === 'schedule') {
      var schedInput = $('#smm-schedule-at');
      var localVal = schedInput ? String(schedInput.value || '').trim() : '';
      if (!localVal) {
        var st = $('#smm-target-status');
        if (st) {
          st.hidden = false;
          st.className = 'smm-submodal__status is-error';
          st.textContent = i18n('error_schedule_time', 'Pick a date and time.');
        }
        return;
      }
      payload.scheduled_at = new Date(localVal).toISOString();
    }

    var submitBtn = $('#smm-btn-confirm-submit');
    if (submitBtn) submitBtn.disabled = true;
    var modalStatus = $('#smm-target-status');
    if (modalStatus) {
      modalStatus.hidden = false;
      modalStatus.className = 'smm-submodal__status';
      modalStatus.textContent = i18n('submitting', 'Submitting…');
    }

    try {
      var res = await fetch(apiUrl('creator-social-posts-create'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok) {
        closeSubmodal('target');
        if (compose.confirmMode === 'post' && Array.isArray(data.share_dialogs) && data.share_dialogs.length) {
          openFacebookShareDialogs(data.share_dialogs);
        }
        setNewPostStatus(
          data.message ||
            (compose.confirmMode === 'schedule'
              ? i18n('scheduled_ok', 'Post scheduled.')
              : i18n('posted_ok', 'Post published.')),
          'success'
        );
        if (compose.confirmMode === 'post' && data.partial) {
          setNewPostStatus(i18n('posted_partial', 'Published to some channels — check Manage Posts for details.'), 'success');
        }
      } else {
        if (modalStatus) {
          modalStatus.className = 'smm-submodal__status is-error';
          modalStatus.textContent = formatPublishFailureMessage(data);
        }
        setNewPostStatus(formatPublishFailureMessage(data), 'error');
      }
    } catch (e) {
      if (modalStatus) {
        modalStatus.className = 'smm-submodal__status is-error';
        modalStatus.textContent = i18n('error_network', 'Network error. Please try again.');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function onSubmodalClick(e) {
    var closeAttr = e.target && e.target.closest ? e.target.closest('[data-smm-close]') : null;
    if (!closeAttr || !root || !root.contains(closeAttr)) return;
    var which = closeAttr.getAttribute('data-smm-close');
    if (
      which === 'addMedia' ||
      which === 'asset' ||
      which === 'link' ||
      which === 'target' ||
      which === 'disconnect'
    ) {
      e.preventDefault();
      if (which === 'disconnect') resolveDisconnectConfirm(false);
      else if (which === 'link') closeLinkModal();
      else closeSubmodal(which);
    }
  }

  function bindNewPostUi() {
    if (!root || root._smmNewPostBound) return;
    root._smmNewPostBound = true;

    function bindSectionToggle(sectionId) {
      var toggle = document.getElementById('smm-' + sectionId + '-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', function () {
        var section = document.getElementById('smm-section-' + sectionId);
        if (!section) return;
        if (sectionId === 'schedule' && !compose.scheduleEnabled) return;
        setSectionCollapsed(sectionId, !section.classList.contains('is-collapsed'));
      });
    }
    bindSectionToggle('channels');
    bindSectionToggle('schedule');

    var settingsToggle = $('#smm-settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', function () {
        var settings = $('#smm-new-post-settings');
        var stage = $('#smm-new-post-stage');
        if (!settings) return;
        var collapsed = settings.classList.toggle('is-collapsed');
        if (stage) stage.classList.toggle('is-settings-collapsed', collapsed);
        settingsToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        settingsToggle.textContent = collapsed ? '‹' : '›';
      });
    }

    var composer = $('#smm-new-post-composer');
    if (composer && !composer._smmViewerBound) {
      composer._smmViewerBound = true;
      composer.addEventListener('click', function (e) {
        var chooseBtn = e.target && e.target.closest ? e.target.closest('#smm-btn-choose-asset') : null;
        if (chooseBtn && composer.contains(chooseBtn)) {
          e.preventDefault();
          openAddMediaModal();
        }
      });
    }

    var scroll = $('#smm-new-post-scroll');
    if (scroll && !scroll._smmComposeBound) {
      scroll._smmComposeBound = true;
      scroll.addEventListener('click', function (e) {
        var expandBtn =
          e.target && e.target.closest ? e.target.closest('[data-smm-channel-expand]') : null;
        if (expandBtn && scroll.contains(expandBtn) && !expandBtn.disabled) {
          e.preventDefault();
          var chEx = expandBtn.getAttribute('data-smm-channel-expand');
          if (!isChannelEnabled(chEx)) return;
          compose.expandedChannel = compose.expandedChannel === chEx ? null : chEx;
          renderChannelCarousel();
        }
      });
      scroll.addEventListener('change', function (e) {
        var enableInput = e.target && e.target.getAttribute
          ? e.target
          : null;
        if (
          !enableInput ||
          !enableInput.getAttribute ||
          !enableInput.getAttribute('data-smm-channel-enable')
        ) {
          return;
        }
        if (!scroll.contains(enableInput)) return;
        var chEn = enableInput.getAttribute('data-smm-channel-enable');
        compose.channelEnabled[chEn] = !!enableInput.checked;
        if (!enableInput.checked && compose.expandedChannel === chEn) {
          compose.expandedChannel = null;
        }
        renderChannelCarousel();
      });
    }

    var scheduleEnable = $('#smm-schedule-enable');
    if (scheduleEnable) {
      scheduleEnable.addEventListener('change', function () {
        setScheduleEnabled(!!scheduleEnable.checked);
      });
    }

    var postBtn = $('#smm-btn-post-now');
    if (postBtn) {
      postBtn.addEventListener('click', function () {
        openTargetConfirmModal();
      });
    }

    var confirmBtn = $('#smm-btn-confirm-submit');
    if (confirmBtn) confirmBtn.addEventListener('click', submitNewPost);

    root.addEventListener('click', onSubmodalClick);
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
    /* Escape portal shells that create a containing block for position:fixed */
    try {
      if (root.parentElement !== document.body) {
        document.body.appendChild(root);
      }
    } catch (eMove) {}
    bindUi();
    bindNewPostUi();
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
    closeLinkModal();
    closeSubmodal('asset');
    closeSubmodal('addMedia');
    closeSubmodal('target');
    stopOAuthWatch();
    try {
      document.body.classList.remove('smm-modal-open');
    } catch (e) {}
  }

  function bindUi() {
    root = document.getElementById('creatorSocialMediaManagerModal');
    if (!root || root._smmBound) return;
    root._smmBound = true;
    bindAssetSourceUi();

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
        var body = root.querySelector('.smm-body');
        if (!sidebar) return;
        var collapsed = sidebar.classList.toggle('is-collapsed');
        if (body) body.classList.toggle('is-sidebar-collapsed', collapsed);
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

    var disconnectConfirmBtn = $('#smm-btn-disconnect-confirm');
    if (disconnectConfirmBtn) {
      disconnectConfirmBtn.addEventListener('click', function () {
        resolveDisconnectConfirm(true);
      });
    }

    bindNewPostUi();

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!root || root.hidden) return;
      var linkModal = document.getElementById('smm-link-modal');
      var assetModal = document.getElementById('smm-asset-picker');
      var addMediaModal = document.getElementById('smm-add-media');
      var disconnectModal = document.getElementById('smm-disconnect-confirm');
      var targetModal = document.getElementById('smm-target-confirm');
      if (linkModal && !linkModal.hidden) {
        closeLinkModal();
        return;
      }
      if (assetModal && !assetModal.hidden) {
        closeSubmodal('asset');
        return;
      }
      if (disconnectModal && !disconnectModal.hidden) {
        resolveDisconnectConfirm(false);
        return;
      }
      if (targetModal && !targetModal.hidden) {
        closeSubmodal('target');
        return;
      }
      if (addMediaModal && !addMediaModal.hidden) {
        closeAddMediaModal();
        return;
      }
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
