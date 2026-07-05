/**
 * Content Publish – Images tab (content_publish_images gallery)
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var items = [];
  var contexts = [];

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) return String(window.__EAZ_OWNER_ID);
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  function labelNoImages() {
    try {
      var m = window.CreatorI18n && window.CreatorI18n.marketing && window.CreatorI18n.marketing.no_publish_images;
      if (m) return String(m);
    } catch (e) {}
    return 'No saved images yet.';
  }

  async function fetchItems() {
    var owner = getOwnerId();
    if (!owner) return [];
    try {
      var res = await fetch(
        API_BASE + '?op=list-content-publish-images&owner_id=' + encodeURIComponent(owner) + '&limit=100',
        { credentials: 'include' }
      );
      var data = await res.json().catch(function () { return { ok: false, items: [] }; });
      if (!data.ok || !Array.isArray(data.items)) return [];
      return data.items;
    } catch (e) {
      console.warn('[ContentPublishImagesScreen]', e);
      return [];
    }
  }

  function createCard(item) {
    var card = document.createElement('div');
    card.className = 'creator-hero-image-card';
    var url = item.thumbnail_url || item.image_url;
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      card.appendChild(img);
    } else {
      var no = document.createElement('div');
      no.className = 'creator-hero-image-card-noimg';
      no.textContent = '—';
      card.appendChild(no);
    }
    card.addEventListener('click', function () {
      var openUrl = item.image_url || url;
      if (openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer');
    });
    return card;
  }

  function renderGrid(ctx) {
    var grid = ctx.grid;
    var empty = ctx.empty;
    var loading = ctx.loading;
    if (!grid) return;
    if (loading) loading.style.display = 'none';

    grid.innerHTML = '';
    if (items.length === 0) {
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = labelNoImages();
      }
      return;
    }
    if (empty) empty.style.display = 'none';
    items.forEach(function (it) {
      grid.appendChild(createCard(it));
    });
  }

  async function load() {
    var hasCtx = contexts && contexts.length > 0;
    if (hasCtx) {
      contexts.forEach(function (ctx) {
        if (ctx.loading) ctx.loading.style.display = 'block';
      });
    }
    items = await fetchItems();
    if (!hasCtx) return;
    contexts.forEach(function (ctx) {
      renderGrid(ctx);
    });
  }

  function registerContext(grid, empty, loading) {
    if (!grid) return;
    contexts.push({ grid: grid, empty: empty || null, loading: loading || null });
  }

  function bind() {
    registerContext(
      document.getElementById('creatorPublishImagesGrid'),
      document.getElementById('creatorPublishImagesEmpty'),
      document.getElementById('creatorPublishImagesLoading')
    );
    registerContext(
      document.getElementById('creatorDesktopPublishImagesGrid'),
      document.getElementById('creatorDesktopPublishImagesEmpty'),
      document.getElementById('creatorDesktopPublishImagesLoading')
    );

    document.querySelectorAll('.creator-marketing-under-tab[data-content="images"], .creator-desktop-marketing-under-tab[data-content="images"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(function () { load(); }, 120);
      });
    });
    document.querySelectorAll('.creator-marketing-tab[data-subtab="content-publish"], .creator-desktop-marketing-tab[data-subtab="content-publish"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(function () { load(); }, 150);
      });
    });

    setTimeout(load, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.ContentPublishImagesScreen = {
    load: load,
    bind: bind
  };
})();
