/**
 * Creations designs grid — visible selection checkboxes, floating dock,
 * bulk activate / deactivate / delete (saved), bulk save / delete jobs (unsaved).
 */
(function () {
  'use strict';

  var selectedIds = new Set();
  var dockEl = null;

  function selectionKeyFromDesign(d) {
    var cs = CS();
    if (cs && typeof cs.resolveBulkSelectionKey === 'function') return cs.resolveBulkSelectionKey(d) || '';
    if (!d) return '';
    var id = d.id != null ? String(d.id).trim() : '';
    if (id) return 'id:' + id;
    var jid = d.job_id != null ? String(d.job_id).trim() : '';
    return jid ? 'job:' + jid : '';
  }

  function isJobKey(k) {
    return String(k || '').indexOf('job:') === 0;
  }

  function isIdKey(k) {
    return String(k || '').indexOf('id:') === 0;
  }

  function purgeOppositeCohort(design) {
    var id = design.id != null ? String(design.id).trim() : '';
    var saved = !!id;
    var drop = [];
    selectedIds.forEach(function (k) {
      if (saved && isJobKey(k)) drop.push(k);
      if (!saved && isIdKey(k)) drop.push(k);
    });
    drop.forEach(function (k) {
      selectedIds.delete(k);
      syncCheckboxForKey(k);
    });
  }

  function selectionCohort() {
    var cs = CS();
    var act = cs && cs.getDesignsActivityFilter ? cs.getDesignsActivityFilter() : 'active';
    if (act === 'active') return 'active_saved';
    var sawJob = false;
    var sawId = false;
    selectedIds.forEach(function (k) {
      if (isJobKey(k)) sawJob = true;
      if (isIdKey(k)) sawId = true;
    });
    if (sawJob) return 'inactive_unsaved';
    if (sawId) return 'inactive_saved';
    return 'inactive_empty';
  }

  function selectAllPoolDesigns() {
    var cs = CS();
    if (!cs || typeof cs.getFilteredDesigns !== 'function') return [];
    var fd = cs.getFilteredDesigns() || [];
    var act = cs.getDesignsActivityFilter ? cs.getDesignsActivityFilter() : 'active';
    var savedInactive = [];
    var unsaved = [];
    var activeSaved = [];
    var i;
    for (i = 0; i < fd.length; i++) {
      var d = fd[i];
      if (!cs.isBulkSelectableDesign || !cs.isBulkSelectableDesign(d)) continue;
      if (act === 'active') {
        activeSaved.push(d);
      } else {
        var idStr = d.id != null ? String(d.id).trim() : '';
        if (idStr) savedInactive.push(d);
        else unsaved.push(d);
      }
    }
    var cohort = selectionCohort();
    if (cohort === 'active_saved') return activeSaved;
    if (cohort === 'inactive_saved') return savedInactive;
    if (cohort === 'inactive_unsaved') return unsaved;
    if (act === 'active') return activeSaved;
    return savedInactive.length ? savedInactive : unsaved;
  }

  function M() {
    return window.CreatorMobileI18n || {};
  }

  function CS() {
    return window.CreationsScreen || null;
  }

  function core() {
    return window.CreatorCreationsLibraryCore || null;
  }

  function T(key, fb) {
    var m = M();
    return m[key] != null && m[key] !== '' ? m[key] : fb;
  }

  function apiDispatch() {
    var c = core();
    if (c && typeof c.apiBase === 'function') return c.apiBase();
    return window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  /** POST save-design requires `op` in the query string (worker returns missing_op otherwise). */
  function saveDesignDispatchUrl() {
    return apiDispatch() + '?op=save-design';
  }

  /** Worker allows at most MAX_SAVE_JOBS (5) concurrent save pipelines; space enqueues so KV count can drop. */
  var BULK_SAVE_ENQUEUE_GAP_MS = 1300;
  var BULK_SAVE_429_MAX_RETRIES = 14;
  var BULK_SAVE_429_BASE_WAIT_MS = 1800;

  function delayP(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * POST save-design with 429/backoff and optional throttle after success.
   * @returns {Promise<void>}
   */
  function postSaveDesignThrottled(payload, jobIdForEvent, throttleAfter) {
    var attempt = 0;
    function run() {
      return fetch(saveDesignDispatchUrl(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (r) {
        var status = r.status;
        return r.json().catch(function () {
          return {};
        }).then(function (data) {
          return { status: status, data: data };
        });
      }).then(function (res) {
        var errCode = res.data && (res.data.error || res.data.reason);
        if (res.status === 429 && errCode === 'too_many_save_jobs') {
          if (attempt >= BULK_SAVE_429_MAX_RETRIES) {
            throw new Error(errCode || 'too_many_save_jobs');
          }
          attempt++;
          var wait = Math.min(20000, BULK_SAVE_429_BASE_WAIT_MS * attempt);
          return delayP(wait).then(run);
        }
        if (!res.data || !res.data.ok) {
          throw new Error((res.data && (res.data.error || res.data.message)) || 'save_failed');
        }
        var jid = jobIdForEvent != null ? String(jobIdForEvent).trim() : '';
        if (jid) {
          try {
            window.dispatchEvent(new CustomEvent('creatorSaveJobStarted', { detail: { jobId: jid } }));
          } catch (e2) {}
        }
        return throttleAfter ? delayP(BULK_SAVE_ENQUEUE_GAP_MS) : Promise.resolve();
      });
    }
    return run();
  }

  function getOwnerId() {
    var c = core();
    if (c && typeof c.getOwnerId === 'function') return c.getOwnerId();
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    return null;
  }

  function getSelectedDesignObjects() {
    var cs = CS();
    if (!cs || typeof cs.getFilteredDesigns !== 'function') return [];
    var fd = cs.getFilteredDesigns() || [];
    var map = {};
    fd.forEach(function (d) {
      var k = selectionKeyFromDesign(d);
      if (k) map[k] = d;
    });
    var out = [];
    selectedIds.forEach(function (key) {
      if (map[key]) out.push(map[key]);
    });
    return out;
  }

  function isSelectedKey(key) {
    return selectedIds.has(String(key || ''));
  }

  function setSelectedWithDesign(design, on) {
    var key = selectionKeyFromDesign(design);
    if (!key) return;
    if (on) {
      purgeOppositeCohort(design);
      selectedIds.add(key);
      syncAllCheckboxes();
    } else {
      selectedIds.delete(key);
      syncCheckboxForKey(key);
    }
    refreshDock();
  }

  function toggleSelectedWithDesign(design) {
    var key = selectionKeyFromDesign(design);
    if (!key) return;
    if (selectedIds.has(key)) {
      selectedIds.delete(key);
      syncCheckboxForKey(key);
    } else {
      purgeOppositeCohort(design);
      selectedIds.add(key);
      syncAllCheckboxes();
    }
    refreshDock();
  }

  /** Legacy: plain creation id without prefix */
  function isSelected(id) {
    var sid = String(id || '').trim();
    if (!sid) return false;
    return selectedIds.has(sid.indexOf(':') >= 0 ? sid : 'id:' + sid);
  }

  function setSelected(id, on) {
    var sid = String(id || '').trim();
    if (!sid) return;
    var key = sid.indexOf(':') >= 0 ? sid : 'id:' + sid;
    if (on) selectedIds.add(key);
    else selectedIds.delete(key);
    syncCheckboxForKey(key);
    refreshDock();
  }

  function toggleSelected(id) {
    var sid = String(id || '').trim();
    if (!sid) return;
    var key = sid.indexOf(':') >= 0 ? sid : 'id:' + sid;
    if (selectedIds.has(key)) selectedIds.delete(key);
    else selectedIds.add(key);
    syncCheckboxForKey(key);
    refreshDock();
  }

  function clearSelection() {
    var copy = Array.from(selectedIds);
    selectedIds.clear();
    copy.forEach(syncCheckboxForKey);
    refreshDock();
  }

  function syncCheckboxForKey(key) {
    if (!key) return;
    document
      .querySelectorAll('.creator-creations-card-bulk-cb[data-bulk-key], .creator-creations-list-bulk-cb[data-bulk-key]')
      .forEach(function (cb) {
        if (cb.getAttribute('data-bulk-key') !== key) return;
        cb.checked = selectedIds.has(key);
      });
  }

  function syncAllCheckboxes() {
    document
      .querySelectorAll('.creator-creations-card-bulk-cb[data-bulk-key], .creator-creations-list-bulk-cb[data-bulk-key]')
      .forEach(function (cb) {
        var key = cb.getAttribute('data-bulk-key');
        if (key) cb.checked = selectedIds.has(key);
      });
  }

  function updateDockActionButtons() {
    if (!dockEl) return;
    var cohort = selectionCohort();
    var show = {
      activate: false,
      deactivate: false,
      delete: false,
      save: false,
    };
    if (cohort === 'active_saved') {
      show.deactivate = true;
      show.delete = true;
    } else if (cohort === 'inactive_saved') {
      show.activate = true;
      show.delete = true;
    } else if (cohort === 'inactive_unsaved') {
      show.save = true;
      show.delete = true;
    }

    function vis(sel, on) {
      var el = dockEl.querySelector(sel);
      if (!el) return;
      el.style.display = on ? '' : 'none';
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
      if (!on) el.disabled = false;
    }

    vis('[data-bulk-act="activate"]', show.activate);
    vis('[data-bulk-act="deactivate"]', show.deactivate);
    vis('[data-bulk-act="delete"]', show.delete);
    vis('[data-bulk-act="save"]', show.save);

    var saveBtn = dockEl.querySelector('[data-bulk-act="save"]');
    if (saveBtn && cohort === 'inactive_unsaved') {
      var nn = selectedIds.size;
      saveBtn.textContent = nn > 1 ? T('bulkSaveAll', 'Save all') : T('bulkSave', 'Save');
    }
  }

  function refreshDock() {
    if (!dockEl) return;
    var n = selectedIds.size;
    var countEl = dockEl.querySelector('.creator-creations-bulk-dock__count');
    if (countEl) {
      countEl.textContent = T('bulkSelectedCountTpl', '%n% selected').split('%n%').join(String(n));
    }
    updateDockActionButtons();
    if (n === 0) dockEl.setAttribute('hidden', '');
    else dockEl.removeAttribute('hidden');
  }

  function selectAllVisible() {
    var pool = selectAllPoolDesigns();
    if (!pool.length) return;
    purgeOppositeCohort(pool[0]);
    pool.forEach(function (d) {
      var k = selectionKeyFromDesign(d);
      if (k) selectedIds.add(k);
    });
    syncAllCheckboxes();
    refreshDock();
  }

  function deselectAll() {
    clearSelection();
  }

  function exitBulkModeFromToolbar() {
    selectedIds.clear();
    syncAllCheckboxes();
    refreshDock();
    syncToolbarVisibility();
  }

  function syncToolbarVisibility() {
    var s = CS();
    var tab = s && typeof s.getCurrentTab === 'function' ? s.getCurrentTab() : 'designs';
    if (tab !== 'designs') {
      clearSelection();
      refreshDock();
      syncAllCheckboxes();
    }
  }

  function pruneInvalidBulkSelectionKeys() {
    var cs = CS();
    if (!cs || cs.getCurrentTab() !== 'designs') return;
    var fd = cs.getFilteredDesigns() || [];
    var valid = {};
    fd.forEach(function (d) {
      if (cs.isBulkSelectableDesign && cs.isBulkSelectableDesign(d)) {
        var k = selectionKeyFromDesign(d);
        if (k) valid[k] = true;
      }
    });
    var rem = [];
    selectedIds.forEach(function (k) {
      if (!valid[k]) rem.push(k);
    });
    rem.forEach(function (k) {
      selectedIds.delete(k);
    });
  }

  function closeOverlay(root) {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    try {
      document.documentElement.classList.remove('creator-creations-bulk-overlay-open');
    } catch (_) {}
  }

  function openOverlayShell(innerClass) {
    var root = document.createElement('div');
    root.className = 'creator-creations-bulk-overlay-root';
    var backdrop = document.createElement('div');
    backdrop.className = 'creator-creations-bulk-overlay-backdrop';
    backdrop.addEventListener('click', function () {
      closeOverlay(root);
    });
    var panel = document.createElement('div');
    panel.className = 'creator-creations-bulk-overlay-panel ' + (innerClass || '');
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    root.appendChild(backdrop);
    root.appendChild(panel);
    document.body.appendChild(root);
    document.documentElement.classList.add('creator-creations-bulk-overlay-open');
    return { root: root, panel: panel, close: function () {
      closeOverlay(root);
    } };
  }

  /**
   * Carousel arrows only when item count exceeds visible slots:
   * desktop (>520px): 4 columns; mobile: 2 columns.
   * Slot width is synced on wrap so every tile matches that grid line (Creations-style thumbnails).
   */
  function bindBulkCarouselOverflow(car, itemCount) {
    var wrap = car.querySelector('.creator-creations-bulk-carousel__track-wrap');
    var track = car.querySelector('.creator-creations-bulk-carousel__track');
    var prev = car.querySelector('.creator-creations-bulk-carousel__btn--prev');
    var next = car.querySelector('.creator-creations-bulk-carousel__btn--next');
    if (!wrap || !track || !prev || !next) return;

    var EPS = 8;
    var GAP = 10;
    var mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 520px)')
        : {
            matches: false,
            addListener: function () {},
            removeListener: function () {},
            addEventListener: function () {},
          };

    function maxSlotsPerView() {
      return mq.matches ? 2 : 4;
    }

    function syncSlotWidth() {
      var cols = maxSlotsPerView();
      var w = wrap.clientWidth;
      if (w <= 0) return;
      var slot = (w - GAP * (cols - 1)) / cols;
      if (!(slot > 0) || !isFinite(slot)) return;
      wrap.style.setProperty('--cc-bulk-slot', slot + 'px');
    }

    function updateOverflowChrome() {
      syncSlotWidth();
      var cw = track.clientWidth;
      var sw = track.scrollWidth;
      var physicalOverflow = sw > cw + EPS;
      var count =
        typeof itemCount === 'number' && itemCount >= 0 ? itemCount : track.children.length;
      var needsPaging = count > maxSlotsPerView();
      var showBtns = needsPaging && physicalOverflow;
      prev.hidden = !showBtns;
      next.hidden = !showBtns;
      prev.setAttribute('aria-hidden', showBtns ? 'false' : 'true');
      next.setAttribute('aria-hidden', showBtns ? 'false' : 'true');
      prev.tabIndex = showBtns ? 0 : -1;
      next.tabIndex = showBtns ? 0 : -1;
      car.classList.toggle('creator-creations-bulk-carousel--has-overflow', showBtns);
    }

    function scheduleOverflowMeasure() {
      if (car._bulkCarouselOverflowRaf) cancelAnimationFrame(car._bulkCarouselOverflowRaf);
      car._bulkCarouselOverflowRaf = requestAnimationFrame(function () {
        car._bulkCarouselOverflowRaf = requestAnimationFrame(function () {
          car._bulkCarouselOverflowRaf = null;
          updateOverflowChrome();
        });
      });
    }

    function mqChange() {
      scheduleOverflowMeasure();
    }
    if (mq.addEventListener) mq.addEventListener('change', mqChange);
    else if (mq.addListener) mq.addListener(mqChange);

    scheduleOverflowMeasure();

    var ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(function () {
            scheduleOverflowMeasure();
          })
        : null;
    if (ro) {
      ro.observe(wrap);
      ro.observe(track);
    }
    window.addEventListener('resize', scheduleOverflowMeasure);
    track.addEventListener('scroll', updateOverflowChrome);

    track.querySelectorAll('img').forEach(function (img) {
      function bump() {
        scheduleOverflowMeasure();
      }
      if (img.complete) bump();
      else {
        img.addEventListener('load', bump, { once: true });
        img.addEventListener('error', bump, { once: true });
      }
    });
  }

  function renderCarouselRow(labelHtml, thumbs) {
    var row = document.createElement('div');
    row.className = 'creator-creations-bulk-carow';
    var head = document.createElement('div');
    head.className = 'creator-creations-bulk-carow__head';
    head.innerHTML = labelHtml;
    row.appendChild(head);
    var car = document.createElement('div');
    car.className = 'creator-creations-bulk-carousel';
    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className =
      'creator-creations-bulk-carousel__btn creator-creations-bulk-carousel__btn--prev';
    prev.innerHTML =
      '<span aria-hidden="true">&#10094;</span><span class="creator-creations-bulk-visually-hidden">' +
      T('bulkCarouselPrev', 'Previous') +
      '</span>';
    prev.hidden = true;
    prev.setAttribute('aria-hidden', 'true');
    prev.tabIndex = -1;
    var next = document.createElement('button');
    next.type = 'button';
    next.className =
      'creator-creations-bulk-carousel__btn creator-creations-bulk-carousel__btn--next';
    next.innerHTML =
      '<span aria-hidden="true">&#10095;</span><span class="creator-creations-bulk-visually-hidden">' +
      T('bulkCarouselNext', 'Next') +
      '</span>';
    next.hidden = true;
    next.setAttribute('aria-hidden', 'true');
    next.tabIndex = -1;
    var wrap = document.createElement('div');
    wrap.className = 'creator-creations-bulk-carousel__track-wrap';
    var track = document.createElement('div');
    track.className = 'creator-creations-bulk-carousel__track';
    (thumbs || []).forEach(function (node) {
      var cell = document.createElement('div');
      cell.className = 'creator-creations-bulk-carousel__cell';
      cell.appendChild(node);
      track.appendChild(cell);
    });
    wrap.appendChild(track);
    function scrollBy(dx) {
      track.scrollBy({ left: dx, behavior: 'smooth' });
    }
    function scrollBulkCarouselPage(direction) {
      var gap = 10;
      var cols =
        typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 520px)').matches ? 2 : 4;
      var slotPx = parseFloat(getComputedStyle(wrap).getPropertyValue('--cc-bulk-slot'));
      if (!(slotPx > 0) || !isFinite(slotPx)) {
        slotPx = (wrap.clientWidth - gap * (cols - 1)) / cols;
      }
      scrollBy(direction * Math.max(96, cols * (slotPx + gap)));
    }
    prev.addEventListener('click', function () {
      scrollBulkCarouselPage(-1);
    });
    next.addEventListener('click', function () {
      scrollBulkCarouselPage(1);
    });
    car.appendChild(prev);
    car.appendChild(wrap);
    car.appendChild(next);
    row.appendChild(car);
    bindBulkCarouselOverflow(car, (thumbs || []).length);
    return row;
  }

  function hydrateThumb(mediaEl, handle) {
    var c = core();
    if (c && typeof c.hydrateProductThumb === 'function') c.hydrateProductThumb(mediaEl, handle);
  }

  function designThumbMini(design) {
    var url = design.preview_url || design.original_url || design.image_url;
    var d = document.createElement('div');
    d.className = 'creator-creations-bulk-dthumb';
    var media = document.createElement('div');
    media.className = 'creator-creations-bulk-dthumb__media';
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = design.title || 'Design';
      media.appendChild(img);
    } else {
      media.textContent = '—';
    }
    d.appendChild(media);
    var cap = document.createElement('div');
    cap.className = 'creator-creations-bulk-dthumb__cap';
    cap.textContent = design.title || '—';
    d.appendChild(cap);
    return d;
  }

  function execBulkDeactivate() {
    var designs = getSelectedDesignObjects().filter(function (d) {
      var id = d.id != null ? String(d.id).trim() : '';
      return !!id;
    });
    var c = core();
    if (!c) return;
    var shell = openOverlayShell('creator-creations-bulk-overlay-panel--sheet');
    var panel = shell.panel;
    panel.innerHTML = '';
    var h = document.createElement('h2');
    h.className = 'creator-creations-bulk-sheet-title';
    h.textContent = T('bulkDeactivateTitle', 'Deactivate designs');
    var body = document.createElement('div');
    body.className = 'creator-creations-bulk-sheet-body';

    Promise.all(
      designs.map(function (d) {
        return c.fetchPublishedRows(d.id).then(function (rows) {
          return { design: d, rows: rows };
        });
      })
    ).then(function (pairs) {
      body.innerHTML = '';
      var noPub = [];
      var withPub = [];
      pairs.forEach(function (p) {
        if ((p.rows || []).length) withPub.push(p);
        else noPub.push(p);
      });
      if (noPub.length) {
        var mergedThumbs = noPub.map(function (p) {
          return designThumbMini(p.design);
        });
        var mergedIntro =
          '<p class="creator-creations-bulk-carow__intro">' +
          escapeHtml(
            T(
              'bulkDeactivateNoProductsIntro',
              'These designs will be moved to inactive only (no published products to remove).'
            )
          ) +
          '</p>';
        body.appendChild(
          renderCarouselRow(
            '<span class="creator-creations-bulk-carow__title">' +
              escapeHtml(
                T('bulkDeactivateNoProductsHeading', 'Designs without published products')
              ) +
              '</span>' +
              mergedIntro,
            mergedThumbs
          )
        );
      }
      withPub.forEach(function (p) {
        var title = escapeHtml(p.design.title || 'Design #' + String(p.design.id));
        var thumbs = (p.rows || []).map(function (row) {
          var thumb = document.createElement('div');
          thumb.className = 'creator-creations-bulk-pthumb';
          var ph = document.createElement('div');
          ph.className = 'creator-creations-bulk-pthumb__media';
          ph.textContent = '—';
          thumb.appendChild(ph);
          var t = document.createElement('div');
          t.className = 'creator-creations-bulk-pthumb__title';
          t.textContent = row.product_name || row.product_key || '';
          thumb.appendChild(t);
          if (row.shopify_handle) hydrateThumb(ph, row.shopify_handle);
          return thumb;
        });
        body.appendChild(
          renderCarouselRow(
            '<span class="creator-creations-bulk-carow__title">' + title + '</span>',
            thumbs
          )
        );
      });
    });

    var foot = document.createElement('div');
    foot.className = 'creator-creations-bulk-sheet-footer creator-creations-bulk-sheet-footer--row';
    var btnCa = btnSecondary(T('bulkCancel', 'Cancel'), shell.close);
    var btnOk = btnPrimary(T('bulkConfirmDeactivate', 'Deactivate'), function () {
      btnOk.disabled = true;
      runDeactivateLoop(designs)
        .then(function () {
          shell.close();
          exitBulkModeFromToolbar();
          if (CS() && typeof CS().loadDesigns === 'function') return CS().loadDesigns(true, { silent: true });
        })
        .catch(function (e) {
          console.warn(e);
          alert(T('bulkErrorDeactivate', T('libraryErrorDeactivate', 'Deactivate failed')));
        })
        .finally(function () {
          btnOk.disabled = false;
        });
    });
    foot.appendChild(btnCa);
    foot.appendChild(btnOk);
    panel.appendChild(h);
    panel.appendChild(body);
    panel.appendChild(foot);
  }

  function runDeactivateLoop(designs) {
    var c = core();
    if (!c || !designs.length) return Promise.resolve();
    var seq = Promise.resolve();
    designs.forEach(function (design) {
      seq = seq.then(function () {
        return c.fetchPublishedRows(design.id).then(function (rows) {
          var ids = rows
            .map(function (r) {
              return r && r.id != null ? Number(r.id) : null;
            })
            .filter(function (x) {
              return x != null && isFinite(x);
            });
          if (ids.length) {
            return c.batchUnpublish(ids).then(function (j) {
              if (!j.ok && !(j.enqueued_ids && j.enqueued_ids.length)) throw new Error('batch_unpublish_failed');
              return c.updateDesignPut({ design_id: design.id, library_status: 'inactive' }).then(function (j2) {
                if (!j2.ok) throw new Error(j2.error || 'update_failed');
              });
            });
          }
          return c.updateDesignPut({ design_id: design.id, library_status: 'inactive' }).then(function (j2) {
            if (!j2.ok) throw new Error(j2.error || 'update_failed');
          });
        });
      });
    });
    return seq;
  }

  function escapeHtml(s) {
    var cx = core();
    if (cx && typeof cx.escapeHtml === 'function') return cx.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function btnPrimary(html, handler) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'creator-creations-bulk-btn creator-creations-bulk-btn--primary';
    b.textContent = html;
    b.addEventListener('click', handler);
    return b;
  }

  function btnSecondary(html, handler) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'creator-creations-bulk-btn creator-creations-bulk-btn--ghost';
    b.textContent = html;
    b.addEventListener('click', handler);
    return b;
  }

  function saveDesignPayloadFromRow(design, ownerId, creatorName, visibility) {
    var jid = design.job_id != null ? String(design.job_id).trim() : '';
    var url = design.preview_url || design.original_url || design.image_url || '';
    return {
      job_id: jid,
      owner_id: ownerId,
      prompt: design.prompt || design.title || '',
      image_url: url || null,
      design_prompt: design.design_prompt || design.prompt || '',
      creator_name: creatorName ? String(creatorName).trim() : null,
      visibility: visibility === 'private' ? 'private' : 'public',
      parent_design_id: null,
    };
  }

  function openBulkSaveManyModal(designs, ownerId) {
    var c = core();
    var shell = openOverlayShell(
      'creator-creations-bulk-overlay-panel--sheet creator-creations-bulk-overlay-panel--save-many'
    );
    var panel = shell.panel;
    panel.innerHTML = '';
    var h = document.createElement('h2');
    h.className = 'creator-creations-bulk-sheet-title';
    h.textContent = T('bulkSaveManyTitle', 'Save designs to library');

    var body = document.createElement('div');
    body.className = 'creator-creations-bulk-sheet-body';
    var grid = document.createElement('div');
    grid.className = 'creator-creations-bulk-design-grid creator-creations-bulk-save-many-grid';
    designs.forEach(function (d) {
      grid.appendChild(designThumbMini(d));
    });
    body.appendChild(grid);

    var optsWrap = document.createElement('div');
    optsWrap.className = 'creator-creations-bulk-save-many-options';
    body.appendChild(optsWrap);

    var foot = document.createElement('div');
    foot.className = 'creator-creations-bulk-sheet-footer creator-creations-bulk-sheet-footer--row';
    var btnCa = btnSecondary(T('bulkCancel', 'Cancel'), shell.close);
    var btnOk = btnPrimary(T('bulkConfirmSaveMany', 'Save all'), function () {});
    foot.appendChild(btnCa);
    foot.appendChild(btnOk);

    panel.appendChild(h);
    panel.appendChild(body);
    panel.appendChild(foot);

    optsWrap.innerHTML =
      '<p class="creator-creations-bulk-loading">' + escapeHtml(T('bulkLoading', 'Loading…')) + '</p>';

    function wireSaveUi(names, visWrap) {
      optsWrap.innerHTML = '';
      var block = document.createElement('div');
      block.className = 'creator-creations-bulk-activate-foot';
      var creatorSel = null;

      if (!names || !names.length) {
        block.appendChild(visWrap);
      } else if (names.length === 1) {
        block.appendChild(visWrap);
      } else {
        var lbl = document.createElement('label');
        lbl.className = 'creator-creations-bulk-sheet-label';
        lbl.textContent = T('libraryActivateCreatorLabel', 'Creator name');
        creatorSel = document.createElement('select');
        creatorSel.className = 'creator-creations-bulk-sheet-select';
        var pick =
          (c && typeof c.readLastCreatorPick === 'function' ? c.readLastCreatorPick(names) : null) || names[0];
        names.forEach(function (n) {
          var opt = document.createElement('option');
          opt.value = n;
          opt.textContent = n;
          if (n === pick) opt.selected = true;
          creatorSel.appendChild(opt);
        });
        block.appendChild(lbl);
        block.appendChild(creatorSel);
        block.appendChild(visWrap);
      }

      optsWrap.appendChild(block);

      btnOk.onclick = function () {
        btnOk.disabled = true;
        var visibility = typeof visWrap.getValue === 'function' ? visWrap.getValue() : 'public';
        var creatorName = '';
        if (names && names.length === 1) creatorName = names[0];
        else if (names && names.length > 1 && creatorSel) creatorName = String(creatorSel.value || '').trim();

        var bulkJobIds = designs
          .map(function (d) {
            return d.job_id != null ? String(d.job_id).trim() : '';
          })
          .filter(Boolean);
        if (CS() && typeof CS().beginBulkSaveUnsavedJobsUi === 'function') {
          CS().beginBulkSaveUnsavedJobsUi(bulkJobIds);
        }
        shell.close();
        exitBulkModeFromToolbar();

        var seq = Promise.resolve();
        designs.forEach(function (d, idx) {
          seq = seq.then(function () {
            var payload = saveDesignPayloadFromRow(d, ownerId, creatorName, visibility);
            var jid = d.job_id != null ? String(d.job_id).trim() : '';
            var throttleAfter = idx < designs.length - 1;
            return postSaveDesignThrottled(payload, jid, throttleAfter);
          });
        });
        seq
          .then(function () {
            if (creatorName && c && typeof c.writeLastCreatorPick === 'function') {
              c.writeLastCreatorPick(creatorName);
            }
            var cs2 = CS();
            if (cs2 && typeof cs2.finishBulkSaveUnsavedJobsUi === 'function') {
              return cs2.finishBulkSaveUnsavedJobsUi(bulkJobIds);
            }
            if (cs2 && typeof cs2.loadDesigns === 'function') return cs2.loadDesigns(true, { silent: true });
          })
          .catch(function (err) {
            console.warn(err);
            var msg = err && err.message ? String(err.message) : '';
            var alertText =
              msg === 'too_many_save_jobs'
                ? T(
                    'bulkErrorSaveRateLimit',
                    'Too many saves are running at once. Wait a moment and try again with fewer designs, or use Save all again — remaining designs will continue.'
                  )
                : T('bulkErrorSave', 'Could not save. Please try again.');
            var cs3 = CS();
            if (cs3 && typeof cs3.cancelBulkSaveUnsavedJobsUi === 'function') {
              cs3.cancelBulkSaveUnsavedJobsUi(bulkJobIds).finally(function () {
                alert(alertText);
              });
            } else {
              alert(alertText);
            }
          })
          .finally(function () {
            btnOk.disabled = false;
          });
      };
    }

    Promise.resolve(c && typeof c.fetchCreatorNames === 'function' ? c.fetchCreatorNames() : [])
      .then(function (names) {
        var visWrap =
          c && typeof c.renderVisibilitySwitch === 'function'
            ? c.renderVisibilitySwitch(true)
            : null;
        if (!visWrap) {
          optsWrap.innerHTML = '';
          optsWrap.textContent = T('bulkSaveUiError', 'Could not load save options.');
          return;
        }
        wireSaveUi(names || [], visWrap);
      })
      .catch(function () {
        optsWrap.innerHTML = '';
        optsWrap.textContent = T('bulkSaveUiError', 'Could not load save options.');
      });
  }

  function execBulkSaveUnsaved() {
    var designs = getSelectedDesignObjects().filter(function (d) {
      return isJobKey(selectionKeyFromDesign(d));
    });
    if (!designs.length) return;
    var owner = getOwnerId();
    if (!owner) {
      alert(T('bulkErrorSave', 'Could not save. Please try again.'));
      return;
    }
    if (designs.length === 1) {
      var cs = CS();
      var payload =
        cs && typeof cs.buildJobPreviewPayloadFromDesign === 'function'
          ? cs.buildJobPreviewPayloadFromDesign(designs[0])
          : null;
      if (
        payload &&
        window.CreatorJobPreviewModalGlobal &&
        typeof window.CreatorJobPreviewModalGlobal.open === 'function'
      ) {
        window.CreatorJobPreviewModalGlobal.open(payload);
      } else {
        openBulkSaveManyModal(designs, owner);
      }
      return;
    }
    openBulkSaveManyModal(designs, owner);
  }

  function execBulkDeleteUnsavedJobsOnly(jobDesigns) {
    var owner = getOwnerId();
    if (!owner) {
      alert(T('bulkErrorDelete', 'Delete failed'));
      return;
    }
    var shell = openOverlayShell('creator-creations-bulk-overlay-panel--sheet');
    var panel = shell.panel;
    panel.innerHTML = '';
    var h = document.createElement('h2');
    h.className = 'creator-creations-bulk-sheet-title';
    h.textContent = T('bulkDeleteTitle', 'Delete designs');

    var body = document.createElement('div');
    body.className = 'creator-creations-bulk-sheet-body';

    var intro = document.createElement('p');
    intro.className = 'creator-creations-bulk-delete-intro';
    intro.textContent = T(
      'bulkDeleteJobsIntro',
      'These generated designs are not in your library yet. They will be removed permanently.'
    );
    body.appendChild(intro);

    var g = document.createElement('div');
    g.className = 'creator-creations-bulk-design-grid';
    jobDesigns.forEach(function (d) {
      g.appendChild(designThumbMini(d));
    });
    body.appendChild(g);

    var foot = document.createElement('div');
    foot.className = 'creator-creations-bulk-sheet-footer creator-creations-bulk-sheet-footer--row';
    var btnCa = btnSecondary(T('bulkCancel', 'Cancel'), shell.close);
    var btnOk = btnPrimary(T('bulkConfirmDelete', 'Delete'), function () {
      btnOk.disabled = true;
      runDeleteJobsLoop(jobDesigns, owner)
        .then(function () {
          shell.close();
          return bulkAnimateRemovedDesignRows(jobDesigns);
        })
        .then(function () {
          exitBulkModeFromToolbar();
          if (CS() && typeof CS().loadDesigns === 'function') return CS().loadDesigns(true, { silent: true });
        })
        .catch(function (e) {
          console.warn(e);
          alert(T('bulkErrorDelete', 'Delete failed'));
        })
        .finally(function () {
          btnOk.disabled = false;
        });
    });
    foot.appendChild(btnCa);
    foot.appendChild(btnOk);
    panel.appendChild(h);
    panel.appendChild(body);
    panel.appendChild(foot);
  }

  function execBulkDelete() {
    var all = getSelectedDesignObjects();
    var savedDesigns = all.filter(function (d) {
      var id = d.id != null ? String(d.id).trim() : '';
      return !!id;
    });
    var jobDesigns = all.filter(function (d) {
      var id = d.id != null ? String(d.id).trim() : '';
      var jid = d.job_id != null ? String(d.job_id).trim() : '';
      return !id && !!jid;
    });

    if (jobDesigns.length && !savedDesigns.length) {
      execBulkDeleteUnsavedJobsOnly(jobDesigns);
      return;
    }

    if (!savedDesigns.length) return;

    var c = core();
    if (!c) return;
    var owner = getOwnerId();
    var shell = openOverlayShell('creator-creations-bulk-overlay-panel--sheet');
    var panel = shell.panel;
    panel.innerHTML = '';
    var h = document.createElement('h2');
    h.className = 'creator-creations-bulk-sheet-title';
    h.textContent = T('bulkDeleteTitle', 'Delete designs');
    var body = document.createElement('div');
    body.className = 'creator-creations-bulk-sheet-body';

    Promise.all(
      savedDesigns.map(function (d) {
        return c.fetchPublishedRows(d.id).then(function (rows) {
          return { design: d, rows: rows };
        });
      })
    ).then(function (pairs) {
      body.innerHTML = '';
      var anyPub = pairs.some(function (p) {
        return (p.rows || []).length > 0;
      });
      if (anyPub) {
        pairs.forEach(function (p) {
          var title = escapeHtml(p.design.title || 'Design #' + String(p.design.id));
          var thumbs = (p.rows || []).map(function (row) {
            var thumb = document.createElement('div');
            thumb.className = 'creator-creations-bulk-pthumb';
            var ph = document.createElement('div');
            ph.className = 'creator-creations-bulk-pthumb__media';
            ph.textContent = '—';
            thumb.appendChild(ph);
            var t = document.createElement('div');
            t.className = 'creator-creations-bulk-pthumb__title';
            t.textContent = row.product_name || row.product_key || '';
            thumb.appendChild(t);
            if (row.shopify_handle) hydrateThumb(ph, row.shopify_handle);
            return thumb;
          });
          if (!thumbs.length) thumbs = [designThumbMini(p.design)];
          body.appendChild(
            renderCarouselRow('<span class="creator-creations-bulk-carow__title">' + title + '</span>', thumbs)
          );
        });
      } else {
        var g2 = document.createElement('div');
        g2.className = 'creator-creations-bulk-design-grid';
        pairs.forEach(function (p) {
          g2.appendChild(designThumbMini(p.design));
        });
        body.appendChild(g2);
      }
    });

    var foot = document.createElement('div');
    foot.className = 'creator-creations-bulk-sheet-footer creator-creations-bulk-sheet-footer--row';
    var btnCa = btnSecondary(T('bulkCancel', 'Cancel'), shell.close);
    var btnOk = btnPrimary(T('bulkConfirmDelete', 'Delete'), function () {
      btnOk.disabled = true;
      runDeleteLoop(savedDesigns, owner)
        .then(function () {
          shell.close();
          return bulkAnimateRemovedDesignRows(savedDesigns);
        })
        .then(function () {
          exitBulkModeFromToolbar();
          if (CS() && typeof CS().loadDesigns === 'function') return CS().loadDesigns(true, { silent: true });
        })
        .catch(function (e) {
          console.warn(e);
          alert(T('bulkErrorDelete', 'Delete failed'));
        })
        .finally(function () {
          btnOk.disabled = false;
        });
    });
    foot.appendChild(btnCa);
    foot.appendChild(btnOk);
    panel.appendChild(h);
    panel.appendChild(body);
    panel.appendChild(foot);
  }

  /** After bulk delete: fade removed cards in the Creations grid before reload (visibility switch lives in a separate overlay). */
  function bulkAnimateRemovedDesignRows(designs) {
    return new Promise(function (resolve) {
      if (!designs || !designs.length) {
        resolve();
        return;
      }
      var roots = [];
      var seen = new Set();
      designs.forEach(function (d) {
        var k = selectionKeyFromDesign(d);
        if (!k) return;
        var esc = String(k).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var cb = document.querySelector('[data-bulk-key="' + esc + '"]');
        if (!cb) return;
        var root = cb.closest('.creator-creations-card') || cb.closest('.creator-creations-list-item');
        if (!root || seen.has(root)) return;
        seen.add(root);
        roots.push(root);
      });
      if (!roots.length) {
        resolve();
        return;
      }
      requestAnimationFrame(function () {
        roots.forEach(function (el, i) {
          el.style.transitionDelay = i * 40 + 'ms';
          el.classList.add('creator-creations-bulk-row--exit');
        });
      });
      var ms = 400 + roots.length * 45;
      setTimeout(resolve, ms);
    });
  }

  function runDeleteJobsLoop(jobDesigns, owner) {
    if (!owner || !jobDesigns.length) return Promise.reject(new Error('missing_owner'));
    var base = apiDispatch();
    var seq = Promise.resolve();
    jobDesigns.forEach(function (d) {
      seq = seq.then(function () {
        var jid = d.job_id != null ? String(d.job_id).trim() : '';
        if (!jid) throw new Error('missing_job_id');
        var u =
          base +
          '?op=delete-job&job_id=' +
          encodeURIComponent(jid) +
          '&owner_id=' +
          encodeURIComponent(owner);
        return fetch(u, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }).then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        }).then(function (data) {
          if (!data.ok) throw new Error(data.error || 'delete_job_failed');
        });
      });
    });
    return seq;
  }

  function runDeleteLoop(designs, owner) {
    if (!owner || !designs.length) return Promise.reject(new Error('missing_owner'));
    var base = apiDispatch();
    var seq = Promise.resolve();
    designs.forEach(function (d) {
      seq = seq.then(function () {
        var u =
          base +
          '?op=delete-design&design_id=' +
          encodeURIComponent(d.id) +
          '&owner_id=' +
          encodeURIComponent(owner);
        return fetch(u, { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' } }).then(function (r) {
          return r.json().catch(function () {
            return {};
          });
        }).then(function (data) {
          if (!data.ok) throw new Error(data.error || 'delete_failed');
        });
      });
    });
    return seq;
  }

  function execBulkActivate() {
    var designs = getSelectedDesignObjects().filter(function (d) {
      var id = d.id != null ? String(d.id).trim() : '';
      return !!id && resolveLib(d) === 'inactive';
    });
    if (!designs.length) {
      alert(T('bulkNoInactiveSelected', 'No inactive designs in selection'));
      return;
    }
    var c = core();
    if (!c || typeof c.fetchActivateCatalogBundle !== 'function') return;

    var shell = openOverlayShell('creator-creations-bulk-overlay-panel--sheet creator-creations-bulk-overlay-panel--activate');
    var panel = shell.panel;
    panel.innerHTML = '';

    var h = document.createElement('h2');
    h.className = 'creator-creations-bulk-sheet-title';
    h.textContent = T('bulkActivateTitle', 'Activate designs');

    var body = document.createElement('div');
    body.className = 'creator-creations-bulk-sheet-body';
    body.innerHTML = '<p class="creator-creations-bulk-loading">' + escapeHtml(T('bulkLoading', 'Loading…')) + '</p>';

    var foot = document.createElement('div');
    foot.className = 'creator-creations-bulk-sheet-footer';
    panel.appendChild(h);
    panel.appendChild(body);
    panel.appendChild(foot);

    var bundlesById = {};
    var draftExcluded = new Map();
    var unionProducts = new Map();

    Promise.all(
      designs.map(function (design) {
        return c.fetchActivateCatalogBundle(design).then(function (b) {
          bundlesById[String(design.id)] = { bundle: b, design: design };
          var ex = new Set((c.parseExcludedFromMeta(design.metadata) || []).map(String));
          draftExcluded.set(String(design.id), ex);
        });
      })
    ).then(function () {
      Object.keys(bundlesById).forEach(function (did) {
        var pack = bundlesById[did];
        var b = pack.bundle;
        if (!b || !b.products) return;
        b.products.forEach(function (p) {
          var pk = String(p.product_key || '').trim();
          if (!pk || unionProducts.has(pk)) return;
          unionProducts.set(pk, p);
        });
      });

      function countForPk(pk) {
        var n = 0;
        designs.forEach(function (d) {
          var id = String(d.id);
          var pack = bundlesById[id];
          if (!pack) return;
          var elig = new Set((pack.bundle.eligibleKeys || []).map(String));
          if (!elig.has(pk)) return;
          var ex = draftExcluded.get(id);
          if (ex && ex.has(pk)) return;
          n++;
        });
        return n;
      }

      function rerenderRows() {
        body.innerHTML = '';
        var intro = document.createElement('p');
        intro.className = 'creator-creations-bulk-activate-intro';
        intro.textContent = T(
          'bulkActivateProductIntro',
          'Each product lists how many selected designs apply. Open to adjust.'
        );
        body.appendChild(intro);
        var keys = Array.from(unionProducts.keys()).sort(function (a, b) {
          return a.localeCompare(b);
        });
        keys.forEach(function (pk) {
          var p = unionProducts.get(pk);
          var count = countForPk(pk);
          if (count === 0) return;
          var row = document.createElement('div');
          row.className = 'creator-creations-bulk-prow';

          var openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'creator-creations-bulk-prow__picker';
          openBtn.setAttribute('aria-label', T('bulkOpenProductPick', 'Select designs for product'));

          var cbUi = document.createElement('span');
          cbUi.className = 'creator-creations-bulk-prow__cb-ui';
          cbUi.setAttribute('aria-hidden', 'true');

          var thumb = document.createElement('span');
          thumb.className = 'creator-creations-bulk-prow__thumb';
          if (p.preview_image_url) {
            var img = document.createElement('img');
            img.src = p.preview_image_url;
            img.alt = '';
            thumb.appendChild(img);
          } else thumb.textContent = '—';

          var text = document.createElement('span');
          text.className = 'creator-creations-bulk-prow__text';
          var strong = document.createElement('strong');
          strong.textContent = p.title || pk;
          var cnt = document.createElement('span');
          cnt.className = 'creator-creations-bulk-prow__count';
          cnt.textContent = T('bulkDesignsEligibleCountTpl', '%n% designs').split('%n%').join(String(count));
          text.appendChild(strong);
          text.appendChild(cnt);

          openBtn.appendChild(cbUi);
          openBtn.appendChild(thumb);
          openBtn.appendChild(text);

          openBtn.addEventListener('click', function () {
            openDrillForProduct(pk, p.title || pk, bundlesById, draftExcluded, rerenderRows);
          });
          row.appendChild(openBtn);
          body.appendChild(row);
        });
      }

      foot.innerHTML = '';
      rerenderRows();

      Promise.resolve(c.fetchCreatorNames()).then(function (names) {
        foot.innerHTML = '';
        var creatorBlock = document.createElement('div');
        creatorBlock.className = 'creator-creations-bulk-activate-foot';

        var visWrap = c.renderVisibilitySwitch(true);

        var creatorSel = null;
        if (!names.length) {
          creatorBlock.appendChild(visWrap);
        } else if (names.length === 1) {
          var soleLbl = document.createElement('p');
          soleLbl.className = 'creator-creations-bulk-activate-creator-name';
          soleLbl.textContent = String(T('libraryActivateScopeNamed', 'Publish as %name%')).split('%name%').join(
            names[0]
          );
          creatorBlock.appendChild(soleLbl);
          creatorBlock.appendChild(visWrap);
        } else {
          var lbl = document.createElement('label');
          lbl.className = 'creator-creations-bulk-sheet-label';
          lbl.textContent = T('libraryActivateCreatorLabel', 'Creator name');
          creatorSel = document.createElement('select');
          creatorSel.className = 'creator-creations-bulk-sheet-select';
          var pick =
            (typeof c.readLastCreatorPick === 'function' ? c.readLastCreatorPick(names) : null) || names[0];
          names.forEach(function (n) {
            var opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            if (n === pick) opt.selected = true;
            creatorSel.appendChild(opt);
          });
          creatorBlock.appendChild(lbl);
          creatorBlock.appendChild(creatorSel);
          creatorBlock.appendChild(visWrap);
        }

        var btnRow = document.createElement('div');
        btnRow.className = 'creator-creations-bulk-sheet-footer--row';
        var btnCa = btnSecondary(T('bulkCancel', 'Cancel'), shell.close);
        var btnGo = btnPrimary(T('libraryConfirmActivate', 'Activate'), function () {
          runBulkActivateCommit(designs, bundlesById, draftExcluded, names, creatorSel, visWrap, btnGo).then(
            function () {
              shell.close();
              exitBulkModeFromToolbar();
              var nm =
                !names || !names.length
                  ? ''
                  : names.length === 1
                    ? names[0]
                    : creatorSel
                      ? String(creatorSel.value || '').trim()
                      : '';
              if (nm && typeof c.writeLastCreatorPick === 'function') c.writeLastCreatorPick(nm);
              if (CS() && typeof CS().loadDesigns === 'function') return CS().loadDesigns(true, { silent: true });
            }
          ).catch(function (err) {
            console.warn(err);
            alert(T('bulkErrorActivate', 'Activate failed'));
          });
        });

        btnRow.appendChild(btnCa);
        btnRow.appendChild(btnGo);
        foot.appendChild(creatorBlock);
        foot.appendChild(btnRow);
      });
    });
  }

  function resolveLib(d) {
    var ls = d.library_status;
    var active = ls === 'active';
    return active ? 'active' : 'inactive';
  }

  function runBulkActivateCommit(designs, bundlesById, draftExcluded, names, creatorSel, visWrap, btnGo) {
    var c = core();
    btnGo.disabled = true;
    var visibility = typeof visWrap.getValue === 'function' ? visWrap.getValue() : 'public';
    var activateWithout = !names || names.length === 0;
    var creatorName = '';
    if (!activateWithout) {
      if (names.length === 1) creatorName = names[0];
      else if (creatorSel) creatorName = String(creatorSel.value || '').trim();
    }

    function excludedArrayForDesignId(designId) {
      var pack = bundlesById[String(designId)];
      var elig = (pack.bundle.eligibleKeys || []).map(String);
      var set = draftExcluded.get(String(designId)) || new Set();
      var arr = elig.filter(function (epk) {
        return set.has(epk);
      });
      return c.sortUnique(arr);
    }

    var seq = Promise.resolve();
    designs.forEach(function (design) {
      seq = seq.then(function () {
        var body = {
          design_id: design.id,
          library_status: 'active',
          visibility: visibility,
        };
        if (activateWithout) {
          body.activate_without_creator_name = true;
          body.creator_name = '';
        } else {
          body.creator_name = creatorName || '';
        }
        body.metadata = { publish_excluded_product_keys: excludedArrayForDesignId(design.id) };
        return c.updateDesignPut(body).then(function (json) {
          if (!json.ok) throw new Error(json.error || 'activate_failed');
        });
      });
    });
    return seq.finally(function () {
      btnGo.disabled = false;
    });
  }

  function openDrillForProduct(pk, ptitle, bundlesById, draftExcluded, rerenderRows) {
    var contributingIds = Object.keys(bundlesById).filter(function (did) {
      var elig = new Set((bundlesById[did].bundle.eligibleKeys || []).map(String));
      return elig.has(pk);
    });
    var baseOn = {};
    contributingIds.forEach(function (did) {
      var set = draftExcluded.get(did);
      baseOn[did] = !(set && set.has(pk));
    });

    function isOn(did) {
      var set = draftExcluded.get(did);
      return !(set && set.has(pk));
    }

    function drillDirty() {
      for (var i = 0; i < contributingIds.length; i++) {
        var did = contributingIds[i];
        if (isOn(did) !== baseOn[did]) return true;
      }
      return false;
    }

    var drill = openOverlayShell('creator-creations-bulk-overlay-panel--drill');
    drill.panel.innerHTML = '';
    var h = document.createElement('h3');
    h.className = 'creator-creations-bulk-sheet-title';
    h.textContent = String(T('bulkDrillProductTitleTpl', '%p%')).split('%p%').join(String(ptitle || pk));

    var grid = document.createElement('div');
    grid.className = 'creator-creations-bulk-drill-grid';
    contributingIds.forEach(function (did) {
      var pack = bundlesById[did];
      var design = pack.design;

      var cell = document.createElement('label');
      cell.className = 'creator-creations-bulk-drill-cell';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isOn(did);

      var thumb = document.createElement('div');
      thumb.className = 'creator-creations-bulk-drill-thumb';
      var imgUrl = design.preview_url || design.image_url || design.original_url;
      if (imgUrl) {
        var im = document.createElement('img');
        im.src = imgUrl;
        im.alt = '';
        thumb.appendChild(im);
      }
      cell.appendChild(cb);
      cell.appendChild(thumb);
      var cap = document.createElement('div');
      cap.className = 'creator-creations-bulk-drill-cap';
      cap.textContent = design.title || '#' + did;
      cell.appendChild(cap);

      cb.addEventListener('change', function () {
        var next = new Set(Array.from(draftExcluded.get(did) || []));
        if (!cb.checked) next.add(pk);
        else next.delete(pk);
        draftExcluded.set(did, next);
        btnApply.disabled = !drillDirty();
      });
      grid.appendChild(cell);
    });

    var foot = document.createElement('div');
    foot.className = 'creator-creations-bulk-sheet-footer creator-creations-bulk-sheet-footer--row';
    var btnDiscard = btnSecondary(T('bulkCancel', 'Cancel'), drill.close);

    var btnApply = btnPrimary(T('bulkApply', 'Apply'), function () {
      rerenderRows();
      drill.close();
    });
    btnApply.disabled = true;

    foot.appendChild(btnDiscard);
    foot.appendChild(btnApply);

    drill.panel.appendChild(h);
    drill.panel.appendChild(grid);
    drill.panel.appendChild(foot);
  }

  function buildDock() {
    dockEl = document.createElement('div');
    dockEl.id = 'creatorCreationsBulkDock';
    dockEl.className = 'creator-creations-bulk-dock';
    dockEl.setAttribute('hidden', '');
    dockEl.innerHTML =
      '<div class="creator-creations-bulk-dock__panel" role="region" aria-label="' +
      escapeHtml(T('bulkDockAria', 'Bulk actions')) +
      '">' +
      '<div class="creator-creations-bulk-dock__row">' +
      '<span class="creator-creations-bulk-dock__count"></span>' +
      '<button type="button" class="creator-creations-bulk-dock__btn" data-bulk-act="all"></button>' +
      '<button type="button" class="creator-creations-bulk-dock__btn" data-bulk-act="none"></button>' +
      '</div>' +
      '<div class="creator-creations-bulk-dock__actions">' +
      '<button type="button" class="creator-creations-bulk-dock__act" data-bulk-act="activate"></button>' +
      '<button type="button" class="creator-creations-bulk-dock__act" data-bulk-act="deactivate"></button>' +
      '<button type="button" class="creator-creations-bulk-dock__act creator-creations-bulk-dock__act--danger" data-bulk-act="delete"></button>' +
      '<button type="button" class="creator-creations-bulk-dock__act" data-bulk-act="save"></button>' +
      '</div>' +
      '</div>';

    dockEl.querySelector('[data-bulk-act="all"]').textContent = T('bulkSelectAll', 'Select all');
    dockEl.querySelector('[data-bulk-act="none"]').textContent = T('bulkDeselectAll', 'Deselect all');
    dockEl.querySelector('[data-bulk-act="activate"]').textContent = T('bulkActivate', 'Activate');
    dockEl.querySelector('[data-bulk-act="deactivate"]').textContent = T('bulkDeactivate', 'Deactivate');
    dockEl.querySelector('[data-bulk-act="delete"]').textContent = T('bulkDelete', 'Delete');
    dockEl.querySelector('[data-bulk-act="save"]').textContent = T('bulkSaveAll', 'Save all');

    dockEl.querySelector('[data-bulk-act="all"]').addEventListener('click', selectAllVisible);
    dockEl.querySelector('[data-bulk-act="none"]').addEventListener('click', deselectAll);
    dockEl.querySelector('[data-bulk-act="activate"]').addEventListener('click', execBulkActivate);
    dockEl.querySelector('[data-bulk-act="deactivate"]').addEventListener('click', execBulkDeactivate);
    dockEl.querySelector('[data-bulk-act="delete"]').addEventListener('click', execBulkDelete);
    dockEl.querySelector('[data-bulk-act="save"]').addEventListener('click', execBulkSaveUnsaved);

    var host = document.getElementById('creatorCreations');
    if (host) host.appendChild(dockEl);
    else document.body.appendChild(dockEl);
  }

  function init() {
    buildDock();

    document.querySelectorAll('.creator-creations-tab[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(syncToolbarVisibility, 0);
      });
    });

    document.querySelectorAll('[data-designs-activity]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(function () {
          pruneInvalidBulkSelectionKeys();
          syncAllCheckboxes();
          refreshDock();
        }, 0);
      });
    });

    window.addEventListener('creator-designs-loaded', function () {
      if (!CS() || CS().getCurrentTab() !== 'designs') {
        syncToolbarVisibility();
        return;
      }
      pruneInvalidBulkSelectionKeys();
      refreshDock();
      syncAllCheckboxes();
    });

    syncToolbarVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CreatorCreationsBulk = {
    isSelected: isSelected,
    isSelectedKey: isSelectedKey,
    setSelected: setSelected,
    setSelectedWithDesign: setSelectedWithDesign,
    toggleSelected: toggleSelected,
    toggleSelectedWithDesign: toggleSelectedWithDesign,
    clearSelection: clearSelection,
    pruneSelection: function () {
      pruneInvalidBulkSelectionKeys();
      syncAllCheckboxes();
      refreshDock();
    },
    refreshDock: refreshDock,
    syncToolbarVisibility: syncToolbarVisibility,
    redrawCheckboxes: function () {
      syncAllCheckboxes();
      refreshDock();
    },
  };
})();
