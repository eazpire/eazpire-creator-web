/**
 * Personalizable Sample — personalization zones editor / viewer.
 * Coordinates are normalized 0–1 relative to the design image.
 *
 * window.CreatorPersonalizationZones.mountEdit(host, opts)
 * window.CreatorPersonalizationZones.mountView(host, opts)
 * window.CreatorPersonalizationZones.normalizeZones(raw)
 */
(function () {
  'use strict';

  var MAX_ZONES = 8;
  var MIN_SIZE = 0.08;
  var DEFAULT_W = 0.28;
  var DEFAULT_H = 0.16;

  function Mi() {
    return window.CreatorMobileI18n || {};
  }

  function clamp(n, lo, hi) {
    var v = Number(n);
    if (!Number.isFinite(v)) v = lo;
    return Math.min(hi, Math.max(lo, v));
  }

  function uid() {
    return 'pz_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function svgLock(locked) {
    if (locked) {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 8h-1V6a4 4 0 10-8 0v2H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2zm-7-2a2 2 0 114 0v2h-4V6zm7 14H7V10h10v10z"/></svg>'
      );
    }
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 8h-1V6a4 4 0 00-8 0h2a2 2 0 114 0v2H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2zm0 12H7V10h10v10z"/></svg>'
    );
  }

  function svgDetail() {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
    );
  }

  function normalizeZone(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    var type = String(raw.type || '').toLowerCase() === 'image' ? 'image' : 'text';
    var w = clamp(raw.w, MIN_SIZE, 1);
    var h = clamp(raw.h, MIN_SIZE, 1);
    var x = clamp(raw.x, 0, 1 - w);
    var y = clamp(raw.y, 0, 1 - h);
    return {
      id: String(raw.id || uid()),
      n: index + 1,
      type: type,
      x: x,
      y: y,
      w: w,
      h: h,
      locked: !!raw.locked,
    };
  }

  function normalizeZones(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_ZONES; i++) {
      var z = normalizeZone(list[i], out.length);
      if (z) out.push(z);
    }
    return out;
  }

  function renumber(zones) {
    for (var i = 0; i < zones.length; i++) zones[i].n = i + 1;
    return zones;
  }

  function typeLabel(type) {
    var M = Mi();
    return type === 'image'
      ? M.zonesTypeImage || 'Image'
      : M.zonesTypeText || 'Text';
  }

  function openTypePicker(onPick) {
    var M = Mi();
    var overlay = document.createElement('div');
    overlay.className = 'cpz-type-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var panel = document.createElement('div');
    panel.className = 'cpz-type-panel';

    var title = document.createElement('h3');
    title.className = 'cpz-type-panel__title';
    title.textContent = M.zonesPickTypeTitle || 'Element type';
    panel.appendChild(title);

    var actions = document.createElement('div');
    actions.className = 'cpz-type-panel__actions';

    function makeBtn(type, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cpz-type-panel__btn';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        overlay.remove();
        onPick(type);
      });
      return btn;
    }

    actions.appendChild(makeBtn('text', M.zonesTypeText || 'Text'));
    actions.appendChild(makeBtn('image', M.zonesTypeImage || 'Image'));
    panel.appendChild(actions);

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cpz-type-panel__cancel';
    cancel.textContent = M.libraryCancel || window.CreatorI18n?.cancel || 'Cancel';
    cancel.addEventListener('click', function () {
      overlay.remove();
    });
    panel.appendChild(cancel);

    overlay.appendChild(panel);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function applyFrameStyle(el, zone) {
    el.style.left = zone.x * 100 + '%';
    el.style.top = zone.y * 100 + '%';
    el.style.width = zone.w * 100 + '%';
    el.style.height = zone.h * 100 + '%';
    el.setAttribute('data-type', zone.type);
    el.classList.toggle('is-locked', !!zone.locked);
  }

  function createFrameEl(zone, opts) {
    var editable = !!(opts && opts.editable);
    var el = document.createElement('div');
    el.className = 'cpz-frame';
    el.setAttribute('data-zone-id', zone.id);
    applyFrameStyle(el, zone);

    var num = document.createElement('span');
    num.className = 'cpz-frame__num';
    num.textContent = String(zone.n);
    el.appendChild(num);

    if (editable) {
      var lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'cpz-frame__lock';
      lockBtn.setAttribute(
        'aria-label',
        zone.locked ? Mi().zonesUnlock || 'Unlock' : Mi().zonesLock || 'Lock'
      );
      lockBtn.innerHTML = svgLock(!!zone.locked);
      lockBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof opts.onToggleLock === 'function') opts.onToggleLock(zone.id);
      });
      el.appendChild(lockBtn);

      ['nw', 'ne', 'sw', 'se'].forEach(function (corner) {
        var h = document.createElement('span');
        h.className = 'cpz-frame__handle cpz-frame__handle--' + corner;
        h.setAttribute('data-handle', corner);
        el.appendChild(h);
      });

      el.addEventListener('pointerdown', function (e) {
        if (typeof opts.onPointerDown === 'function') opts.onPointerDown(e, zone.id, el);
      });
    }

    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof opts.onSelect === 'function') opts.onSelect(zone.id);
    });

    return el;
  }

  function getImageBox(imgEl, hostEl) {
    if (!imgEl || !hostEl) {
      return { left: 0, top: 0, width: hostEl ? hostEl.clientWidth : 1, height: hostEl ? hostEl.clientHeight : 1 };
    }
    var nw = imgEl.naturalWidth || 1;
    var nh = imgEl.naturalHeight || 1;
    var cw = hostEl.clientWidth || 1;
    var ch = hostEl.clientHeight || 1;
    var scale = Math.min(cw / nw, ch / nh);
    var width = nw * scale;
    var height = nh * scale;
    return {
      left: (cw - width) / 2,
      top: (ch - height) / 2,
      width: width,
      height: height,
    };
  }

  function mountShared(host, opts) {
    opts = opts || {};
    var mode = opts.mode === 'view' ? 'view' : 'edit';
    var editable = mode === 'edit';
    var zones = normalizeZones(opts.zones);
    var selectedId = zones[0] ? zones[0].id : null;
    var imageUrl = String(opts.imageUrl || '').trim();
    var listeners = [];
    var dragState = null;

    host.innerHTML = '';
    var root = document.createElement('div');
    root.className = editable ? 'cpz-panel' : 'cpz-viewer cpz-viewer--pdp';

    var layout = null;
    var viewer = null;
    var stage = null;
    var img = null;
    var listEl = null;
    var setBtn = null;

    if (editable) {
      var hint = document.createElement('p');
      hint.className = 'cpz-panel__hint';
      hint.textContent = Mi().zonesHint || 'Place frames on the design to mark where customers can add text or images.';
      root.appendChild(hint);

      layout = document.createElement('div');
      layout.className = 'cpz-panel__layout';
      root.appendChild(layout);

      viewer = document.createElement('div');
      viewer.className = 'cpz-viewer';
      layout.appendChild(viewer);
    } else {
      viewer = root;
    }

    img = document.createElement('img');
    img.className = 'cpz-viewer__img';
    img.alt = '';
    img.draggable = false;
    if (imageUrl) img.src = imageUrl;
    viewer.appendChild(img);

    stage = document.createElement('div');
    stage.className = 'cpz-viewer__stage' + (editable ? ' is-edit' : '');
    viewer.appendChild(stage);

    function syncStageBox() {
      var box = getImageBox(img, viewer);
      stage.style.left = box.left + 'px';
      stage.style.top = box.top + 'px';
      stage.style.width = box.width + 'px';
      stage.style.height = box.height + 'px';
    }

    img.addEventListener('load', syncStageBox);
    window.addEventListener('resize', syncStageBox);
    listeners.push(function () {
      window.removeEventListener('resize', syncStageBox);
    });

    if (editable) {
      var toolbar = document.createElement('div');
      toolbar.className = 'cpz-viewer__toolbar';
      setBtn = document.createElement('button');
      setBtn.type = 'button';
      setBtn.className = 'cpz-viewer__set-btn';
      setBtn.textContent = Mi().zonesSetElement || 'Set Element';
      setBtn.addEventListener('click', function () {
        if (zones.length >= MAX_ZONES) {
          window.alert(Mi().zonesMaxError || 'You can add up to 8 personalizable elements.');
          return;
        }
        openTypePicker(function (type) {
          addZone(type);
        });
      });
      toolbar.appendChild(setBtn);
      viewer.appendChild(toolbar);

      listEl = document.createElement('div');
      listEl.className = 'cpz-list';
      layout.appendChild(listEl);
    }

    function emitChange() {
      if (typeof opts.onChange === 'function') {
        opts.onChange(zones.map(function (z) {
          return {
            id: z.id,
            n: z.n,
            type: z.type,
            x: z.x,
            y: z.y,
            w: z.w,
            h: z.h,
            locked: !!z.locked,
          };
        }));
      }
    }

    function findZone(id) {
      for (var i = 0; i < zones.length; i++) {
        if (zones[i].id === id) return zones[i];
      }
      return null;
    }

    function addZone(type) {
      if (zones.length >= MAX_ZONES) return;
      var offset = (zones.length % 4) * 0.04;
      var zone = {
        id: uid(),
        n: zones.length + 1,
        type: type === 'image' ? 'image' : 'text',
        x: clamp(0.36 + offset, 0, 1 - DEFAULT_W),
        y: clamp(0.36 + offset, 0, 1 - DEFAULT_H),
        w: DEFAULT_W,
        h: DEFAULT_H,
        locked: false,
      };
      zones.push(zone);
      selectedId = zone.id;
      render();
      emitChange();
    }

    function removeZone(id) {
      zones = renumber(zones.filter(function (z) {
        return z.id !== id;
      }));
      if (selectedId === id) selectedId = zones[0] ? zones[0].id : null;
      render();
      emitChange();
    }

    function toggleLock(id) {
      var z = findZone(id);
      if (!z) return;
      z.locked = !z.locked;
      render();
      emitChange();
    }

    function selectZone(id) {
      selectedId = id;
      render();
    }

    function onPointerDown(e, zoneId, frameEl) {
      var z = findZone(zoneId);
      if (!z || z.locked) {
        selectZone(zoneId);
        return;
      }
      var handle = e.target && e.target.getAttribute ? e.target.getAttribute('data-handle') : null;
      if (e.target && e.target.closest && e.target.closest('.cpz-frame__lock')) return;

      e.preventDefault();
      selectZone(zoneId);
      syncStageBox();
      var stageRect = stage.getBoundingClientRect();
      if (!stageRect.width || !stageRect.height) return;

      dragState = {
        id: zoneId,
        handle: handle || 'move',
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: z.x, y: z.y, w: z.w, h: z.h },
        stageW: stageRect.width,
        stageH: stageRect.height,
        frameEl: frameEl,
      };

      try {
        frameEl.setPointerCapture(e.pointerId);
      } catch (_) {}

      function onMove(ev) {
        if (!dragState) return;
        var dx = (ev.clientX - dragState.startX) / dragState.stageW;
        var dy = (ev.clientY - dragState.startY) / dragState.stageH;
        var o = dragState.origin;
        var next = { x: o.x, y: o.y, w: o.w, h: o.h };
        var hndl = dragState.handle;

        if (hndl === 'move') {
          next.x = clamp(o.x + dx, 0, 1 - o.w);
          next.y = clamp(o.y + dy, 0, 1 - o.h);
        } else {
          if (hndl.indexOf('w') >= 0) {
            var nx = clamp(o.x + dx, 0, o.x + o.w - MIN_SIZE);
            next.w = o.x + o.w - nx;
            next.x = nx;
          }
          if (hndl.indexOf('e') >= 0) {
            next.w = clamp(o.w + dx, MIN_SIZE, 1 - o.x);
          }
          if (hndl.indexOf('n') >= 0) {
            var ny = clamp(o.y + dy, 0, o.y + o.h - MIN_SIZE);
            next.h = o.y + o.h - ny;
            next.y = ny;
          }
          if (hndl.indexOf('s') >= 0) {
            next.h = clamp(o.h + dy, MIN_SIZE, 1 - o.y);
          }
        }

        var zone = findZone(dragState.id);
        if (!zone) return;
        zone.x = next.x;
        zone.y = next.y;
        zone.w = next.w;
        zone.h = next.h;
        applyFrameStyle(dragState.frameEl, zone);
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        dragState = null;
        emitChange();
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }

    function renderList() {
      if (!listEl) return;
      listEl.innerHTML = '';
      var title = document.createElement('p');
      title.className = 'cpz-list__title';
      title.textContent = Mi().zonesListTitle || 'Personalizable elements';
      listEl.appendChild(title);

      if (!zones.length) {
        var empty = document.createElement('p');
        empty.className = 'cpz-list__empty';
        empty.textContent =
          Mi().zonesListEmpty ||
          'No elements yet. Use Set Element to mark areas customers can personalize.';
        listEl.appendChild(empty);
        return;
      }

      var items = document.createElement('div');
      items.className = 'cpz-list__items';
      zones.forEach(function (z) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'cpz-list__item' + (z.id === selectedId ? ' is-selected' : '');
        row.setAttribute('data-type', z.type);
        row.addEventListener('click', function () {
          selectZone(z.id);
        });

        var badge = document.createElement('span');
        badge.className = 'cpz-list__badge';
        badge.textContent = String(z.n);
        row.appendChild(badge);

        var label = document.createElement('span');
        label.className = 'cpz-list__label';
        label.textContent = typeLabel(z.type);
        row.appendChild(label);

        var del = document.createElement('span');
        del.className = 'cpz-list__delete';
        del.setAttribute('role', 'button');
        del.setAttribute('aria-label', Mi().zonesDelete || 'Remove');
        del.textContent = '×';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          removeZone(z.id);
        });
        row.appendChild(del);

        items.appendChild(row);
      });
      listEl.appendChild(items);
    }

    function render() {
      syncStageBox();
      stage.innerHTML = '';
      zones.forEach(function (z) {
        var frame = createFrameEl(z, {
          editable: editable,
          onSelect: selectZone,
          onToggleLock: toggleLock,
          onPointerDown: onPointerDown,
        });
        if (z.id === selectedId) frame.classList.add('is-selected');
        stage.appendChild(frame);
      });
      if (setBtn) setBtn.disabled = zones.length >= MAX_ZONES;
      renderList();
    }

    host.appendChild(root);
    render();
    // next frame for correct image box after layout
    requestAnimationFrame(syncStageBox);

    return {
      getZones: function () {
        return normalizeZones(zones);
      },
      setZones: function (next) {
        zones = normalizeZones(next);
        selectedId = zones[0] ? zones[0].id : null;
        render();
      },
      setImageUrl: function (url) {
        imageUrl = String(url || '').trim();
        img.src = imageUrl;
      },
      destroy: function () {
        listeners.forEach(function (fn) {
          try {
            fn();
          } catch (_) {}
        });
        host.innerHTML = '';
      },
      el: root,
    };
  }

  function mountEdit(host, opts) {
    if (!host) return null;
    return mountShared(host, Object.assign({}, opts || {}, { mode: 'edit' }));
  }

  function mountView(host, opts) {
    if (!host) return null;
    return mountShared(host, Object.assign({}, opts || {}, { mode: 'view' }));
  }

  window.CreatorPersonalizationZones = {
    MAX_ZONES: MAX_ZONES,
    normalizeZones: normalizeZones,
    mountEdit: mountEdit,
    mountView: mountView,
    svgDetail: svgDetail,
  };
})();
