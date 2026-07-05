/**
 * My Designs Modal (dev prototype)
 * Shows user's designs in a grid. On select: adds to reference images.
 */
(function () {
  'use strict';

  var designs = [];
  var filteredDesigns = [];
  /** @type {null|function()} */
  var myDesignsLayerRestore = null;

  function getApiBase() {
    return window.CreatorWidget?.apiBaseUrl || 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID !== null && String(window.__EAZ_OWNER_ID).trim() !== '') {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    if (window.Shopify && window.Shopify.customerId) {
      return String(window.Shopify.customerId);
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta) {
      var mc = (meta.getAttribute('content') || '').trim();
      if (mc) return mc;
    }
    var el = document.querySelector('input[id^="ownerId-"]');
    if (el && el.value) return el.value.trim();
    if (window.CreatorWidget && window.CreatorWidget.ownerId) {
      return String(window.CreatorWidget.ownerId);
    }
    var w = document.querySelector('[id^="creator-widget-"]');
    if (w && w.id) {
      var sid = w.id.replace('creator-widget-', '');
      if (sid && window.CreatorWidgetConfig && window.CreatorWidgetConfig[sid] && window.CreatorWidgetConfig[sid].owner_id != null) {
        return String(window.CreatorWidgetConfig[sid].owner_id);
      }
    }
    return null;
  }

  function open() {
    var overlay = document.getElementById('genMyDesignsOverlay');
    if (!overlay) return;

    myDesignsLayerRestore = null;
    if (typeof window.eazReparentIntoCreatorAutomationLayer === 'function') {
      myDesignsLayerRestore = window.eazReparentIntoCreatorAutomationLayer(overlay);
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');

    var grid = document.getElementById('genMyDesignsGrid');
    var loading = document.getElementById('genMyDesignsLoading');
    var empty = document.getElementById('genMyDesignsEmpty');

    if (grid) grid.innerHTML = '';
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';

    fetchDesigns().then(function (items) {
      designs = items;
      filterDesigns(document.getElementById('genMyDesignsSearch')?.value || '');
      renderGrid();
      if (loading) loading.style.display = 'none';
    }).catch(function () {
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = 'Error loading designs.';
      }
    });
  }

  function close() {
    var overlay = document.getElementById('genMyDesignsOverlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (myDesignsLayerRestore) {
      try {
        myDesignsLayerRestore();
      } catch (eR) {}
      myDesignsLayerRestore = null;
    }
  }

  function normalizeGenerated(item) {
    return {
      id: null,
      job_id: item.job_id || null,
      image_url: item.image_url || null,
      preview_url: item.preview_url || item.image_url || null,
      original_url: item.image_url || null,
      title: item.prompt || item.design_prompt || ('Design ' + (item.job_id || '')),
      created_at: item.created_at || item.finished || 0,
      source: 'generated'
    };
  }

  function normalizeSaved(item) {
    var meta = item.metadata;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch (_e) {
        meta = null;
      }
    }
    return {
      id: String(item.id || ''),
      job_id: item.job_id || null,
      image_url: item.original_url || item.preview_url || null,
      preview_url: item.preview_url || item.original_url || null,
      original_url: item.original_url || item.preview_url || null,
      title: item.title || item.prompt || ('Design #' + (item.id || '')),
      created_at: item.updated_at || item.created_at || 0,
      source: 'saved',
      metadata: meta,
      design_type: (meta && meta.design_type) || null
    };
  }

  async function fetchDesigns() {
    var owner = getOwnerId();
    if (!owner) return [];
    var savedJobIds = new Set();
    try {
      var base = getApiBase();
      var listUrl = base + '?op=list&owner_id=' + encodeURIComponent(owner) + '&limit=100';
      var genUrl = base + '?op=list-generated&path_prefix=/apps/creator-dispatch&owner_id=' + encodeURIComponent(owner) + '&limit=200';
      var resList = await fetch(listUrl, { credentials: 'include' });
      var dataList = await resList.json().catch(function () { return { ok: false, items: [] }; });
      var resGen = await fetch(genUrl, { credentials: 'include' });
      var dataGen = await resGen.json().catch(function () { return { ok: false, items: [] }; });
      var saved = (dataList.ok && dataList.items) ? dataList.items : [];
      var generated = (dataGen.ok && dataGen.items) ? dataGen.items : [];
      saved.forEach(function (s) { if (s.job_id) savedJobIds.add(s.job_id); });
      var merged = saved.map(normalizeSaved);
      generated.forEach(function (g) {
        if (!savedJobIds.has(g.job_id)) merged.push(normalizeGenerated(g));
      });
      merged.sort(function (a, b) {
        var ta = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : (a.created_at || 0);
        var tb = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : (b.created_at || 0);
        return tb - ta;
      });
      return merged;
    } catch (_e) {
      return [];
    }
  }

  function filterDesigns(query) {
    if (!query || !query.trim()) {
      filteredDesigns = designs.slice();
    } else {
      var q = query.trim().toLowerCase();
      filteredDesigns = designs.filter(function (d) {
        return (d.title || '').toLowerCase().indexOf(q) >= 0 || (d.prompt || '').toLowerCase().indexOf(q) >= 0;
      });
    }
  }

  function renderGrid() {
    var grid = document.getElementById('genMyDesignsGrid');
    var empty = document.getElementById('genMyDesignsEmpty');
    var countEl = document.getElementById('genMyDesignsCount');
    if (!grid) return;
    grid.innerHTML = '';

    if (filteredDesigns.length === 0) {
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = designs.length === 0 ? 'No designs found.' : 'No search results.';
      }
      grid.style.display = 'none';
    } else {
      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      filteredDesigns.forEach(function (design) {
        var card = document.createElement('div');
        card.className = 'gen-my-designs-card';
        card.dataset.designId = design.id || '';
        card.dataset.jobId = design.job_id || '';
        var url = design.preview_url || design.original_url || design.image_url;
        if (url) {
          var img = document.createElement('img');
          img.src = url;
          img.alt = design.title || 'Design';
          img.loading = 'lazy';
          card.appendChild(img);
        } else {
          var noImg = document.createElement('div');
          noImg.className = 'gen-my-designs-card-noimg';
          noImg.textContent = '—';
          card.appendChild(noImg);
        }
        card.addEventListener('click', function () {
          var imageUrl = design.preview_url || design.original_url || design.image_url;
          if (imageUrl) {
            window.dispatchEvent(
              new CustomEvent('gen-design-selected', {
                detail: {
                  imageUrl: imageUrl,
                  designType: design.design_type || (design.metadata && design.metadata.design_type) || null,
                  parentDesignId: design.id || null
                }
              })
            );
            close();
          }
        });
        grid.appendChild(card);
      });
    }

    if (countEl) countEl.textContent = filteredDesigns.length + ' design' + (filteredDesigns.length !== 1 ? 's' : '');
  }

  function bind() {
    var overlay = document.getElementById('genMyDesignsOverlay');
    var closeBtn = document.getElementById('genMyDesignsClose');
    var searchInput = document.getElementById('genMyDesignsSearch');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    if (searchInput) {
      var debounceTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          filterDesigns(searchInput.value);
          renderGrid();
        }, 300);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.GenMyDesignsModal = {
    open: open,
    close: close
  };
})();
