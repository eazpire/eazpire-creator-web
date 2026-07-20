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

  function systemParentsForSelect() {
    return (foldersTree || []).filter(function (f) {
      return f.is_system && f.system_key && f.system_key !== 'hidden';
    });
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

    var html = '';
    (foldersTree || []).forEach(function (parent) {
      var active = currentFolder === parent.id ? ' is-active' : '';
      html +=
        '<div class="cam-folder-row" data-cam-folder-id="' +
        escapeHtml(parent.id) +
        '">' +
        '<button type="button" class="cam-sidebar__item' +
        active +
        '" data-cam-folder="' +
        escapeHtml(parent.id) +
        '">' +
        '<span class="cam-sidebar__item-label">' +
        escapeHtml(parent.title) +
        '</span>' +
        '<span class="cam-sidebar__count">' +
        String(parent.asset_count || 0) +
        '</span>' +
        '</button>' +
        '<button type="button" class="cam-folder-add-child" data-cam-add-child="' +
        escapeHtml(parent.id) +
        '" title="' +
        escapeHtml(i18n('add_child_folder', 'Add child folder')) +
        '" aria-label="' +
        escapeHtml(i18n('add_child_folder', 'Add child folder')) +
        '">+</button>' +
        '</div>';

      (parent.children || []).forEach(function (child) {
        var cActive = currentFolder === child.id ? ' is-active' : '';
        html +=
          '<div class="cam-folder-row" data-cam-folder-id="' +
          escapeHtml(child.id) +
          '">' +
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
    });
    nav.innerHTML = html;

    var allBtn = $('#cam-folder-all');
    var hiddenBtn = $('#cam-folder-hidden');
    if (allBtn) allBtn.classList.toggle('is-active', currentFolder === 'all');
    if (hiddenBtn) hiddenBtn.classList.toggle('is-active', currentFolder === 'hidden');
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
        var thumb = a.thumbnail_url || a.url || '';
        var media =
          a.media_kind === 'video'
            ? '<video class="cam-card__media" src="' +
              escapeHtml(a.url || '') +
              '" poster="' +
              escapeHtml(thumb) +
              '" muted preload="metadata"></video>'
            : '<img class="cam-card__media" src="' +
              escapeHtml(thumb) +
              '" alt="" loading="lazy">';
        return (
          '<article class="cam-card' +
          selClass +
          '" data-cam-asset-key="' +
          escapeHtml(key) +
          '" data-asset-type="' +
          escapeHtml(a.asset_type) +
          '" data-asset-id="' +
          escapeHtml(a.id) +
          '">' +
          '<input type="checkbox" class="cam-card__check" data-cam-select' +
          checked +
          ' aria-label="' +
          escapeHtml(i18n('select_asset', 'Select asset')) +
          '">' +
          media +
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
    var data = await apiGet('marketing-asset-folders-list');
    if (!data || !data.ok) {
      setStatus(i18n('error_load_folders', 'Could not load folders.'), true);
      return;
    }
    foldersTree = data.folders || [];
    hiddenFolder = data.hidden || null;
    allCount = data.all_count || 0;
    renderFolderTree();
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

  function openDrawer() {
    var sidebar = $('#cam-sidebar');
    var scrim = $('#cam-drawer-scrim');
    if (sidebar) sidebar.classList.add('is-drawer-open');
    if (scrim) scrim.hidden = false;
  }

  function closeDrawer() {
    var sidebar = $('#cam-sidebar');
    var scrim = $('#cam-drawer-scrim');
    if (sidebar) sidebar.classList.remove('is-drawer-open');
    if (scrim) scrim.hidden = true;
  }

  function onRootClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var folderBtn = t.closest('[data-cam-folder]');
    if (folderBtn && !t.closest('[data-cam-add-child]') && !t.closest('[data-cam-folder-action]')) {
      currentFolder = folderBtn.getAttribute('data-cam-folder') || 'all';
      selected = Object.create(null);
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
        asset_id: card.getAttribute('data-asset-id')
      };
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
        var sidebar = $('#cam-sidebar');
        var body = root.querySelector('.cam-body');
        if (!sidebar) return;
        var collapsed = sidebar.classList.toggle('is-collapsed');
        if (body) body.classList.toggle('is-sidebar-collapsed', collapsed);
        sideToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sideToggle.textContent = collapsed ? '›' : '‹';
      });
    }

    var addFolderBtn = $('#cam-btn-add-folder');
    if (addFolderBtn) {
      addFolderBtn.addEventListener('click', function () {
        var parentId = null;
        if (currentFolder && currentFolder !== 'all' && currentFolder !== 'hidden') {
          var f = findFolderById(currentFolder);
          if (f && f.is_system && f.system_key !== 'hidden') parentId = f.id;
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

    root.addEventListener('click', onRootClick);
    root.addEventListener('contextmenu', onRootContextMenu);

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
      if (settings && !settings.hidden) {
        closeSubmodal('cam-folder-settings');
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
      var sidebar = $('#cam-sidebar');
      if (sidebar && sidebar.classList.contains('is-drawer-open')) {
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
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    closeDrawer();
    closeMenus();
    closeSubmodal('cam-folder-settings');
    closeSubmodal('cam-confirm-folder-remove');
    closeSubmodal('cam-confirm-assets-permanent');
    closeSubmodal('cam-confirm-asset-action');
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
