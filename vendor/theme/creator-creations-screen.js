/**
 * Creations Screen – Designs | Products
 * Tab switching, toolbar (Suche, Filter, Upload), 3-column grid
 */
(function () {
  'use strict';

  var API_BASE = (function () {
    try {
      var h = window.location && window.location.hostname;
      if (h === 'www.eazpire.com' || h === 'eazpire.com') {
        return window.location.origin.replace(/\/$/, '') + '/__eaz/creator-dispatch';
      }
    } catch (e) {}
    if (window.CREATOR_API_CONFIG && typeof window.CREATOR_API_CONFIG.getDispatchUrl === 'function') {
      return window.CREATOR_API_CONFIG.getDispatchUrl();
    }
    return window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  })();
  var designs = [];

  var animationsReady = false;
  var animationsReadyPromise = null;
  /** Active ParticleReveal handles for grid cards — stopped before grid teardown. */
  var activeGridParticleAnims = [];

  function perf() {
    return window.CreatorPerfDebug || null;
  }

  function eazAnim(scope, key) {
    try {
      if (window.EazAnim && typeof window.EazAnim.isEnabled === 'function') {
        return window.EazAnim.isEnabled(scope, key);
      }
    } catch (_e) {}
    return false;
  }

  function whenAnimationsReady() {
    if (animationsReady) return Promise.resolve();
    if (animationsReadyPromise) return animationsReadyPromise;
    animationsReadyPromise = new Promise(function (resolve) {
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        animationsReady = true;
        resolve();
      }
      var timeoutId = setTimeout(done, 2000);
      if (window.EazAnim && typeof window.EazAnim.whenReady === 'function') {
        window.EazAnim.whenReady()
          .then(function () {
            clearTimeout(timeoutId);
            done();
          })
          .catch(function () {
            clearTimeout(timeoutId);
            done();
          });
      } else {
        clearTimeout(timeoutId);
        done();
      }
    });
    return animationsReadyPromise;
  }

  function canUseCreationsCardReveal() {
    if (!animationsReady) return false;
    return !!(eazAnim('creator', 'creations_card_reveal') && window.ParticleReveal);
  }

  function isMobileCreationsViewport() {
    try {
      return window.matchMedia && window.matchMedia('(max-width: 991px)').matches;
    } catch (_e) {}
    return true;
  }

  function applyCreationsGridPerfConstants() {
    var mobile = isMobileCreationsViewport();
    DESIGN_GRID_BATCH_SIZE = mobile ? 4 : 8;
    DESIGN_PARTICLE_MIN_INDEX = mobile ? 8 : 20;
    DESIGN_IMAGE_EAGER_COUNT = mobile ? 2 : 6;
    DESIGN_IMAGE_FETCH_PRIORITY_HIGH = 1;
    PRODUCT_GRID_BATCH_SIZE = mobile ? 4 : 8;
    PRODUCT_IMAGE_EAGER_COUNT = mobile ? 2 : 6;
    PRODUCT_IMAGE_FETCH_PRIORITY_HIGH = 1;
  }

  function registerGridParticleAnim(anim) {
    if (!anim) return;
    activeGridParticleAnims.push(anim);
    var p = perf();
    if (p) p.setCounter('particle_rafs', activeGridParticleAnims.length);
  }

  function stopAllGridParticleReveals() {
    for (var i = 0; i < activeGridParticleAnims.length; i++) {
      try {
        if (activeGridParticleAnims[i] && activeGridParticleAnims[i].stop) {
          activeGridParticleAnims[i].stop();
        }
      } catch (_e) {}
    }
    activeGridParticleAnims.length = 0;
    var p = perf();
    if (p) p.setCounter('particle_rafs', 0);
  }

  function teardownDesignsGridObservers() {
    if (designsScrollObserver) {
      designsScrollObserver.disconnect();
      designsScrollObserver = null;
    }
    designsScrollSentinel = null;
    var p = perf();
    if (p) p.setCounter('designs_observers', 0);
  }

  var filteredDesigns = [];
  var currentRenderDesigns = [];
  var publishedSummaryByDesignId = {};
  var creationsProductBadgesByDesignId = {};
  var products = [];
  var filteredProducts = [];
  var designsLoadedOnce = false;
  var productsLoadedOnce = false;
  var designsLoadError = null;
  var productsLoadError = null;
  var designsLoadPromise = null;
  var productsLoadPromise = null;
  /** While bulk-save runs: hide these job_ids from generated/KV merge so rows do not reappear until D1 saved row exists. */
  var suppressedGeneratedJobIds = new Set();
  /** Poll listJobs while auto-save runs so inactive tab cards keep saving overlay until D1 row exists. */
  var librarySaveWatchTimerId = null;
  var LIBRARY_SAVE_POLL_MS = 3000;
  /** Retry load when owner id is not yet on the page (Liquid / EazCreatorCore). */
  var designsOwnerRetryTimerId = null;
  var designsOwnerRetryAttempts = 0;
  var DESIGNS_OWNER_RETRY_MAX = 40;
  /** Lightweight poll after bulk save (get-design by job_id) — no full list fetch / no repeated full-grid reload loop. */
  var bulkSaveWatchTimerId = null;
  var bulkSaveWatchPendingSet = null;
  var bulkSaveWatchDeadlineMs = 0;
  var bulkSaveWatchTickBusy = false;
  /** Wall-clock deadline extended on each finishBulkSave so overlapping bulk saves do not drop earlier job_ids. */
  var BULK_SAVE_WATCH_WINDOW_MS = 240000;
  /** In-progress Creations uploads keyed by localId or jobId — shown first on Inactive. */
  var pendingUploadByKey = {};
  var currentTab = 'designs';
  /** Library filter: active = saved in library (creations); inactive = generated, not saved yet (generated_designs / jobs). */
  var designsActivityFilter = 'active';

  /** Saved-library bulk actions: Active tab only (saved rows with id). */
  function bulkEligibleSavedDesign(d) {
    if (designsActivityFilter !== 'active') return false;
    if (!d) return false;
    var id = d.id != null ? String(d.id).trim() : '';
    return id !== '';
  }

  /** Inactive tab: saved library row with explicit inactive status (has id). */
  function bulkEligibleInactiveSavedLibrary(d) {
    if (designsActivityFilter !== 'inactive') return false;
    if (!d) return false;
    var id = d.id != null ? String(d.id).trim() : '';
    if (!id) return false;
    return resolveLibraryStatus(d) === 'inactive';
  }

  /** Inactive tab: completed generated row not yet saved to library (job id only). */
  function bulkEligibleInactiveUnsavedGenerated(d) {
    if (designsActivityFilter !== 'inactive') return false;
    if (!d) return false;
    var id = d.id != null ? String(d.id).trim() : '';
    if (id) return false;
    var jid = d.job_id != null ? String(d.job_id).trim() : '';
    return jid !== '';
  }

  function isBulkSelectableDesign(d) {
    if (d && (d.upload_pending || d._pendingUploadKey)) return false;
    if (designsActivityFilter === 'active') return bulkEligibleSavedDesign(d);
    return bulkEligibleInactiveSavedLibrary(d) || bulkEligibleInactiveUnsavedGenerated(d);
  }

  /** Stable key for bulk selection: "id:<creation id>" or "job:<job_id>" */
  function resolveBulkSelectionKey(d) {
    if (!d) return '';
    var id = d.id != null ? String(d.id).trim() : '';
    if (id) return 'id:' + id;
    var jid = d.job_id != null ? String(d.job_id).trim() : '';
    if (jid) return 'job:' + jid;
    return '';
  }

  function redrawDesignsGridOnly() {
    filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
    renderDesignsGrid();
  }
  var lastDesignFilters = null;
  var viewMode = 'grid2';
  var designsRenderedCount = 0;
  var productsRenderedCount = 0;
  /** First batch: static thumbnails only (fast LCP). ParticleReveal only for index >= this (scroll-loaded). */
  var DESIGN_PARTICLE_MIN_INDEX = 20;
  var DESIGN_GRID_BATCH_SIZE = 20;
  /** Avoid native lazy-load deferring in-page images (Edge scrollport + below-fold batches). */
  var DESIGN_IMAGE_EAGER_COUNT = 40;
  var DESIGN_IMAGE_FETCH_PRIORITY_HIGH = 4;
  var PRODUCT_GRID_BATCH_SIZE = 20;
  var PRODUCT_IMAGE_EAGER_COUNT = 32;
  var PRODUCT_IMAGE_FETCH_PRIORITY_HIGH = 4;
  var TAP_MOVE_THRESHOLD_PX = 12;
  var TAP_MAX_DURATION_MS = 500;
  var SINGLE_CLICK_DELAY_MS = 240;
  var productHandleImageCache = new Map();

  function setCreationsLoadingElement(loadingEl, which) {
    if (!loadingEl) return;
    var M = window.CreatorMobileI18n || {};
    var label =
      which === 'products'
        ? M.creationsLoadingProducts || 'Loading your products…'
        : M.creationsLoadingDesigns || 'Loading your designs…';
    loadingEl.classList.add('creator-creations-loading--with-spinner');
    loadingEl.setAttribute('role', 'status');
    loadingEl.setAttribute('aria-busy', 'true');
    loadingEl.innerHTML =
      '<span class="creator-creations-loading__spinner" aria-hidden="true"></span>' +
      '<span class="creator-creations-loading__label"></span>';
    var lab = loadingEl.querySelector('.creator-creations-loading__label');
    if (lab) lab.textContent = label;
  }

  function resetCreationsLoadingElement(loadingEl) {
    if (!loadingEl) return;
    loadingEl.classList.remove('creator-creations-loading--with-spinner');
    loadingEl.removeAttribute('role');
    loadingEl.removeAttribute('aria-busy');
  }

  /** True while the first list fetch is in progress or not yet started (avoids "empty" before data exists). */
  function shouldShowDesignsLoading() {
    if (designsLoadedOnce) return false;
    if (designsLoadError) return false;
    if (designsLoadPromise) return true;
    return true;
  }

  function shouldShowProductsLoading() {
    if (productsLoadedOnce) return false;
    if (productsLoadError) return false;
    if (productsLoadPromise) return true;
    return true;
  }

  var VIEW_ICONS = {
    grid2: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="8" height="8" rx="1"/><rect x="13" y="8" width="8" height="8" rx="1"/></svg>',
    grid3: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="16.5" y="9.5" width="5" height="5" rx="1"/></svg>',
    grid4: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="8" width="3" height="3" rx="1"/><rect x="7" y="8" width="3" height="3" rx="1"/><rect x="12" y="8" width="3" height="3" rx="1"/><rect x="17" y="8" width="3" height="3" rx="1"/></svg>',
    grid6: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="4" height="4" rx="1"/><rect x="10" y="7" width="4" height="4" rx="1"/><rect x="17" y="7" width="4" height="4" rx="1"/><rect x="3" y="13" width="4" height="4" rx="1"/><rect x="10" y="13" width="4" height="4" rx="1"/><rect x="17" y="13" width="4" height="4" rx="1"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
  };

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null && String(window.__EAZ_OWNER_ID).trim()) {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    var balanceEl = document.getElementById('global-eaz-balance-value');
    if (balanceEl && balanceEl.dataset && balanceEl.dataset.debugOwner) {
      try {
        var parsed = JSON.parse(balanceEl.dataset.debugOwner);
        if (parsed && String(parsed).trim() !== 'null') return String(parsed).trim();
      } catch (_) {
        if (balanceEl.dataset.debugOwner && balanceEl.dataset.debugOwner !== 'null') {
          return String(balanceEl.dataset.debugOwner).replace(/"/g, '').trim();
        }
      }
    }
    return null;
  }

  function getCategory(design) {
    var M = window.CreatorMobileI18n || {};
    var src = (design.design_source || design.source || design.category || design.type || '').toString();
    var srcLower = src.toLowerCase();
    if (srcLower === 'automation') return M.creationsCategoryAutomation || 'Automation';
    if (srcLower === 'generated') return 'Generiert';
    if (srcLower === 'uploaded') return 'Hochgeladen';
    if (srcLower === 'saved') return 'Gespeichert';
    if (srcLower === 'merged') return 'Merged';
    if (srcLower === 'remix') return 'Remix';
    var meta = design.metadata || {};
    var aid = meta.automation_id != null ? meta.automation_id : design.automation_id;
    var aidN = aid != null && aid !== '' ? Number(aid) : NaN;
    if (!isNaN(aidN) && aidN > 0) return M.creationsCategoryAutomation || 'Automation';
    // Fallback: check source field
    if (design.source === 'generated') return 'Generiert';
    if (design.source === 'uploaded') return 'Hochgeladen';
    if (design.source === 'saved') return 'Gespeichert';
    // Default fallback
    return 'Gespeichert';
  }

  function normalizeGenerated(item) {
    var designPrompt = item.design_prompt || item.final_prompt || null;
    var userPrompt = '';
    if (item.user_prompt != null && String(item.user_prompt).trim()) {
      userPrompt = String(item.user_prompt).trim();
    } else if (item.prompt != null && String(item.prompt).trim()) {
      userPrompt = String(item.prompt).trim();
    }
    // Never treat assembled Replicate wrappers as the user prompt
    if (userPrompt) {
      var upLower = userPrompt.toLowerCase();
      var looksAssembled =
        upLower.indexOf('reference influence') === 0 ||
        upLower.indexOf('quick inspiration mode') === 0 ||
        upLower.indexOf('target product:') === 0 ||
        (upLower.indexOf('reference influence') !== -1 && upLower.indexOf('user prompt:') === -1) ||
        (upLower.indexOf('quick inspiration mode') !== -1 && upLower.indexOf('user prompt:') === -1);
      if (looksAssembled) {
        var marker = 'user prompt:';
        var idx = upLower.lastIndexOf(marker);
        userPrompt = idx !== -1 ? userPrompt.slice(idx + marker.length).trim() : '';
      }
    }
    if (!userPrompt && designPrompt) {
      var dp = String(designPrompt);
      var dpLower = dp.toLowerCase();
      var mIdx = dpLower.lastIndexOf('user prompt:');
      if (mIdx !== -1) userPrompt = dp.slice(mIdx + 'user prompt:'.length).trim();
    }

    var aidRaw = item.automation_id != null ? item.automation_id : (item.metadata && item.metadata.automation_id);
    var aidNum = aidRaw != null && aidRaw !== '' ? Number(aidRaw) : NaN;
    var hasAutomation = !isNaN(aidNum) && aidNum > 0;
    var meta = {
      design_source: hasAutomation ? 'Automation' : 'Generated',
      design_prompt: designPrompt || '',
      user_prompt: userPrompt
    };
    if (hasAutomation) meta.automation_id = aidNum;

    return {
      id: null,
      design_id: null,
      job_id: item.job_id || null,
      image_url: item.image_url || null,
      preview_url: item.preview_url || item.image_url || null,
      original_url: item.image_url || null,
      title: userPrompt || ('Design ' + (item.job_id || '')),
      prompt: userPrompt || null,
      user_prompt: userPrompt || null,
      design_prompt: designPrompt,
      created_at: item.created_at || item.finished || 0,
      updated_at: null,
      source: hasAutomation ? 'automation' : 'generated',
      design_source: hasAutomation ? 'Automation' : 'Generated',
      automation_id: hasAutomation ? aidNum : null,
      creator_name: item.creator_name || null,
      metadata: meta,
      library_status: item.library_status || 'inactive',
      saving_to_library: !!item.saving_to_library
    };
  }

  function normalizeSaved(item) {
    var meta = {};
    try {
      meta = item.metadata && (typeof item.metadata === 'string' ? JSON.parse(item.metadata || '{}') : item.metadata) || {};
    } catch (_) {}
    
    // Determine design_source based on Backend logic:
    // Uploaded = has user_image_url but NO design_prompt
    // Saved = saved designs that are NOT uploaded (have design_prompt or no user_image_url)
    var userImageUrl = meta.user_image_url || item.user_image_url || null;
    var designPrompt = meta.design_prompt || item.design_prompt || null;
    var isUploaded = !!(userImageUrl && userImageUrl.trim() && !designPrompt);

    var aidRaw = meta.automation_id != null ? meta.automation_id : item.automation_id;
    var aidNum = aidRaw != null && aidRaw !== '' ? Number(aidRaw) : NaN;
    var hasAutomation = !isNaN(aidNum) && aidNum > 0;

    var explicitSrc = (item.design_source || meta.design_source || item.source || '').toString();
    var explicitSrcLower = explicitSrc.toLowerCase();

    var src;
    if (explicitSrcLower === 'automation' || hasAutomation) {
      src = 'Automation';
    } else if (isUploaded) {
      src = 'Uploaded';
    } else if (explicitSrcLower === 'generated') {
      src = 'Generated';
    } else if (explicitSrcLower === 'uploaded') {
      src = 'Uploaded';
    } else if (explicitSrcLower === 'personalized') {
      src = 'Personalized';
    } else {
      src = 'Saved';
    }

    var srcKey = 'saved';
    if (src === 'Generated') srcKey = 'generated';
    else if (src === 'Uploaded') srcKey = 'uploaded';
    else if (src === 'Automation') srcKey = 'automation';
    else if (src === 'Personalized') srcKey = 'personalized';

    return {
      id: String(item.id || ''),
      job_id: item.job_id || null,
      image_url: item.original_url || item.preview_url || null,
      preview_url: item.preview_url || item.original_url || null,
      original_url: item.original_url || item.preview_url || null,
      /** D1 op=list — matches file behind r2_key_original (for crop coordinate sanity checks). */
      width: item.width != null && item.width !== '' ? Number(item.width) : null,
      height: item.height != null && item.height !== '' ? Number(item.height) : null,
      title: item.title || item.prompt || ('Design #' + (item.id || '')),
      created_at: item.created_at || 0,
      updated_at: item.updated_at != null ? item.updated_at : null,
      source: srcKey,
      design_source: src,
      creator_name: item.creator_name || meta.creator_name || null,
      /** Must mirror GET ?op=list (creations.visibility); omitted entries broke preview modal toggle */
      visibility: item.visibility || meta.visibility || null,
      metadata: meta,
      library_status:
        item.library_status === 'inactive' || item.library_status === 'active'
          ? item.library_status
          : 'active',
      shop_locked:
        meta.shop_locked === true || meta.shop_locked === 'yes' || meta.shop_locked === 1,
      review_status: item.review_status || null,
      review_item_id: item.review_item_id != null ? item.review_item_id : null
    };
  }

  /** Unix ms for sorting / display (handles ISO strings, ms, and sec). */
  function parseTsToMs(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'string') {
      var ms = new Date(v).getTime();
      return isNaN(ms) ? 0 : ms;
    }
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return 0;
    if (n < 1e12) return Math.round(n * 1000);
    return Math.round(n);
  }

  function designSortTimestampMs(d) {
    if (!d) return 0;
    var pick = d.updated_at != null && d.updated_at !== '' ? d.updated_at : d.created_at;
    return parseTsToMs(pick);
  }

  function sortDesignsNewestFirst(arr) {
    if (!arr || !arr.length) return arr;
    arr.sort(function (a, b) {
      var tb = designSortTimestampMs(b);
      var ta = designSortTimestampMs(a);
      if (tb !== ta) return tb - ta;
      var sidb = String((b && b.id) || '').trim();
      var sida = String((a && a.id) || '').trim();
      if (sidb !== sida) return sidb.localeCompare(sida);
      var jb = String((b && b.job_id) || '');
      var ja = String((a && a.job_id) || '');
      return jb.localeCompare(ja);
    });
    return arr;
  }

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /** Fetch JSON with retries on network / 5xx / 429. Throws on hard API failure (ok:false). */
  async function fetchDispatchJson(url, label) {
    var attempts = 3;
    var lastErr = null;
    for (var i = 0; i < attempts; i++) {
      try {
        var res = await fetch(url, { credentials: 'include' });
        var data = await res.json().catch(function () {
          return null;
        });
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error((label || 'api') + '_http_' + res.status);
          lastErr.status = res.status;
          if (i < attempts - 1) {
            await sleepMs(250 * (i + 1));
            continue;
          }
          throw lastErr;
        }
        if (!data) {
          lastErr = new Error((label || 'api') + '_invalid_json');
          lastErr.status = res.status;
          throw lastErr;
        }
        if (data.ok === false) {
          var apiErr = new Error(data.error || (label || 'api') + '_failed');
          apiErr.code = data.error || 'api_failed';
          apiErr.status = res.status;
          throw apiErr;
        }
        return data;
      } catch (e) {
        lastErr = e;
        if (e && e.status && e.status < 500 && e.status !== 429) throw e;
        if (i < attempts - 1) {
          await sleepMs(250 * (i + 1));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr || new Error((label || 'api') + '_failed');
  }

  async function fetchAllSavedDesignPages(owner) {
    var saved = [];
    var cursor = null;
    var pages = 0;
    while (pages < 60) {
      pages++;
      var listUrl = API_BASE + '?op=list&owner_id=' + encodeURIComponent(owner) + '&limit=50';
      if (cursor) listUrl += '&cursor=' + encodeURIComponent(cursor);
      var dataList = await fetchDispatchJson(listUrl, 'list');
      if (!dataList.items || !dataList.items.length) break;
      for (var i = 0; i < dataList.items.length; i++) saved.push(dataList.items[i]);
      cursor = dataList.next_cursor || null;
      if (!cursor) break;
    }
    return saved;
  }

  /** Hero jobs live in hero_images + notifications; they must not appear as designs on Creations. */
  function isHeroGenerateListJob(j) {
    if (!j) return false;
    var t = String(j.type || j.action || '')
      .trim()
      .toLowerCase();
    return t === 'hero-generate';
  }

  /**
   * One list-jobs fetch: (1) KV-backed “done but not saved” cards for merge, (2) job_ids currently in save pipeline.
   * Save pipeline sets KV `saving` before the queue runs; D1 `list-generated` still lists generated_designs until
   * `creations` exists — without filtering, reload would show the same design again under Inactive.
   */
  async function fetchListJobsDesignMergeBundle(owner) {
    var url =
      API_BASE +
      '?op=list-jobs&path_prefix=/apps/creator-dispatch&owner_id=' +
      encodeURIComponent(owner) +
      '&limit=50';
    var res = await fetch(url, { credentials: 'include' });
    var data = await res.json().catch(function () { return { ok: false, items: [] }; });
    var items = !data.ok || !Array.isArray(data.items) ? [] : data.items;
    var savingJobIds = new Set();
    var savingJobs = [];
    var uploadPendingJobs = [];
    items.forEach(function (j) {
      if (!j || !j.job_id) return;
      var jid = String(j.job_id).trim();
      if (!jid) return;
      var jobType = String(j.type || j.action || '')
        .trim()
        .toLowerCase();
      if (j.saving && !j.saved) {
        savingJobIds.add(jid);
        if (j.done && !isHeroGenerateListJob(j)) {
          var sr = j.result || {};
          if (sr.preview_url || sr.image_url || j.preview_url || j.image_url) savingJobs.push(j);
        }
      }
      // In-progress upload-design: show in Inactive even before done/saved
      if (jobType === 'upload-design' && !j.saved && !j.done && !isHeroGenerateListJob(j)) {
        uploadPendingJobs.push(j);
      }
    });
    var kvDone = items.filter(function (j) {
      if (!j || !j.job_id || !j.done || j.saved || j.saving) return false;
      if (isHeroGenerateListJob(j)) return false;
      var r = j.result || {};
      return !!(r.preview_url || r.image_url || j.preview_url || j.image_url);
    });
    return {
      kvDone: kvDone,
      savingJobIds: savingJobIds,
      savingJobs: savingJobs,
      uploadPendingJobs: uploadPendingJobs
    };
  }

  function normalizeGeneratedFromListJobs(j) {
    var r = j.result || {};
    var preview = r.preview_url || j.preview_url || null;
    var image = r.image_url || j.image_url || preview || null;
    var aid = j.automation_id != null && j.automation_id !== '' ? Number(j.automation_id) : NaN;
    return normalizeGenerated({
      job_id: j.job_id,
      prompt: j.prompt || null,
      user_prompt: j.user_prompt || j.prompt || null,
      design_prompt: j.effective_prompt || j.design_prompt || null,
      final_prompt: j.final_prompt || null,
      image_url: image,
      preview_url: preview || image,
      created_at: j.finished || j.started || null,
      automation_id: !isNaN(aid) && aid > 0 ? aid : null
    });
  }

  async function fetchDesigns() {
    var ownerRaw = getOwnerId();
    var owner = ownerRaw != null ? String(ownerRaw).trim() : '';
    if (!owner) {
      console.warn('[CreationsScreen] fetchDesigns: missing owner id');
      var missingErr = new Error('missing_owner_id');
      missingErr.code = 'MISSING_OWNER_ID';
      throw missingErr;
    }

    var savedJobIds = new Set();
    var genUrl =
      API_BASE +
      '?op=list-generated&path_prefix=/apps/creator-dispatch&owner_id=' +
      encodeURIComponent(owner) +
      '&limit=500';

    var savedPromise = fetchAllSavedDesignPages(owner);
    // Generated is best-effort: if it fails after retries, still show saved (Active) designs.
    var generatedPromise = fetchDispatchJson(genUrl, 'list-generated')
      .then(function (dataGen) {
        return {
          ok: true,
          items: dataGen.items ? dataGen.items : [],
        };
      })
      .catch(function (genErr) {
        console.warn('[CreationsScreen] list-generated failed (continuing with saved only):', genErr);
        return { ok: false, items: [] };
      });
    var listJobsBundlePromise = fetchListJobsDesignMergeBundle(owner).catch(function () {
      return { kvDone: [], savingJobIds: new Set(), savingJobs: [], uploadPendingJobs: [] };
    });

    var results = await Promise.all([savedPromise, generatedPromise, listJobsBundlePromise]);
    var saved = results[0];
    var generatedBundle = results[1];
    var generated = generatedBundle.items || [];
    var listJobsBundle = results[2];
    var kvDone = listJobsBundle.kvDone;
    var savingJobIds = listJobsBundle.savingJobIds;
    var savingJobs = listJobsBundle.savingJobs || [];
    var uploadPendingJobs = listJobsBundle.uploadPendingJobs || [];

    saved.forEach(function (s) {
      if (s.job_id != null && String(s.job_id).trim() !== '') {
        savedJobIds.add(String(s.job_id));
      }
    });

    var merged = saved.map(normalizeSaved);
    var mergedJobIds = new Set();
    var d1JobIds = new Set();
    merged.forEach(function (d) {
      var mj = d && d.job_id != null ? String(d.job_id).trim() : '';
      if (mj) mergedJobIds.add(mj);
    });
    generated.forEach(function (g) {
      var gj = g.job_id != null ? String(g.job_id) : '';
      if (gj) d1JobIds.add(gj);
      if (gj && suppressedGeneratedJobIds.has(gj)) return;
      if (gj && !savedJobIds.has(gj)) {
        var genNorm = normalizeGenerated(g);
        if (gj && savingJobIds.has(gj)) genNorm.saving_to_library = true;
        merged.push(genNorm);
        if (gj) mergedJobIds.add(gj);
      }
    });

    kvDone.forEach(function (j) {
      var jid = j.job_id != null ? String(j.job_id) : '';
      if (!jid || savedJobIds.has(jid) || d1JobIds.has(jid)) return;
      if (suppressedGeneratedJobIds.has(jid)) return;
      if (isHeroGenerateListJob(j)) return;
      merged.push(normalizeGeneratedFromListJobs(j));
      mergedJobIds.add(jid);
    });

    savingJobs.forEach(function (j) {
      var jid = j.job_id != null ? String(j.job_id) : '';
      if (!jid || savedJobIds.has(jid) || d1JobIds.has(jid)) return;
      if (suppressedGeneratedJobIds.has(jid)) return;
      if (isHeroGenerateListJob(j)) return;
      if (mergedJobIds.has(jid)) return;
      var savingNorm = normalizeGeneratedFromListJobs(j);
      savingNorm.saving_to_library = true;
      merged.push(savingNorm);
      mergedJobIds.add(jid);
    });

    uploadPendingJobs.forEach(function (j) {
      var jid = j.job_id != null ? String(j.job_id) : '';
      if (!jid || savedJobIds.has(jid) || d1JobIds.has(jid)) return;
      if (suppressedGeneratedJobIds.has(jid)) return;
      if (mergedJobIds.has(jid)) return;
      var preview = j.image_url || j.preview_url || (j.result && (j.result.preview_url || j.result.image_url)) || null;
      var uploadNorm = normalizeGeneratedFromListJobs(j);
      uploadNorm.preview_url = preview || uploadNorm.preview_url;
      uploadNorm.image_url = preview || uploadNorm.image_url;
      uploadNorm.original_url = preview || uploadNorm.original_url;
      uploadNorm.source = 'uploaded';
      uploadNorm.design_source = 'Uploaded';
      uploadNorm.upload_pending = true;
      uploadNorm.saving_to_library = true;
      uploadNorm.title = (j.upload_filename || uploadNorm.title || 'Upload').toString().replace(/\.[^.]+$/, '');
      var msg = String(j.message || '').toLowerCase();
      var p = Number(j.progress) || 0;
      var status = 'processing';
      if (msg.indexOf('skalier') >= 0 || msg.indexOf('upscale') >= 0) status = 'upscaling';
      else if (msg.indexOf('speicher') >= 0) status = 'saving';
      else if (p < 15) status = 'uploading';
      else if (p < 50) status = 'processing';
      else if (p < 70) status = 'upscaling';
      else status = 'saving';
      uploadNorm.upload_status = status;
      if (uploadNorm.metadata) {
        uploadNorm.metadata.design_source = 'Uploaded';
        uploadNorm.metadata.upload_pending = true;
      }
      merged.push(uploadNorm);
      mergedJobIds.add(jid);
    });

    sortDesignsNewestFirst(merged);
    console.info('[CreationsScreen] fetchDesigns debug', {
      owner_id: owner,
      list_saved_total: saved.length,
      list_generated_ok: !!generatedBundle.ok,
      generated_count: generated.length,
      kv_done_count: kvDone.length,
      saving_to_library_count: savingJobIds.size,
      merged_count: merged.length
    });
    return merged;
  }

  async function fetchPublishedSummary() {
    var owner = getOwnerId();
    if (!owner) return;
    try {
      var shop = window.Shopify?.shop || null;
      var url = API_BASE + '?op=get-published-summary&owner_id=' + encodeURIComponent(owner);
      if (shop) url += '&shop=' + encodeURIComponent(shop);
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && Array.isArray(data.designs)) {
        publishedSummaryByDesignId = {};
        data.designs.forEach(function (d) {
          publishedSummaryByDesignId[String(d.design_id)] = d.products_count || 0;
        });
      }
    } catch (e) {
      console.warn('[CreationsScreen] Published summary fetch error:', e);
    }
  }

  function catalogRegionForBadges() {
    if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveCatalogRegion === 'function') {
      return window.CreatorHeroRegions.resolveCatalogRegion();
    }
    return 'EU';
  }

  async function fetchCreationsProductBadges() {
    var owner = getOwnerId();
    if (!owner) return;
    try {
      var shop = window.Shopify?.shop || null;
      var region = catalogRegionForBadges();
      var url =
        API_BASE +
        '?op=get-creations-product-badges&owner_id=' +
        encodeURIComponent(owner) +
        '&region=' +
        encodeURIComponent(region);
      if (shop) url += '&shop=' + encodeURIComponent(shop);
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok && data.designs && typeof data.designs === 'object') {
        creationsProductBadgesByDesignId = data.designs;
      }
    } catch (e) {
      console.warn('[CreationsScreen] Product badges fetch error:', e);
    }
  }

  function getPublishedCount(design) {
    var id = design.id ? String(design.id) : null;
    return id ? (publishedSummaryByDesignId[id] || 0) : 0;
  }

  function escapeBadgeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  /** Uses op=get-creations-product-badges: inactive = eligible only; active = published / eligible. */
  function formatDesignProductBadgeText(design) {
    var id = design.id ? String(design.id).trim() : '';
    if (!id) return '';
    var row = creationsProductBadgesByDesignId[id];
    var eligible = row ? Number(row.eligible_product_count) || 0 : 0;
    var pub = row ? Number(row.published_product_count) || 0 : 0;
    var ls = resolveLibraryStatus(design);
    if (ls === 'inactive') return String(eligible);
    return pub + ' / ' + eligible;
  }

  function toImageString(value) {
    if (!value) return null;
    var raw = null;
    if (typeof value === 'string') raw = value;
    else if (typeof value === 'object') {
      raw = value.src || value.url || value.image_url || value.preview_url || null;
    }
    if (!raw || typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s) return null;
    if (s.indexOf('//') === 0) s = 'https:' + s;
    return s;
  }

  function resolveProductImageUrl(product) {
    if (!product) return null;
    // Prefer Shopify/catalog/design fallbacks over Printify CDN (often expired).
    var primary =
      toImageString(product.image_url) ||
      toImageString(product.featured_image) ||
      toImageString(product.mockup_image) ||
      toImageString(product.preview_image) ||
      toImageString(product.preview_url) ||
      toImageString(product.thumbnail_url) ||
      toImageString(product.main_image) ||
      toImageString(product.product_image) ||
      toImageString(Array.isArray(product.images) ? product.images[0] : null) ||
      toImageString(product.variants && product.variants[0] && (product.variants[0].image || product.variants[0].image_url)) ||
      null;
    if (primary) return primary;
    var printifyImgs = product.printify_images;
    if (Array.isArray(printifyImgs) && printifyImgs.length) {
      for (var i = 0; i < printifyImgs.length; i++) {
        var first = toImageString(printifyImgs[i]);
        if (first) return first;
      }
    }
    return null;
  }

  function isReviewRejected(design) {
    return design && String(design.review_status || '').trim() === 'rejected';
  }

  function isReviewPendingStatus(rs) {
    var s = String(rs || '').trim();
    return s === 'pending_review' || s === 'needs_more_votes' || s === 'moderator_review' || s === 'resubmit';
  }

  function reviewBadgeLabel(rs) {
    var M = window.CreatorMobileI18n || {};
    if (rs === 'rejected') return M.reviewBadgeRejected || 'Needs changes';
    if (isReviewPendingStatus(rs)) return M.reviewBadgePending || 'In review';
    return '';
  }

  function isShopLockedDesign(design) {
    if (!design) return false;
    if (design.shop_locked === true) return true;
    var meta = design.metadata || {};
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta || '{}') || {};
      } catch (_) {
        meta = {};
      }
    }
    return meta.shop_locked === true || meta.shop_locked === 'yes' || meta.shop_locked === 1;
  }

  function appendShopLockBadges(container, design) {
    if (!container || !isShopLockedDesign(design)) return;
    var Mi = window.CreatorMobileI18n || {};
    var wrap = document.createElement('div');
    wrap.className = 'creator-creations-card-shop-badges';
    var shop = document.createElement('span');
    shop.className = 'creator-creations-card-shop-badge creator-creations-card-shop-badge--shop';
    shop.textContent = Mi.libraryBadgeShop || 'Shop';
    var priv = document.createElement('span');
    priv.className = 'creator-creations-card-shop-badge creator-creations-card-shop-badge--private';
    priv.textContent = Mi.libraryBadgePrivate || 'Private';
    wrap.appendChild(shop);
    wrap.appendChild(priv);
    container.appendChild(wrap);
  }

  function appendReviewStatusBadge(container, entity) {
    if (!container || !entity) return;
    var rs = String(entity.review_status || '').trim();
    if (!rs || rs === 'approved') return;
    var label = reviewBadgeLabel(rs);
    if (!label) return;
    var badge = document.createElement('span');
    badge.className =
      'creator-creations-review-badge creator-creations-review-badge--' +
      rs.replace(/[^a-z_]/gi, '');
    badge.textContent = label;
    container.appendChild(badge);
  }

  function getProductCarouselImages(product) {
    if (!product) return [];
    var out = [];
    var seen = {};
    function push(u) {
      var url = toImageString(u);
      if (!url || seen[url]) return;
      seen[url] = true;
      out.push(url);
    }
    push(product.featured_image);
    push(product.image_url);
    push(product.mockup_image);
    push(product.preview_image);
    var imgs = product.printify_images;
    if (Array.isArray(imgs)) {
      imgs.forEach(function (x) {
        push(x);
      });
    }
    if (!out.length) {
      var single = resolveProductImageUrl(product);
      if (single) out.push(single);
    }
    return out;
  }

  function appendProductImageCarousel(container, product, index) {
    if (!container) return;
    var urls = getProductCarouselImages(product);
    if (urls.length <= 1) {
      var url = urls[0] || resolveProductImageUrl(product);
      if (url) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = product.title || 'Product';
        setImgLoadingPriority(
          img,
          typeof index === 'number' ? index : PRODUCT_IMAGE_EAGER_COUNT,
          PRODUCT_IMAGE_EAGER_COUNT,
          PRODUCT_IMAGE_FETCH_PRIORITY_HIGH
        );
        container.appendChild(img);
      }
      return;
    }
    container.classList.add('creator-creations-product-carousel');
    var track = document.createElement('div');
    track.className = 'creator-creations-product-carousel__track';
    urls.forEach(function (u, idx) {
      var slide = document.createElement('div');
      slide.className = 'creator-creations-product-carousel__slide';
      var slideImg = document.createElement('img');
      slideImg.src = u;
      slideImg.alt = (product.title || 'Product') + ' ' + (idx + 1);
      setImgLoadingPriority(slideImg, idx, 1, PRODUCT_IMAGE_FETCH_PRIORITY_HIGH);
      slide.appendChild(slideImg);
      track.appendChild(slide);
    });
    container.appendChild(track);
    var dots = document.createElement('div');
    dots.className = 'creator-creations-product-carousel__dots';
    urls.forEach(function (_, idx) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'creator-creations-product-carousel__dot' + (idx === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', 'Image ' + (idx + 1));
      dot.addEventListener('click', function (e) {
        e.stopPropagation();
        track.style.transform = 'translateX(-' + idx * 100 + '%)';
        dots.querySelectorAll('.creator-creations-product-carousel__dot').forEach(function (d, i) {
          d.classList.toggle('is-active', i === idx);
        });
      });
      dots.appendChild(dot);
    });
    container.appendChild(dots);
  }

  function resolveUploadStatusLabel(statusKey) {
    var M = window.CreatorMobileI18n || {};
    var key = String(statusKey || 'uploading').toLowerCase();
    if (key === 'processing') return M.creationsUploadStatusProcessing || 'Processing';
    if (key === 'upscaling') return M.creationsUploadStatusUpscaling || 'Upscaling';
    if (key === 'saving') return M.creationsUploadStatusSaving || 'Saving';
    if (key === 'failed') return M.creationsUploadStatusFailed || 'Failed';
    if (key === 'done') return M.creationsSavingToLibrary || 'Saving…';
    return M.creationsUploadStatusUploading || 'Uploading';
  }

  function pendingUploadEntries() {
    return Object.keys(pendingUploadByKey).map(function (k) {
      return pendingUploadByKey[k];
    });
  }

  function findPendingUploadKey(detail) {
    if (!detail) return null;
    var jobId = detail.jobId != null ? String(detail.jobId).trim() : '';
    var localId = detail.localId != null ? String(detail.localId).trim() : '';
    if (jobId) {
      var byJob = Object.keys(pendingUploadByKey).find(function (k) {
        var row = pendingUploadByKey[k];
        return row && String(row.job_id || '').trim() === jobId;
      });
      if (byJob) return byJob;
    }
    if (localId && pendingUploadByKey[localId]) return localId;
    if (jobId && pendingUploadByKey[jobId]) return jobId;
    return localId || jobId || null;
  }

  function upsertPendingUploadPlaceholder(detail) {
    if (!detail) return;
    var localId = detail.localId != null ? String(detail.localId).trim() : '';
    var jobId = detail.jobId != null ? String(detail.jobId).trim() : '';
    var key = findPendingUploadKey(detail) || localId || jobId;
    if (!key) return;

    var prev = pendingUploadByKey[key] || {};
    if (localId && key !== localId && pendingUploadByKey[localId] && key !== localId) {
      prev = pendingUploadByKey[localId] || prev;
      delete pendingUploadByKey[localId];
    }

    var status = detail.status || prev.upload_status || 'uploading';
    var previewUrl = detail.previewUrl || prev.preview_url || null;
    var title =
      detail.title ||
      (detail.filename ? String(detail.filename).replace(/\.[^.]+$/, '') : null) ||
      prev.title ||
      'Upload';

    if (prev._pendingBlobUrl && previewUrl && previewUrl !== prev._pendingBlobUrl && String(previewUrl).indexOf('blob:') !== 0) {
      try {
        URL.revokeObjectURL(prev._pendingBlobUrl);
      } catch (_) {}
      prev._pendingBlobUrl = null;
    }

    var row = {
      id: null,
      design_id: null,
      job_id: jobId || prev.job_id || null,
      image_url: previewUrl,
      preview_url: previewUrl,
      original_url: previewUrl,
      title: title,
      prompt: null,
      design_prompt: null,
      created_at: prev.created_at || Date.now(),
      updated_at: Date.now(),
      source: 'uploaded',
      design_source: 'Uploaded',
      library_status: 'inactive',
      saving_to_library: status !== 'failed',
      upload_pending: true,
      upload_status: status,
      needs_upscale: detail.needsUpscale != null ? !!detail.needsUpscale : !!prev.needs_upscale,
      _pendingUploadKey: key,
      _pendingBlobUrl: previewUrl && String(previewUrl).indexOf('blob:') === 0 ? previewUrl : prev._pendingBlobUrl || null,
      metadata: {
        design_source: 'Uploaded',
        upload_pending: true,
        upload_status: status
      }
    };

    // Prefer stable key by job id once known
    if (jobId && key !== jobId) {
      delete pendingUploadByKey[key];
      key = jobId;
      row._pendingUploadKey = key;
    }
    pendingUploadByKey[key] = row;

    if (designsActivityFilter !== 'inactive') {
      setDesignsActivityFilter('inactive');
    } else {
      filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
      renderDesignsGrid();
    }
    startLibrarySaveWatchIfNeeded();
  }

  function updatePendingUploadProgress(detail) {
    if (!detail) return;
    var key = findPendingUploadKey(detail);
    if (!key || !pendingUploadByKey[key]) {
      if (detail.jobId || detail.localId) upsertPendingUploadPlaceholder(detail);
      return;
    }
    var row = pendingUploadByKey[key];
    if (detail.status) row.upload_status = detail.status;
    if (detail.previewUrl) {
      if (row._pendingBlobUrl && String(detail.previewUrl).indexOf('blob:') !== 0) {
        try {
          URL.revokeObjectURL(row._pendingBlobUrl);
        } catch (_) {}
        row._pendingBlobUrl = null;
      }
      row.preview_url = detail.previewUrl;
      row.image_url = detail.previewUrl;
      row.original_url = detail.previewUrl;
    }
    if (detail.jobId) row.job_id = String(detail.jobId);
    row.saving_to_library = row.upload_status !== 'failed';
    if (row.metadata) row.metadata.upload_status = row.upload_status;
    row.updated_at = Date.now();

    if (detail.status === 'done') {
      // Keep until loadDesigns merges the real row; overlay shows Saving…
      row.saving_to_library = true;
    }
    if (detail.status === 'failed') {
      row.saving_to_library = false;
    }

    if (designsActivityFilter === 'inactive') {
      filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
      renderDesignsGrid();
    }
  }

  function clearPendingUpload(detailOrJobId) {
    var detail =
      detailOrJobId && typeof detailOrJobId === 'object'
        ? detailOrJobId
        : { jobId: detailOrJobId };
    var key = findPendingUploadKey(detail);
    if (!key) return;
    var row = pendingUploadByKey[key];
    if (row && row._pendingBlobUrl) {
      try {
        URL.revokeObjectURL(row._pendingBlobUrl);
      } catch (_) {}
    }
    delete pendingUploadByKey[key];
  }

  function prunePendingUploadsAgainstDesigns(list) {
    var jobIds = {};
    (list || []).forEach(function (d) {
      if (!d || d._pendingUploadKey) return;
      var jid = d.job_id != null ? String(d.job_id).trim() : '';
      if (jid) jobIds[jid] = true;
    });
    Object.keys(pendingUploadByKey).forEach(function (k) {
      var row = pendingUploadByKey[k];
      var jid = row && row.job_id != null ? String(row.job_id).trim() : '';
      if (jid && jobIds[jid]) clearPendingUpload({ jobId: jid, localId: k });
    });
  }

  function mergePendingUploadsIntoList(list) {
    prunePendingUploadsAgainstDesigns(list);
    var out = Array.isArray(list) ? list.slice() : [];
    var existingJobs = {};
    out.forEach(function (d) {
      var jid = d && d.job_id != null ? String(d.job_id).trim() : '';
      if (jid) existingJobs[jid] = true;
    });
    pendingUploadEntries().forEach(function (row) {
      var jid = row.job_id != null ? String(row.job_id).trim() : '';
      if (jid && existingJobs[jid]) return;
      out.unshift(row);
    });
    return out;
  }

  function insertOptimisticInactiveDesignFromJob(job) {
    if (!job || !job.job_id) return;
    var jid = String(job.job_id).trim();
    if (!jid) return;
    var exists = designs.some(function (d) {
      return String(d.job_id || '').trim() === jid;
    });
    if (exists) return;
    var norm = normalizeGeneratedFromListJobs(job);
    norm.saving_to_library = !!(job.saving || (!job.saved && job.done));
    designs.push(norm);
    sortDesignsNewestFirst(designs);
    filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
    if (designsActivityFilter === 'inactive') renderDesignsGrid();
    startLibrarySaveWatchIfNeeded();
  }

  function getStorefrontProductJsUrl(handle) {
    var key = String(handle || '').trim().toLowerCase();
    if (!key) return null;
    try {
      var h = window.location && window.location.hostname;
      // Creator portal is not the Shopify storefront — never hit relative /products/*.js there.
      if (
        window.__CREATOR_PORTAL_HOST__ ||
        h === 'creator.eazpire.com' ||
        (h && h.indexOf('creator.') === 0)
      ) {
        return 'https://www.eazpire.com/products/' + encodeURIComponent(key) + '.js';
      }
      if (h === 'www.eazpire.com' || h === 'eazpire.com' || (h && h.indexOf('.myshopify.com') > 0)) {
        return '/products/' + encodeURIComponent(key) + '.js';
      }
    } catch (_e) {}
    return 'https://www.eazpire.com/products/' + encodeURIComponent(key) + '.js';
  }

  function getProductImageFromStoreHandle(handle) {
    var key = String(handle || '').trim().toLowerCase();
    if (!key) return Promise.resolve(null);
    if (productHandleImageCache.has(key)) {
      return Promise.resolve(productHandleImageCache.get(key));
    }
    var shop = (window.Shopify && window.Shopify.shop) || 'allyoucanpink.myshopify.com';
    var storeJsUrl = getStorefrontProductJsUrl(key);
    var workerUrl =
      API_BASE +
      '?op=get-product-image&shop=' +
      encodeURIComponent(shop) +
      '&handle=' +
      encodeURIComponent(key);
    var onPortal = false;
    try {
      var hn = window.location && window.location.hostname;
      onPortal = !!(
        window.__CREATOR_PORTAL_HOST__ ||
        hn === 'creator.eazpire.com' ||
        (hn && hn.indexOf('creator.') === 0)
      );
    } catch (_e) {}

    function fromPayload(payload) {
      if (!payload) return null;
      return (
        toImageString(payload.featured_image) ||
        toImageString(Array.isArray(payload.images) ? payload.images[0] : null) ||
        toImageString(payload.image) ||
        toImageString(payload.image_url) ||
        null
      );
    }

    function fromWorker() {
      return fetch(workerUrl, { credentials: 'include' })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (data) {
          var img = data && data.ok ? toImageString(data.image_url) : null;
          productHandleImageCache.set(key, img || null);
          return img || null;
        })
        .catch(function () {
          productHandleImageCache.set(key, null);
          return null;
        });
    }

    function fromStoreJs() {
      return fetch(storeJsUrl, {
        credentials: onPortal ? 'omit' : 'same-origin',
        mode: onPortal ? 'cors' : 'same-origin',
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (payload) {
          return fromPayload(payload);
        })
        .catch(function () {
          return null;
        });
    }

    // Portal: worker first (same-origin /api/dispatch). Storefront .js is cross-origin.
    if (onPortal) {
      return fromWorker().then(function (img) {
        if (img) return img;
        return fromStoreJs().then(function (storeImg) {
          productHandleImageCache.set(key, storeImg || null);
          return storeImg || null;
        });
      });
    }

    return fromStoreJs().then(function (image) {
      if (image) {
        productHandleImageCache.set(key, image);
        return image;
      }
      return fromWorker();
    });
  }

  function tryHydrateProductCardImage(mediaEl, prod) {
    if (!mediaEl || !prod || !prod.shopify_handle) return;
    if (mediaEl.querySelector('img')) return;
    getProductImageFromStoreHandle(prod.shopify_handle).then(function (storeImg) {
      if (!storeImg || mediaEl.querySelector('img')) return;
      mediaEl.innerHTML = '';
      var img = document.createElement('img');
      img.src = storeImg;
      img.alt = prod.title || 'Product';
      img.loading = 'lazy';
      mediaEl.appendChild(img);
      prod.image_url = storeImg;
    });
  }

  async function fetchProducts() {
    var owner = getOwnerId();
    if (!owner) return [];

    var shop = window.Shopify?.shop || 'allyoucanpink.myshopify.com';
    var productsUrl = API_BASE + '?op=get-published-products&owner_id=' + encodeURIComponent(owner) +
      '&shop=' + encodeURIComponent(shop);

    console.log('[CreationsScreen] fetchProducts: requesting', productsUrl);
    var dataProducts = await fetchDispatchJson(productsUrl, 'get-published-products');
    var raw = dataProducts.products ? dataProducts.products : [];
    var items = [];
    raw.forEach(function (p) {
      var productImage = resolveProductImageUrl(p);
      items.push({
        id: p.shopify_product_id || p.product_key + '-product',
        title: p.product_name || p.product_key || 'Product',
        url: p.storefront_url || null,
        image_url: productImage,
        featured_image: toImageString(p.featured_image) || null,
        mockup_image: toImageString(p.mockup_image) || null,
        preview_image: toImageString(p.preview_image) || null,
        printify_images: Array.isArray(p.printify_images) ? p.printify_images : null,
        printify_product_id: p.printify_product_id || null,
        mockups_by_view:
          p.mockups_by_view && typeof p.mockups_by_view === 'object' ? p.mockups_by_view : null,
        product_key: p.product_key,
        product_name: p.product_name,
        shopify_handle: p.shopify_handle || null,
        published_at: p.last_published_at || null,
        review_status: p.review_status || null,
        shopify_completion_status: p.shopify_completion_status || null,
        publish_intent: p.publish_intent || null,
        publish_status_detail: p.publish_status_detail || null,
        is_test_product: !!p.is_test_product || p.publish_intent === 'test_publish',
        published_design_id: p.published_design_id || null,
        design_ids: Array.isArray(p.design_ids) ? p.design_ids : []
      });
    });
    items.sort(function (a, b) {
      var aTest =
        a.is_test_product &&
        a.shopify_completion_status !== 'complete' &&
        a.shopify_completion_status !== 'failed';
      var bTest =
        b.is_test_product &&
        b.shopify_completion_status !== 'complete' &&
        b.shopify_completion_status !== 'failed';
      if (aTest !== bTest) return aTest ? -1 : 1;
      var ta = a.published_at ? (typeof a.published_at === 'string' ? new Date(a.published_at).getTime() : (a.published_at < 1e12 ? a.published_at * 1000 : a.published_at)) : 0;
      var tb = b.published_at ? (typeof b.published_at === 'string' ? new Date(b.published_at).getTime() : (b.published_at < 1e12 ? b.published_at * 1000 : b.published_at)) : 0;
      return tb - ta;
    });
    return items;
  }

  function isDesignSaved(d) {
    if (!d) return false;
    var id = d.id != null ? String(d.id).trim() : '';
    return id !== '';
  }

  function resolveLibraryStatus(d) {
    if (!d) return 'inactive';
    var ls = d.library_status;
    if (ls === 'active' || ls === 'inactive') return ls;
    var id = d.id != null ? String(d.id).trim() : '';
    return id !== '' ? 'active' : 'inactive';
  }

  function designsMatchingActivity(d) {
    var ls = resolveLibraryStatus(d);
    return designsActivityFilter === 'active' ? ls === 'active' : ls === 'inactive';
  }

  function getDesignsBaseForActivityAndModalFilters() {
    var base = designs.filter(designsMatchingActivity);
    if (designsActivityFilter === 'inactive') {
      base = mergePendingUploadsIntoList(base);
    }
    if (lastDesignFilters && typeof window.matchesDesignFilter === 'function') {
      base = base.filter(function (d) {
        return window.matchesDesignFilter(d, lastDesignFilters);
      });
    }
    return base;
  }

  function replaceActivationPlaceholders(str, map) {
    var out = String(str || '');
    if (!map) return out;
    Object.keys(map).forEach(function (k) {
      out = out.split('%' + k + '%').join(String(map[k] != null ? map[k] : ''));
    });
    return out;
  }

  var activationToastTimers = { hide: null, remove: null };

  function dismissActivationSuccessToast() {
    var el = document.getElementById('creatorActivationSuccessToast');
    if (activationToastTimers.hide) {
      clearTimeout(activationToastTimers.hide);
      activationToastTimers.hide = null;
    }
    if (activationToastTimers.remove) {
      clearTimeout(activationToastTimers.remove);
      activationToastTimers.remove = null;
    }
    if (!el) return;
    el.classList.add('creator-activation-success-toast--out');
    activationToastTimers.remove = setTimeout(function () {
      el.remove();
      activationToastTimers.remove = null;
    }, 320);
  }

  /** Centered confirmation after library activate (tap / timeout to dismiss). */
  function showDesignActivationSuccessToast(opts) {
    var M = window.CreatorMobileI18n || {};
    var designTitle = opts && opts.designTitle ? String(opts.designTitle).trim() : '';
    var productCount = opts && opts.productCount != null ? Number(opts.productCount) : 0;
    if (!isFinite(productCount) || productCount < 0) productCount = 0;
    var showProductCountLine = !!(opts && opts.showProductCountLine);

    dismissActivationSuccessToast();

    var overlay = document.createElement('div');
    overlay.id = 'creatorActivationSuccessToast';
    overlay.className = 'creator-activation-success-toast';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.addEventListener('click', function () {
      dismissActivationSuccessToast();
    });

    var card = document.createElement('div');
    card.className = 'creator-activation-success-toast__card';
    card.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    var icon = document.createElement('div');
    icon.className = 'creator-activation-success-toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✓';

    var headlineTpl = M.libraryActivateSuccessHeadline || '%design_title%';
    var headlineEl = document.createElement('div');
    headlineEl.className = 'creator-activation-success-toast__headline';
    headlineEl.textContent = replaceActivationPlaceholders(headlineTpl, {
      design_title: designTitle || (M.libraryActivateSuccessUntitled || 'Design'),
    });

    var subEl = document.createElement('div');
    subEl.className = 'creator-activation-success-toast__sub';
    if (showProductCountLine) {
      subEl.textContent = replaceActivationPlaceholders(
        M.libraryActivateSuccessSub || '',
        { count: String(productCount) }
      );
    } else {
      subEl.textContent =
        M.libraryActivateSuccessSubGeneric ||
        replaceActivationPlaceholders(M.libraryActivateSuccessSub || '', { count: String(productCount) });
    }

    card.appendChild(icon);
    card.appendChild(headlineEl);
    card.appendChild(subEl);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    activationToastTimers.hide = setTimeout(function () {
      activationToastTimers.hide = null;
      dismissActivationSuccessToast();
    }, 5600);
  }

  function syncDesignsActivityToggleUi() {
    document.querySelectorAll('[data-designs-activity]').forEach(function (b) {
      var on = b.getAttribute('data-designs-activity') === designsActivityFilter;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function scrollDesignsGridToTop() {
    var grid = document.getElementById('creatorDesignsGrid');
    if (!grid || !grid.parentElement) return;
    var p = grid.parentElement;
    try {
      p.scrollTop = 0;
    } catch (_) {}
  }

  function setDesignsActivityFilter(v) {
    if (v !== 'active' && v !== 'inactive') return;
    if (v === designsActivityFilter) return;
    var p = perf();
    if (p) p.mark('activity-switch-start');
    var t0 = performance && performance.now ? performance.now() : Date.now();
    designsActivityFilter = v;
    syncDesignsActivityToggleUi();
    filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
    renderDesignsGrid();
    scrollDesignsGridToTop();
    if (p) {
      p.record('activity_switch', (performance && performance.now ? performance.now() : Date.now()) - t0);
      p.mark('activity-switch-end');
      p.measure('activity_switch', 'activity-switch-start', 'activity-switch-end');
    }
    try {
      window.dispatchEvent(
        new CustomEvent('creator-creations-activity-filter', { detail: { filter: designsActivityFilter } })
      );
    } catch (_) {}
  }

  /** Merge server-aligned fields into an existing saved design row (optimistic UI). */
  function applyDesignLibraryPatch(designId, patch) {
    var id = designId != null ? String(designId).trim() : '';
    if (!id || !patch) return false;
    var found = false;
    var i;
    for (i = 0; i < designs.length; i++) {
      if (String(designs[i].id || '').trim() !== id) continue;
      found = true;
      var d = designs[i];
      if (patch.library_status === 'active' || patch.library_status === 'inactive') {
        d.library_status = patch.library_status;
      }
      if (patch.visibility != null) d.visibility = patch.visibility;
      if (patch.creator_name !== undefined) d.creator_name = patch.creator_name ? String(patch.creator_name) : null;
      d.updated_at = Date.now();
      var meta = {};
      try {
        meta = d.metadata && typeof d.metadata === 'object' ? Object.assign({}, d.metadata) : {};
      } catch (_) {
        meta = {};
      }
      if (patch.publish_excluded_product_keys !== undefined) {
        meta.publish_excluded_product_keys = Array.isArray(patch.publish_excluded_product_keys)
          ? patch.publish_excluded_product_keys.slice()
          : [];
      }
      if (patch.shop_locked === false) {
        d.shop_locked = false;
        delete meta.shop_locked;
        if (patch.metadata && typeof patch.metadata === 'object') {
          Object.keys(patch.metadata).forEach(function (k) {
            if (k === 'shop_locked') return;
            meta[k] = patch.metadata[k];
          });
        }
      } else if (patch.shop_locked === true) {
        d.shop_locked = true;
        meta.shop_locked = true;
      }
      d.metadata = meta;
      break;
    }
    filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
    renderDesignsGrid();
    return found;
  }

  /**
   * After delete-design / delete-job: drop the row from cached lists and re-render — no fetch.
   * @param {{ designId?: string, jobId?: string }} opts
   * @returns {boolean} true if a matching row was removed
   */
  function removeDeletedDesignLocally(opts) {
    opts = opts || {};
    var sid = opts.designId != null ? String(opts.designId).trim() : '';
    var sjob = opts.jobId != null ? String(opts.jobId).trim() : '';
    if (!sid && !sjob) return false;
    var before = designs.length;
    designs = designs.filter(function (d) {
      var dId = d.id != null ? String(d.id).trim() : '';
      var dJob = d.job_id != null ? String(d.job_id).trim() : '';
      if (sid && dId === sid) return false;
      if (sjob && dJob === sjob) return false;
      return true;
    });
    if (designs.length === before) return false;
    if (sid) {
      delete publishedSummaryByDesignId[sid];
      delete creationsProductBadgesByDesignId[sid];
    }
    filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
    renderDesignsGrid();
    return true;
  }

  function normalizeJobIdListForBulkSave(jobIds) {
    var out = [];
    var seen = {};
    (jobIds || []).forEach(function (x) {
      var s = x != null ? String(x).trim() : '';
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    return out;
  }

  /** Call when user starts bulk save: rows leave Inactive immediately; merge suppresses KV/generated until D1 row exists. */
  function beginBulkSaveUnsavedJobsUi(jobIds) {
    var ids = normalizeJobIdListForBulkSave(jobIds);
    if (!ids.length) return;
    ids.forEach(function (jid) {
      suppressedGeneratedJobIds.add(jid);
    });
    designs = designs.filter(function (d) {
      var idStr = d.id != null ? String(d.id).trim() : '';
      var j = d.job_id != null ? String(d.job_id).trim() : '';
      if (idStr !== '') return true;
      if (!j || ids.indexOf(j) < 0) return true;
      return false;
    });
    filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
    renderDesignsGrid();
    try {
      if (window.CreatorCreationsBulk && typeof window.CreatorCreationsBulk.pruneSelection === 'function') {
        window.CreatorCreationsBulk.pruneSelection();
      }
    } catch (e) {}
  }

  function stopLibrarySaveWatch() {
    if (librarySaveWatchTimerId != null) {
      clearInterval(librarySaveWatchTimerId);
      librarySaveWatchTimerId = null;
    }
  }

  function hasSavingDesignsInList() {
    if (pendingUploadEntries().some(function (d) {
      return d && d.upload_pending && d.upload_status !== 'failed';
    })) {
      return true;
    }
    return designs.some(function (d) {
      return d && d.saving_to_library;
    });
  }

  function startLibrarySaveWatchIfNeeded() {
    if (!hasSavingDesignsInList()) {
      stopLibrarySaveWatch();
      return;
    }
    if (librarySaveWatchTimerId != null) return;
    librarySaveWatchTimerId = setInterval(function () {
      loadDesigns(true, { silent: true }).then(function () {
        if (!hasSavingDesignsInList()) stopLibrarySaveWatch();
      }).catch(function () {});
    }, LIBRARY_SAVE_POLL_MS);
  }

  function appendSavingToLibraryOverlay(container, design) {
    if (!container || !design) return;
    var uploadPending = !!design.upload_pending;
    if (!uploadPending && !design.saving_to_library) return;
    var overlay = document.createElement('div');
    overlay.className = 'creator-creations-saving-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    var spinner = document.createElement('div');
    spinner.className = 'creator-creations-saving-overlay__spinner';
    overlay.appendChild(spinner);
    var label = document.createElement('span');
    label.className = 'creator-creations-saving-overlay__label';
    if (uploadPending) {
      label.textContent = resolveUploadStatusLabel(design.upload_status);
    } else {
      label.textContent =
        (window.CreatorMobileI18n && window.CreatorMobileI18n.creationsSavingToLibrary) || 'Saving…';
    }
    overlay.appendChild(label);
    container.appendChild(overlay);
    if (container.classList) {
      container.classList.add('creator-creations-card--saving');
      if (uploadPending) container.classList.add('creator-creations-card--upload-pending');
    }
  }

  function renderRejectedDesignsSection(rejectedList, gridWrap) {
    var existing = document.getElementById('creatorDesignsRejectedSection');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    if (!rejectedList.length || designsActivityFilter !== 'inactive') return;
    var M = window.CreatorMobileI18n || {};
    var host = gridWrap && gridWrap.parentElement;
    if (!host) return;
    var details = document.createElement('details');
    details.id = 'creatorDesignsRejectedSection';
    details.className = 'creator-creations-rejected-section';
    var summary = document.createElement('summary');
    summary.textContent =
      (M.reviewRejectedSection || 'Rejected — needs changes') + ' (' + rejectedList.length + ')';
    details.appendChild(summary);
    var hint = document.createElement('p');
    hint.className = 'creator-creations-rejected-section__hint';
    hint.textContent =
      M.reviewResubmitHint || 'Edit your design and activate again to resubmit.';
    details.appendChild(hint);
    var mini = document.createElement('div');
    mini.className = 'creator-creations-rejected-section__grid';
    rejectedList.forEach(function (design, idx) {
      mini.appendChild(createDesignCard(design, false, idx));
    });
    details.appendChild(mini);
    host.insertBefore(details, gridWrap);
  }

  function stopBulkSaveWatchTimer() {
    if (bulkSaveWatchTimerId != null) {
      clearInterval(bulkSaveWatchTimerId);
      bulkSaveWatchTimerId = null;
    }
    bulkSaveWatchDeadlineMs = 0;
  }

  function fetchDesignByJobIdForBulkWatch(jobId, ownerId) {
    var jid = jobId != null ? String(jobId).trim() : '';
    var oid = ownerId != null ? String(ownerId).trim() : '';
    if (!jid || !oid) return Promise.resolve(null);
    var url =
      API_BASE +
      '?op=get-design&job_id=' +
      encodeURIComponent(jid) +
      '&owner_id=' +
      encodeURIComponent(oid);
    return fetch(url, { credentials: 'include' })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        if (!data || !data.ok || !data.design) return null;
        return data.design;
      })
      .catch(function () {
        return null;
      });
  }

  /** Insert a single saved row from get-design if not already present. */
  function mergeBulkSavedDesignIntoList(raw) {
    if (!raw || raw.id == null) return false;
    var idStr = String(raw.id).trim();
    if (!idStr) return false;
    var i;
    for (i = 0; i < designs.length; i++) {
      if (String(designs[i].id || '').trim() === idStr) return false;
    }
    var itemForNormalize = {
      id: raw.id,
      job_id: raw.job_id,
      prompt: raw.prompt,
      preview_url: raw.preview_url,
      original_url: raw.original_url,
      metadata: raw.metadata,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      creator_name: raw.creator_name,
      visibility: raw.visibility,
      library_status: raw.library_status,
      title: raw.title,
    };
    designs.push(normalizeSaved(itemForNormalize));
    return true;
  }

  /** After all save-design HTTP calls succeeded: switch to Active, then merge each finished row via get-design (no loadDesigns polling). */
  function finishBulkSaveUnsavedJobsUi(jobIds) {
    var ids = normalizeJobIdListForBulkSave(jobIds);
    if (!ids.length) return Promise.resolve();
    setDesignsActivityFilter('active');
    startBulkSaveWatch(ids);
    return Promise.resolve();
  }

  function startBulkSaveWatch(ids) {
    var normalized = normalizeJobIdListForBulkSave(ids);
    if (!normalized.length) return;
    var owner = getOwnerId();
    if (!owner) {
      normalized.forEach(function (j) {
        suppressedGeneratedJobIds.delete(j);
      });
      filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
      renderDesignsGrid();
      return;
    }
    if (!bulkSaveWatchPendingSet) bulkSaveWatchPendingSet = new Set();
    normalized.forEach(function (jid) {
      bulkSaveWatchPendingSet.add(jid);
    });
    var bump = Date.now() + BULK_SAVE_WATCH_WINDOW_MS;
    bulkSaveWatchDeadlineMs = Math.max(bulkSaveWatchDeadlineMs || 0, bump);

    function tick() {
      if (bulkSaveWatchTickBusy) return;
      if (!bulkSaveWatchPendingSet) return;
      if (!bulkSaveWatchPendingSet.size) {
        stopBulkSaveWatchTimer();
        bulkSaveWatchPendingSet = null;
        fetchCreationsProductBadges()
          .then(function () {
            filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
            renderDesignsGrid();
          })
          .catch(function () {});
        return;
      }
      if (Date.now() > bulkSaveWatchDeadlineMs) {
        bulkSaveWatchPendingSet.forEach(function (jid) {
          suppressedGeneratedJobIds.delete(jid);
        });
        stopBulkSaveWatchTimer();
        bulkSaveWatchPendingSet = null;
        filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
        renderDesignsGrid();
        return;
      }
      bulkSaveWatchTickBusy = true;
      var pending = Array.from(bulkSaveWatchPendingSet);
      var mergedAny = false;
      var seq = Promise.resolve();
      pending.forEach(function (jid) {
        seq = seq.then(function () {
          return fetchDesignByJobIdForBulkWatch(jid, owner).then(function (raw) {
            if (!raw || raw.id == null) return;
            if (mergeBulkSavedDesignIntoList(raw)) mergedAny = true;
            bulkSaveWatchPendingSet.delete(jid);
            suppressedGeneratedJobIds.delete(jid);
          });
        });
      });
      seq
        .then(function () {
          if (mergedAny) {
            sortDesignsNewestFirst(designs);
            filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
            renderDesignsGrid();
            try {
              window.dispatchEvent(new CustomEvent('creator-designs-loaded', { detail: { count: designs.length } }));
            } catch (e3) {}
          }
          if (!bulkSaveWatchPendingSet || !bulkSaveWatchPendingSet.size) {
            stopBulkSaveWatchTimer();
            bulkSaveWatchPendingSet = null;
            return fetchCreationsProductBadges().then(function () {
              filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
              renderDesignsGrid();
            });
          }
        })
        .catch(function () {})
        .finally(function () {
          bulkSaveWatchTickBusy = false;
        });
    }

    if (bulkSaveWatchTimerId == null) {
      bulkSaveWatchTickBusy = false;
      tick();
      bulkSaveWatchTimerId = setInterval(tick, 2200);
    }
  }

  /** Restore list if bulk save failed after optimistic UI. */
  function cancelBulkSaveUnsavedJobsUi(jobIds) {
    var ids = normalizeJobIdListForBulkSave(jobIds);
    ids.forEach(function (j) {
      suppressedGeneratedJobIds.delete(j);
      if (bulkSaveWatchPendingSet) bulkSaveWatchPendingSet.delete(j);
    });
    if (!bulkSaveWatchPendingSet || !bulkSaveWatchPendingSet.size) {
      stopBulkSaveWatchTimer();
      bulkSaveWatchPendingSet = null;
      bulkSaveWatchTickBusy = false;
    }
    return loadDesigns(true, { silent: true }).then(function () {
      try {
        if (window.CreatorCreationsBulk && typeof window.CreatorCreationsBulk.pruneSelection === 'function') {
          window.CreatorCreationsBulk.pruneSelection();
        }
      } catch (e2) {}
    });
  }

  function filterDesigns(query) {
    var base = getDesignsBaseForActivityAndModalFilters();
    if (!query || !query.trim()) {
      filteredDesigns = base.slice();
    } else {
      var q = query.trim().toLowerCase();
      filteredDesigns = base.filter(function (d) {
        return (d.title || '').toLowerCase().indexOf(q) >= 0 || (d.prompt || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    sortDesignsNewestFirst(filteredDesigns);
  }

  function filterProducts(query) {
    if (!query || !query.trim()) {
      filteredProducts = products.slice();
    } else {
      var q = query.trim().toLowerCase();
      filteredProducts = products.filter(function (p) {
        return (p.title || '').toLowerCase().indexOf(q) >= 0 ||
          (p.product_name || '').toLowerCase().indexOf(q) >= 0 ||
          (p.product_key || '').toLowerCase().indexOf(q) >= 0;
      });
    }
  }

  function ensureParticleCanvas(container) {
    var canvas = document.createElement('canvas');
    canvas.className = 'creator-drawer__aquarium-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    return canvas;
  }

  /** True only for KV-only completed jobs with no creations row (legacy). Saved inactive designs have an id. */
  function isInactiveLibraryDesign(d) {
    if (!d) return false;
    var id = d.id != null ? String(d.id).trim() : '';
    if (id !== '') return false;
    return true;
  }

  function buildJobLikeForPreviewModal(design) {
    var jid = design.job_id != null ? String(design.job_id).trim() : '';
    if (!jid) return null;
    var url = design.preview_url || design.original_url || design.image_url || '';
    var meta = design && design.metadata && typeof design.metadata === 'object' ? design.metadata : null;
    var userImageUrl =
      (design && design.user_image_url) ||
      (meta && (meta.user_image_url || meta.reference_image_url || meta.source_image_url || null)) ||
      null;
    return {
      job_id: jid,
      prompt: design.prompt || design.title || '',
      design_prompt: design.design_prompt || design.prompt || null,
      final_prompt: design.design_prompt || design.prompt || null,
      preview_url: url || null,
      image_url: design.image_url || url || null,
      result: url
        ? { preview_url: url, image_url: design.image_url || url }
        : (design.metadata && design.metadata.result) || null,
      done: true,
      saved: false,
      library_status: 'inactive',
      finished: design.created_at || Date.now(),
      user_image_url: userImageUrl,
      metadata: meta || null
    };
  }

  function normalizeJobPayloadForPreviewModal(job) {
    if (!job) return null;
    var url = (job.result && (job.result.preview_url || job.result.image_url)) ||
      job.preview_url || job.image_url || job.generated_image_url || '';
    if (!url && typeof job.result === 'string' && job.result.indexOf('http') === 0) {
      url = job.result;
    }
    if (!url) return null;
    var out = {};
    for (var k in job) {
      if (Object.prototype.hasOwnProperty.call(job, k)) out[k] = job[k];
    }
    if (!out.result || (!out.result.preview_url && !out.result.image_url)) {
      out.result = { preview_url: url, image_url: out.image_url || url };
    }
    if (!out.user_image_url) {
      var meta = out.metadata && typeof out.metadata === 'object' ? out.metadata : null;
      out.user_image_url =
        (meta && (meta.user_image_url || meta.reference_image_url || meta.source_image_url || null)) || null;
    }
    return out;
  }

  function openJobPreviewModalFromPayload(jobPayload) {
    var normalized = normalizeJobPayloadForPreviewModal(jobPayload);
    if (!normalized) {
      console.warn('[CreationsScreen] Job preview: no preview URL after fetch');
      return;
    }
    function tryOpen() {
      if (window.CreatorJobPreviewModalGlobal && typeof window.CreatorJobPreviewModalGlobal.open === 'function') {
        window.CreatorJobPreviewModalGlobal.open(normalized);
        return true;
      }
      return false;
    }
    if (tryOpen()) return;
    var start = Date.now();
    (function poll() {
      if (tryOpen()) return;
      if (Date.now() - start > 2800) {
        console.warn('[CreationsScreen] CreatorJobPreviewModalGlobal not ready');
        return;
      }
      setTimeout(poll, 90);
    })();
  }

  function mergeFetchedJobIntoLocal(local, fetched) {
    if (!fetched) return local || null;
    var url = (fetched.result && (fetched.result.preview_url || fetched.result.image_url)) ||
      fetched.preview_url || fetched.image_url || '';
    var merged = Object.assign({}, local || {}, fetched);
    if (url) {
      merged.result = merged.result || {};
      merged.result.preview_url = merged.result.preview_url || url;
      merged.result.image_url = merged.result.image_url || merged.result.preview_url;
    }
    return merged;
  }

  function openInactiveDesignJobPreview(design) {
    var jobId = design.job_id != null ? String(design.job_id).trim() : '';
    var owner = getOwnerId();
    var local = buildJobLikeForPreviewModal(design);

    if (!jobId || !owner) {
      openJobPreviewModalFromPayload(local || { job_id: '', result: null });
      return;
    }
    fetch(
      API_BASE + '?op=get-generated&job_id=' + encodeURIComponent(jobId) + '&owner_id=' + encodeURIComponent(owner),
      { credentials: 'include' }
    )
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var fetched = data && data.ok && data.job ? data.job : null;
        var merged = mergeFetchedJobIntoLocal(local, fetched);
        openJobPreviewModalFromPayload(merged);
      })
      .catch(function () {
        openJobPreviewModalFromPayload(local);
      });
  }

  function openCreationsDesignDetailModal(design) {
    if (design && design.upload_pending) return;
    if (isInactiveLibraryDesign(design)) {
      console.info('[CreationsScreen] Inactive (unsaved generated) → job preview modal', {
        job_id: design.job_id || null
      });
      openInactiveDesignJobPreview(design);
      return;
    }

    var imageUrl = design.preview_url || design.original_url || design.image_url;
    var previewApi = window.CreatorDesignPreviewModal;
    console.info('[CreationsScreen] Design detail open', {
      design_id: design.design_id || design.id || null,
      job_id: design.job_id || null,
      has_preview: !!(previewApi && typeof previewApi.open === 'function')
    });
    if (previewApi && typeof previewApi.open === 'function') {
      previewApi.open({
        id: design.id || null,
        design_id: design.design_id || design.id || null,
        preview_url: design.preview_url || imageUrl || '',
        original_url: design.original_url || imageUrl || null,
        width: design.width != null && design.width !== '' ? Number(design.width) : null,
        height: design.height != null && design.height !== '' ? Number(design.height) : null,
        title: design.title || 'Design',
        job_id: design.job_id || null,
        owner_id: getOwnerId(),
        metadata: design.metadata || null,
        prompt: design.prompt || null,
        design_prompt: design.design_prompt || null,
        visibility: design.visibility || null,
        creator_name: design.creator_name || null,
        image_url: design.image_url || imageUrl || null
      });
      return;
    }
    if (imageUrl) {
      window.dispatchEvent(new CustomEvent('gen-design-selected', { detail: { imageUrl: imageUrl } }));
    }
  }

  function setImgLoadingPriority(img, index, eagerUntil, highUntil) {
    if (!img) return;
    if (typeof index === 'number' && index < eagerUntil) {
      img.loading = 'eager';
      if (typeof index === 'number' && index < highUntil) {
        try {
          img.setAttribute('fetchpriority', 'high');
        } catch (_) {}
      }
    } else {
      img.loading = 'lazy';
    }
  }

  function createDesignCard(design, useParticleAnimation, index) {
    var card = document.createElement('div');
    card.className = 'creator-creations-card';
    card.setAttribute('data-eazy-guide', 'creations.design-card');
    card.dataset.designId = design.id || '';
    card.dataset.jobId = design.job_id || '';
    card.dataset.designIndex = String(index);

    var url = design.preview_url || design.original_url || design.image_url;
    var useParticle =
      !!(canUseCreationsCardReveal() && typeof index === 'number' && index >= DESIGN_PARTICLE_MIN_INDEX);
    if (url) {
      if (useParticle) {
        var media = document.createElement('div');
        media.className = 'creator-creations-card-media creator-creations-card-media--shimmer';
        card.appendChild(media);
        ensureParticleCanvas(media);
        card.dataset.particleUrl = url;
      } else {
        var img = document.createElement('img');
        img.src = url;
        img.alt = design.title || 'Design';
        setImgLoadingPriority(img, index, DESIGN_IMAGE_EAGER_COUNT, DESIGN_IMAGE_FETCH_PRIORITY_HIGH);
        card.appendChild(img);
      }
    } else {
      var noImg = document.createElement('div');
      noImg.className = 'creator-creations-card-noimg';
      noImg.textContent = '—';
      card.appendChild(noImg);
    }

    var idStr = design.id != null ? String(design.id).trim() : '';
    var uploadPending = !!design.upload_pending;
    if (uploadPending) {
      var statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'creator-creations-card-library-btn creator-creations-card-library-btn--status';
      statusBtn.textContent = resolveUploadStatusLabel(design.upload_status);
      statusBtn.setAttribute('aria-label', statusBtn.textContent);
      statusBtn.disabled = true;
      card.appendChild(statusBtn);
      card.classList.add('creator-creations-card--upload-pending');
    } else if (idStr) {
      var badgeBtn = document.createElement('button');
      badgeBtn.type = 'button';
      badgeBtn.className = 'creator-creations-card-products-badge';
      badgeBtn.setAttribute(
        'aria-label',
        (window.CreatorMobileI18n && window.CreatorMobileI18n.designProductsBadgeAria) || 'Products'
      );
      badgeBtn.innerHTML =
        '<span class="creator-creations-card-products-badge__icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg></span>' +
        '<span class="creator-creations-card-products-badge__text">' +
        escapeBadgeHtml(formatDesignProductBadgeText(design)) +
        '</span>';
      badgeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var previewApi = window.CreatorDesignPreviewModal;
        if (previewApi && typeof previewApi.open === 'function') {
          previewApi.open(design, { screen: 'products' });
        } else if (typeof window.openCreatorDesignProductsModal === 'function') {
          window.openCreatorDesignProductsModal({ design: design });
        }
      });
      card.appendChild(badgeBtn);

      var libBtn = document.createElement('button');
      libBtn.type = 'button';
      libBtn.className = 'creator-creations-card-library-btn';
      var lsBtn = resolveLibraryStatus(design);
      var Mi = window.CreatorMobileI18n || {};
      var shopLocked = isShopLockedDesign(design);
      if (shopLocked) {
        libBtn.textContent = Mi.libraryUnlockShopBtn || 'Unlock';
        libBtn.setAttribute('aria-label', Mi.libraryUnlockShopAria || 'Unlock Shop design with EAZV');
        libBtn.classList.add('creator-creations-card-library-btn--unlock');
      } else if (lsBtn === 'inactive') {
        libBtn.textContent = Mi.libraryActivateBtn || 'Activate';
        libBtn.setAttribute('aria-label', Mi.libraryActivateAria || 'Activate design');
      } else {
        libBtn.textContent = Mi.libraryDeactivateBtn || 'Deactivate';
        libBtn.setAttribute('aria-label', Mi.libraryDeactivateAria || 'Deactivate design');
      }
      libBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (shopLocked) {
          if (typeof window.unlockShopStudioDesign === 'function') {
            window.unlockShopStudioDesign(design);
          }
          return;
        }
        if (lsBtn === 'inactive') {
          var previewApiActivate = window.CreatorDesignPreviewModal;
          if (previewApiActivate && typeof previewApiActivate.open === 'function') {
            previewApiActivate.open(design, { screen: 'activate', mode: 'activate' });
          } else if (typeof window.openCreatorCreationsActivateModal === 'function') {
            window.openCreatorCreationsActivateModal(design);
          }
        } else if (typeof window.openCreatorCreationsDeactivateModal === 'function') {
          window.openCreatorCreationsDeactivateModal(design);
        }
      });
      card.appendChild(libBtn);
    }

    appendShopLockBadges(card, design);
    appendReviewStatusBadge(card, design);

    if (isBulkSelectableDesign(design)) {
      card.classList.add('creator-creations-card--bulk');
      var bw = document.createElement('div');
      bw.className = 'creator-creations-card-bulk-wrap';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'creator-creations-card-bulk-cb';
      var bulkKey = resolveBulkSelectionKey(design);
      if (bulkKey) cb.setAttribute('data-bulk-key', bulkKey);
      cb.setAttribute(
        'aria-label',
        (window.CreatorMobileI18n && window.CreatorMobileI18n.bulkSelectDesignAria) || 'Select design'
      );
      if (window.CreatorCreationsBulk && typeof window.CreatorCreationsBulk.isSelectedKey === 'function') {
        cb.checked = !!window.CreatorCreationsBulk.isSelectedKey(bulkKey);
      }
      cb.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      cb.addEventListener('change', function (e) {
        e.stopPropagation();
        if (window.CreatorCreationsBulk && typeof window.CreatorCreationsBulk.setSelectedWithDesign === 'function') {
          window.CreatorCreationsBulk.setSelectedWithDesign(design, !!cb.checked);
        }
      });
      bw.appendChild(cb);
      card.appendChild(bw);
    }

    appendSavingToLibraryOverlay(card, design);

    return card;
  }

  function appendDesignCardsToGrid(fromIndex, toIndex) {
    var grid = document.getElementById('creatorDesignsGrid');
    if (!grid) return;
    var fragment = document.createDocumentFragment();
    var canReveal = canUseCreationsCardReveal();
    var revealQueue = [];
    for (var i = fromIndex; i < toIndex && i < currentRenderDesigns.length; i++) {
      var card = createDesignCard(currentRenderDesigns[i], canReveal, i);
      fragment.appendChild(card);
      if (card.dataset.particleUrl && canReveal) {
        revealQueue.push(card);
      }
    }
    grid.appendChild(fragment);
    revealQueue.forEach(function (card) {
      var particleUrl = card.dataset.particleUrl;
      if (particleUrl) {
        var media = card.querySelector('.creator-creations-card-media');
        var canvas = media && media.querySelector('canvas');
        if (canvas && media) {
          (function (mediaEl, canvasEl, url) {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                if (!canUseCreationsCardReveal()) {
                  if (mediaEl) mediaEl.classList.remove('creator-creations-card-media--shimmer');
                  return;
                }
                try {
                  var anim = ParticleReveal.run(canvasEl, url, {
                    density: 6,
                    backgroundColor: 'transparent',
                    particleOpacity: 1,
                    noDissolve: true,
                    radialReveal: true,
                    onComplete: function () {
                      var idx = activeGridParticleAnims.indexOf(anim);
                      if (idx >= 0) activeGridParticleAnims.splice(idx, 1);
                      var p = perf();
                      if (p) p.setCounter('particle_rafs', activeGridParticleAnims.length);
                      if (mediaEl) mediaEl.classList.remove('creator-creations-card-media--shimmer');
                    }
                  });
                  registerGridParticleAnim(anim);
                } catch (_) {
                  if (mediaEl) mediaEl.classList.remove('creator-creations-card-media--shimmer');
                }
              });
            });
          })(media, canvas, particleUrl);
        }
      }
    });
  }

  var designsScrollObserver = null;
  var designsScrollSentinel = null;

  function loadNextDesignBatch() {
    if (viewMode === 'list' || designsRenderedCount >= currentRenderDesigns.length) return;
    var nextBatch = Math.min(designsRenderedCount + DESIGN_GRID_BATCH_SIZE, currentRenderDesigns.length);
    appendDesignCardsToGrid(designsRenderedCount, nextBatch);
    designsRenderedCount = nextBatch;
    ensureDesignsScrollSentinel();
  }

  function ensureDesignsScrollSentinel() {
    if (viewMode === 'list') return;
    var grid = document.getElementById('creatorDesignsGrid');
    var gridWrap = grid && grid.parentElement;
    if (!grid || !gridWrap) return;

    var endEl = grid.querySelector('[data-creations-end-reached]');
    if (designsScrollSentinel && designsScrollSentinel.parentNode) {
      designsScrollSentinel.parentNode.removeChild(designsScrollSentinel);
      designsScrollSentinel = null;
    }
    if (designsScrollObserver) {
      designsScrollObserver.disconnect();
      designsScrollObserver = null;
    }
    if (designsRenderedCount >= filteredDesigns.length) {
      if (filteredDesigns.length > 0 && !endEl) {
        var msg = document.createElement('div');
        msg.setAttribute('data-creations-end-reached', 'true');
        msg.className = 'creator-creations-end-reached';
        msg.textContent = (window.CreatorMobileI18n && window.CreatorMobileI18n.creationsEndReached) || 'End of list — you have seen all designs';
        grid.appendChild(msg);
      }
      return;
    }
    if (endEl && endEl.parentNode) endEl.parentNode.removeChild(endEl);

    designsScrollSentinel = document.createElement('div');
    designsScrollSentinel.setAttribute('data-creations-scroll-sentinel', 'true');
    designsScrollSentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;visibility:hidden;';
    grid.appendChild(designsScrollSentinel);

    designsScrollObserver = new IntersectionObserver(
      function (entries) {
        if (!entries[0] || !entries[0].isIntersecting) return;
        loadNextDesignBatch();
      },
      { root: gridWrap, rootMargin: '200px', threshold: 0 }
    );
    designsScrollObserver.observe(designsScrollSentinel);
    var pObs = perf();
    if (pObs) pObs.setCounter('designs_observers', 1);
  }

  function onDesignsGridScroll() {
    if (viewMode === 'list') return;
    var grid = document.getElementById('creatorDesignsGrid');
    if (!grid) return;
    var gridWrap = grid.parentElement;
    if (!gridWrap) return;
    if (designsRenderedCount >= currentRenderDesigns.length) return;

    var scrollTop = gridWrap.scrollTop;
    var scrollHeight = gridWrap.scrollHeight;
    var clientHeight = gridWrap.clientHeight;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      loadNextDesignBatch();
    }
  }

  var productPreviewModalLoadPromise = null;

  function resolveProductPreviewModalAssetUrl(explicitUrl, fileName) {
    if (explicitUrl) return explicitUrl;
    try {
      if (
        window.__CREATOR_PORTAL_HOST__ ||
        (window.location &&
          window.location.hostname &&
          (window.location.hostname === 'creator.eazpire.com' ||
            window.location.hostname.indexOf('creator.') === 0))
      ) {
        return '/vendor/theme/' + fileName;
      }
    } catch (_e) {}
    try {
      var scripts = document.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || '';
        if (src.indexOf('creator-creations-screen.js') !== -1) {
          return src.replace('creator-creations-screen.js', fileName);
        }
      }
    } catch (_e2) {}
    var bundle = window.__CREATOR_LAZY_CREATIONS_BUNDLE || [];
    for (var b = 0; b < bundle.length; b++) {
      var u = String(bundle[b] || '');
      if (u.indexOf('creator-creations-screen.js') !== -1) {
        return u.replace('creator-creations-screen.js', fileName);
      }
    }
    return '';
  }

  function ensureCssHref(href) {
    if (!href) return;
    var base = String(href).split('?')[0];
    var already = Array.prototype.some.call(
      document.querySelectorAll('link[rel="stylesheet"]'),
      function (l) {
        return (l.getAttribute('href') || '').split('?')[0] === base;
      }
    );
    if (already) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function withPortalCacheBust(url) {
    if (!url) return url;
    if (String(url).indexOf('?') !== -1) return url;
    var v = window.__CREATOR_PORTAL_ASSET_V || 'ppm-fix-20260719d';
    return String(url) + '?v=' + v;
  }

  /** Lazy-load Product Preview Modal (Creations → Products). */
  function ensureProductPreviewModal() {
    if (window.CreatorProductPreviewModal && typeof window.CreatorProductPreviewModal.open === 'function') {
      return Promise.resolve();
    }
    if (productPreviewModalLoadPromise) return productPreviewModalLoadPromise;

    var lazy = window.__CreatorLazyModals;
    var jsUrl = withPortalCacheBust(
      resolveProductPreviewModalAssetUrl(
        window.__CREATOR_PRODUCT_PREVIEW_MODAL_JS || '',
        'creator-product-preview-modal.js'
      )
    );
    var cssUrl = withPortalCacheBust(
      resolveProductPreviewModalAssetUrl(
        window.__CREATOR_PRODUCT_PREVIEW_MODAL_CSS || '',
        'creator-product-preview-modal.css'
      )
    );
    ensureCssHref(cssUrl);

    if (lazy && typeof lazy.loadScript === 'function' && jsUrl) {
      productPreviewModalLoadPromise = lazy.loadScript(jsUrl).catch(function (err) {
        productPreviewModalLoadPromise = null;
        throw err;
      });
      return productPreviewModalLoadPromise;
    }

    if (!jsUrl) {
      return Promise.reject(new Error('Product preview modal loader unavailable'));
    }

    productPreviewModalLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = jsUrl;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        productPreviewModalLoadPromise = null;
        reject(new Error('product_preview_modal_load_failed'));
      };
      document.head.appendChild(s);
    });
    return productPreviewModalLoadPromise;
  }

  /**
   * Open Product Preview Modal for a published Products-tab card.
   * Lazy-loads assets if needed. Never redirects to the shop.
   */
  function openPublishedProductPreview(prod) {
    if (!prod) return;
    var productKey = prod.product_key || null;
    var productName = prod.title || prod.product_name || productKey || 'Product';
    var imageUrl =
      prod.image_url ||
      prod.featured_image ||
      prod.mockup_image ||
      prod.preview_image ||
      null;
    var designIds = Array.isArray(prod.design_ids) ? prod.design_ids : [];
    var designId = designIds.length ? designIds[0] : null;
    var opts = {
      productKey: productKey,
      productName: productName,
      ownerId: getOwnerId() || '',
      designId: designId,
      imageUrl: imageUrl,
      renderedSrc: imageUrl,
      publishedDesignId: prod.published_design_id || null,
      printifyProductId: prod.printify_product_id || null,
      printifyImages: Array.isArray(prod.printify_images) ? prod.printify_images : null,
      mockupsByView:
        prod.mockups_by_view && typeof prod.mockups_by_view === 'object'
          ? prod.mockups_by_view
          : null,
    };

    ensureProductPreviewModal()
      .then(function () {
        if (
          window.CreatorProductPreviewModal &&
          typeof window.CreatorProductPreviewModal.open === 'function'
        ) {
          window.CreatorProductPreviewModal.open(opts);
          return;
        }
        console.warn('[CreationsScreen] Product preview modal unavailable for', productKey);
      })
      .catch(function (err) {
        console.error('[CreationsScreen] Failed to load product preview modal:', err);
      });
  }

  function createProductCard(prod, index) {
    var card = document.createElement('div');
    card.className = 'creator-creations-card';
    var isTest = !!prod.is_test_product || prod.publish_intent === 'test_publish';
    var inProgress =
      isTest &&
      prod.shopify_completion_status !== 'complete' &&
      prod.shopify_completion_status !== 'failed';
    if (isTest) card.classList.add('is-test-product');
    if (inProgress) card.classList.add('is-test-publishing');
    card.setAttribute('data-eazy-guide', 'creations.product-card');
    if (prod.product_key) card.setAttribute('data-product-key', String(prod.product_key));
    var media = document.createElement('div');
    media.className = 'creator-creations-card-media';
    appendProductImageCarousel(media, prod, index);
    if (!media.querySelector('img') && !media.querySelector('.creator-creations-product-carousel__track')) {
      var noImg = document.createElement('div');
      noImg.className = 'creator-creations-card-noimg';
      noImg.textContent = '—';
      media.appendChild(noImg);
      tryHydrateProductCardImage(media, prod);
    }
    if (inProgress) {
      var load = document.createElement('div');
      load.className = 'creator-creations-card-loading';
      load.innerHTML = '<span class="creator-creations-card-spinner" aria-hidden="true"></span>';
      media.appendChild(load);
      var st = document.createElement('div');
      st.className = 'creator-creations-card-status';
      st.textContent =
        prod.publish_status_detail ||
        (window.CreatorI18n && window.CreatorI18n['creator.creations.test_product_publishing']) ||
        'Publishing…';
      card.appendChild(st);
    }
    if (isTest) {
      var badge = document.createElement('span');
      badge.className = 'creator-creations-card-badge creator-creations-card-badge--test';
      badge.textContent =
        (window.CreatorI18n && window.CreatorI18n['creator.creations.test_product']) || 'Test Product';
      card.appendChild(badge);
    }
    appendReviewStatusBadge(card, prod);
    card.appendChild(media);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', function (e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openPublishedProductPreview(prod);
    });
    card.addEventListener('keydown', function (e) {
      if (!e) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPublishedProductPreview(prod);
      }
    });
    return card;
  }

  function appendProductCardsToGrid(fromIndex, toIndex) {
    var grid = document.getElementById('creatorProductsGrid');
    if (!grid) return;
    var fragment = document.createDocumentFragment();
    for (var i = fromIndex; i < toIndex && i < filteredProducts.length; i++) {
      var card = createProductCard(filteredProducts[i], i);
      fragment.appendChild(card);
    }
    grid.appendChild(fragment);
  }

  var productsScrollObserver = null;
  var productsScrollSentinel = null;

  function loadNextProductBatch() {
    if (viewMode === 'list' || productsRenderedCount >= filteredProducts.length) return;
    var nextBatch = Math.min(productsRenderedCount + PRODUCT_GRID_BATCH_SIZE, filteredProducts.length);
    appendProductCardsToGrid(productsRenderedCount, nextBatch);
    productsRenderedCount = nextBatch;
    ensureProductsScrollSentinel();
  }

  function ensureProductsScrollSentinel() {
    if (viewMode === 'list') return;
    var grid = document.getElementById('creatorProductsGrid');
    var gridWrap = grid && grid.parentElement;
    if (!grid || !gridWrap) return;

    var endEl = grid.querySelector('[data-creations-end-reached]');
    if (productsScrollSentinel && productsScrollSentinel.parentNode) {
      productsScrollSentinel.parentNode.removeChild(productsScrollSentinel);
      productsScrollSentinel = null;
    }
    if (productsScrollObserver) {
      productsScrollObserver.disconnect();
      productsScrollObserver = null;
    }
    if (productsRenderedCount >= filteredProducts.length) {
      if (filteredProducts.length > 0 && !endEl) {
        var msg = document.createElement('div');
        msg.setAttribute('data-creations-end-reached', 'true');
        msg.className = 'creator-creations-end-reached';
        msg.textContent = (window.CreatorMobileI18n && window.CreatorMobileI18n.creationsEndReachedProducts) || 'End of list — you have seen all products';
        grid.appendChild(msg);
      }
      return;
    }
    if (endEl && endEl.parentNode) endEl.parentNode.removeChild(endEl);

    productsScrollSentinel = document.createElement('div');
    productsScrollSentinel.setAttribute('data-creations-scroll-sentinel', 'true');
    productsScrollSentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;visibility:hidden;';
    grid.appendChild(productsScrollSentinel);

    productsScrollObserver = new IntersectionObserver(
      function (entries) {
        if (!entries[0] || !entries[0].isIntersecting) return;
        loadNextProductBatch();
      },
      { root: gridWrap, rootMargin: '200px', threshold: 0 }
    );
    productsScrollObserver.observe(productsScrollSentinel);
  }

  function onProductsGridScroll() {
    if (viewMode === 'list') return;
    var grid = document.getElementById('creatorProductsGrid');
    if (!grid) return;
    var gridWrap = grid.parentElement;
    if (!gridWrap) return;
    if (productsRenderedCount >= filteredProducts.length) return;

    var scrollTop = gridWrap.scrollTop;
    var scrollHeight = gridWrap.scrollHeight;
    var clientHeight = gridWrap.clientHeight;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      loadNextProductBatch();
    }
  }

  function finishGridRenderPerf(p, t0) {
    if (!p) return;
    p.record('grid_render', (performance && performance.now ? performance.now() : Date.now()) - t0);
    p.mark('grid-render-end');
    p.measure('grid_render', 'grid-render-start', 'grid-render-end');
    p.setCounter('card_reveal_enabled', canUseCreationsCardReveal() ? 1 : 0);
  }

  function renderDesignsGrid() {
    var grid = document.getElementById('creatorDesignsGrid');
    var empty = document.getElementById('creatorDesignsEmpty');
    var loading = document.getElementById('creatorDesignsLoading');
    var countEl = document.getElementById('creatorDesignsCount');

    if (!grid) return;

    var p = perf();
    if (p) p.mark('grid-render-start');
    var t0 = performance && performance.now ? performance.now() : Date.now();

    stopAllGridParticleReveals();
    teardownDesignsGridObservers();
    grid.innerHTML = '';

    if (shouldShowDesignsLoading()) {
      if (empty) empty.style.display = 'none';
      if (loading) {
        loading.style.display = 'flex';
        setCreationsLoadingElement(loading, 'designs');
      }
      grid.style.display = 'none';
      var listL = document.getElementById('creatorDesignsList');
      if (listL) listL.style.display = 'none';
      if (countEl) countEl.textContent = '—';
      finishGridRenderPerf(p, t0);
      return;
    }

    if (loading) {
      resetCreationsLoadingElement(loading);
      loading.style.display = 'none';
    }

    var rejectedDesigns = [];
    currentRenderDesigns = filteredDesigns;
    if (designsActivityFilter === 'inactive') {
      rejectedDesigns = [];
      currentRenderDesigns = [];
      filteredDesigns.forEach(function (d) {
        if (isReviewRejected(d)) rejectedDesigns.push(d);
        else currentRenderDesigns.push(d);
      });
    }
    renderRejectedDesignsSection(rejectedDesigns, grid.parentElement);

    if (currentRenderDesigns.length === 0 && rejectedDesigns.length === 0) {
      if (empty) {
        empty.style.display = 'block';
        var M = window.CreatorMobileI18n || {};
        var poolActivity = designs.filter(designsMatchingActivity);
        var emptyMsg;
        if (designsLoadError) {
          emptyMsg = designsLoadError;
        } else if (designs.length === 0) {
          emptyMsg = M.creationsNoDesigns || 'No designs found.';
        } else if (poolActivity.length === 0) {
          emptyMsg =
            designsActivityFilter === 'inactive'
              ? M.creationsEmptyInactive || 'No unsaved generated designs.'
              : M.creationsEmptyActive || 'No saved designs yet.';
        } else {
          emptyMsg = M.creationsNoMatches || 'No matches for your search or filters.';
        }
        empty.textContent = emptyMsg;
      }
      grid.style.display = 'none';
      var listEl0 = document.getElementById('creatorDesignsList');
      if (listEl0) listEl0.style.display = 'none';
      finishGridRenderPerf(p, t0);
    } else {
      if (empty) empty.style.display = 'none';
      var listEl = document.getElementById('creatorDesignsList');
      var isList = viewMode === 'list';
      grid.style.display = isList ? 'none' : 'grid';
      if (listEl) listEl.style.display = isList ? 'flex' : 'none';

      if (isList && listEl) {
        listEl.innerHTML = '';
        currentRenderDesigns.forEach(function (design, idx) {
          var item = document.createElement('div');
          item.className = 'creator-creations-list-item';
          item.dataset.designIndex = String(idx);
          item.dataset.designId = design.id != null ? String(design.id).trim() : '';
          var url = design.preview_url || design.original_url || design.image_url;
          if (isBulkSelectableDesign(design)) {
            item.classList.add('creator-creations-list-item--bulk');
            var lbw = document.createElement('div');
            lbw.className = 'creator-creations-list-item-bulk-wrap';
            var lcb = document.createElement('input');
            lcb.type = 'checkbox';
            lcb.className = 'creator-creations-list-bulk-cb';
            var listBulkKey = resolveBulkSelectionKey(design);
            if (listBulkKey) lcb.setAttribute('data-bulk-key', listBulkKey);
            lcb.setAttribute(
              'aria-label',
              (window.CreatorMobileI18n && window.CreatorMobileI18n.bulkSelectDesignAria) || 'Select design'
            );
            if (window.CreatorCreationsBulk && typeof window.CreatorCreationsBulk.isSelectedKey === 'function') {
              lcb.checked = !!window.CreatorCreationsBulk.isSelectedKey(listBulkKey);
            }
            lcb.addEventListener('click', function (e) {
              e.stopPropagation();
            });
            lcb.addEventListener('change', function (e) {
              e.stopPropagation();
              if (window.CreatorCreationsBulk && typeof window.CreatorCreationsBulk.setSelectedWithDesign === 'function') {
                window.CreatorCreationsBulk.setSelectedWithDesign(design, !!lcb.checked);
              }
            });
            lbw.appendChild(lcb);
            item.appendChild(lbw);
          }
          var thumb = document.createElement('div');
          thumb.className = 'creator-creations-list-item-thumb';
          if (url) {
            var img = document.createElement('img');
            img.src = url;
            img.alt = design.title || 'Design';
            setImgLoadingPriority(img, idx, DESIGN_IMAGE_EAGER_COUNT, DESIGN_IMAGE_FETCH_PRIORITY_HIGH);
            thumb.appendChild(img);
          } else thumb.textContent = '—';
          appendSavingToLibraryOverlay(thumb, design);
          item.appendChild(thumb);
          var body = document.createElement('div');
          body.className = 'creator-creations-list-item-body';
          var top = document.createElement('div');
          top.className = 'creator-creations-list-item-top';
          var title = document.createElement('span');
          title.className = 'creator-creations-list-item-title';
          title.textContent = design.title || 'Design';
          top.appendChild(title);
          var catBadge = document.createElement('span');
          catBadge.className = 'creator-creations-list-item-badge creator-creations-list-item-badge--category';
          catBadge.textContent = getCategory(design);
          top.appendChild(catBadge);
          body.appendChild(top);
          var bottom = document.createElement('div');
          bottom.className = 'creator-creations-list-item-bottom';
          var leftBadges = document.createElement('span');
          leftBadges.className = 'creator-creations-list-item-bottom-left';
          var dateBadge = document.createElement('span');
          dateBadge.className = 'creator-creations-list-item-badge creator-creations-list-item-badge--date';
          var dateMs = designSortTimestampMs(design);
          dateBadge.textContent = dateMs
            ? new Date(dateMs).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
          leftBadges.appendChild(dateBadge);
          var creatorName = (design.creator_name || '').toString().trim();
          if (creatorName) {
            var creatorBadge = document.createElement('span');
            creatorBadge.className = 'creator-creations-list-item-badge creator-creations-list-item-badge--creator';
            creatorBadge.textContent = creatorName;
            leftBadges.appendChild(creatorBadge);
          }
          bottom.appendChild(leftBadges);
          var rightActions = document.createElement('div');
          rightActions.className = 'creator-creations-list-item-bottom-actions';
          var prodBadge = document.createElement('button');
          prodBadge.type = 'button';
          prodBadge.className =
            'creator-creations-list-item-badge creator-creations-list-item-badge--products creator-creations-list-item-badge--products-btn';
          prodBadge.setAttribute(
            'aria-label',
            (window.CreatorMobileI18n && window.CreatorMobileI18n.designProductsBadgeAria) || 'Products'
          );
          prodBadge.innerHTML =
            '<span class="creator-creations-list-item-badge-icon">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg></span>' +
            '<span class="creator-creations-list-item-badge-count">' +
            escapeBadgeHtml(formatDesignProductBadgeText(design)) +
            '</span>';
          prodBadge.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var previewApi = window.CreatorDesignPreviewModal;
            if (previewApi && typeof previewApi.open === 'function') {
              previewApi.open(design, { screen: 'products' });
            } else if (typeof window.openCreatorDesignProductsModal === 'function') {
              window.openCreatorDesignProductsModal({ design: design });
            }
          });
          rightActions.appendChild(prodBadge);

          var idStrList = design.id != null ? String(design.id).trim() : '';
          if (design.upload_pending) {
            var statusBtnList = document.createElement('button');
            statusBtnList.type = 'button';
            statusBtnList.className =
              'creator-creations-list-item-library-btn creator-creations-list-item-badge creator-creations-list-item-badge--library creator-creations-list-item-library-btn--status';
            statusBtnList.textContent = resolveUploadStatusLabel(design.upload_status);
            statusBtnList.disabled = true;
            rightActions.appendChild(statusBtnList);
          } else if (idStrList) {
            var libBtnList = document.createElement('button');
            libBtnList.type = 'button';
            libBtnList.className =
              'creator-creations-list-item-library-btn creator-creations-list-item-badge creator-creations-list-item-badge--library';
            var lsList = resolveLibraryStatus(design);
            var MiL = window.CreatorMobileI18n || {};
            var shopLockedList = isShopLockedDesign(design);
            if (shopLockedList) {
              libBtnList.textContent = MiL.libraryUnlockShopBtn || 'Unlock';
              libBtnList.setAttribute('aria-label', MiL.libraryUnlockShopAria || 'Unlock Shop design with EAZV');
            } else if (lsList === 'inactive') {
              libBtnList.textContent = MiL.libraryActivateBtn || 'Activate';
              libBtnList.setAttribute('aria-label', MiL.libraryActivateAria || 'Activate design');
            } else {
              libBtnList.textContent = MiL.libraryDeactivateBtn || 'Deactivate';
              libBtnList.setAttribute('aria-label', MiL.libraryDeactivateAria || 'Deactivate design');
            }
            libBtnList.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (shopLockedList) {
                if (typeof window.unlockShopStudioDesign === 'function') {
                  window.unlockShopStudioDesign(design);
                }
                return;
              }
              if (lsList === 'inactive') {
                var previewApiActivateList = window.CreatorDesignPreviewModal;
                if (previewApiActivateList && typeof previewApiActivateList.open === 'function') {
                  previewApiActivateList.open(design, { screen: 'activate', mode: 'activate' });
                } else if (typeof window.openCreatorCreationsActivateModal === 'function') {
                  window.openCreatorCreationsActivateModal(design);
                }
              } else if (typeof window.openCreatorCreationsDeactivateModal === 'function') {
                window.openCreatorCreationsDeactivateModal(design);
              }
            });
            rightActions.appendChild(libBtnList);
            if (shopLockedList) {
              var shopBadgeList = document.createElement('span');
              shopBadgeList.className =
                'creator-creations-list-item-badge creator-creations-list-item-badge--shop';
              shopBadgeList.textContent = MiL.libraryBadgeShop || 'Shop';
              leftBadges.appendChild(shopBadgeList);
              var privBadgeList = document.createElement('span');
              privBadgeList.className =
                'creator-creations-list-item-badge creator-creations-list-item-badge--private';
              privBadgeList.textContent = MiL.libraryBadgePrivate || 'Private';
              leftBadges.appendChild(privBadgeList);
            }
          }

          bottom.appendChild(rightActions);
          body.appendChild(bottom);
          item.appendChild(body);
          listEl.appendChild(item);
        });
      } else {
        designsRenderedCount = Math.min(DESIGN_GRID_BATCH_SIZE, currentRenderDesigns.length);
        appendDesignCardsToGrid(0, designsRenderedCount);
        ensureDesignsScrollSentinel();
      }
    }

    if (countEl) {
      countEl.textContent =
        currentRenderDesigns.length +
        ' design' +
        (currentRenderDesigns.length !== 1 ? 's' : '') +
        (rejectedDesigns.length ? ' +' + rejectedDesigns.length + ' rejected' : '');
    }

    finishGridRenderPerf(p, t0);
  }

  function renderProductsGrid() {
    var grid = document.getElementById('creatorProductsGrid');
    var empty = document.getElementById('creatorProductsEmpty');
    var loading = document.getElementById('creatorProductsLoading');
    var countEl = document.getElementById('creatorProductsCount');
    var Mp = window.CreatorMobileI18n || {};

    if (!grid) return;

    grid.innerHTML = '';

    if (shouldShowProductsLoading()) {
      if (empty) empty.style.display = 'none';
      if (loading) {
        loading.style.display = 'flex';
        setCreationsLoadingElement(loading, 'products');
      }
      grid.style.display = 'none';
      var listP = document.getElementById('creatorProductsList');
      if (listP) listP.style.display = 'none';
      if (countEl) countEl.textContent = '—';
      return;
    }

    if (loading) {
      resetCreationsLoadingElement(loading);
      loading.style.display = 'none';
    }

    if (filteredProducts.length === 0) {
      if (empty) {
        empty.style.display = 'block';
        if (productsLoadError) {
          empty.textContent = productsLoadError;
        } else {
          empty.textContent =
            products.length === 0
              ? Mp.creationsNoProducts || 'No products found.'
              : Mp.creationsNoMatches || 'No matches for your search or filters.';
        }
      }
      grid.style.display = 'none';
      var listEl0 = document.getElementById('creatorProductsList');
      if (listEl0) listEl0.style.display = 'none';
    } else {
      if (empty) empty.style.display = 'none';
      var listEl = document.getElementById('creatorProductsList');
      var isList = viewMode === 'list';
      grid.style.display = isList ? 'none' : 'grid';
      if (listEl) listEl.style.display = isList ? 'flex' : 'none';

      if (isList && listEl) {
        listEl.innerHTML = '';
        filteredProducts.forEach(function (prod, pidx) {
          var item = document.createElement('div');
          item.className = 'creator-creations-list-item';
          var url = resolveProductImageUrl(prod);
          var thumb = document.createElement('div');
          thumb.className = 'creator-creations-list-item-thumb';
          if (url) {
            var img = document.createElement('img');
            img.src = url;
            img.alt = prod.title || 'Product';
            setImgLoadingPriority(img, pidx, PRODUCT_IMAGE_EAGER_COUNT, PRODUCT_IMAGE_FETCH_PRIORITY_HIGH);
            thumb.appendChild(img);
          } else thumb.textContent = '—';
          if (!url && prod.shopify_handle) {
            getProductImageFromStoreHandle(prod.shopify_handle).then(function (storeImg) {
              if (!storeImg || thumb.querySelector('img')) return;
              thumb.textContent = '';
              var fallback = document.createElement('img');
              fallback.src = storeImg;
              fallback.alt = prod.title || 'Product';
              setImgLoadingPriority(fallback, pidx, PRODUCT_IMAGE_EAGER_COUNT, PRODUCT_IMAGE_FETCH_PRIORITY_HIGH);
              thumb.appendChild(fallback);
              prod.image_url = storeImg;
            });
          }
          item.appendChild(thumb);
          var body = document.createElement('div');
          body.className = 'creator-creations-list-item-body';
          var top = document.createElement('div');
          top.className = 'creator-creations-list-item-top';
          var title = document.createElement('span');
          title.className = 'creator-creations-list-item-title';
          title.textContent = prod.title || prod.product_name || 'Product';
          top.appendChild(title);
          var prodTypeBadge = document.createElement('span');
          prodTypeBadge.className = 'creator-creations-list-item-badge creator-creations-list-item-badge--category';
          prodTypeBadge.textContent = (prod.product_key || prod.product_name || '—').replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
          top.appendChild(prodTypeBadge);
          body.appendChild(top);
          var bottom = document.createElement('div');
          bottom.className = 'creator-creations-list-item-bottom';
          var leftBadges = document.createElement('span');
          leftBadges.className = 'creator-creations-list-item-bottom-left';
          var dateBadge = document.createElement('span');
          dateBadge.className = 'creator-creations-list-item-badge creator-creations-list-item-badge--date';
          dateBadge.textContent = prod.published_at
            ? new Date(prod.published_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
          leftBadges.appendChild(dateBadge);
          bottom.appendChild(leftBadges);
          body.appendChild(bottom);
          item.appendChild(body);
          item.setAttribute('role', 'button');
          item.setAttribute('tabindex', '0');
          item.addEventListener('click', function (e) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            openPublishedProductPreview(prod);
          });
          item.addEventListener('keydown', function (e) {
            if (!e) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPublishedProductPreview(prod);
            }
          });
          listEl.appendChild(item);
        });
      } else {
        productsRenderedCount = Math.min(PRODUCT_GRID_BATCH_SIZE, filteredProducts.length);
        appendProductCardsToGrid(0, productsRenderedCount);
        ensureProductsScrollSentinel();
      }
    }

    if (countEl) countEl.textContent = filteredProducts.length + ' product' + (filteredProducts.length !== 1 ? 's' : '');
  }

  function scheduleDesignsLoadRetryIfNeeded() {
    if (designsLoadedOnce || designsOwnerRetryTimerId) return;
    if (designsOwnerRetryAttempts >= DESIGNS_OWNER_RETRY_MAX) return;
    designsOwnerRetryAttempts++;
    designsOwnerRetryTimerId = setTimeout(function () {
      designsOwnerRetryTimerId = null;
      if (designsLoadedOnce) return;
      if (getOwnerId()) {
        loadDesigns(true);
      } else {
        scheduleDesignsLoadRetryIfNeeded();
      }
    }, 300);
  }

  function enrichDesignsMetadataInBackground() {
    return Promise.all([fetchPublishedSummary(), fetchCreationsProductBadges()])
      .then(function () {
        if (!designsLoadedOnce) return;
        filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
        renderDesignsGrid();
      })
      .catch(function (e) {
        console.warn('[CreationsScreen] enrichDesignsMetadataInBackground:', e);
      });
  }

  function loadDesigns(forceReload, loadOpts) {
    var force = forceReload === true;
    var silent = loadOpts && loadOpts.silent === true;
    if (!force && designsLoadedOnce && designsLoadPromise === null) {
      filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
      renderDesignsGrid();
      return Promise.resolve(designs);
    }
    if (designsLoadPromise) {
      if (!force) return designsLoadPromise;
      return designsLoadPromise.finally(function () {
        return loadDesigns(true, loadOpts);
      });
    }
    var grid = document.getElementById('creatorDesignsGrid');
    var loading = document.getElementById('creatorDesignsLoading');
    var empty = document.getElementById('creatorDesignsEmpty');

    if (!silent) {
      if (grid) grid.innerHTML = '';
      if (empty) empty.style.display = 'none';
      designsLoadError = null;
      if (loading) {
        loading.style.display = 'flex';
        setCreationsLoadingElement(loading, 'designs');
      }
    } else {
      designsLoadError = null;
    }

    if (!getOwnerId()) {
      scheduleDesignsLoadRetryIfNeeded();
      renderDesignsGrid();
      return Promise.resolve([]);
    }

    designsLoadPromise = fetchDesigns()
      .then(function (designList) {
        designs = designList || [];
        prunePendingUploadsAgainstDesigns(designs);
        designsLoadError = null;
        designsLoadedOnce = true;
        designsOwnerRetryAttempts = 0;
        try {
          filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
          console.info('[CreationsScreen] loadDesigns debug', {
            designs_count: designs.length,
            filtered_count_after_search: filteredDesigns.length,
            search_value: ((document.getElementById('creatorDesignsSearch') || {}).value || '')
          });
          renderDesignsGrid();
          startLibrarySaveWatchIfNeeded();
        } catch (renderErr) {
          console.error('[CreationsScreen] render after loadDesigns failed:', renderErr);
          filteredDesigns = [];
          var Mi = window.CreatorMobileI18n || {};
          designsLoadError =
            (Mi.creationsLoadFailed || 'Could not load.') +
            (renderErr && renderErr.message ? ' (' + String(renderErr.message) + ')' : '');
          try {
            renderDesignsGrid();
          } catch (renderErr2) {
            console.error('[CreationsScreen] renderDesignsGrid fatal:', renderErr2);
          }
        }
        window.dispatchEvent(new CustomEvent('creator-designs-loaded', { detail: { count: designs.length } }));
        enrichDesignsMetadataInBackground();
        return designs;
      })
      .catch(function (err) {
        if (err && err.code === 'MISSING_OWNER_ID') {
          designsLoadError = null;
          designsLoadedOnce = false;
          scheduleDesignsLoadRetryIfNeeded();
          renderDesignsGrid();
          return [];
        }
        console.warn('[CreationsScreen] loadDesigns error:', err);
        designs = [];
        filteredDesigns = [];
        var MiErr = window.CreatorMobileI18n || {};
        designsLoadError = MiErr.creationsLoadFailed || 'Could not load.';
        designsLoadedOnce = true;
        renderDesignsGrid();
        return [];
      })
      .finally(function () {
        if (loading && !silent) {
          resetCreationsLoadingElement(loading);
          loading.style.display = 'none';
        }
        designsLoadPromise = null;
      });
    return designsLoadPromise;
  }

  function loadProducts() {
    if (productsLoadedOnce && productsLoadPromise === null) {
      filteredProducts = products.slice();
      filterProducts(document.getElementById('creatorProductsSearch')?.value || '');
      renderProductsGrid();
      return Promise.resolve(products);
    }
    if (productsLoadPromise) return productsLoadPromise;
    var grid = document.getElementById('creatorProductsGrid');
    var loading = document.getElementById('creatorProductsLoading');
    var empty = document.getElementById('creatorProductsEmpty');

    if (grid) grid.innerHTML = '';
    if (empty) empty.style.display = 'none';
    productsLoadError = null;
    if (loading) {
      loading.style.display = 'flex';
      setCreationsLoadingElement(loading, 'products');
    }

    console.log('[CreationsScreen] loadProducts: fetch started');
    productsLoadPromise = fetchProducts().then(function (items) {
      console.log('[CreationsScreen] loadProducts: fetch ok, items=', items?.length ?? 0);
      products = items || [];
      productsLoadError = null;
      productsLoadedOnce = true;
      filteredProducts = products.slice();
      filterProducts(document.getElementById('creatorProductsSearch')?.value || '');
      renderProductsGrid();
      ensureTestPublishProductsPoll();
      window.dispatchEvent(new CustomEvent('creator-products-loaded', { detail: { count: products.length } }));
    }).catch(function (err) {
      console.error('[CreationsScreen] loadProducts: fetch error', err);
      products = [];
      filteredProducts = [];
      var Mq = window.CreatorMobileI18n || {};
      productsLoadError = Mq.creationsLoadFailed || 'Could not load.';
      productsLoadedOnce = true;
      renderProductsGrid();
    }).finally(function () {
      if (loading) {
        resetCreationsLoadingElement(loading);
        loading.style.display = 'none';
      }
      productsLoadPromise = null;
    });
    return productsLoadPromise;
  }

  function setViewMode(mode) {
    var isAllowed = mode === 'grid2' || mode === 'grid3' || mode === 'grid4' || mode === 'grid6' || mode === 'list';
    viewMode = isAllowed ? mode : 'grid2';
    var creations = document.getElementById('creatorCreations');
    if (creations) creations.classList.toggle('creator-creations--list', viewMode === 'list');
    var designGrid = document.getElementById('creatorDesignsGrid');
    var productGrid = document.getElementById('creatorProductsGrid');
    if (designGrid && viewMode !== 'list') {
      designGrid.classList.remove('creator-creations-grid--2', 'creator-creations-grid--3', 'creator-creations-grid--4', 'creator-creations-grid--6');
      if (viewMode === 'grid2') designGrid.classList.add('creator-creations-grid--2');
      else if (viewMode === 'grid3') designGrid.classList.add('creator-creations-grid--3');
      else if (viewMode === 'grid4') designGrid.classList.add('creator-creations-grid--4');
      else designGrid.classList.add('creator-creations-grid--6');
    }
    if (productGrid && viewMode !== 'list') {
      productGrid.classList.remove('creator-creations-grid--2', 'creator-creations-grid--3', 'creator-creations-grid--4', 'creator-creations-grid--6');
      if (viewMode === 'grid2') productGrid.classList.add('creator-creations-grid--2');
      else if (viewMode === 'grid3') productGrid.classList.add('creator-creations-grid--3');
      else if (viewMode === 'grid4') productGrid.classList.add('creator-creations-grid--4');
      else productGrid.classList.add('creator-creations-grid--6');
    }
    updateViewIcon();
    renderDesignsGrid();
    renderProductsGrid();
  }

  function updateViewIcon() {
    var icon = document.getElementById('creatorCreationsViewIcon');
    if (icon && VIEW_ICONS[viewMode]) icon.innerHTML = VIEW_ICONS[viewMode];
  }

  function openViewModal() {
    var overlay = document.getElementById('creatorViewModeOverlay');
    if (overlay) {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    document.querySelectorAll('.creator-view-mode-opt').forEach(function (btn) {
      btn.classList.toggle('is-selected', btn.dataset.view === viewMode);
    });
  }

  function closeViewModal() {
    var overlay = document.getElementById('creatorViewModeOverlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function switchTab(tab) {
    currentTab = tab;
    var panelDesigns = document.getElementById('creatorCreationsPanelDesigns');
    var panelProducts = document.getElementById('creatorCreationsPanelProducts');
    var headerTitle = document.querySelector('.creator-header__title');

    document.querySelectorAll('.creator-creations-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });

    if (panelDesigns) panelDesigns.classList.toggle('creator-creations-panel--hidden', tab !== 'designs');
    if (panelProducts) panelProducts.classList.toggle('creator-creations-panel--hidden', tab !== 'products');

    if (headerTitle) headerTitle.textContent = tab === 'designs' ? 'Designs' : 'Products';

    if (tab === 'designs') loadDesigns();
    else if (tab === 'products') loadProducts();
  }

  function bindCreationsScreen() {
    setViewMode(viewMode);
    var tabDesigns = document.querySelector('.creator-creations-tab[data-tab="designs"]');
    var tabProducts = document.querySelector('.creator-creations-tab[data-tab="products"]');
    var searchDesigns = document.getElementById('creatorDesignsSearch');
    var searchProducts = document.getElementById('creatorProductsSearch');
    var uploadBtn = document.getElementById('creatorDesignsUpload');
    var filterDesignsBtn = document.getElementById('creatorDesignsFilter');
    var filterProductsBtn = document.getElementById('creatorProductsFilter');

    if (tabDesigns) tabDesigns.addEventListener('click', function () { switchTab('designs'); });
    if (tabProducts) tabProducts.addEventListener('click', function () { switchTab('products'); });

    var debounceTimer;
    if (searchDesigns) {
      searchDesigns.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          filterDesigns(searchDesigns.value);
          renderDesignsGrid();
        }, 300);
      });
    }
    if (searchProducts) {
      searchProducts.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          filterProducts(searchProducts.value);
          renderProductsGrid();
        }, 300);
      });
    }

    if (uploadBtn) {
      var designUploadFileInput = document.createElement('input');
      designUploadFileInput.type = 'file';
      designUploadFileInput.accept = 'image/png,image/jpeg,image/svg+xml';
      designUploadFileInput.style.display = 'none';
      designUploadFileInput.multiple = false;
      document.body.appendChild(designUploadFileInput);

      designUploadFileInput.addEventListener('change', function () {
        var file = designUploadFileInput.files[0];
        designUploadFileInput.value = '';
        if (!file) return;

        var maxSize = 30 * 1024 * 1024;
        if (file.size > maxSize) {
          alert('Die Datei ist zu groß. Maximale Größe: 30MB');
          return;
        }
        var allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) {
          alert('Ungültiger Dateityp. Erlaubt sind: PNG, JPG, SVG');
          return;
        }

        var api = window.DesignUploadModal && window.DesignUploadModal.init({ selectedFile: file });
        if (api && typeof api.open === 'function') api.open();
      });

      uploadBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof window.openCreationsUploadSourceChoice === 'function') {
          window.openCreationsUploadSourceChoice('creator-mobile');
          return;
        }
        designUploadFileInput.click();
      });
    }

    if (filterDesignsBtn) filterDesignsBtn.addEventListener('click', function () {
      if (typeof window.openFilterModal === 'function') window.openFilterModal({ source: 'designs' });
    });
    if (filterProductsBtn) filterProductsBtn.addEventListener('click', function () {
      if (typeof window.openFilterModal === 'function') window.openFilterModal({ source: 'products' });
    });

    document.querySelectorAll('[data-designs-activity]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-designs-activity');
        if (!v) return;
        setDesignsActivityFilter(v);
      });
    });

    function refreshDesignsOnSaveProgress() {
      if (designsActivityFilter !== 'inactive') return;
      loadDesigns(true, { silent: true }).catch(function () {});
    }
    window.addEventListener('creatorSaveJobStarted', refreshDesignsOnSaveProgress);
    window.addEventListener('creatorJobUpdated', function (ev) {
      var job = ev && ev.detail && ev.detail.job;
      if (job && job.saving && !job.saved) refreshDesignsOnSaveProgress();
    });
    window.addEventListener('creatorJobCompleted', function (ev) {
      var job = ev && ev.detail && ev.detail.job;
      if (job) insertOptimisticInactiveDesignFromJob(job);
      if (job && !job.saved && (job.saving || job.done)) refreshDesignsOnSaveProgress();
    });
    window.addEventListener('creatorUploadPlaceholder', function (ev) {
      upsertPendingUploadPlaceholder((ev && ev.detail) || {});
    });
    window.addEventListener('creatorUploadProgress', function (ev) {
      updatePendingUploadProgress((ev && ev.detail) || {});
    });
    window.addEventListener('creator-upload-finished', function (ev) {
      var detail = (ev && ev.detail) || {};
      var jobId = detail.jobId != null ? String(detail.jobId).trim() : '';
      var statusKey = detail.statusKey || (detail.status && detail.status.error ? 'failed' : 'done');
      updatePendingUploadProgress({
        jobId: jobId,
        localId: detail.localId,
        status: statusKey === 'failed' ? 'failed' : 'done',
        previewUrl:
          (detail.status && detail.status.result && (detail.status.result.preview_url || detail.status.result.image_url)) ||
          (detail.status && (detail.status.preview_url || detail.status.image_url)) ||
          null
      });
      if (statusKey !== 'failed' && jobId) {
        // Real row replaces placeholder after loadDesigns prune
        loadDesigns(true, { silent: true }).catch(function () {});
      }
    });

    window.addEventListener('creator-filter-applied', function (e) {
      var detail = (e && e.detail) || {};
      var source = detail.source || 'designs';
      var filters = detail.filters || detail.designFilters || detail.productFilters || {};
      if (source === 'designs' && typeof window.matchesDesignFilter === 'function') {
        lastDesignFilters = filters;
        filterDesigns((document.getElementById('creatorDesignsSearch') || {}).value || '');
        renderDesignsGrid();
      } else if (source === 'products') {
        if (typeof window.matchesProductFilter === 'function') {
          filteredProducts = products.filter(function (p) { return window.matchesProductFilter(p, filters); });
        } else {
          filteredProducts = products.slice();
        }
        var searchEl = document.getElementById('creatorProductsSearch');
        var searchVal = searchEl ? (searchEl.value || '').trim() : '';
        if (searchVal) {
          var q = searchVal.toLowerCase();
          filteredProducts = filteredProducts.filter(function (p) {
            return (p.title || '').toLowerCase().indexOf(q) >= 0 ||
              (p.product_name || '').toLowerCase().indexOf(q) >= 0 ||
              (p.product_key || '').toLowerCase().indexOf(q) >= 0;
          });
        }
        renderProductsGrid();
      }
    });

    var viewBtn = document.getElementById('creatorCreationsViewBtn');
    var viewOverlay = document.getElementById('creatorViewModeOverlay');
    if (viewBtn) viewBtn.addEventListener('click', openViewModal);
    if (viewOverlay) {
      viewOverlay.addEventListener('click', function (e) {
        if (e.target === viewOverlay) closeViewModal();
      });
    }
    document.querySelectorAll('.creator-view-mode-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setViewMode(btn.dataset.view);
        closeViewModal();
      });
    });

    var designsGrid = document.getElementById('creatorDesignsGrid');
    if (designsGrid && designsGrid.parentElement) {
      designsGrid.parentElement.addEventListener('scroll', onDesignsGridScroll, { passive: true });
    }
    var productsGrid = document.getElementById('creatorProductsGrid');
    if (productsGrid && productsGrid.parentElement) {
      productsGrid.parentElement.addEventListener('scroll', onProductsGridScroll, { passive: true });
    }

    var touchTapState = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      startAt: 0,
      suppressClickUntil: 0
    };

    function onTapTouchStart(e) {
      var t = e && e.touches && e.touches[0];
      if (!t) return;
      touchTapState.active = true;
      touchTapState.moved = false;
      touchTapState.startX = t.clientX;
      touchTapState.startY = t.clientY;
      touchTapState.startAt = Date.now();
    }

    function onTapTouchMove(e) {
      if (!touchTapState.active) return;
      var t = e && e.touches && e.touches[0];
      if (!t) return;
      var dx = Math.abs(t.clientX - touchTapState.startX);
      var dy = Math.abs(t.clientY - touchTapState.startY);
      if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
        touchTapState.moved = true;
      }
    }

    var pendingClickTimer = null;

    function resolveDesignFromEvent(e) {
      var target = e && e.target;
      if (
        target &&
        target.closest &&
        target.closest(
          '.creator-creations-card-products-badge, .creator-creations-card-library-btn, .creator-creations-card-bulk-wrap, .creator-creations-list-item-badge--products-btn, .creator-creations-list-item-library-btn, .creator-creations-list-item-bulk-wrap'
        )
      ) {
        return null;
      }
      var card = target && target.closest ? target.closest('.creator-creations-card, .creator-creations-list-item') : null;
      if (!card) return null;
      var index = Number(card.getAttribute('data-design-index'));
      if (!isFinite(index) || index < 0 || index >= filteredDesigns.length) return null;
      return filteredDesigns[index];
    }

    function openMergeModalWithDesign(design) {
      if (!design) return;
      var mergeModal = window.CreatorDesignMergeModal;
      if (!mergeModal || typeof mergeModal.open !== 'function') {
        console.warn('[CreationsScreen] Merge modal API not available');
        return;
      }
      var designId = design.design_id || design.id || null;
      if (!designId) {
        console.warn('[CreationsScreen] Cannot open merge modal: missing design id');
        return;
      }

      var previewUrl = design.preview_url || design.original_url || design.image_url || null;
      if (typeof mergeModal.clearSlot === 'function') {
        mergeModal.clearSlot('left');
        mergeModal.clearSlot('right');
      }
      if (typeof mergeModal.setSlot === 'function') {
        mergeModal.setSlot('left', {
          designId: designId,
          previewUrl: previewUrl,
          title: design.title || ('Design ' + String(designId))
        });
      }
      mergeModal.open();
      console.info('[CreationsScreen] Merge modal opened via double click', { design_id: designId });
    }

    function handleDesignTapEvent(e) {
      var now = Date.now();
      if (e && e.type === 'click' && now < touchTapState.suppressClickUntil) {
        return;
      }
      if (e && e.type === 'dblclick') {
        if (pendingClickTimer) {
          clearTimeout(pendingClickTimer);
          pendingClickTimer = null;
        }
        var mergeDesign = resolveDesignFromEvent(e);
        if (!mergeDesign) return;
        e.preventDefault();
        e.stopPropagation();
        openMergeModalWithDesign(mergeDesign);
        return;
      }
      if (e && e.type === 'touchend') {
        var duration = now - (touchTapState.startAt || now);
        if (touchTapState.moved || duration > TAP_MAX_DURATION_MS) {
          touchTapState.active = false;
          return;
        }
        // A valid tap already handled on touchend; ignore synthetic click.
        touchTapState.suppressClickUntil = now + 700;
      }

      var design = resolveDesignFromEvent(e);
      if (!design) return;
      if (e && e.type === 'click') {
        // Delay single-click action so double-click can override it.
        if (pendingClickTimer) clearTimeout(pendingClickTimer);
        pendingClickTimer = setTimeout(function() {
          pendingClickTimer = null;
          openCreationsDesignDetailModal(design);
        }, SINGLE_CLICK_DELAY_MS);
      } else {
        openCreationsDesignDetailModal(design);
      }
      touchTapState.active = false;
    }

    var designsGridWrap = designsGrid && designsGrid.parentElement;
    var designsList = document.getElementById('creatorDesignsList');
    if (designsGridWrap) {
      designsGridWrap.addEventListener('touchstart', onTapTouchStart, { passive: true });
      designsGridWrap.addEventListener('touchmove', onTapTouchMove, { passive: true });
      designsGridWrap.addEventListener('click', handleDesignTapEvent);
      designsGridWrap.addEventListener('dblclick', handleDesignTapEvent);
      designsGridWrap.addEventListener('touchend', handleDesignTapEvent, { passive: true });
    }
    if (designsList) {
      designsList.addEventListener('touchstart', onTapTouchStart, { passive: true });
      designsList.addEventListener('touchmove', onTapTouchMove, { passive: true });
      designsList.addEventListener('click', handleDesignTapEvent);
      designsList.addEventListener('dblclick', handleDesignTapEvent);
      designsList.addEventListener('touchend', handleDesignTapEvent, { passive: true });
    }

    // Load when screen 2 (Creations) is shown
    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport) {
      var observer = new MutationObserver(function () {
        if (viewport.classList.contains('slide-2')) {
          switchTab(currentTab);
        }
      });
      observer.observe(viewport, { attributes: true, attributeFilter: ['class'] });
    }

    // Initial load when creations screen is visible on load (mobile swipe)
    if (viewport && viewport.classList.contains('slide-2')) {
      switchTab('designs');
    } else {
      // Desktop: viewport slide-* is not synced with the shell; load when Creations panel is active on bind (e.g. restored layout).
      var deskCreations = document.querySelector('[data-desktop-screen="creations"]');
      if (
        deskCreations &&
        deskCreations.classList.contains('is-active') &&
        !deskCreations.hidden
      ) {
        switchTab(currentTab);
      }
    }
  }

  function bind() {
    applyCreationsGridPerfConstants();
    bindCreationsScreen();
    whenAnimationsReady().then(function () {
      if (designsLoadedOnce) renderDesignsGrid();
    });
  }

  window.addEventListener('eazCreatorContextReady', function () {
    if (!designsLoadedOnce && currentTab === 'designs') {
      loadDesigns(true);
    }
  });

  var testPublishProductsPoll = null;
  function ensureTestPublishProductsPoll() {
    var hasPending = (products || []).some(function (p) {
      return (
        p &&
        (p.is_test_product || p.publish_intent === 'test_publish') &&
        p.shopify_completion_status !== 'complete' &&
        p.shopify_completion_status !== 'failed'
      );
    });
    if (!hasPending) {
      if (testPublishProductsPoll) {
        clearInterval(testPublishProductsPoll);
        testPublishProductsPoll = null;
      }
      return;
    }
    if (testPublishProductsPoll) return;
    testPublishProductsPoll = setInterval(function () {
      if (currentTab !== 'products') return;
      loadProducts();
    }, 5000);
  }

  window.addEventListener('eaz-studio-test-publish', function (ev) {
    var d = (ev && ev.detail) || {};
    var pk = String(d.product_key || '').trim();
    if (!pk) return;
    var found = false;
    for (var i = 0; i < products.length; i++) {
      if (String(products[i].product_key || '') !== pk) continue;
      found = true;
      products[i].is_test_product = true;
      products[i].publish_intent = 'test_publish';
      products[i].publish_status_detail = d.message || products[i].publish_status_detail;
      if (d.shopify_completion_status) {
        products[i].shopify_completion_status = d.shopify_completion_status;
      } else if (d.in_progress) {
        products[i].shopify_completion_status = 'pending_shopify';
      }
      if (d.published_design_id) products[i].published_design_id = d.published_design_id;
      if (d.printify_product_id) products[i].printify_product_id = d.printify_product_id;
      break;
    }
    if (!found) {
      products.unshift({
        id: 'test-' + pk,
        title: d.message || pk,
        product_key: pk,
        product_name: pk,
        is_test_product: true,
        publish_intent: 'test_publish',
        shopify_completion_status: d.in_progress === false ? d.phase || 'complete' : 'pending_shopify',
        publish_status_detail: d.message || 'Publishing…',
        published_design_id: d.published_design_id || null,
        printify_product_id: d.printify_product_id || null,
        published_at: Date.now(),
        design_ids: d.design_id ? [d.design_id] : [],
        image_url: null,
        printify_images: null,
        mockups_by_view: null,
      });
    }
    products.sort(function (a, b) {
      var aTest =
        a.is_test_product &&
        a.shopify_completion_status !== 'complete' &&
        a.shopify_completion_status !== 'failed';
      var bTest =
        b.is_test_product &&
        b.shopify_completion_status !== 'complete' &&
        b.shopify_completion_status !== 'failed';
      if (aTest !== bTest) return aTest ? -1 : 1;
      return 0;
    });
    if (currentTab === 'products') {
      filteredProducts = products.slice();
      productsLoadedOnce = true;
      renderProductsGrid();
    }
    ensureTestPublishProductsPoll();
  });

  window.addEventListener('creator-creations-bundle-ready', function () {
    var deskCreations = document.querySelector('[data-desktop-screen="creations"]');
    if (
      deskCreations &&
      deskCreations.classList.contains('is-active') &&
      !deskCreations.hidden &&
      !designsLoadedOnce
    ) {
      loadDesigns(true);
    }
  });

  // Desktop↔mobile shell remount (creator-desktop.js) moves #creatorCreations between hosts.
  // Re-apply grid after the node is visible again so cards are not left in a hidden desktop host.
  window.addEventListener('creator:shell-layout-change', function () {
    applyCreationsGridPerfConstants();
    if (!designsLoadedOnce) return;
    try {
      if (currentTab === 'designs') renderDesignsGrid();
      else if (currentTab === 'products' && productsLoadedOnce) renderProductsGrid();
    } catch (_layoutRender) {}
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.refreshCreationsDesignProductState = function () {
    return fetchCreationsProductBadges().then(function () {
      renderDesignsGrid();
    });
  };

  window.__creationsEligibleProductCount = function (designId) {
    var id = designId != null ? String(designId).trim() : '';
    if (!id || !creationsProductBadgesByDesignId[id]) return 0;
    return Number(creationsProductBadgesByDesignId[id].eligible_product_count) || 0;
  };

  window.CreationsScreen = {
    loadDesigns: loadDesigns,
    loadProducts: loadProducts,
    setDesignsActivityFilter: setDesignsActivityFilter,
    beginBulkSaveUnsavedJobsUi: beginBulkSaveUnsavedJobsUi,
    finishBulkSaveUnsavedJobsUi: finishBulkSaveUnsavedJobsUi,
    cancelBulkSaveUnsavedJobsUi: cancelBulkSaveUnsavedJobsUi,
    removeDeletedDesignLocally: removeDeletedDesignLocally,
    applyDesignLibraryPatch: applyDesignLibraryPatch,
    showDesignActivationSuccessToast: showDesignActivationSuccessToast,
    dismissActivationSuccessToast: dismissActivationSuccessToast,
    switchTab: switchTab,
    redrawDesignsGridOnly: redrawDesignsGridOnly,
    getDesignsActivityFilter: function () {
      return designsActivityFilter;
    },
    getCurrentTab: function () { return currentTab; },
    getDesigns: function () { return designs; },
    /** Designs in the current Active/Inactive scope (for filter modal counts). */
    getDesignsForListFilter: function () {
      return designs.filter(designsMatchingActivity);
    },
    getProducts: function () { return products; },
    getFilteredDesigns: function () { return filteredDesigns; },
    getFilteredProducts: function () { return filteredProducts; },
    setViewMode: setViewMode,
    resolveBulkSelectionKey: resolveBulkSelectionKey,
    isBulkSelectableDesign: isBulkSelectableDesign,
    /** Job-shaped payload for {@link CreatorJobPreviewModalGlobal} (unsaved generated row). */
    buildJobPreviewPayloadFromDesign: function (design) {
      return buildJobLikeForPreviewModal(design);
    }
  };
})();
