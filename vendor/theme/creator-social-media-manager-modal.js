/**
 * Creator Social Media Manager modal (IDEA-040 Phase A) — shell + Connect stubs
 */
(function () {
  'use strict';

  var root = null;
  var currentNav = 'overview';

  /** Locked product channel list (Phase A: Offline unless wired later). */
  var CHANNELS = [
    { id: 'facebook', labelKey: 'channel_facebook', label: 'Facebook', short: 'f' },
    { id: 'instagram', labelKey: 'channel_instagram', label: 'Instagram', short: 'Ig' },
    { id: 'threads', labelKey: 'channel_threads', label: 'Threads', short: '@' },
    { id: 'tiktok', labelKey: 'channel_tiktok', label: 'TikTok', short: 'Tk' },
    { id: 'youtube', labelKey: 'channel_youtube', label: 'YouTube', short: 'YT' },
    { id: 'snapchat', labelKey: 'channel_snapchat', label: 'Snapchat', short: 'Sc' },
    { id: 'pinterest', labelKey: 'channel_pinterest', label: 'Pinterest', short: 'P' },
    { id: 'tumblr', labelKey: 'channel_tumblr', label: 'Tumblr', short: 't' },
    { id: 'linkedin', labelKey: 'channel_linkedin', label: 'LinkedIn', short: 'in' },
    { id: 'mastodon', labelKey: 'channel_mastodon', label: 'Mastodon', short: 'M' },
    { id: 'bluesky', labelKey: 'channel_bluesky', label: 'Bluesky', short: 'bsky' }
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

  function $(sel, el) {
    return (el || root).querySelector(sel);
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
  }

  function renderConnectGrid() {
    var grid = $('#smm-connect-grid');
    if (!grid || grid._smmRendered) return;
    grid._smmRendered = true;
    var offlineLabel = i18n('status_offline', 'Offline');
    var onlineLabel = i18n('status_online', 'Online');
    var html = '';
    CHANNELS.forEach(function (ch) {
      var name = i18n(ch.labelKey, ch.label);
      // Phase A: all Offline; Online glow class reserved for future OAuth
      var online = false;
      html +=
        '<div class="smm-channel-card ' + (online ? 'is-online' : 'is-offline') + '" data-smm-channel="' + ch.id + '">' +
        '<span class="smm-channel-card__logo smm-channel-card__logo--' + ch.id + '" aria-hidden="true">' + ch.short + '</span>' +
        '<span class="smm-channel-card__name">' + name + '</span>' +
        '<span class="smm-channel-card__status">' + (online ? onlineLabel : offlineLabel) + '</span>' +
        '</div>';
    });
    grid.innerHTML = html;
  }

  function open(opts) {
    opts = opts || {};
    bindUi();
    root = document.getElementById('creatorSocialMediaManagerModal');
    if (!root) return;
    renderConnectGrid();
    setNav(opts.nav || 'overview');
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    try { document.body.classList.add('smm-modal-open'); } catch (e) {}
  }

  function close() {
    root = document.getElementById('creatorSocialMediaManagerModal');
    if (!root) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    closeDrawer();
    try { document.body.classList.remove('smm-modal-open'); } catch (e) {}
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi);
  } else {
    bindUi();
  }

  window.CreatorSocialMediaManager = {
    open: open,
    close: close,
    setNav: function (nav) {
      if (!root || root.hidden) open({ nav: nav });
      else setNav(nav);
    }
  };
})();
