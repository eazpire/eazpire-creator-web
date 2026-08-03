/**
 * Creator Assets Manager modal (IDEA-045)
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var root = null;
  var foldersTree = [];
  var hiddenFolder = null;
  var allCount = 0;
  var assets = [];
  var selected = Object.create(null);
  var currentFolder = 'all';
  var currentType = '';
  var searchQuery = '';
  var searchTimer = null;
  var folderMenuTarget = null;
  var assetMenuTarget = null;
  var folderSettingsMode = null; // create | edit
  var folderSettingsParentId = null;
  var folderSettingsId = null;
  var pendingFolderRemoveId = null;
  var removeAssetsConfirmed = false;
  var pendingAssetAction = null; // { action, items }
  var moveItems = null; // [{ asset_type, asset_id, folder_id? }]
  var moveSelectedFolderId = null;
  var playingKey = null;
  var expandedParents = Object.create(null); // parentId -> true
  var dragPayload = null; // [{ asset_type, asset_id }]
  var dragExpandTimer = null;
  var dragExpandFolderId = null;
  var linkPhoneSessionId = null;
  var linkPhonePollTimer = null;
  var PHONE_UPLOAD_WORKER_FALLBACK = 'https://creator-engine.eazpire.workers.dev';

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    return !t || t.indexOf('translation missing') !== -1;
  }

  function i18n(key, fallback) {
    try {
      var ns = window.CreatorI18n && window.CreatorI18n.assets_manager;
      if (ns && ns[key] != null && !isBadTranslationString(String(ns[key]))) {
        return String(ns[key]);
      }
      var flat = window.CreatorI18n && window.CreatorI18n['creator.assets_manager.' + key];
      if (flat != null && !isBadTranslationString(String(flat))) return String(flat);
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

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function assetKey(a) {
    return String(a.asset_type) + ':' + String(a.id);
  }

  function setStatus(msg, isError) {
    var el = $('#cam-status');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
  }

  function selectedItems() {
    return Object.keys(selected).map(function (k) {
      var parts = k.split(':');
      return { asset_type: parts[0], asset_id: parts.slice(1).join(':') };
    });
  }

  function updateFloatBar() {
    var bar = $('#cam-float-bar');
    var countEl = $('#cam-float-count');
    var keys = Object.keys(selected);
    if (!bar) return;
    if (!keys.length) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    if (countEl) countEl.textContent = String(keys.length);
    var toggle = $('#cam-btn-select-toggle');
    if (toggle) {
      var allSelected = assets.length > 0 && keys.length >= assets.length;
      toggle.textContent = allSelected
        ? i18n('deselect_all', 'Deselect all')
        : i18n('select_all', 'Select all');
    }
  }

  async function apiGet(op, extraParams) {
    var url = apiUrl(op);
    if (extraParams) {
      Object.keys(extraParams).forEach(function (k) {
        if (extraParams[k] == null || extraParams[k] === '') return;
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(extraParams[k]);
      });
    }
    var res = await fetch(url, { credentials: 'include' });
    return res.json();
  }

  async function apiPost(op, body) {
    var res = await fetch(apiUrl(op), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return res.json();
  }

  function closeMenus() {
    var fm = document.getElementById('cam-folder-menu');
    var am = document.getElementById('cam-asset-menu');
    if (fm) fm.hidden = true;
    if (am) am.hidden = true;
    folderMenuTarget = null;
    assetMenuTarget = null;
  }

  function showMenu(el, x, y) {
    if (!el) return;
    el.hidden = false;
    el.style.left = Math.max(8, Math.min(x, window.innerWidth - 160)) + 'px';
    el.style.top = Math.max(8, Math.min(y, window.innerHeight - 100)) + 'px';
  }

  /** Reparent overlays to body so fixed z-index is not trapped in cam-modal-root stacking context. */
  function mountOverlay(el) {
    if (!el) return null;
    try {
      if (el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    } catch (eMount) {}
    return el;
  }

  function openSubmodal(id) {
    var el = mountOverlay(document.getElementById(id));
    if (!el) return;
    el.hidden = false;
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeSubmodal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
  }

  var SYSTEM_FOLDER_DEFS = [
    { system_key: 'unsorted', titleKey: 'folder_unsorted', title: 'Unsorted' },
    { system_key: 'hero_images', titleKey: 'folder_hero_images', title: 'Hero Images' },
    { system_key: 'character_images', titleKey: 'folder_character_images', title: 'Character Images' },
    { system_key: 'motion_videos', titleKey: 'folder_motion_videos', title: 'Motion Videos' }
  ];

  function systemFolderTitle(folder) {
    if (!folder) return '';
    var def = SYSTEM_FOLDER_DEFS.find(function (d) {
      return d.system_key === folder.system_key;
    });
    if (def) return i18n(def.titleKey, def.title);
    return folder.title || '';
  }

  function ensureSystemFoldersInTree(tree) {
    var list = Array.isArray(tree) ? tree.slice() : [];
    SYSTEM_FOLDER_DEFS.forEach(function (def) {
      var found = list.some(function (f) {
        return f && f.system_key === def.system_key;
      });
      if (!found) {
        list.push({
          id: def.system_key,
          system_key: def.system_key,
          title: def.title,
          is_system: true,
          parent_id: null,
          asset_count: 0,
          children: [],
          _local: true
        });
      }
    });
    // Keep system folders in fixed order, then any extras
    list.sort(function (a, b) {
      var ai = SYSTEM_FOLDER_DEFS.findIndex(function (d) {
        return d.system_key === a.system_key;
      });
      var bi = SYSTEM_FOLDER_DEFS.findIndex(function (d) {
        return d.system_key === b.system_key;
      });
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return list;
  }

  function systemParentsForSelect() {
    return (foldersTree || []).filter(function (f) {
      return (
        f.is_system &&
        f.system_key &&
        f.system_key !== 'hidden' &&
        f.system_key !== 'unsorted' &&
        !f._local
      );
    });
  }

  function isUserChildFolder(folder) {
    return !!(folder && !folder.is_system && folder.parent_id && !folder._local);
  }

  function collectUserChildFolders() {
    var out = [];
    ensureSystemFoldersInTree(foldersTree).forEach(function (parent) {
      (parent.children || []).forEach(function (child) {
        if (isUserChildFolder(child) || (!child.is_system && child.parent_id)) {
          out.push({
            id: child.id,
            title: child.title || '',
            parent_id: parent.id,
            parent_title: systemFolderTitle(parent) || parent.title || ''
          });
        }
      });
    });
    return out;
  }

  function ensureParentExpandedForCurrent() {
    if (!currentFolder || currentFolder === 'all' || currentFolder === 'hidden') return;
    var folder = findFolderById(currentFolder);
    if (folder && folder.parent_id) {
      expandedParents[folder.parent_id] = true;
    }
  }

  function renderFolderTree() {
    var nav = $('#cam-folder-tree');
    var allCountEl = $('[data-cam-all-count]');
    var hiddenCountEl = $('[data-cam-hidden-count]');
    if (allCountEl) allCountEl.textContent = String(allCount || 0);
    if (hiddenCountEl) {
      hiddenCountEl.textContent = String((hiddenFolder && hiddenFolder.asset_count) || 0);
    }
    if (!nav) return;

    ensureParentExpandedForCurrent();

    var html = '';
    ensureSystemFoldersInTree(foldersTree).forEach(function (parent) {
      var active = currentFolder === parent.id ? ' is-active' : '';
      var label = systemFolderTitle(parent) || parent.title || '';
      var canAddChild =
        !parent._local && parent.id && parent.system_key !== 'unsorted' && parent.system_key !== 'hidden';
      var children = parent.children || [];
      var hasChildren = children.length > 0;
      var isExpanded = !!(expandedParents[parent.id] || (!hasChildren && false));
      // Expand by default when parent has children and was never toggled, OR when marked
      if (hasChildren && expandedParents[parent.id] == null) {
        // Default: expanded so existing folders stay discoverable; DnD can still expand collapsed ones
        isExpanded = true;
        expandedParents[parent.id] = true;
      } else if (hasChildren) {
        isExpanded = !!expandedParents[parent.id];
      }

      html +=
        '<div class="cam-folder-group' +
        (isExpanded ? ' is-expanded' : '') +
        '" data-cam-folder-group="' +
        escapeHtml(parent.id) +
        '">' +
        '<div class="cam-folder-row" data-cam-folder-id="' +
        escapeHtml(parent.id) +
        '" data-system-key="' +
        escapeHtml(parent.system_key || '') +
        '" data-cam-drop="0">' +
        (hasChildren
          ? '<button type="button" class="cam-folder-expand" data-cam-expand="' +
            escapeHtml(parent.id) +
            '" aria-expanded="' +
            (isExpanded ? 'true' : 'false') +
            '">' +
            (isExpanded ? '▾' : '▸') +
            '</button>'
          : '') +
        '<button type="button" class="cam-sidebar__item' +
        active +
        '" data-cam-folder="' +
        escapeHtml(parent.id) +
        '">' +
        '<span class="cam-sidebar__item-label">' +
        escapeHtml(label) +
        '</span>' +
        '<span class="cam-sidebar__count">' +
        String(parent.asset_count || 0) +
        '</span>' +
        '</button>' +
        (canAddChild
          ? '<button type="button" class="cam-folder-add-child" data-cam-add-child="' +
            escapeHtml(parent.id) +
            '" title="' +
            escapeHtml(i18n('add_child_folder', 'Add child folder')) +
            '" aria-label="' +
            escapeHtml(i18n('add_child_folder', 'Add child folder')) +
            '">+</button>'
          : '') +
        '</div>';

      if (hasChildren) {
        html += '<div class="cam-folder-children">';
        children.forEach(function (child) {
          var cActive = currentFolder === child.id ? ' is-active' : '';
          html +=
            '<div class="cam-folder-row" data-cam-folder-id="' +
            escapeHtml(child.id) +
            '" data-cam-drop="1">' +
            '<button type="button" class="cam-sidebar__item cam-sidebar__item--child' +
            cActive +
            '" data-cam-folder="' +
            escapeHtml(child.id) +
            '">' +
            '<span class="cam-sidebar__item-label">' +
            escapeHtml(child.title) +
            '</span>' +
            '<span class="cam-sidebar__count">' +
            String(child.asset_count || 0) +
            '</span>' +
            '</button>' +
            '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    nav.innerHTML = html;

    var allBtn = $('#cam-folder-all');
    var hiddenBtn = $('#cam-folder-hidden');
    if (allBtn) allBtn.classList.toggle('is-active', currentFolder === 'all');
    if (hiddenBtn) hiddenBtn.classList.toggle('is-active', currentFolder === 'hidden');
  }

  function mediaPreviewHtml(a) {
    var url = String(a.url || '').trim();
    var thumb = String(a.thumbnail_url || a.url || '').trim();
    var kind = String(a.media_kind || '').toLowerCase();
    if (kind === 'video') {
      return (
        '<div class="cam-card__media-wrap">' +
        '<video class="cam-card__media" src="' +
        escapeHtml(url) +
        '"' +
        (thumb && thumb !== url ? ' poster="' + escapeHtml(thumb) + '"' : '') +
        ' muted playsinline preload="metadata"></video>' +
        '<span class="cam-card__play" aria-hidden="true">▶</span>' +
        '</div>'
      );
    }
    if (kind === 'audio') {
      return (
        '<div class="cam-card__media-wrap">' +
        '<div class="cam-card__audio-placeholder" aria-hidden="true">♪</div>' +
        (url
          ? '<audio class="cam-card__media cam-card__media--audio" src="' +
            escapeHtml(url) +
            '" preload="metadata"></audio>'
          : '') +
        '<span class="cam-card__play" aria-hidden="true">▶</span>' +
        '</div>'
      );
    }
    return (
      '<div class="cam-card__media-wrap">' +
      (thumb
        ? '<img class="cam-card__media" src="' +
          escapeHtml(thumb) +
          '" alt="" loading="lazy">'
        : '<div class="cam-card__audio-placeholder" aria-hidden="true"></div>') +
      '</div>'
    );
  }

  function stopAllPlayback() {
    if (!root) {
      playingKey = null;
      return;
    }
    root.querySelectorAll('.cam-card.is-playing').forEach(function (card) {
      card.classList.remove('is-playing');
      var media = card.querySelector('video, audio');
      if (media) {
        try {
          media.pause();
          media.currentTime = 0;
        } catch (e) {}
      }
    });
    playingKey = null;
  }

  function toggleCardPlayback(card) {
    if (!card) return;
    var key = card.getAttribute('data-cam-asset-key');
    var kind = card.getAttribute('data-media-kind');
    if (kind !== 'video' && kind !== 'audio') return;
    var media = card.querySelector('video, audio');
    if (!media || !media.getAttribute('src')) return;

    if (playingKey === key && !media.paused) {
      try {
        media.pause();
      } catch (e) {}
      card.classList.remove('is-playing');
      playingKey = null;
      return;
    }

    stopAllPlayback();
    try {
      if (media.tagName === 'VIDEO') media.muted = false;
      var p = media.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          // Autoplay with sound may fail; retry muted for video previews
          if (media.tagName === 'VIDEO') {
            media.muted = true;
            media.play().catch(function () {});
          }
        });
      }
      card.classList.add('is-playing');
      playingKey = key;
      media.onended = function () {
        card.classList.remove('is-playing');
        if (playingKey === key) playingKey = null;
      };
    } catch (e) {}
  }

  function renderAssets() {
    var grid = $('#cam-asset-grid');
    var empty = $('#cam-empty');
    if (!grid) return;
    if (!assets.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      updateFloatBar();
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = assets
      .map(function (a) {
        var key = assetKey(a);
        var checked = selected[key] ? ' checked' : '';
        var selClass = selected[key] ? ' is-selected' : '';
        var playClass =
          a.media_kind === 'video' || a.media_kind === 'audio' ? ' cam-card--playable' : '';
        var playingClass = playingKey === key ? ' is-playing' : '';
        return (
          '<article class="cam-card' +
          selClass +
          playClass +
          playingClass +
          '" draggable="true" data-cam-asset-key="' +
          escapeHtml(key) +
          '" data-asset-type="' +
          escapeHtml(a.asset_type) +
          '" data-asset-id="' +
          escapeHtml(a.id) +
          '" data-media-kind="' +
          escapeHtml(a.media_kind || '') +
          '" data-folder-id="' +
          escapeHtml(a.folder_id || '') +
          '">' +
          '<input type="checkbox" class="cam-card__check" data-cam-select' +
          checked +
          ' aria-label="' +
          escapeHtml(i18n('select_asset', 'Select asset')) +
          '">' +
          mediaPreviewHtml(a) +
          '<div class="cam-card__meta">' +
          '<div class="cam-card__title">' +
          escapeHtml(a.title || a.asset_type) +
          '</div>' +
          '<div class="cam-card__type">' +
          escapeHtml(a.asset_type || '') +
          '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
    updateFloatBar();
  }

  async function loadFolders() {
    try {
      var data = await apiGet('marketing-asset-folders-list');
      if (!data || !data.ok) {
        setStatus(i18n('error_load_folders', 'Could not load folders.'), true);
        foldersTree = ensureSystemFoldersInTree([]);
        hiddenFolder = { id: 'hidden', system_key: 'hidden', asset_count: 0 };
        allCount = 0;
        renderFolderTree();
        return;
      }
      foldersTree = ensureSystemFoldersInTree(data.folders || []);
      hiddenFolder = data.hidden || { id: 'hidden', system_key: 'hidden', asset_count: 0 };
      allCount = data.all_count || 0;
      renderFolderTree();
    } catch (err) {
      setStatus(i18n('error_load_folders', 'Could not load folders.'), true);
      foldersTree = ensureSystemFoldersInTree([]);
      hiddenFolder = { id: 'hidden', system_key: 'hidden', asset_count: 0 };
      allCount = 0;
      renderFolderTree();
    }
  }

  async function loadAssets() {
    setStatus(i18n('loading', 'Loading…'), false);
    var params = {
      folder_id: currentFolder,
      type: currentType || undefined,
      q: searchQuery || undefined
    };
    // Exclude search when browsing Hidden is fine; API excludes Hidden from search for non-hidden views.
    var data = await apiGet('marketing-assets-list', params);
    if (!data || !data.ok) {
      setStatus(i18n('error_load_assets', 'Could not load assets.'), true);
      assets = [];
      renderAssets();
      return;
    }
    setStatus('', false);
    assets = data.assets || [];
    // Drop selections that are no longer visible
    Object.keys(selected).forEach(function (k) {
      if (!assets.some(function (a) { return assetKey(a) === k; })) {
        delete selected[k];
      }
    });
    renderAssets();
  }

  async function refreshAll() {
    await loadFolders();
    await loadAssets();
  }

  function openFolderSettings(mode, opts) {
    opts = opts || {};
    folderSettingsMode = mode;
    folderSettingsId = opts.folderId || null;
    folderSettingsParentId = opts.parentId || null;
    removeAssetsConfirmed = false;

    var titleEl = $('#cam-folder-title');
    var descEl = $('#cam-folder-description');
    var tagsEl = $('#cam-folder-tags');
    var parentWrap = $('#cam-folder-parent-wrap');
    var parentSel = $('#cam-folder-parent');
    var err = $('#cam-folder-settings-error');
    var heading = $('#cam-folder-settings-title');
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }
    if (heading) {
      heading.textContent =
        mode === 'edit'
          ? i18n('folder_settings_edit', 'Edit folder')
          : i18n('folder_settings', 'Folder Settings');
    }
    if (titleEl) titleEl.value = opts.title || '';
    if (descEl) descEl.value = opts.description || '';
    if (tagsEl) tagsEl.value = Array.isArray(opts.tags) ? opts.tags.join(', ') : opts.tags || '';

    if (mode === 'create') {
      if (parentWrap) parentWrap.hidden = false;
      if (parentSel) {
        var parents = systemParentsForSelect();
        parentSel.innerHTML = parents
          .map(function (p) {
            return (
              '<option value="' +
              escapeHtml(p.id) +
              '"' +
              (folderSettingsParentId === p.id || (!folderSettingsParentId && parents[0] && p.id === parents[0].id)
                ? ' selected'
                : '') +
              '>' +
              escapeHtml(p.title) +
              '</option>'
            );
          })
          .join('');
        if (folderSettingsParentId) parentSel.value = folderSettingsParentId;
      }
    } else if (parentWrap) {
      parentWrap.hidden = true;
    }

    openSubmodal('cam-folder-settings');
    if (titleEl) titleEl.focus();
  }

  async function saveFolderSettings() {
    var titleEl = $('#cam-folder-title');
    var descEl = $('#cam-folder-description');
    var tagsEl = $('#cam-folder-tags');
    var parentSel = $('#cam-folder-parent');
    var err = $('#cam-folder-settings-error');
    var title = titleEl ? String(titleEl.value || '').trim() : '';
    if (!title) {
      if (err) {
        err.hidden = false;
        err.textContent = i18n('title_required', 'Title is required.');
      }
      return;
    }
    var description = descEl ? String(descEl.value || '').trim() : '';
    var tags = tagsEl ? String(tagsEl.value || '').trim() : '';
    var data;
    if (folderSettingsMode === 'edit') {
      data = await apiPost('marketing-asset-folder-update', {
        folder_id: folderSettingsId,
        title: title,
        description: description,
        tags: tags
      });
    } else {
      var parentId = parentSel ? parentSel.value : folderSettingsParentId;
      data = await apiPost('marketing-asset-folder-create', {
        parent_id: parentId,
        title: title,
        description: description,
        tags: tags
      });
    }
    if (!data || !data.ok) {
      if (err) {
        err.hidden = false;
        err.textContent = i18n('error_save_folder', 'Could not save folder.');
      }
      return;
    }
    closeSubmodal('cam-folder-settings');
    await refreshAll();
  }

  function findFolderById(id) {
    var i;
    var j;
    for (i = 0; i < foldersTree.length; i++) {
      if (foldersTree[i].id === id) return foldersTree[i];
      var kids = foldersTree[i].children || [];
      for (j = 0; j < kids.length; j++) {
        if (kids[j].id === id) return kids[j];
      }
    }
    return null;
  }

  function openFolderRemoveConfirm(folderId) {
    pendingFolderRemoveId = folderId;
    removeAssetsConfirmed = false;
    var check = $('#cam-remove-assets-check');
    if (check) check.checked = false;
    openSubmodal('cam-confirm-folder-remove');
  }

  async function confirmFolderRemove() {
    var check = $('#cam-remove-assets-check');
    var removeAssets = !!(check && check.checked);
    if (removeAssets && !removeAssetsConfirmed) {
      openSubmodal('cam-confirm-assets-permanent');
      return;
    }
    var data = await apiPost('marketing-asset-folder-delete', {
      folder_id: pendingFolderRemoveId,
      remove_assets: removeAssets
    });
    closeSubmodal('cam-confirm-folder-remove');
    closeSubmodal('cam-confirm-assets-permanent');
    pendingFolderRemoveId = null;
    removeAssetsConfirmed = false;
    if (!data || !data.ok) {
      setStatus(i18n('error_remove_folder', 'Could not remove folder.'), true);
      return;
    }
    if (currentFolder === data.folder_id) currentFolder = 'all';
    await refreshAll();
  }

  function openAssetActionConfirm(action, items) {
    pendingAssetAction = { action: action, items: items };
    var title = $('#cam-confirm-asset-title');
    var body = $('#cam-confirm-asset-body');
    if (action === 'hide') {
      if (title) title.textContent = i18n('confirm_hide_title', 'Hide assets?');
      if (body) {
        body.textContent = i18n(
          'confirm_hide_body',
          'Selected assets will be moved to Hidden and excluded from search.'
        );
      }
    } else {
      if (title) title.textContent = i18n('confirm_remove_assets_title', 'Remove assets?');
      if (body) {
        body.textContent = i18n(
          'confirm_remove_assets_body',
          'Selected assets will be permanently deleted. This cannot be undone.'
        );
      }
    }
    openSubmodal('cam-confirm-asset-action');
  }

  async function confirmAssetAction() {
    if (!pendingAssetAction) return;
    var action = pendingAssetAction.action;
    var items = pendingAssetAction.items || [];
    var data;
    if (action === 'hide') {
      data = await apiPost('marketing-assets-move', { items: items, target: 'hidden' });
    } else {
      data = await apiPost('marketing-assets-delete', { items: items });
    }
    closeSubmodal('cam-confirm-asset-action');
    pendingAssetAction = null;
    selected = Object.create(null);
    if (!data || !data.ok) {
      setStatus(
        action === 'hide'
          ? i18n('error_hide', 'Could not hide assets.')
          : i18n('error_remove_assets', 'Could not remove assets.'),
        true
      );
      return;
    }
    await refreshAll();
  }

  function itemsForMoveFromKeys(keys) {
    return (keys || []).map(function (k) {
      var asset = assets.find(function (a) {
        return assetKey(a) === k;
      });
      var parts = String(k).split(':');
      return {
        asset_type: asset ? asset.asset_type : parts[0],
        asset_id: asset ? asset.id : parts.slice(1).join(':'),
        folder_id: asset && asset.folder_id != null ? String(asset.folder_id) : ''
      };
    });
  }

  function excludedFolderIdsForMove(items) {
    var set = Object.create(null);
    (items || []).forEach(function (it) {
      if (it.folder_id) set[String(it.folder_id)] = true;
    });
    // If browsing a concrete folder, also exclude that view as "current"
    if (currentFolder && currentFolder !== 'all' && currentFolder !== 'hidden') {
      var cur = findFolderById(currentFolder);
      if (cur && !cur.is_system) set[String(currentFolder)] = true;
    }
    return set;
  }

  function renderMoveGrid() {
    var grid = $('#cam-move-grid');
    var err = $('#cam-move-error');
    var confirmBtn = $('#cam-move-confirm');
    if (!grid) return;
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }
    var excluded = excludedFolderIdsForMove(moveItems || []);
    var targets = collectUserChildFolders().filter(function (f) {
      return !excluded[String(f.id)];
    });
    if (!targets.length) {
      grid.innerHTML =
        '<div class="cam-move-empty">' +
        escapeHtml(
          i18n('no_move_targets', 'No folders available to move into. Create a child folder first.')
        ) +
        '</div>';
      moveSelectedFolderId = null;
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }
    grid.innerHTML = targets
      .map(function (f) {
        var sel = moveSelectedFolderId === f.id ? ' is-selected' : '';
        return (
          '<button type="button" class="cam-move-card' +
          sel +
          '" role="option" aria-selected="' +
          (sel ? 'true' : 'false') +
          '" data-cam-move-folder="' +
          escapeHtml(f.id) +
          '">' +
          '<span class="cam-move-card__title">' +
          escapeHtml(f.title) +
          '</span>' +
          '<span class="cam-move-card__parent">' +
          escapeHtml(f.parent_title) +
          '</span>' +
          '</button>'
        );
      })
      .join('');
    if (confirmBtn) confirmBtn.disabled = !moveSelectedFolderId;
  }

  function openMoveModal(items) {
    moveItems = items || [];
    moveSelectedFolderId = null;
    if (!moveItems.length) return;
    renderMoveGrid();
    openSubmodal('cam-move-modal');
  }

  async function confirmMove() {
    if (!moveItems || !moveItems.length || !moveSelectedFolderId) return;
    var payloadItems = moveItems.map(function (it) {
      return { asset_type: it.asset_type, asset_id: it.asset_id };
    });
    var data = await apiPost('marketing-assets-move', {
      items: payloadItems,
      folder_id: moveSelectedFolderId
    });
    closeSubmodal('cam-move-modal');
    moveItems = null;
    moveSelectedFolderId = null;
    selected = Object.create(null);
    if (!data || !data.ok) {
      setStatus(i18n('error_move', 'Could not move assets.'), true);
      return;
    }
    await refreshAll();
  }

  async function moveItemsToFolder(items, folderId) {
    if (!items || !items.length || !folderId) return;
    var data = await apiPost('marketing-assets-move', {
      items: items.map(function (it) {
        return { asset_type: it.asset_type, asset_id: it.asset_id };
      }),
      folder_id: folderId
    });
    selected = Object.create(null);
    if (!data || !data.ok) {
      setStatus(i18n('error_move', 'Could not move assets.'), true);
      return;
    }
    await refreshAll();
  }

  function clearDragHover() {
    if (dragExpandTimer) {
      clearTimeout(dragExpandTimer);
      dragExpandTimer = null;
    }
    dragExpandFolderId = null;
    if (!root) return;
    root.querySelectorAll('.cam-folder-row.is-drop-hover, .cam-folder-row.is-drop-target').forEach(
      function (el) {
        el.classList.remove('is-drop-hover', 'is-drop-target');
      }
    );
  }

  function onCardDragStart(e) {
    var card = e.target && e.target.closest ? e.target.closest('[data-cam-asset-key]') : null;
    if (!card || !root.contains(card)) return;
    if (e.target.closest && e.target.closest('[data-cam-select]')) {
      e.preventDefault();
      return;
    }
    var key = card.getAttribute('data-cam-asset-key');
    var keys = selected[key] ? Object.keys(selected) : [key];
    dragPayload = itemsForMoveFromKeys(keys);
    card.classList.add('is-dragging');
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', keys.join(','));
    } catch (err) {}
    stopAllPlayback();
  }

  function onCardDragEnd() {
    dragPayload = null;
    clearDragHover();
    if (!root) return;
    root.querySelectorAll('.cam-card.is-dragging').forEach(function (c) {
      c.classList.remove('is-dragging');
    });
  }

  function onFolderDragOver(e) {
    if (!dragPayload || !dragPayload.length) return;
    var row = e.target && e.target.closest ? e.target.closest('[data-cam-folder-id]') : null;
    if (!row || !root.contains(row)) return;
    var folderId = row.getAttribute('data-cam-folder-id');
    var dropOk = row.getAttribute('data-cam-drop') === '1';
    var group = row.closest('[data-cam-folder-group]');

    // Hover parent → expand children after short delay
    if (group && group.getAttribute('data-cam-folder-group') === folderId) {
      e.preventDefault();
      row.classList.add('is-drop-target');
      if (dragExpandFolderId !== folderId) {
        if (dragExpandTimer) clearTimeout(dragExpandTimer);
        dragExpandFolderId = folderId;
        dragExpandTimer = setTimeout(function () {
          expandedParents[folderId] = true;
          renderFolderTree();
        }, 400);
      }
      return;
    }

    if (!dropOk) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch (err) {}
    clearDragHoverClassesOnly();
    row.classList.add('is-drop-hover', 'is-drop-target');
  }

  function clearDragHoverClassesOnly() {
    if (!root) return;
    root.querySelectorAll('.cam-folder-row.is-drop-hover').forEach(function (el) {
      el.classList.remove('is-drop-hover');
    });
  }

  function onFolderDrop(e) {
    var row = e.target && e.target.closest ? e.target.closest('[data-cam-folder-id]') : null;
    if (!row || !root.contains(row)) return;
    if (row.getAttribute('data-cam-drop') !== '1') return;
    e.preventDefault();
    var folderId = row.getAttribute('data-cam-folder-id');
    var items = dragPayload;
    clearDragHover();
    dragPayload = null;
    if (!items || !items.length || !folderId) return;
    // Skip no-op moves into the same folder
    var allSame = items.every(function (it) {
      return String(it.folder_id || '') === String(folderId);
    });
    if (allSame) return;
    moveItemsToFolder(items, folderId);
  }

  function openDrawer() {
    var wrap = $('#cam-sidebar-wrapper') || $('#cam-sidebar');
    var scrim = $('#cam-drawer-scrim');
    if (wrap) wrap.classList.add('is-drawer-open');
    if (scrim) scrim.hidden = false;
  }

  function closeDrawer() {
    var wrap = $('#cam-sidebar-wrapper') || $('#cam-sidebar');
    var scrim = $('#cam-drawer-scrim');
    if (wrap) wrap.classList.remove('is-drawer-open');
    if (scrim) scrim.hidden = true;
  }

  function onRootClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var expandBtn = t.closest('[data-cam-expand]');
    if (expandBtn) {
      e.preventDefault();
      e.stopPropagation();
      var eid = expandBtn.getAttribute('data-cam-expand');
      if (eid) {
        expandedParents[eid] = !expandedParents[eid];
        renderFolderTree();
      }
      return;
    }

    var moveFolderBtn = t.closest('[data-cam-move-folder]');
    if (moveFolderBtn) {
      moveSelectedFolderId = moveFolderBtn.getAttribute('data-cam-move-folder');
      renderMoveGrid();
      return;
    }

    var folderBtn = t.closest('[data-cam-folder]');
    if (folderBtn && !t.closest('[data-cam-add-child]') && !t.closest('[data-cam-folder-action]')) {
      currentFolder = folderBtn.getAttribute('data-cam-folder') || 'all';
      selected = Object.create(null);
      stopAllPlayback();
      closeDrawer();
      renderFolderTree();
      loadAssets();
      return;
    }

    var addChild = t.closest('[data-cam-add-child]');
    if (addChild) {
      e.preventDefault();
      openFolderSettings('create', { parentId: addChild.getAttribute('data-cam-add-child') });
      return;
    }

    var typeChip = t.closest('[data-cam-type]');
    if (typeChip && typeChip.hasAttribute('data-cam-type')) {
      currentType = typeChip.getAttribute('data-cam-type') || '';
      root.querySelectorAll('.cam-chip').forEach(function (chip) {
        chip.classList.toggle('is-active', chip === typeChip);
      });
      selected = Object.create(null);
      stopAllPlayback();
      loadAssets();
      return;
    }

    var check = t.closest('[data-cam-select]');
    if (check) {
      var card = check.closest('[data-cam-asset-key]');
      if (!card) return;
      var key = card.getAttribute('data-cam-asset-key');
      if (check.checked) selected[key] = true;
      else delete selected[key];
      card.classList.toggle('is-selected', !!selected[key]);
      updateFloatBar();
      return;
    }

    var playCard = t.closest('.cam-card--playable');
    if (playCard && root.contains(playCard) && !t.closest('[data-cam-select]')) {
      e.preventDefault();
      toggleCardPlayback(playCard);
      return;
    }

    var folderAction = t.closest('[data-cam-folder-action]');
    if (folderAction) {
      var fa = folderAction.getAttribute('data-cam-folder-action');
      var f = folderMenuTarget;
      closeMenus();
      if (!f) return;
      if (fa === 'edit') {
        openFolderSettings('edit', {
          folderId: f.id,
          title: f.title,
          description: f.description,
          tags: f.tags
        });
      } else if (fa === 'remove') {
        openFolderRemoveConfirm(f.id);
      }
      return;
    }

    var assetAction = t.closest('[data-cam-asset-action]');
    if (assetAction) {
      var aa = assetAction.getAttribute('data-cam-asset-action');
      var item = assetMenuTarget;
      closeMenus();
      if (!item) return;
      if (aa === 'move') {
        var moveKeys = Object.keys(selected);
        if (!moveKeys.length) {
          moveKeys = [String(item.asset_type) + ':' + String(item.asset_id)];
        }
        openMoveModal(itemsForMoveFromKeys(moveKeys));
        return;
      }
      openAssetActionConfirm(aa, [item]);
      return;
    }

    var cancel = t.closest('[data-cam-confirm-cancel]');
    if (cancel) {
      var which = cancel.getAttribute('data-cam-confirm-cancel');
      if (which === 'folder-remove') closeSubmodal('cam-confirm-folder-remove');
      if (which === 'assets-permanent') {
        closeSubmodal('cam-confirm-assets-permanent');
        var checkBox = $('#cam-remove-assets-check');
        if (checkBox) checkBox.checked = false;
        removeAssetsConfirmed = false;
      }
      if (which === 'asset-action') {
        closeSubmodal('cam-confirm-asset-action');
        pendingAssetAction = null;
      }
    }
  }

  function onRootContextMenu(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var folderRow = t.closest('[data-cam-folder-id]');
    if (folderRow && root.contains(folderRow)) {
      var fid = folderRow.getAttribute('data-cam-folder-id');
      var folder = findFolderById(fid);
      if (!folder || folder.is_system) return;
      e.preventDefault();
      closeMenus();
      folderMenuTarget = folder;
      showMenu(document.getElementById('cam-folder-menu'), e.clientX, e.clientY);
      return;
    }

    var card = t.closest('[data-cam-asset-key]');
    if (card && root.contains(card)) {
      e.preventDefault();
      closeMenus();
      assetMenuTarget = {
        asset_type: card.getAttribute('data-asset-type'),
        asset_id: card.getAttribute('data-asset-id'),
        folder_id: card.getAttribute('data-folder-id') || ''
      };
      // Prefer multi-select when right-clicking an already-selected card
      var key = card.getAttribute('data-cam-asset-key');
      if (key && !selected[key]) {
        selected = Object.create(null);
        selected[key] = true;
        renderAssets();
      }
      showMenu(document.getElementById('cam-asset-menu'), e.clientX, e.clientY);
    }
  }

  /* ── Add File / link import ── */
  var MAX_BYTES = 500 * 1024 * 1024;
  var SIMPLE_MAX = 32 * 1024 * 1024;
  var PART_SIZE = 5 * 1024 * 1024;
  var linkMode = null; // 'single' | 'bulk'
  var linkSingle = null;
  var linkBulkAll = [];
  var linkBulkMeta = null;
  var linkBulkSelected = Object.create(null);
  var linkBulkTypeFilter = { image: true, video: true, reel: true };
  var linkBulkAvailableTypes = { image: false, video: false, reel: false };
  var camUploading = false;

  function isDesktopViewport() {
    return !(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  }

  function detectClientBulkUrl(url) {
    try {
      var u = new URL(String(url || '').trim());
      var host = u.hostname.replace(/^www\./i, '').toLowerCase();
      if (host.indexOf('facebook.com') === -1 && host !== 'm.facebook.com') return false;
      if (/\/reel\/\d+/i.test(u.pathname) || /\/watch/i.test(u.pathname) || /\/share\//i.test(u.pathname)) {
        return false;
      }
      var sk = String(u.searchParams.get('sk') || '').toLowerCase();
      if (sk === 'reels_tab' || sk === 'reels') return true;
      if (/\/reels\/?$/i.test(u.pathname) || /\/reels\//i.test(u.pathname)) return true;
      if (/\/videos\/?$/i.test(u.pathname) && !/\/videos\/\d+/i.test(u.pathname)) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function updateExtractButtonLabel() {
    var btn = document.getElementById('cam-link-extract');
    var input = document.getElementById('cam-link-url');
    if (!btn) return;
    var url = input ? String(input.value || '').trim() : '';
    if (detectClientBulkUrl(url)) {
      btn.textContent = i18n('link_extract_analyze', 'Extract → Analyze');
    } else {
      btn.textContent = i18n('link_extract', 'Extract');
    }
  }

  function openAddSourceModal() {
    var overlay = mountOverlay(document.getElementById('camAddSourceModal'));
    if (!overlay) {
      try {
        console.warn('[AssetsManager] camAddSourceModal missing');
      } catch (eMiss) {}
      return;
    }
    var phoneBtn = document.getElementById('cam-addsrc-phone');
    if (phoneBtn) phoneBtn.hidden = !isDesktopViewport();
    overlay.hidden = false;
    overlay.removeAttribute('hidden');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAddSourceModal() {
    closeSubmodal('camAddSourceModal');
  }

  function setLinkModalBulkFullscreen(on) {
    var modal = document.getElementById('camLinkModal');
    if (!modal) return;
    if (on) modal.classList.add('cam-submodal--fullscreen');
    else modal.classList.remove('cam-submodal--fullscreen');
  }

  function setLinkSidebarVisible(on) {
    var wrap = document.getElementById('cam-link-sidebar-wrapper');
    var toggle = document.getElementById('cam-link-sidebar-toggle');
    if (!wrap) return;
    wrap.hidden = !on;
    if (on) {
      // Start expanded so bulk options are discoverable
      wrap.classList.remove('is-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    } else {
      wrap.classList.add('is-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function setBulkUiVisible(on) {
    var bulk = document.getElementById('cam-link-bulk');
    var controls = document.getElementById('cam-link-bulk-controls');
    if (bulk) bulk.hidden = !on;
    if (controls) controls.hidden = !on;
    setLinkSidebarVisible(!!on);
    setLinkModalBulkFullscreen(!!on);
  }

  function classifyClientBulkAssetType(candidate) {
    var existing = String((candidate && candidate.asset_type) || '').toLowerCase();
    if (existing === 'image' || existing === 'video' || existing === 'reel') return existing;
    var kind = String((candidate && candidate.kind) || '').toLowerCase();
    var url = String((candidate && candidate.url) || '').toLowerCase();
    if (kind === 'image' || kind === 'photo' || kind === 'photo_image') return 'image';
    if (kind === 'reel' || kind === 'shorts' || /\/reel\//i.test(url) || /\/share\/r\//i.test(url)) {
      return 'reel';
    }
    if (kind === 'watch' || kind === 'video' || kind === 'videos' || /\/watch/i.test(url) || /\/videos\//i.test(url)) {
      return 'video';
    }
    return 'video';
  }

  function syncBulkAssetTypeControls() {
    var available = { image: false, video: false, reel: false };
    (linkBulkAll || []).forEach(function (c) {
      var t = classifyClientBulkAssetType(c);
      if (available[t] != null) available[t] = true;
      c.asset_type = t;
    });
    linkBulkAvailableTypes = available;
    // Default: all available types checked
    linkBulkTypeFilter = {
      image: !!available.image,
      video: !!available.video,
      reel: !!available.reel,
    };
    ['image', 'video', 'reel'].forEach(function (type) {
      var input = document.getElementById('cam-link-type-' + type);
      var label = document.querySelector('.cam-link-asset-types__option[data-cam-link-type="' + type + '"]');
      if (input) {
        input.checked = !!linkBulkTypeFilter[type];
        input.disabled = !available[type];
      }
      if (label) label.classList.toggle('is-unavailable', !available[type]);
    });
    updateBulkAssetTypeSummary();
  }

  function readBulkAssetTypeFilterFromDom() {
    ['image', 'video', 'reel'].forEach(function (type) {
      var input = document.getElementById('cam-link-type-' + type);
      if (!input || input.disabled) {
        linkBulkTypeFilter[type] = false;
        return;
      }
      linkBulkTypeFilter[type] = !!input.checked;
    });
    // Keep at least one available type checked
    var anyOn = ['image', 'video', 'reel'].some(function (t) {
      return linkBulkAvailableTypes[t] && linkBulkTypeFilter[t];
    });
    if (!anyOn) {
      ['image', 'video', 'reel'].forEach(function (t) {
        if (linkBulkAvailableTypes[t]) {
          linkBulkTypeFilter[t] = true;
          var input = document.getElementById('cam-link-type-' + t);
          if (input) input.checked = true;
        }
      });
    }
    updateBulkAssetTypeSummary();
  }

  function updateBulkAssetTypeSummary() {
    var el = document.getElementById('cam-link-asset-types-summary');
    if (!el) return;
    var labels = {
      image: i18n('link_asset_type_image', 'Image'),
      video: i18n('link_asset_type_video', 'Video'),
      reel: i18n('link_asset_type_reel', 'Reel'),
    };
    var selected = ['image', 'video', 'reel'].filter(function (t) {
      return linkBulkAvailableTypes[t] && linkBulkTypeFilter[t];
    });
    var availableCount = ['image', 'video', 'reel'].filter(function (t) {
      return linkBulkAvailableTypes[t];
    }).length;
    if (!selected.length || selected.length === availableCount) {
      el.textContent = i18n('link_asset_types_all', 'All');
      return;
    }
    el.textContent = selected.map(function (t) {
      return labels[t];
    }).join(', ');
  }

  function setAssetTypesPanelOpen(open) {
    var panel = document.getElementById('cam-link-asset-types-panel');
    var toggle = document.getElementById('cam-link-asset-types-toggle');
    if (panel) panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setLinkPhoneWidgetOpen(open) {
    var widget = document.getElementById('cam-link-phone');
    var btn = document.getElementById('cam-link-phone-btn');
    if (!widget) return;
    if (open && !isDesktopViewport()) open = false;
    widget.hidden = !open;
    if (btn) {
      btn.classList.toggle('is-active', !!open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (open) startLinkPhoneBridge();
    else stopLinkPhoneBridge();
  }

  function resetLinkModal() {
    linkMode = null;
    linkSingle = null;
    linkBulkAll = [];
    linkBulkMeta = null;
    linkBulkSelected = Object.create(null);
    linkBulkTypeFilter = { image: true, video: true, reel: true };
    linkBulkAvailableTypes = { image: false, video: false, reel: false };
    setAssetTypesPanelOpen(false);
    setLinkPhoneWidgetOpen(false);
    var summary = document.getElementById('cam-link-summary');
    var statusEl = document.getElementById('cam-link-status');
    var single = document.getElementById('cam-link-single-preview');
    var submit = document.getElementById('cam-link-submit');
    var video = document.getElementById('cam-link-preview-video');
    var audio = document.getElementById('cam-link-preview-audio');
    var image = document.getElementById('cam-link-preview-image');
    if (summary) {
      summary.hidden = true;
      summary.textContent = '';
    }
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'cam-link-status';
    }
    if (single) single.hidden = true;
    setBulkUiVisible(false);
    if (submit) submit.disabled = true;
    [video, audio, image].forEach(function (el) {
      if (!el) return;
      try {
        if (el.pause) el.pause();
      } catch (ePause) {}
      el.removeAttribute('src');
      if (el.load) {
        try {
          el.load();
        } catch (eLoad) {}
      }
      el.hidden = true;
    });
    var fsVideo = document.getElementById('cam-link-fs-video');
    if (fsVideo) {
      try {
        fsVideo.pause();
      } catch (eFs) {}
      fsVideo.removeAttribute('src');
      try {
        fsVideo.load();
      } catch (eFsLoad) {}
    }
    closeSubmodal('cam-link-fs');
    var grid = document.getElementById('cam-link-bulk-grid');
    if (grid) grid.innerHTML = '';
  }

  function isDesktopViewport() {
    return !(window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
  }

  function phoneBridgeApiBase() {
    var cfg = window.CREATOR_API_CONFIG || {};
    if (cfg.PHONE_UPLOAD_BASE_URL) {
      return String(cfg.PHONE_UPLOAD_BASE_URL).replace(/\/+$/, '');
    }
    if (cfg.WORKER_BASE_URL) {
      return String(cfg.WORKER_BASE_URL).replace(/\/+$/, '');
    }
    var base = cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/+$/, '') : '';
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(base)) return base;
    if (window.__CREATOR_PORTAL_HOST__) return PHONE_UPLOAD_WORKER_FALLBACK;
    var fromApi = String(API_BASE || '').replace(/\/apps\/creator-dispatch$/i, '').replace(/\/+$/, '');
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(fromApi)) return fromApi;
    return PHONE_UPLOAD_WORKER_FALLBACK;
  }

  function fetchPhoneBridgeJson(url, options) {
    return fetch(url, options || { credentials: 'omit' }).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        var snippet = String(text || '').trim();
        if (snippet) {
          try {
            data = JSON.parse(snippet);
          } catch (_e) {
            var err = new Error('Phone bridge returned non-JSON (HTTP ' + r.status + ')');
            err.httpStatus = r.status;
            throw err;
          }
        }
        return { httpOk: r.ok, status: r.status, data: data };
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

  function applyPhoneLinkValue(value) {
    var urlInput = document.getElementById('cam-link-url');
    var phoneStatus = document.getElementById('cam-link-phone-status');
    if (urlInput) {
      urlInput.value = value;
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_received', 'Link received from phone');
    submitLinkAnalyze();
  }

  function pollLinkPhoneSession(sessionId, ownerId) {
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
          applyPhoneLinkValue(data.value);
        } else if (data.status === 'expired') {
          stopLinkPhoneBridge();
        }
      })
      .catch(function () {});
  }

  function startLinkPhoneBridge() {
    var box = document.getElementById('cam-link-phone');
    var qrImg = document.getElementById('cam-link-qr-img');
    var phoneStatus = document.getElementById('cam-link-phone-status');
    if (!box || box.hidden || !isDesktopViewport()) return;
    stopLinkPhoneBridge();
    if (qrImg) {
      qrImg.removeAttribute('src');
      qrImg.alt = '';
    }
    var ownerId = getOwnerId();
    if (!ownerId) {
      if (phoneStatus) {
        phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      }
      return;
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_starting', 'Preparing phone scan…');
    var base = phoneBridgeApiBase();
    fetchPhoneBridgeJson(base + '/api/creator-phone-upload/session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_id: ownerId, purpose: 'video_link' }),
    })
      .then(function (res) {
        var session = res.data;
        if (!res.httpOk || !session || !session.ok || !session.session_id) {
          if (phoneStatus) {
            phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
          }
          return;
        }
        linkPhoneSessionId = session.session_id;
        if (qrImg) {
          qrImg.onload = function () {
            if (phoneStatus && linkPhoneSessionId === session.session_id) {
              phoneStatus.textContent = i18n(
                'link_phone_hint',
                'Scan, choose Browser or App, paste the link, tap Extract — it runs here automatically.'
              );
            }
          };
          qrImg.onerror = function () {
            if (phoneStatus) {
              phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
            }
          };
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
          pollLinkPhoneSession(session.session_id, ownerId);
        }, 2000);
        pollLinkPhoneSession(session.session_id, ownerId);
      })
      .catch(function () {
        if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      });
  }

  function openLinkModal() {
    closeAddSourceModal();
    resetLinkModal();
    var input = document.getElementById('cam-link-url');
    if (input) input.value = '';
    updateExtractButtonLabel();
    var phoneBtn = document.getElementById('cam-link-phone-btn');
    if (phoneBtn) phoneBtn.hidden = !isDesktopViewport();
    openSubmodal('camLinkModal');
    if (input) input.focus();
  }

  function closeLinkModal() {
    setLinkPhoneWidgetOpen(false);
    stopLinkPhoneBridge();
    closeSubmodal('camLinkModal');
    closeSubmodal('cam-link-fs');
    resetLinkModal();
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function uploadSimple(file) {
    var fd = new FormData();
    fd.append('file', file);
    var res = await fetch(apiUrl('video-studio-asset-upload-simple'), {
      method: 'POST',
      credentials: 'include',
      body: fd
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'upload_failed');
    return data.asset;
  }

  async function uploadMultipart(file) {
    var initRes = await fetch(apiUrl('video-studio-asset-upload-init'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mime: file.type || 'application/octet-stream',
        bytes: file.size,
        original_name: file.name
      })
    });
    var initData = await initRes.json();
    if (!initData.ok) throw new Error(initData.error || 'upload_init_failed');
    var uploadId = initData.upload_id;
    var assetId = initData.asset_id;
    var parts = [];
    var offset = 0;
    var partNumber = 1;
    while (offset < file.size) {
      var end = Math.min(offset + PART_SIZE, file.size);
      var chunk = file.slice(offset, end);
      var partFd = new FormData();
      partFd.append('upload_id', uploadId);
      partFd.append('asset_id', assetId);
      partFd.append('part_number', String(partNumber));
      partFd.append('file', chunk, 'part-' + partNumber);
      var partRes = await fetch(apiUrl('video-studio-asset-upload-part'), {
        method: 'POST',
        credentials: 'include',
        body: partFd
      });
      var partData = await partRes.json();
      if (!partData.ok) throw new Error(partData.error || 'upload_part_failed');
      parts.push({ part_number: partData.part_number || partNumber, etag: partData.etag });
      offset = end;
      partNumber += 1;
    }
    var completeRes = await fetch(apiUrl('video-studio-asset-upload-complete'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId, asset_id: assetId, parts: parts })
    });
    var completeData = await completeRes.json();
    if (!completeData.ok) throw new Error(completeData.error || 'upload_complete_failed');
    return completeData.asset;
  }

  async function uploadFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setStatus(i18n('error_upload', 'Upload failed.'), true);
      return;
    }
    camUploading = true;
    setStatus(i18n('uploading', 'Uploading…'));
    try {
      if (file.size <= SIMPLE_MAX) {
        await uploadSimple(file);
      } else {
        await uploadMultipart(file);
      }
      setStatus(i18n('upload_done', 'Upload complete'));
      await refreshAll();
    } catch (err) {
      console.warn('[AssetsManager] upload failed', err);
      setStatus(i18n('error_upload', 'Upload failed.'), true);
    } finally {
      camUploading = false;
    }
  }

  async function uploadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    for (var i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
  }

  function sortBulkCandidates(list, sort) {
    var arr = (list || []).slice();
    var mode = String(sort || 'newest');
    arr.sort(function (a, b) {
      if (mode === 'most_views') {
        var av = a.views != null ? Number(a.views) : -1;
        var bv = b.views != null ? Number(b.views) : -1;
        if (bv !== av) return bv - av;
      }
      var at = a.created_at != null ? Number(a.created_at) : 0;
      var bt = b.created_at != null ? Number(b.created_at) : 0;
      if (mode === 'oldest') {
        if (at !== bt) return at - bt;
      } else if (at !== bt) {
        return bt - at;
      }
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
    });
    return arr;
  }

  function updateBulkCardThumb(url, thumbUrl) {
    if (!url || !thumbUrl) return;
    var cards = document.querySelectorAll('.cam-link-bulk-card[data-cam-bulk-url]');
    var card = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-cam-bulk-url') === url) {
        card = cards[i];
        break;
      }
    }
    if (!card) return;
    var mediaBtn = card.querySelector('.cam-link-bulk-card__media');
    if (!mediaBtn) return;
    var existing = mediaBtn.querySelector('img.cam-link-bulk-card__thumb');
    if (existing) {
      existing.src = thumbUrl;
      return;
    }
    mediaBtn.innerHTML =
      '<img class="cam-link-bulk-card__thumb" src="' + escapeHtml(thumbUrl) + '" alt="" loading="lazy">';
  }

  function renderBulkGrid() {
    var grid = document.getElementById('cam-link-bulk-grid');
    var countInput = document.getElementById('cam-link-bulk-count');
    var sortSelect = document.getElementById('cam-link-bulk-sort');
    var submit = document.getElementById('cam-link-submit');
    if (!grid) return;
    readBulkAssetTypeFilterFromDom();
    var filtered = (linkBulkAll || []).filter(function (c) {
      var t = classifyClientBulkAssetType(c);
      c.asset_type = t;
      return !!linkBulkTypeFilter[t];
    });
    var maxShow = Math.min(80, Math.max(1, filtered.length || 1));
    var count = Math.max(1, Math.min(maxShow, Number(countInput && countInput.value) || 12));
    if (countInput) {
      countInput.max = String(Math.min(80, Math.max(1, filtered.length || 1)));
      if (Number(countInput.value) > filtered.length) {
        countInput.value = String(Math.min(24, filtered.length || 1));
        count = Math.max(1, Math.min(maxShow, Number(countInput.value) || 12));
      }
    }
    var sort = sortSelect ? sortSelect.value : 'newest';
    var sorted = sortBulkCandidates(filtered, sort).slice(0, count);
    linkBulkSelected = Object.create(null);
    sorted.forEach(function (c) {
      // Key by reel/video id when present so duplicate/empty URLs cannot collapse N→1.
      var selKey = String(c.id || c.url || '').trim();
      if (selKey) linkBulkSelected[selKey] = true;
    });
    var typeLabels = {
      image: i18n('link_asset_type_image', 'Image'),
      video: i18n('link_asset_type_video', 'Video'),
      reel: i18n('link_asset_type_reel', 'Reel'),
    };
    grid.innerHTML = sorted
      .map(function (c) {
        var typeKey = classifyClientBulkAssetType(c);
        var selKey = String(c.id || c.url || '').trim();
        var mediaInner = c.thumb_url
          ? '<img class="cam-link-bulk-card__thumb" src="' +
            escapeHtml(c.thumb_url) +
            '" alt="" loading="lazy">'
          : '<div class="cam-link-bulk-card__placeholder" aria-hidden="true">' +
            escapeHtml(typeLabels[typeKey] || i18n('video', 'Video')) +
            '</div>';
        var views =
          c.views != null
            ? '<div>' + escapeHtml(String(c.views)) + ' views</div>'
            : '';
        return (
          '<div class="cam-link-bulk-card is-selected" role="option" aria-selected="true" data-cam-bulk-key="' +
          escapeHtml(selKey) +
          '" data-cam-bulk-url="' +
          escapeHtml(c.url) +
          '" data-cam-bulk-type="' +
          escapeHtml(typeKey) +
          '">' +
          '<input type="checkbox" class="cam-link-bulk-card__check" checked aria-label="' +
          escapeHtml(i18n('select_asset', 'Select asset')) +
          '">' +
          '<button type="button" class="cam-link-bulk-card__media" data-cam-bulk-play="' +
          escapeHtml(c.url) +
          '" aria-label="' +
          escapeHtml(i18n('play', 'Play')) +
          '">' +
          mediaInner +
          '</button>' +
          '<div class="cam-link-bulk-card__meta"><div>#' +
          escapeHtml(String(c.id || '').slice(-8)) +
          '</div><div>' +
          escapeHtml(typeLabels[typeKey] || typeKey) +
          '</div>' +
          views +
          '</div></div>'
        );
      })
      .join('');
    if (submit) submit.disabled = !sorted.length;
    // Lazy-resolve missing posters (queued; does not ingest to R2)
    var missing = sorted.filter(function (c) {
      return c && c.url && !c.thumb_url && !c.preview_url;
    });
    enqueueBulkThumbResolve(missing);
  }

  var bulkThumbInflight = Object.create(null);
  var bulkThumbQueue = [];
  var bulkThumbActive = 0;
  // Keep low: each resolve hits Facebook; flooding causes false "blocked" failures.
  var BULK_THUMB_CONCURRENCY = 1;
  var BULK_THUMB_WARM_MAX = 6;

  function enqueueBulkThumbResolve(list) {
    (list || []).slice(0, BULK_THUMB_WARM_MAX).forEach(function (c) {
      if (!c || !c.url || bulkThumbInflight[c.url]) return;
      bulkThumbInflight[c.url] = 'queued';
      bulkThumbQueue.push(c);
    });
    drainBulkThumbQueue();
  }

  function drainBulkThumbQueue() {
    while (bulkThumbActive < BULK_THUMB_CONCURRENCY && bulkThumbQueue.length) {
      var candidate = bulkThumbQueue.shift();
      bulkThumbActive += 1;
      resolveBulkThumbLazy(candidate).finally(function () {
        bulkThumbActive -= 1;
        drainBulkThumbQueue();
      });
    }
  }

  async function resolveBulkThumbLazy(candidate) {
    var url = candidate && candidate.url;
    if (!url) return;
    bulkThumbInflight[url] = true;
    try {
      // Same extract API / URL as single mode — caches playable media + poster.
      var data = await apiPost('video-studio-link-extract', { url: url, format: 'mp4' });
      if (!data || !data.ok) return;
      if (data.thumb_url) {
        candidate.thumb_url = data.thumb_url;
        updateBulkCardThumb(url, data.thumb_url);
      }
      if (data.preview_url) {
        candidate.preview_url = data.preview_url;
      }
    } catch (e) {
      /* best-effort — never surface as bulk analyze error */
    } finally {
      delete bulkThumbInflight[url];
    }
  }

  async function playBulkCandidate(url) {
    var statusEl = document.getElementById('cam-link-status');
    var cached = (linkBulkAll || []).find(function (c) {
      return c && c.url === url;
    });
    if (statusEl) {
      statusEl.textContent = i18n('link_bulk_previewing', 'Loading preview…');
      statusEl.className = 'cam-link-status is-info';
    }
    try {
      // Always use the same single-extract path for playability (fresh if uncached).
      var data =
        cached && cached.preview_url
          ? { ok: true, preview_url: cached.preview_url, thumb_url: cached.thumb_url || null }
          : await apiPost('video-studio-link-extract', { url: url, format: 'mp4' });
      if (!data.ok || !data.preview_url) {
        if (statusEl) {
          var serverMsg = data && data.message ? String(data.message) : '';
          var errCode = String((data && (data.error_code || data.error)) || '');
          // Only claim private/blocked when the server text clearly says so —
          // wrong URL / empty resolve must not use that misleading copy.
          var looksPrivate = /private|login wall|login_wall|not\s*public|access denied/i.test(
            serverMsg + ' ' + errCode
          );
          statusEl.textContent = looksPrivate
            ? i18n(
                'link_bulk_preview_failed',
                'Could not preview this reel (private or blocked). You can still Download selected items.'
              )
            : serverMsg ||
              i18n(
                'link_bulk_preview_failed_generic',
                'Preview failed for this item. Try Extract with the same link, or Download selected items.'
              );
          statusEl.className = 'cam-link-status is-error';
        }
        return;
      }
      if (cached) {
        cached.preview_url = data.preview_url;
        if (data.thumb_url) {
          cached.thumb_url = data.thumb_url;
          updateBulkCardThumb(url, data.thumb_url);
        }
      }
      // Ensure single-preview players stay cleared — only fullscreen player for bulk
      var singleVideo = document.getElementById('cam-link-preview-video');
      var singleAudio = document.getElementById('cam-link-preview-audio');
      [singleVideo, singleAudio].forEach(function (el) {
        if (!el) return;
        try {
          if (el.pause) el.pause();
        } catch (e1) {}
        el.removeAttribute('src');
        el.hidden = true;
      });
      var video = document.getElementById('cam-link-fs-video');
      if (video) {
        video.src = data.preview_url;
        if (data.thumb_url) video.setAttribute('poster', data.thumb_url);
        try {
          video.play();
        } catch (e) {}
      }
      openSubmodal('cam-link-fs');
      if (statusEl) {
        statusEl.textContent = i18n('link_bulk_ready', 'Select assets and click Download.');
        statusEl.className = 'cam-link-status is-success';
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = i18n(
          'link_bulk_preview_failed_generic',
          'Preview failed for this item. Try Extract with the same link, or Download selected items.'
        );
        statusEl.className = 'cam-link-status is-error';
      }
    }
  }

  async function submitLinkAnalyze() {
    var urlInput = document.getElementById('cam-link-url');
    var statusEl = document.getElementById('cam-link-status');
    var summary = document.getElementById('cam-link-summary');
    var extractBtn = document.getElementById('cam-link-extract');
    var submit = document.getElementById('cam-link-submit');
    var url = urlInput ? String(urlInput.value || '').trim() : '';
    resetLinkModal();
    if (urlInput) urlInput.value = url;
    updateExtractButtonLabel();
    if (!url) {
      if (statusEl) {
        statusEl.textContent = i18n('link_error_invalid_url', 'Please enter a valid URL.');
        statusEl.className = 'cam-link-status is-error';
      }
      return;
    }
    var looksBulk = detectClientBulkUrl(url);
    if (looksBulk) setLinkModalBulkFullscreen(true);
    if (statusEl) {
      statusEl.textContent = looksBulk
        ? i18n('link_analyzing', 'Analyzing…')
        : i18n('link_extracting', 'Extracting preview…');
      statusEl.className = 'cam-link-status is-info';
    }
    if (extractBtn) extractBtn.disabled = true;
    try {
      var data = await apiPost('marketing-asset-link-analyze', {
        url: url,
        format: 'mp4',
        limit: 200,
        sort: 'newest'
      });
      if (!data.ok) {
        setLinkModalBulkFullscreen(false);
        if (statusEl) {
          // Bulk failures use bulk messaging — never imply single-video extract failed
          if (data.mode === 'bulk' || looksBulk) {
            statusEl.textContent =
              data.message ||
              i18n(
                'link_bulk_empty',
                'No public reels/videos were found on that Facebook tab. The page may be private or blocked for automated access.'
              );
          } else {
            statusEl.textContent =
              data.message || i18n('link_error_generic', 'Could not add media from that link.');
          }
          statusEl.className = 'cam-link-status is-error';
        }
        return;
      }
      if (data.mode === 'bulk') {
        linkMode = 'bulk';
        linkBulkAll = Array.isArray(data.candidates) ? data.candidates : [];
        linkBulkMeta = data;
        // Never surface single-extract Facebook errors during successful bulk analyze
        if (summary) {
          var typeLabel = (data.summary && data.summary.type) || 'video';
          var count = (data.summary && data.summary.count) || linkBulkAll.length;
          summary.hidden = false;
          summary.textContent = i18n('link_bulk_summary', 'Found {count} {type} assets.')
            .replace('{count}', String(count))
            .replace('{type}', String(typeLabel));
        }
        setBulkUiVisible(true);
        var singlePreview = document.getElementById('cam-link-single-preview');
        if (singlePreview) singlePreview.hidden = true;
        syncBulkAssetTypeControls();
        var countInput = document.getElementById('cam-link-bulk-count');
        if (countInput) {
          countInput.max = String(Math.min(80, Math.max(1, linkBulkAll.length || 1)));
          countInput.value = String(Math.min(24, linkBulkAll.length || 1));
        }
        renderBulkGrid();
        if (statusEl) {
          statusEl.textContent = data.warning
            ? i18n('link_bulk_partial', 'Public list loaded (best effort). Adjust count/sort, then download selected.')
            : i18n('link_bulk_ready', 'Select assets and click Download.');
          statusEl.className = 'cam-link-status is-success';
        }
        return;
      }

      // single — exactly one media element visible (CSS also hides [hidden] media)
      linkMode = 'single';
      setBulkUiVisible(false);
      closeSubmodal('cam-link-fs');
      linkSingle = {
        url: data.normalized_url || url,
        kind: data.kind || 'video',
        preview_url: data.preview_url,
        cached: !!data.cached,
        asset_id: data.asset_id || null
      };
      if (summary) {
        summary.hidden = false;
        summary.textContent = i18n('link_single_summary', '1 {type} asset ready.')
          .replace('{type}', String(data.kind || 'video'));
      }
      var single = document.getElementById('cam-link-single-preview');
      var video = document.getElementById('cam-link-preview-video');
      var audio = document.getElementById('cam-link-preview-audio');
      var image = document.getElementById('cam-link-preview-image');
      if (single) single.hidden = false;
      [video, audio, image].forEach(function (el) {
        if (!el) return;
        try {
          if (el.pause) el.pause();
        } catch (eP) {}
        el.removeAttribute('src');
        if (el.removeAttribute) el.removeAttribute('poster');
        if (el.load) {
          try {
            el.load();
          } catch (eL) {}
        }
        el.hidden = true;
      });
      var target = data.kind === 'audio' ? audio : data.kind === 'image' ? image : video;
      if (target && data.preview_url) {
        target.src = data.preview_url;
        target.hidden = false;
      }
      if (submit) submit.disabled = false;
      if (statusEl) {
        statusEl.textContent = i18n('link_extracted', 'Preview ready — click Download to save it.');
        statusEl.className = 'cam-link-status is-success';
      }
    } catch (e) {
      console.warn('[AssetsManager] link analyze failed', e);
      setLinkModalBulkFullscreen(false);
      if (statusEl) {
        statusEl.textContent = i18n('link_error_generic', 'Could not add media from that link.');
        statusEl.className = 'cam-link-status is-error';
      }
    } finally {
      if (extractBtn) extractBtn.disabled = false;
    }
  }

  async function pollLinkIngestStatus(assetId, statusEl, progressLabel) {
    for (var attempt = 0; attempt < 120; attempt++) {
      if (statusEl && attempt > 0 && attempt % 3 === 0) {
        statusEl.textContent =
          progressLabel || i18n('link_processing', 'Downloading media in the background…');
      }
      try {
        var data = await apiGet('video-studio-link-ingest-status', { asset_id: assetId });
        if (data && data.status === 'ready') return { ok: true, asset: data.asset };
        if (data && data.status === 'failed') return { ok: false, data: data };
      } catch (pollErr) {
        /* transient — keep polling */
      }
      await sleep(2000);
    }
    return { ok: false, data: { error: 'timeout' } };
  }

  function stopBulkThumbWarmup() {
    bulkThumbQueue = [];
    Object.keys(bulkThumbInflight || {}).forEach(function (k) {
      delete bulkThumbInflight[k];
    });
  }

  async function ingestOneLinkWithFolder(url, folderId, statusEl, progressLabel) {
    var data = await apiPost('video-studio-link-ingest', {
      url: url,
      format: 'mp4',
      folder_id: folderId
    });
    // Rate limit: brief wait + one retry (do not abort the rest of the bulk).
    if (
      data &&
      !data.ok &&
      !data.asset_id &&
      (data.error === 'rate_limit_minute' ||
        data.error === 'rate_limit_day' ||
        data.error === 'rate_limit')
    ) {
      await sleep(1500);
      data = await apiPost('video-studio-link-ingest', {
        url: url,
        format: 'mp4',
        folder_id: folderId
      });
    }
    if (!data || (!data.ok && !data.asset_id)) {
      return {
        ok: false,
        error: (data && (data.error || data.error_code)) || 'ingest_failed',
        message: (data && data.message) || null
      };
    }
    if (data.asset_id && (data.status === 'queued' || data.status === 'processing')) {
      var polled = await pollLinkIngestStatus(data.asset_id, statusEl, progressLabel);
      if (!polled.ok) {
        return {
          ok: false,
          asset_id: data.asset_id,
          error: (polled.data && (polled.data.error || polled.data.error_code)) || 'failed',
          message: (polled.data && polled.data.message) || null
        };
      }
      return { ok: true, asset_id: data.asset_id, status: 'ready' };
    }
    return {
      ok: true,
      asset_id: data.asset_id || null,
      status: data.status || 'ready',
      cached: !!data.cached
    };
  }

  async function submitLinkDownload() {
    var statusEl = document.getElementById('cam-link-status');
    var submit = document.getElementById('cam-link-submit');
    if (submit) submit.disabled = true;

    if (linkMode === 'single' && linkSingle) {
      if (statusEl) {
        statusEl.textContent = i18n('link_downloading', 'Downloading…');
        statusEl.className = 'cam-link-status is-info';
      }
      try {
        var data = await apiPost('video-studio-link-ingest', {
          url: linkSingle.url,
          format: 'mp4'
        });
        if (!data.ok && !data.asset_id) {
          if (statusEl) {
            statusEl.textContent =
              data.message || i18n('link_error_generic', 'Could not add media from that link.');
            statusEl.className = 'cam-link-status is-error';
          }
          if (submit) submit.disabled = false;
          return;
        }
        if (data.asset_id && (data.status === 'queued' || data.status === 'processing')) {
          var polled = await pollLinkIngestStatus(data.asset_id, statusEl);
          if (!polled.ok) {
            if (statusEl) {
              statusEl.textContent =
                (polled.data && polled.data.message) ||
                i18n('link_error_generic', 'Could not add media from that link.');
              statusEl.className = 'cam-link-status is-error';
            }
            if (submit) submit.disabled = false;
            return;
          }
        }
        if (statusEl) {
          statusEl.textContent = i18n('link_download_done', 'Saved to Unsorted.');
          statusEl.className = 'cam-link-status is-success';
        }
        closeLinkModal();
        await refreshAll();
      } catch (e) {
        if (statusEl) {
          statusEl.textContent = i18n('link_error_generic', 'Could not add media from that link.');
          statusEl.className = 'cam-link-status is-error';
        }
        if (submit) submit.disabled = false;
      }
      return;
    }

    if (linkMode === 'bulk') {
      // Selection keys are candidate ids (fallback: url). Resolve to canonical URLs.
      var urls = [];
      var seenUrl = Object.create(null);
      Object.keys(linkBulkSelected).forEach(function (selKey) {
        if (!linkBulkSelected[selKey]) return;
        var key = String(selKey || '').trim();
        if (!key) return;
        var match = (linkBulkAll || []).find(function (c) {
          return String(c.id || '') === key || String(c.url || '') === key;
        });
        var url = match && match.url ? String(match.url).trim() : key;
        if (!url || seenUrl[url]) return;
        seenUrl[url] = true;
        urls.push(url);
      });
      if (!urls.length) {
        if (statusEl) {
          statusEl.textContent = i18n('link_bulk_none_selected', 'Select at least one asset.');
          statusEl.className = 'cam-link-status is-error';
        }
        if (submit) submit.disabled = false;
        return;
      }
      // Stop lazy thumb extracts — they return HTTP 422 and flood Facebook while we download.
      stopBulkThumbWarmup();
      if (statusEl) {
        statusEl.textContent = i18n('link_bulk_downloading', 'Creating folder and downloading…');
        statusEl.className = 'cam-link-status is-info';
      }
      try {
        var sourceInput = document.getElementById('cam-link-url');
        var sourceUrl = sourceInput ? String(sourceInput.value || '').trim() : '';
        // Create folder only — then ingest each URL via the same op as single Download
        // (sequential, continue on per-item 422/fail, apply folder_id every time).
        var bulk = await apiPost('marketing-asset-link-bulk-ingest', {
          urls: [],
          create_folder_only: true,
          format: 'mp4',
          source_url: sourceUrl,
          folder_title: (linkBulkMeta && linkBulkMeta.folder_title_suggestion) || undefined,
          folder_description:
            (linkBulkMeta && linkBulkMeta.folder_description_suggestion) || undefined,
          parent_system_key: 'motion_videos'
        });
        if (!bulk.ok || !bulk.folder || !bulk.folder.id) {
          if (statusEl) {
            statusEl.textContent =
              bulk.message || i18n('link_error_generic', 'Could not add media from that link.');
            statusEl.className = 'cam-link-status is-error';
          }
          if (submit) submit.disabled = false;
          return;
        }
        var folderId = bulk.folder.id;
        var okCount = 0;
        var failCount = 0;
        var total = urls.length;
        for (var i = 0; i < urls.length; i++) {
          var progressLabel = i18n(
            'link_bulk_progress',
            'Downloading {current}/{total}…'
          )
            .replace('{current}', String(i + 1))
            .replace('{total}', String(total));
          if (statusEl) {
            statusEl.textContent = progressLabel;
            statusEl.className = 'cam-link-status is-info';
          }
          try {
            var one = await ingestOneLinkWithFolder(urls[i], folderId, statusEl, progressLabel);
            if (one && one.ok) okCount += 1;
            else failCount += 1;
          } catch (itemErr) {
            console.warn('[AssetsManager] bulk item failed', urls[i], itemErr);
            failCount += 1;
          }
          // Small gap between items — avoid parallel Facebook/Cobalt flooding.
          if (i < urls.length - 1) await sleep(400);
        }
        var resultMsg;
        if (okCount === total) {
          resultMsg = i18n('link_bulk_done_all', 'Downloaded {ok}/{total}.')
            .replace('{ok}', String(okCount))
            .replace('{total}', String(total));
        } else if (okCount > 0) {
          resultMsg = i18n(
            'link_bulk_done_partial',
            'Downloaded {ok}/{total} ({failed} failed).'
          )
            .replace('{ok}', String(okCount))
            .replace('{total}', String(total))
            .replace('{failed}', String(failCount));
        } else {
          resultMsg = i18n(
            'link_bulk_done_none',
            'Could not download the selected items. Try again or use Device upload.'
          );
        }
        if (statusEl) {
          statusEl.textContent = resultMsg;
          statusEl.className =
            'cam-link-status ' + (okCount > 0 ? 'is-success' : 'is-error');
        }
        if (okCount > 0) {
          currentFolder = folderId;
          closeLinkModal();
          await refreshAll();
        } else if (submit) {
          submit.disabled = false;
        }
      } catch (e) {
        console.warn('[AssetsManager] bulk ingest failed', e);
        if (statusEl) {
          statusEl.textContent = i18n('link_error_generic', 'Could not add media from that link.');
          statusEl.className = 'cam-link-status is-error';
        }
        if (submit) submit.disabled = false;
      }
    }
  }

  window.__eazAssetsManagerPhoneApply = function (imageUrl) {
    if (!root || root.hidden || !imageUrl) return false;
    closeAddSourceModal();
    fetch(imageUrl, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        return r.blob();
      })
      .then(function (blob) {
        var ext = (blob.type || '').split('/')[1] || 'jpg';
        var file = new File([blob], 'phone-upload.' + ext, { type: blob.type || 'image/jpeg' });
        return uploadFile(file);
      })
      .catch(function (e) {
        console.warn('[AssetsManager] phone apply failed', e);
        setStatus(i18n('error_upload', 'Upload failed.'), true);
      });
    return true;
  };

  function bindAddFileUi() {
    var addFileBtn = document.getElementById('cam-btn-add-file');
    if (addFileBtn && !addFileBtn._camAddFileBound) {
      addFileBtn._camAddFileBound = true;
      addFileBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openAddSourceModal();
      });
    }
    var addSrcOverlay = document.getElementById('camAddSourceModal');
    if (addSrcOverlay && !addSrcOverlay._camAddSrcBound) {
      addSrcOverlay._camAddSrcBound = true;
      addSrcOverlay.addEventListener('mousedown', function (ev) {
        if (ev.target && ev.target.id === 'camAddSourceModal') closeAddSourceModal();
      });
    }
    var addSrcCancel = document.getElementById('cam-addsrc-cancel');
    if (addSrcCancel && !addSrcCancel._camBound) {
      addSrcCancel._camBound = true;
      addSrcCancel.addEventListener('click', closeAddSourceModal);
    }
    var addSrcDevice = document.getElementById('cam-addsrc-device');
    if (addSrcDevice && !addSrcDevice._camBound) {
      addSrcDevice._camBound = true;
      addSrcDevice.addEventListener('click', function () {
        closeAddSourceModal();
        var input = document.getElementById('cam-file-input');
        if (input) input.click();
      });
    }
    var addSrcPhone = document.getElementById('cam-addsrc-phone');
    if (addSrcPhone && !addSrcPhone._camBound) {
      addSrcPhone._camBound = true;
      addSrcPhone.addEventListener('click', function () {
        closeAddSourceModal();
        if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
          window.CreatorPhoneUploadModal.open({ purpose: 'assets-manager' });
        }
      });
    }
    var addSrcLink = document.getElementById('cam-addsrc-link');
    if (addSrcLink && !addSrcLink._camBound) {
      addSrcLink._camBound = true;
      addSrcLink.addEventListener('click', openLinkModal);
    }
  }

  function bindUi() {
    root = document.getElementById('creatorAssetsManagerModal');
    if (!root) return;
    // Always (re)ensure Add File / source-picker wiring — overlays may mount after first bind.
    bindAddFileUi();
    if (root._camBound) return;
    root._camBound = true;

    var closeBtn = $('#cam-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var menuBtn = $('#cam-btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', openDrawer);

    var scrim = $('#cam-drawer-scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);

    var sideToggle = $('#cam-sidebar-toggle');
    if (sideToggle) {
      sideToggle.addEventListener('click', function () {
        // Mobile: hamburger/rail opens drawer; desktop: rail collapses/expands in place.
        if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
          var wrapMobile = $('#cam-sidebar-wrapper');
          if (wrapMobile && !wrapMobile.classList.contains('is-drawer-open')) {
            openDrawer();
            return;
          }
          closeDrawer();
          return;
        }
        var wrap = $('#cam-sidebar-wrapper');
        var body = root.querySelector('.cam-body');
        if (!wrap) return;
        var collapsed = wrap.classList.toggle('is-collapsed');
        if (body) body.classList.toggle('is-sidebar-collapsed', collapsed);
        sideToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        // Keep rail markup intact (CSS rotates the SVG arrow; never set textContent on the button).
      });
    }

    var addFolderBtn = $('#cam-btn-add-folder');
    if (addFolderBtn) {
      addFolderBtn.addEventListener('click', function () {
        var parentId = null;
        if (currentFolder && currentFolder !== 'all' && currentFolder !== 'hidden') {
          var f = findFolderById(currentFolder);
          if (f && f.is_system && f.system_key !== 'hidden' && f.system_key !== 'unsorted') {
            parentId = f.id;
          }
          else if (f && f.parent_id) parentId = f.parent_id;
        }
        openFolderSettings('create', { parentId: parentId });
      });
    }

    var fileInput = document.getElementById('cam-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var files = fileInput.files;
        fileInput.value = '';
        if (files && files.length) uploadFiles(files);
      });
    }

    var linkCancel = document.getElementById('cam-link-cancel');
    if (linkCancel) linkCancel.addEventListener('click', closeLinkModal);
    var linkExtract = document.getElementById('cam-link-extract');
    if (linkExtract) linkExtract.addEventListener('click', submitLinkAnalyze);
    var linkSubmit = document.getElementById('cam-link-submit');
    if (linkSubmit) linkSubmit.addEventListener('click', submitLinkDownload);
    var linkUrl = document.getElementById('cam-link-url');
    if (linkUrl) {
      linkUrl.addEventListener('input', updateExtractButtonLabel);
      linkUrl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitLinkAnalyze();
        }
      });
    }
    var bulkApply = document.getElementById('cam-link-bulk-apply');
    if (bulkApply) bulkApply.addEventListener('click', renderBulkGrid);
    var linkSideToggle = document.getElementById('cam-link-sidebar-toggle');
    if (linkSideToggle) {
      linkSideToggle.addEventListener('click', function () {
        var wrap = document.getElementById('cam-link-sidebar-wrapper');
        if (!wrap || wrap.hidden) return;
        var collapsed = wrap.classList.toggle('is-collapsed');
        linkSideToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    }
    var assetTypesToggle = document.getElementById('cam-link-asset-types-toggle');
    if (assetTypesToggle) {
      assetTypesToggle.addEventListener('click', function () {
        var panel = document.getElementById('cam-link-asset-types-panel');
        setAssetTypesPanelOpen(!!(panel && panel.hidden));
      });
    }
    ['image', 'video', 'reel'].forEach(function (type) {
      var input = document.getElementById('cam-link-type-' + type);
      if (!input) return;
      input.addEventListener('change', function () {
        renderBulkGrid();
      });
    });
    var phoneBtn = document.getElementById('cam-link-phone-btn');
    if (phoneBtn) {
      phoneBtn.addEventListener('click', function () {
        var widget = document.getElementById('cam-link-phone');
        setLinkPhoneWidgetOpen(!(widget && !widget.hidden));
      });
    }
    var phoneClose = document.getElementById('cam-link-phone-close');
    if (phoneClose) {
      phoneClose.addEventListener('click', function () {
        setLinkPhoneWidgetOpen(false);
      });
    }
    var bulkGrid = document.getElementById('cam-link-bulk-grid');
    if (bulkGrid) {
      function syncBulkSelectionFromCard(card) {
        if (!card) return;
        var selKey =
          card.getAttribute('data-cam-bulk-key') || card.getAttribute('data-cam-bulk-url');
        var check = card.querySelector('.cam-link-bulk-card__check');
        var next = !!(check && check.checked);
        if (selKey) linkBulkSelected[selKey] = next;
        card.classList.toggle('is-selected', next);
        card.setAttribute('aria-selected', next ? 'true' : 'false');
        var submitBtn = document.getElementById('cam-link-submit');
        if (submitBtn) {
          submitBtn.disabled = !Object.keys(linkBulkSelected).some(function (k) {
            return linkBulkSelected[k];
          });
        }
      }
      bulkGrid.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        // Selection only via checkbox — never toggle from media/meta clicks
        if (t.classList && t.classList.contains('cam-link-bulk-card__check')) {
          syncBulkSelectionFromCard(t.closest('[data-cam-bulk-key], [data-cam-bulk-url]'));
          return;
        }
        var playBtn = t.closest('[data-cam-bulk-play]');
        if (playBtn) {
          e.preventDefault();
          e.stopPropagation();
          playBulkCandidate(playBtn.getAttribute('data-cam-bulk-play'));
        }
      });
      bulkGrid.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || !t.classList || !t.classList.contains('cam-link-bulk-card__check')) return;
        syncBulkSelectionFromCard(t.closest('[data-cam-bulk-key], [data-cam-bulk-url]'));
      });
    }
    var fsClose = document.getElementById('cam-link-fs-close');
    if (fsClose) {
      fsClose.addEventListener('click', function () {
        var video = document.getElementById('cam-link-fs-video');
        if (video) {
          try {
            video.pause();
          } catch (e) {}
          video.removeAttribute('src');
        }
        closeSubmodal('cam-link-fs');
      });
    }

    var searchInput = $('#cam-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchQuery = String(searchInput.value || '').trim();
          loadAssets();
        }, 250);
      });
    }

    var settingsCancel = $('#cam-folder-settings-cancel');
    if (settingsCancel) {
      settingsCancel.addEventListener('click', function () {
        closeSubmodal('cam-folder-settings');
      });
    }
    var settingsSave = $('#cam-folder-settings-save');
    if (settingsSave) settingsSave.addEventListener('click', saveFolderSettings);

    var removeAssetsCheck = $('#cam-remove-assets-check');
    if (removeAssetsCheck) {
      removeAssetsCheck.addEventListener('change', function () {
        if (removeAssetsCheck.checked && !removeAssetsConfirmed) {
          // Opening second confirm; keep checked only after confirm.
          removeAssetsCheck.checked = false;
          openSubmodal('cam-confirm-assets-permanent');
        } else if (!removeAssetsCheck.checked) {
          removeAssetsConfirmed = false;
        }
      });
    }

    var folderRemoveOk = $('#cam-confirm-folder-remove-ok');
    if (folderRemoveOk) folderRemoveOk.addEventListener('click', confirmFolderRemove);

    var permanentOk = $('#cam-confirm-assets-permanent-ok');
    if (permanentOk) {
      permanentOk.addEventListener('click', function () {
        removeAssetsConfirmed = true;
        var check = $('#cam-remove-assets-check');
        if (check) check.checked = true;
        closeSubmodal('cam-confirm-assets-permanent');
      });
    }

    var assetOk = $('#cam-confirm-asset-ok');
    if (assetOk) assetOk.addEventListener('click', confirmAssetAction);

    var selectToggle = $('#cam-btn-select-toggle');
    if (selectToggle) {
      selectToggle.addEventListener('click', function () {
        var keys = Object.keys(selected);
        var allSelected = assets.length > 0 && keys.length >= assets.length;
        selected = Object.create(null);
        if (!allSelected) {
          assets.forEach(function (a) {
            selected[assetKey(a)] = true;
          });
        }
        renderAssets();
      });
    }

    var moveBtn = $('#cam-btn-move');
    if (moveBtn) {
      moveBtn.addEventListener('click', function () {
        var keys = Object.keys(selected);
        if (!keys.length) return;
        openMoveModal(itemsForMoveFromKeys(keys));
      });
    }
    var hideBtn = $('#cam-btn-hide');
    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        var items = selectedItems();
        if (!items.length) return;
        openAssetActionConfirm('hide', items);
      });
    }
    var removeBtn = $('#cam-btn-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        var items = selectedItems();
        if (!items.length) return;
        openAssetActionConfirm('remove', items);
      });
    }

    var moveCancel = $('#cam-move-cancel');
    if (moveCancel) {
      moveCancel.addEventListener('click', function () {
        closeSubmodal('cam-move-modal');
        moveItems = null;
        moveSelectedFolderId = null;
      });
    }
    var moveConfirm = $('#cam-move-confirm');
    if (moveConfirm) moveConfirm.addEventListener('click', confirmMove);

    root.addEventListener('click', onRootClick);
    root.addEventListener('contextmenu', onRootContextMenu);
    root.addEventListener('dragstart', onCardDragStart);
    root.addEventListener('dragend', onCardDragEnd);
    root.addEventListener('dragover', onFolderDragOver);
    root.addEventListener('drop', onFolderDrop);
    root.addEventListener('dragleave', function (ev) {
      var row = ev.target && ev.target.closest ? ev.target.closest('.cam-folder-row') : null;
      if (row && !row.contains(ev.relatedTarget)) {
        row.classList.remove('is-drop-hover');
      }
    });

    document.addEventListener('click', function (ev) {
      if (!root || root.hidden) return;
      var menu1 = document.getElementById('cam-folder-menu');
      var menu2 = document.getElementById('cam-asset-menu');
      if (menu1 && !menu1.hidden && !menu1.contains(ev.target)) menu1.hidden = true;
      if (menu2 && !menu2.hidden && !menu2.contains(ev.target)) menu2.hidden = true;
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!root || root.hidden) return;
      var linkFs = document.getElementById('cam-link-fs');
      var linkModal = document.getElementById('camLinkModal');
      var addSrc = document.getElementById('camAddSourceModal');
      var settings = document.getElementById('cam-folder-settings');
      var folderRemove = document.getElementById('cam-confirm-folder-remove');
      var permanent = document.getElementById('cam-confirm-assets-permanent');
      var assetConfirm = document.getElementById('cam-confirm-asset-action');
      var moveModal = document.getElementById('cam-move-modal');
      if (linkFs && !linkFs.hidden) {
        closeSubmodal('cam-link-fs');
        return;
      }
      if (linkModal && !linkModal.hidden) {
        closeLinkModal();
        return;
      }
      if (addSrc && !addSrc.hidden) {
        closeAddSourceModal();
        return;
      }
      if (settings && !settings.hidden) {
        closeSubmodal('cam-folder-settings');
        return;
      }
      if (moveModal && !moveModal.hidden) {
        closeSubmodal('cam-move-modal');
        moveItems = null;
        moveSelectedFolderId = null;
        return;
      }
      if (permanent && !permanent.hidden) {
        closeSubmodal('cam-confirm-assets-permanent');
        return;
      }
      if (folderRemove && !folderRemove.hidden) {
        closeSubmodal('cam-confirm-folder-remove');
        return;
      }
      if (assetConfirm && !assetConfirm.hidden) {
        closeSubmodal('cam-confirm-asset-action');
        return;
      }
      var wrapEsc = $('#cam-sidebar-wrapper');
      if (wrapEsc && wrapEsc.classList.contains('is-drawer-open')) {
        closeDrawer();
        return;
      }
      close();
    });
  }

  function open() {
    root = document.getElementById('creatorAssetsManagerModal');
    if (!root) {
      try {
        console.warn('[AssetsManager] modal root missing');
      } catch (e) {}
      return false;
    }
    try {
      if (root.parentElement !== document.body) {
        document.body.appendChild(root);
      }
    } catch (eMove) {}
    bindUi();
    currentFolder = 'all';
    currentType = '';
    searchQuery = '';
    selected = Object.create(null);
    moveItems = null;
    moveSelectedFolderId = null;
    playingKey = null;
    dragPayload = null;
    var searchInput = $('#cam-search-input');
    if (searchInput) searchInput.value = '';
    root.querySelectorAll('.cam-chip').forEach(function (chip, idx) {
      chip.classList.toggle('is-active', idx === 0);
    });
    root.hidden = false;
    root.removeAttribute('hidden');
    root.setAttribute('aria-hidden', 'false');
    try {
      document.body.classList.add('cam-modal-open');
    } catch (e) {}
    refreshAll();
    return true;
  }

  function close() {
    root = document.getElementById('creatorAssetsManagerModal');
    if (!root) return;
    stopAllPlayback();
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    closeDrawer();
    closeMenus();
    clearDragHover();
    closeSubmodal('cam-folder-settings');
    closeSubmodal('cam-confirm-folder-remove');
    closeSubmodal('cam-confirm-assets-permanent');
    closeSubmodal('cam-confirm-asset-action');
    closeSubmodal('cam-move-modal');
    closeAddSourceModal();
    closeLinkModal();
    moveItems = null;
    moveSelectedFolderId = null;
    try {
      document.body.classList.remove('cam-modal-open');
    } catch (e) {}
  }

  function onDelegatedOpenClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-assets-manager-open]') : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  }

  function boot() {
    bindUi();
    if (!document._camOpenDelegationBound) {
      document._camOpenDelegationBound = true;
      document.addEventListener('click', onDelegatedOpenClick, true);
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

  window.CreatorAssetsManager = {
    open: open,
    close: close,
    refresh: refreshAll
  };
})();
