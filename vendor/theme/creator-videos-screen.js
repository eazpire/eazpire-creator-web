/**
 * Content Publish – Videos grid (mobile + desktop marketing panels)
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) return String(window.__EAZ_OWNER_ID);
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  async function fetchVideos() {
    var owner = getOwnerId();
    if (!owner) return [];
    try {
      var url = API_BASE + '?op=creator-videos-list&owner_id=' + encodeURIComponent(owner) + '&limit=100';
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () { return { ok: false, items: [] }; });
      if (!data.ok || !Array.isArray(data.items)) return [];
      return data.items;
    } catch (e) {
      console.warn('[CreatorVideosScreen] fetch error:', e);
      return [];
    }
  }

  function createVideoCard(item) {
    var card = document.createElement('div');
    card.className = 'creator-hero-image-card';
    var thumb = item.thumbnail_url || item.video_url;
    if (thumb) {
      var img = document.createElement('img');
      img.src = thumb;
      img.alt = item.user_prompt || 'Video';
      img.loading = 'lazy';
      card.appendChild(img);
    }
    var badge = document.createElement('div');
    badge.style.cssText = 'position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;';
    badge.textContent = '▶';
    card.style.position = 'relative';
    card.appendChild(badge);
    card.addEventListener('click', function () {
      if (item.video_url) window.open(item.video_url, '_blank', 'noopener');
    });
    return card;
  }

  function renderGrid(wrap) {
    if (!wrap) return;
    var loading = wrap.querySelector('[id$="VideosLoading"]');
    var empty = wrap.querySelector('[id$="VideosEmpty"]');
    var grid = wrap.querySelector('[id$="VideosGrid"]');
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (grid) grid.innerHTML = '';

    fetchVideos().then(function (items) {
      if (loading) loading.style.display = 'none';
      if (!grid) return;
      if (!items.length) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';
      items.forEach(function (it) {
        grid.appendChild(createVideoCard(it));
      });
    });
  }

  function isMarketingVideosWorkspaceActive() {
    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport) {
      if (!viewport.classList.contains('slide-3')) return false;
      var pub = document.getElementById('creatorMarketingPanelPublish');
      if (pub && pub.classList.contains('creator-marketing-panel--hidden')) return false;
      var vid = document.querySelector('[data-content="videos"].is-active');
      return !!vid;
    }
    var desktopHero = document.getElementById('creatorDesktopHero');
    if (desktopHero) {
      if (String(desktopHero.getAttribute('data-desktop-active-screen') || '').toLowerCase() !== 'marketing') {
        return false;
      }
    }
    return !!document.querySelector(
      '#creatorDesktopMarketingHost [data-content="videos"].is-active, #creatorMarketing [data-content="videos"].is-active'
    );
  }

  function loadAll() {
    if (!isMarketingVideosWorkspaceActive()) return;
    var m = document.getElementById('creatorVideosPublishPanel');
    var d = document.getElementById('creatorDesktopVideosPublishPanel');
    if (m) renderGrid(m);
    if (d) renderGrid(d);
  }

  window.CreatorVideosScreen = {
    load: loadAll,
    refresh: loadAll,
    fetchVideos: fetchVideos,
  };
})();
