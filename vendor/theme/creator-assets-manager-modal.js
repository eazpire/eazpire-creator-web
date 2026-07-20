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

  function openSubmodal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
  }

  function closeSubmodal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = true;
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

  function bindUi() {
    root = document.getElementById('creatorAssetsManagerModal');
    if (!root || root._camBound) return;
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
      var settings = document.getElementById('cam-folder-settings');
      var folderRemove = document.getElementById('cam-confirm-folder-remove');
      var permanent = document.getElementById('cam-confirm-assets-permanent');
      var assetConfirm = document.getElementById('cam-confirm-asset-action');
      var moveModal = document.getElementById('cam-move-modal');
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
