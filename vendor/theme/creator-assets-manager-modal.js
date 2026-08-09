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
  var deletingFolderIds = Object.create(null); // folderId -> true
  var deletingAssetKeys = Object.create(null); // assetKey -> true
  var folderRemoveBusy = false;
  var assetActionBusy = false;
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

  /** Prefer document lookup — confirm overlays are reparented to body via mountOverlay. */
  function byId(id) {
    return document.getElementById(id);
  }

  function closeAllConfirmModals() {
    closeSubmodal('cam-confirm-folder-remove');
    closeSubmodal('cam-confirm-assets-permanent');
    closeSubmodal('cam-confirm-asset-action');
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
    { system_key: 'videos', titleKey: 'folder_videos', title: 'Videos' },
    { system_key: 'motion_videos', titleKey: 'folder_motion_videos', title: 'Motion Videos', parent_system_key: 'videos' },
    { system_key: 'transition_videos', titleKey: 'folder_transition_videos', title: 'Transition Videos', parent_system_key: 'videos' },
    { system_key: 'transition_clips', titleKey: 'folder_transition_clips', title: 'Transition Clips', parent_system_key: 'videos' },
    { system_key: 'downloads', titleKey: 'folder_downloads', title: 'Downloads' }
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
    var rootDefs = SYSTEM_FOLDER_DEFS.filter(function (d) {
      return !d.parent_system_key;
    });
    rootDefs.forEach(function (def) {
      var found = list.some(function (f) {
        return f && f.system_key === def.system_key;
      });
      if (!found) {
        var children = SYSTEM_FOLDER_DEFS.filter(function (c) {
          return c.parent_system_key === def.system_key;
        }).map(function (c) {
          return {
            id: c.system_key,
            system_key: c.system_key,
            title: c.title,
            is_system: true,
            parent_id: def.system_key,
            asset_count: 0,
            children: [],
            _local: true
          };
        });
        list.push({
          id: def.system_key,
          system_key: def.system_key,
          title: def.title,
          is_system: true,
          parent_id: null,
          asset_count: 0,
          children: children,
          _local: true
        });
      }
    });
    // Keep root system folders in fixed order, then any extras
    list.sort(function (a, b) {
      var ai = rootDefs.findIndex(function (d) {
        return d.system_key === a.system_key;
      });
      var bi = rootDefs.findIndex(function (d) {
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

  function walkFolderTree(nodes, visit, parents) {
    var list = Array.isArray(nodes) ? nodes : [];
    var chain = Array.isArray(parents) ? parents : [];
    list.forEach(function (node) {
      if (!node) return;
      visit(node, chain);
      walkFolderTree(node.children || [], visit, chain.concat([node]));
    });
  }

  function collectUserChildFolders() {
    var out = [];
    walkFolderTree(ensureSystemFoldersInTree(foldersTree), function (node, parents) {
      if (!(isUserChildFolder(node) || (!node.is_system && node.parent_id))) return;
      var root = parents[0] || null;
      var parent = parents[parents.length - 1] || root;
      var pathTitles = parents
        .concat([node])
        .filter(function (p) {
          return p && !p.is_system;
        })
        .map(function (p) {
          return p.title || '';
        });
      out.push({
        id: node.id,
        title: pathTitles.length > 1 ? pathTitles.join(' / ') : node.title || '',
        parent_id: parent ? parent.id : node.parent_id,
        parent_title: systemFolderTitle(root) || (root && root.title) || ''
      });
    });
    return out;
  }

  function ensureParentExpandedForCurrent() {
    if (!currentFolder || currentFolder === 'all' || currentFolder === 'hidden') return;
    walkFolderTree(foldersTree, function (node, parents) {
      if (node.id !== currentFolder) return;
      parents.forEach(function (p) {
        if (p && p.id) expandedParents[p.id] = true;
      });
      if (node.parent_id) expandedParents[node.parent_id] = true;
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

      var parentDeleting = !!deletingFolderIds[parent.id];
      html +=
        '<div class="cam-folder-group' +
        (isExpanded ? ' is-expanded' : '') +
        '" data-cam-folder-group="' +
        escapeHtml(parent.id) +
        '">' +
        '<div class="cam-folder-row' +
        (parentDeleting ? ' is-deleting' : '') +
        '" data-cam-folder-id="' +
        escapeHtml(parent.id) +
        '" data-system-key="' +
        escapeHtml(parent.system_key || '') +
        '" data-cam-drop="0"' +
        (parentDeleting ? ' aria-busy="true"' : '') +
        '>' +
        (hasChildren
          ? '<button type="button" class="cam-folder-expand" data-cam-expand="' +
            escapeHtml(parent.id) +
            '" aria-expanded="' +
            (isExpanded ? 'true' : 'false') +
            '"' +
            (parentDeleting ? ' disabled' : '') +
            '>' +
            (isExpanded ? '▾' : '▸') +
            '</button>'
          : '') +
        '<button type="button" class="cam-sidebar__item' +
        active +
        '" data-cam-folder="' +
        escapeHtml(parent.id) +
        '"' +
        (parentDeleting ? ' disabled' : '') +
        '>' +
        '<span class="cam-sidebar__item-label">' +
        escapeHtml(label) +
        '</span>' +
        (parentDeleting
          ? '<span class="cam-deleting-spinner" aria-hidden="true"></span>'
          : '<span class="cam-sidebar__count">' +
            String(parent.asset_count || 0) +
            '</span>') +
        '</button>' +
        (canAddChild && !parentDeleting
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
        html += renderNestedFolderRows(children, 1);
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
        '<button type="button" class="cam-card__fs" data-cam-fullscreen aria-label="' +
        escapeHtml(i18n('video_fullscreen', 'Fullscreen')) +
        '" title="' +
        escapeHtml(i18n('video_fullscreen', 'Fullscreen')) +
        '">⛶</button>' +
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

  function closeVideoFullscreen() {
    var overlay = document.getElementById('cam-asset-fs');
    var video = document.getElementById('cam-asset-fs-video');
    if (video) {
      try {
        video.pause();
      } catch (e) {}
      video.removeAttribute('src');
      try {
        video.load();
      } catch (e2) {}
    }
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('hidden', '');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function openVideoFullscreen(asset) {
    if (!asset || !asset.url) return;
    stopAllPlayback();
    var overlay = document.getElementById('cam-asset-fs');
    var video = document.getElementById('cam-asset-fs-video');
    if (!overlay || !video) return;
    video.src = asset.url;
    overlay.hidden = false;
    overlay.removeAttribute('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    try {
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
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

  function formatCount(n) {
    var v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '';
    if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(v));
  }

  function socialMetaOf(asset) {
    return asset && asset.social_meta && typeof asset.social_meta === 'object'
      ? asset.social_meta
      : null;
  }

  function socialTooltipText(asset) {
    var m = socialMetaOf(asset);
    if (!m) return '';
    var parts = [];
    if (m.author && m.author.name) parts.push(String(m.author.name));
    if (m.description) {
      var d = String(m.description).replace(/\s+/g, ' ').trim();
      if (d.length > 140) d = d.slice(0, 137) + '…';
      if (d) parts.push(d);
    }
    var counts = [];
    if (m.view_count != null) counts.push(formatCount(m.view_count) + ' views');
    if (m.like_count != null) counts.push(formatCount(m.like_count) + ' likes');
    if (m.comment_count != null) counts.push(formatCount(m.comment_count) + ' comments');
    if (m.share_count != null) counts.push(formatCount(m.share_count) + ' shares');
    if (counts.length) parts.push(counts.join(' · '));
    if (m.post_url) parts.push(String(m.post_url));
    return parts.join(' · ');
  }

  function socialSnippetHtml(asset) {
    var m = socialMetaOf(asset);
    if (!m) return '';
    var bits = [];
    if (m.author && m.author.name) bits.push(escapeHtml(String(m.author.name)));
    if (m.view_count != null) bits.push(escapeHtml(formatCount(m.view_count)) + ' views');
    else if (m.like_count != null) bits.push(escapeHtml(formatCount(m.like_count)) + ' likes');
    if (!bits.length && m.description) {
      var snip = String(m.description).replace(/\s+/g, ' ').trim();
      if (snip.length > 48) snip = snip.slice(0, 45) + '…';
      bits.push(escapeHtml(snip));
    }
    if (!bits.length) return '';
    return '<div class="cam-card__social">' + bits.join(' · ') + '</div>';
  }

  function closeSocialDetail() {
    var modal = $('#cam-social-detail');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }

  function openSocialDetail(asset) {
    var modal = $('#cam-social-detail');
    var body = $('#cam-social-detail-body');
    var openLink = $('#cam-social-detail-open');
    if (!modal || !body) return;
    var m = socialMetaOf(asset);
    if (!m) {
      body.innerHTML =
        '<p class="cam-social-detail__empty">' +
        escapeHtml(i18n('social_no_meta', 'No social details available for this asset.')) +
        '</p>';
      if (openLink) openLink.hidden = true;
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      return;
    }
    var rows = [];
    function addRow(label, valueHtml) {
      if (!valueHtml) return;
      rows.push(
        '<div class="cam-social-detail__row"><dt>' +
          escapeHtml(label) +
          '</dt><dd>' +
          valueHtml +
          '</dd></div>'
      );
    }
    if (m.platform) addRow(i18n('social_platform', 'Platform'), escapeHtml(String(m.platform)));
    if (m.author && m.author.name) {
      var authorHtml = escapeHtml(String(m.author.name));
      if (m.author.url) {
        authorHtml =
          '<a href="' +
          escapeHtml(String(m.author.url)) +
          '" target="_blank" rel="noopener noreferrer">' +
          authorHtml +
          '</a>';
      }
      addRow(i18n('social_author', 'Author'), authorHtml);
    }
    if (m.description) {
      addRow(
        i18n('social_description', 'Description'),
        '<span class="cam-social-detail__desc">' + escapeHtml(String(m.description)) + '</span>'
      );
    }
    if (m.view_count != null) addRow(i18n('social_views', 'Views'), escapeHtml(formatCount(m.view_count)));
    if (m.like_count != null) addRow(i18n('social_likes', 'Likes'), escapeHtml(formatCount(m.like_count)));
    if (m.comment_count != null)
      addRow(i18n('social_comments', 'Comments'), escapeHtml(formatCount(m.comment_count)));
    if (m.share_count != null)
      addRow(i18n('social_shares', 'Shares'), escapeHtml(formatCount(m.share_count)));
    if (m.published_at) {
      try {
        addRow(
          i18n('social_published', 'Published'),
          escapeHtml(new Date(Number(m.published_at)).toLocaleString())
        );
      } catch (e) {}
    }
    body.innerHTML = rows.length
      ? '<dl class="cam-social-detail__dl">' + rows.join('') + '</dl>'
      : '<p class="cam-social-detail__empty">' +
        escapeHtml(i18n('social_no_meta', 'No social details available for this asset.')) +
        '</p>';
    if (openLink) {
      if (m.post_url) {
        openLink.href = String(m.post_url);
        openLink.hidden = false;
      } else {
        openLink.hidden = true;
      }
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }

  function getActiveLinkDownloadPlaceholders() {
    if (!linkDownloadJob || !Array.isArray(linkDownloadJob.items)) return [];
    if (String(linkDownloadJob.folderId) !== String(currentFolder)) return [];
    return linkDownloadJob.items.filter(function (item) {
      if (!item) return false;
      if (item.status === 'ready' && item.asset_id) {
        return !assets.some(function (a) {
          return String(a.id) === String(item.asset_id);
        });
      }
      return (
        item.status === 'pending' ||
        item.status === 'downloading' ||
        item.status === 'failed'
      );
    });
  }

  function renderPendingDownloadCard(item) {
    var st = String((item && item.status) || 'pending');
    var label =
      st === 'failed'
        ? i18n('link_download_card_failed', 'Failed')
        : st === 'downloading'
          ? i18n('link_download_card_downloading', 'Downloading…')
          : i18n('link_download_card_pending', 'Queued…');
    var failClass = st === 'failed' ? ' is-failed' : '';
    var busy = st === 'failed' ? '' : ' aria-busy="true"';
    var errDetail =
      st === 'failed' && item && (item.message || item.error)
        ? String(item.message || item.error).slice(0, 160)
        : '';
    return (
      '<article class="cam-card cam-card--pending' +
      failClass +
      '" data-cam-pending-id="' +
      escapeHtml(item.localId || '') +
      '" draggable="false"' +
      busy +
      (errDetail ? ' title="' + escapeHtml(errDetail) + '"' : '') +
      '>' +
      '<div class="cam-card__pending" aria-hidden="true">' +
      (st === 'failed'
        ? '<span class="cam-card__pending-fail">!</span>'
        : '<span class="cam-deleting-spinner"></span>') +
      '</div>' +
      '<div class="cam-card__meta">' +
      '<div class="cam-card__title">' +
      escapeHtml(label) +
      '</div>' +
      '<div class="cam-card__type">' +
      escapeHtml(
        errDetail || i18n('link_download_card_type', 'Link download')
      ) +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function renderAssets() {
    var grid = $('#cam-asset-grid');
    var empty = $('#cam-empty');
    if (!grid) return;
    var placeholders = getActiveLinkDownloadPlaceholders();
    if (!assets.length && !placeholders.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      updateFloatBar();
      return;
    }
    if (empty) empty.hidden = true;
    var realHtml = assets
      .map(function (a) {
        var key = assetKey(a);
        var checked = selected[key] ? ' checked' : '';
        var selClass = selected[key] ? ' is-selected' : '';
        var playClass =
          a.media_kind === 'video' || a.media_kind === 'audio' ? ' cam-card--playable' : '';
        var playingClass = playingKey === key ? ' is-playing' : '';
        var tip = socialTooltipText(a);
        var hasSocial = !!socialMetaOf(a);
        var titleAttr = tip ? ' title="' + escapeHtml(tip) + '"' : '';
        var isDeleting = !!deletingAssetKeys[key];
        return (
          '<article class="cam-card' +
          selClass +
          playClass +
          playingClass +
          (hasSocial ? ' cam-card--social' : '') +
          (isDeleting ? ' is-deleting' : '') +
          '" draggable="' +
          (isDeleting ? 'false' : 'true') +
          '" data-cam-asset-key="' +
          escapeHtml(key) +
          '" data-asset-type="' +
          escapeHtml(a.asset_type) +
          '" data-asset-id="' +
          escapeHtml(a.id) +
          '" data-media-kind="' +
          escapeHtml(a.media_kind || '') +
          '" data-folder-id="' +
          escapeHtml(a.folder_id || '') +
          '"' +
          (isDeleting ? ' aria-busy="true"' : '') +
          titleAttr +
          '>' +
          (isDeleting
            ? '<div class="cam-card__deleting" aria-hidden="true"><span class="cam-deleting-spinner"></span></div>'
            : '') +
          '<input type="checkbox" class="cam-card__check" data-cam-select' +
          checked +
          (isDeleting ? ' disabled' : '') +
          ' aria-label="' +
          escapeHtml(i18n('select_asset', 'Select asset')) +
          '">' +
          (hasSocial
            ? '<button type="button" class="cam-card__social-btn" data-cam-social-detail aria-label="' +
              escapeHtml(i18n('social_view_details', 'View social details')) +
              '"' +
              (isDeleting ? ' disabled' : '') +
              '>i</button>'
            : '') +
          mediaPreviewHtml(a) +
          '<div class="cam-card__meta">' +
          '<div class="cam-card__title">' +
          escapeHtml(a.title || a.asset_type) +
          '</div>' +
          '<div class="cam-card__type">' +
          escapeHtml(a.asset_type || '') +
          '</div>' +
          socialSnippetHtml(a) +
          '</div>' +
          '</article>'
        );
      })
      .join('');
    var pendingHtml = placeholders.map(renderPendingDownloadCard).join('');
    grid.innerHTML = pendingHtml + realHtml;
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

  async function loadAssets(opts) {
    opts = opts || {};
    if (!opts.silent) setStatus(i18n('loading', 'Loading…'), false);
    var params = {
      folder_id: currentFolder,
      type: currentType || undefined,
      q: searchQuery || undefined
    };
    // Exclude search when browsing Hidden is fine; API excludes Hidden from search for non-hidden views.
    var data = await apiGet('marketing-assets-list', params);
    if (!data || !data.ok) {
      if (!opts.silent) setStatus(i18n('error_load_assets', 'Could not load assets.'), true);
      assets = [];
      renderAssets();
      return;
    }
    if (!opts.silent) setStatus('', false);
    assets = data.assets || [];
    // Drop selections that are no longer visible
    Object.keys(selected).forEach(function (k) {
      if (!assets.some(function (a) { return assetKey(a) === k; })) {
        delete selected[k];
      }
    });
    // Keep in-flight deleting markers until local remove finishes
    renderAssets();
  }

  async function refreshAll() {
    await loadFolders();
    await loadAssets();
  }

  /** Background sync after optimistic local remove — no blocking status line. */
  function softRefreshAfterMutation() {
    Promise.resolve()
      .then(function () {
        return loadFolders();
      })
      .then(function () {
        return loadAssets({ silent: true });
      })
      .catch(function () {});
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

  function renderNestedFolderRows(nodes, depth) {
    var html = '';
    var level = Math.max(1, Number(depth) || 1);
    (nodes || []).forEach(function (child) {
      if (!child) return;
      var cActive = currentFolder === child.id ? ' is-active' : '';
      var grand = child.children || [];
      var hasGrand = grand.length > 0;
      var childExpanded =
        hasGrand &&
        (expandedParents[child.id] == null ? true : !!expandedParents[child.id]);
      if (hasGrand && expandedParents[child.id] == null) {
        expandedParents[child.id] = true;
      }
      var childDeleting = !!deletingFolderIds[child.id];
      html +=
        '<div class="cam-folder-row cam-folder-row--nested' +
        (childDeleting ? ' is-deleting' : '') +
        '" data-cam-folder-id="' +
        escapeHtml(child.id) +
        '" data-cam-drop="1" data-cam-depth="' +
        String(level) +
        '" style="padding-left:' +
        String(8 + level * 12) +
        'px"' +
        (childDeleting ? ' aria-busy="true"' : '') +
        '>' +
        (hasGrand
          ? '<button type="button" class="cam-folder-expand" data-cam-expand="' +
            escapeHtml(child.id) +
            '" aria-expanded="' +
            (childExpanded ? 'true' : 'false') +
            '"' +
            (childDeleting ? ' disabled' : '') +
            '>' +
            (childExpanded ? '▾' : '▸') +
            '</button>'
          : '<span class="cam-folder-expand-spacer" aria-hidden="true"></span>') +
        '<button type="button" class="cam-sidebar__item cam-sidebar__item--child' +
        cActive +
        '" data-cam-folder="' +
        escapeHtml(child.id) +
        '"' +
        (childDeleting ? ' disabled' : '') +
        '>' +
        '<span class="cam-sidebar__item-label">' +
        escapeHtml(child.title) +
        '</span>' +
        (childDeleting
          ? '<span class="cam-deleting-spinner" aria-hidden="true"></span>'
          : '<span class="cam-sidebar__count">' +
            String(child.asset_count || 0) +
            '</span>') +
        '</button>' +
        '</div>';
      if (hasGrand && childExpanded) {
        html += '<div class="cam-folder-children">';
        html += renderNestedFolderRows(grand, level + 1);
        html += '</div>';
      }
    });
    return html;
  }

  function findFolderById(id) {
    var found = null;
    walkFolderTree(foldersTree, function (node) {
      if (node && node.id === id) found = node;
    });
    return found;
  }

  function isFolderUnderRoot(rootId, targetId) {
    if (!rootId || !targetId) return false;
    if (String(rootId) === String(targetId)) return true;
    var rootNode = findFolderById(rootId);
    if (!rootNode) return false;
    var hit = false;
    walkFolderTree([rootNode], function (node) {
      if (node && String(node.id) === String(targetId)) hit = true;
    });
    return hit;
  }

  function removeFolderSubtreeFromTree(folderId) {
    function filterNodes(nodes) {
      var out = [];
      (nodes || []).forEach(function (n) {
        if (!n || String(n.id) === String(folderId)) return;
        var copy = Object.assign({}, n);
        if (copy.children) copy.children = filterNodes(copy.children);
        out.push(copy);
      });
      return out;
    }
    foldersTree = filterNodes(foldersTree);
  }

  function openFolderRemoveConfirm(folderId) {
    pendingFolderRemoveId = folderId;
    removeAssetsConfirmed = false;
    var check = byId('cam-remove-assets-check');
    if (check) check.checked = false;
    openSubmodal('cam-confirm-folder-remove');
  }

  async function confirmFolderRemove() {
    if (folderRemoveBusy) return;
    var check = byId('cam-remove-assets-check');
    var removeAssets = !!(check && check.checked) || !!removeAssetsConfirmed;
    if (removeAssets && !removeAssetsConfirmed) {
      openSubmodal('cam-confirm-assets-permanent');
      return;
    }
    var folderId = pendingFolderRemoveId;
    if (!folderId) return;

    folderRemoveBusy = true;
    // Close confirm dialogs immediately; keep the main Assets Manager open.
    closeAllConfirmModals();
    pendingFolderRemoveId = null;
    removeAssetsConfirmed = false;
    if (check) check.checked = false;

    deletingFolderIds[folderId] = true;
    renderFolderTree();

    try {
      var data = await apiPost('marketing-asset-folder-delete', {
        folder_id: folderId,
        remove_assets: removeAssets
      });
      if (!data || !data.ok) {
        delete deletingFolderIds[folderId];
        renderFolderTree();
        setStatus(i18n('error_remove_folder', 'Could not remove folder.'), true);
        return;
      }
      if (isFolderUnderRoot(folderId, currentFolder)) currentFolder = 'all';
      removeFolderSubtreeFromTree(folderId);
      delete deletingFolderIds[folderId];
      renderFolderTree();
      softRefreshAfterMutation();
    } catch (err) {
      delete deletingFolderIds[folderId];
      renderFolderTree();
      setStatus(i18n('error_remove_folder', 'Could not remove folder.'), true);
    } finally {
      folderRemoveBusy = false;
    }
  }

  function openAssetActionConfirm(action, items) {
    pendingAssetAction = { action: action, items: items };
    var title = byId('cam-confirm-asset-title');
    var body = byId('cam-confirm-asset-body');
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
    if (assetActionBusy || !pendingAssetAction) return;
    var action = pendingAssetAction.action;
    var items = pendingAssetAction.items || [];
    if (!items.length) {
      pendingAssetAction = null;
      closeSubmodal('cam-confirm-asset-action');
      return;
    }

    assetActionBusy = true;
    pendingAssetAction = null;
    // Close confirm immediately; keep the main Assets Manager open.
    closeSubmodal('cam-confirm-asset-action');

    var keys = items.map(function (it) {
      return String(it.asset_type) + ':' + String(it.asset_id);
    });
    keys.forEach(function (k) {
      deletingAssetKeys[k] = true;
      delete selected[k];
    });
    renderAssets();

    try {
      var data;
      if (action === 'hide') {
        data = await apiPost('marketing-assets-move', { items: items, target: 'hidden' });
      } else {
        data = await apiPost('marketing-assets-delete', { items: items });
      }
      if (!data || !data.ok) {
        keys.forEach(function (k) {
          delete deletingAssetKeys[k];
        });
        renderAssets();
        setStatus(
          action === 'hide'
            ? i18n('error_hide', 'Could not hide assets.')
            : i18n('error_remove_assets', 'Could not remove assets.'),
          true
        );
        return;
      }
      var removeSet = Object.create(null);
      keys.forEach(function (k) {
        removeSet[k] = true;
        delete deletingAssetKeys[k];
      });
      assets = assets.filter(function (a) {
        return !removeSet[assetKey(a)];
      });
      renderAssets();
      softRefreshAfterMutation();
    } catch (err) {
      keys.forEach(function (k) {
        delete deletingAssetKeys[k];
      });
      renderAssets();
      setStatus(
        action === 'hide'
          ? i18n('error_hide', 'Could not hide assets.')
          : i18n('error_remove_assets', 'Could not remove assets.'),
        true
      );
    } finally {
      assetActionBusy = false;
    }
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

    var socialBtn = t.closest('[data-cam-social-detail]');
    if (socialBtn) {
      e.preventDefault();
      e.stopPropagation();
      var socialCard = socialBtn.closest('[data-cam-asset-key]');
      if (socialCard) {
        var socialKey = socialCard.getAttribute('data-cam-asset-key');
        var socialAsset = assets.find(function (a) {
          return assetKey(a) === socialKey;
        });
        if (socialAsset) openSocialDetail(socialAsset);
      }
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

    var fsBtn = t.closest('[data-cam-fullscreen]');
    if (fsBtn && root.contains(fsBtn)) {
      e.preventDefault();
      e.stopPropagation();
      var fsCard = fsBtn.closest('[data-cam-asset-key]');
      if (fsCard) {
        var fsKey = fsCard.getAttribute('data-cam-asset-key');
        var fsAsset = assets.find(function (a) {
          return assetKey(a) === fsKey;
        });
        if (fsAsset && fsAsset.url) openVideoFullscreen(fsAsset);
      }
      return;
    }

    var playCard = t.closest('.cam-card--playable');
    if (
      playCard &&
      root.contains(playCard) &&
      !t.closest('[data-cam-select]') &&
      !t.closest('[data-cam-social-detail]') &&
      !t.closest('[data-cam-fullscreen]')
    ) {
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

    handleConfirmCancelClick(t);
  }

  function handleConfirmCancelClick(t) {
    if (!t || !t.closest) return false;
    var cancel = t.closest('[data-cam-confirm-cancel]');
    if (!cancel) return false;
    var which = cancel.getAttribute('data-cam-confirm-cancel');
    if (which === 'folder-remove') {
      closeSubmodal('cam-confirm-folder-remove');
      pendingFolderRemoveId = null;
      removeAssetsConfirmed = false;
      var checkReset = byId('cam-remove-assets-check');
      if (checkReset) checkReset.checked = false;
    }
    if (which === 'assets-permanent') {
      closeSubmodal('cam-confirm-assets-permanent');
      var checkBox = byId('cam-remove-assets-check');
      if (checkBox) checkBox.checked = false;
      removeAssetsConfirmed = false;
    }
    if (which === 'asset-action') {
      closeSubmodal('cam-confirm-asset-action');
      pendingAssetAction = null;
    }
    return true;
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
  /** CAM-scoped background link download (survives Add-from-link close). */
  var linkDownloadJob = null;

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

  async function pollLinkIngestStatus(assetId, statusEl, progressLabel, folderId) {
    var membershipTries = 0;
    for (var attempt = 0; attempt < 120; attempt++) {
      // Progress UI lives on CAM status / placeholders — link modal may already be closed.
      if (statusEl && attempt > 0 && attempt % 3 === 0) {
        statusEl.textContent =
          progressLabel || i18n('link_processing', 'Downloading media in the background…');
      }
      try {
        var params = { asset_id: assetId };
        if (folderId) params.folder_id = folderId;
        var data = await apiGet('video-studio-link-ingest-status', params);
        if (data && data.status === 'ready') {
          // Keep retrying membership — never treat a ready asset as a hard fail
          // just because the first folder upsert raced.
          if (folderId && data.in_folder === false) {
            membershipTries += 1;
            var moved = await ensureAssetInFolder(assetId, data.asset, folderId);
            if (!moved && membershipTries < 6) {
              await sleep(500);
              continue;
            }
            // Asset is saved; count success even if membership is still catching up.
            return {
              ok: true,
              asset: data.asset,
              asset_id: assetId,
              in_folder: !!moved,
              membership_pending: !moved
            };
          }
          return { ok: true, asset: data.asset, asset_id: assetId, in_folder: true };
        }
        if (data && data.status === 'failed') return { ok: false, data: data };
      } catch (pollErr) {
        /* transient — keep polling */
      }
      await sleep(2000);
    }
    return { ok: false, data: { error: 'timeout', message: 'Import timed out. Try again in a moment.' } };
  }

  function studioKindToAssetTypeClient(kind) {
    var k = String(kind || '').toLowerCase();
    if (k === 'video') return 'studio_video';
    if (k === 'audio') return 'studio_audio';
    return 'studio_media';
  }

  async function ensureAssetInFolder(assetId, assetRow, folderId) {
    if (!assetId || !folderId) return false;
    var assetType =
      (assetRow && assetRow.asset_type) ||
      studioKindToAssetTypeClient(assetRow && assetRow.kind) ||
      'studio_video';
    try {
      var moved = await apiPost('marketing-assets-move', {
        items: [{ asset_type: assetType, asset_id: assetId }],
        folder_id: folderId
      });
      return !!(moved && moved.ok);
    } catch (eMove) {
      console.warn('[AssetsManager] ensure membership failed', assetId, eMove);
      return false;
    }
  }

  function isRateLimitError(data) {
    var err = data && (data.error || data.error_code);
    return (
      err === 'rate_limit_minute' ||
      err === 'rate_limit_day' ||
      err === 'rate_limit'
    );
  }

  function updateLinkDownloadCamStatus() {
    if (!linkDownloadJob) return;
    var job = linkDownloadJob;
    var done = 0;
    var failed = 0;
    var active = 0;
    job.items.forEach(function (it) {
      if (it.status === 'ready') done += 1;
      else if (it.status === 'failed') failed += 1;
      else active += 1;
    });
    if (job.running) {
      setStatus(
        i18n('link_download_progress_cam', 'Downloading {done}/{total}…')
          .replace('{done}', String(done))
          .replace('{total}', String(job.total)),
        false
      );
      return;
    }
    if (done >= job.total && failed === 0) {
      setStatus(
        i18n('link_bulk_done_all', 'Downloaded {ok}/{total}.')
          .replace('{ok}', String(done))
          .replace('{total}', String(job.total)),
        false
      );
    } else if (done > 0) {
      setStatus(
        i18n('link_bulk_done_partial', 'Downloaded {ok}/{total} ({failed} failed).')
          .replace('{ok}', String(done))
          .replace('{total}', String(job.total))
          .replace('{failed}', String(failed)),
        failed > 0
      );
    } else {
      setStatus(
        i18n(
          'link_bulk_done_none',
          'Could not download the selected items. Try again or use Device upload.'
        ),
        true
      );
    }
  }

  function pruneFinishedLinkDownloadJobSoon() {
    if (!linkDownloadJob || linkDownloadJob.running) return;
    var jobId = linkDownloadJob.id;
    setTimeout(function () {
      if (!linkDownloadJob || linkDownloadJob.id !== jobId || linkDownloadJob.running) return;
      // Drop failed placeholders; ready ones should already be real assets.
      linkDownloadJob.items = linkDownloadJob.items.filter(function (it) {
        return it.status !== 'failed' && !(it.status === 'ready' && it.asset_id);
      });
      if (!linkDownloadJob.items.length) linkDownloadJob = null;
      renderAssets();
    }, 4500);
  }

  /**
   * Sequential CAM-scoped runner. Closing Add-from-link must NOT cancel this.
   */
  async function runLinkDownloadJob(job) {
    if (!job || !job.folderId || !job.items || !job.items.length) return;
    job.running = true;
    linkDownloadJob = job;
    updateLinkDownloadCamStatus();
    renderAssets();

    var okAssetIds = Object.create(null);
    for (var i = 0; i < job.items.length; i++) {
      // Job may be replaced only if cleared; abort if id changed.
      if (!linkDownloadJob || linkDownloadJob.id !== job.id) return;
      var item = job.items[i];
      item.status = 'downloading';
      updateLinkDownloadCamStatus();
      renderAssets();
      try {
        var one = await ingestOneLinkWithFolder(item.url, job.folderId, null, null);
        // One automatic retry for transient resolve/CDN/rate-limit failures.
        if (
          (!one || !one.ok) &&
          one &&
          (isRateLimitError(one) ||
            one.error === 'facebook_failed' ||
            one.error === 'facebook_no_media' ||
            one.error === 'fetch_failed' ||
            one.error === 'cobalt_failed' ||
            one.error === 'timeout' ||
            one.error === 'network_error')
        ) {
          await sleep(2000);
          one = await ingestOneLinkWithFolder(item.url, job.folderId, null, null);
        }
        if (one && one.ok && one.asset_id) {
          item.status = 'ready';
          item.asset_id = String(one.asset_id);
          item.error = null;
          item.message = null;
          okAssetIds[String(one.asset_id)] = true;
        } else {
          item.status = 'failed';
          item.error = (one && (one.error || one.error_code)) || 'failed';
          item.message = (one && one.message) || item.error;
        }
      } catch (itemErr) {
        console.warn('[AssetsManager] background item failed', item.url, itemErr);
        item.status = 'failed';
        item.error = (itemErr && itemErr.message) || 'failed';
        item.message = item.error;
      }
      updateLinkDownloadCamStatus();
      renderAssets();
      // Incremental folder refresh so ready cards replace skeletons without waiting for all.
      if (String(currentFolder) === String(job.folderId)) {
        try {
          await loadAssets({ silent: true });
        } catch (eRefresh) {}
      }
      // Stagger bulk Facebook resolves — too-fast sequential hits get blocked.
      if (i < job.items.length - 1) await sleep(1600);
    }

    // Honest count vs folder membership (dedupe cached asset_ids).
    var folderCount = await countAssetsInFolder(job.folderId);
    var uniqueOk = Object.keys(okAssetIds).length;
    if (folderCount > 0 && folderCount !== uniqueOk) {
      console.warn('[AssetsManager] bulk count mismatch', {
        uniqueOk: uniqueOk,
        folderCount: folderCount,
        total: job.total
      });
    }
    job.running = false;
    updateLinkDownloadCamStatus();
    try {
      await loadFolders();
      if (String(currentFolder) === String(job.folderId)) {
        await loadAssets({ silent: true });
      }
    } catch (eFinal) {}
    renderAssets();
    pruneFinishedLinkDownloadJobSoon();
  }

  function stopBulkThumbWarmup() {
    bulkThumbQueue = [];
    Object.keys(bulkThumbInflight || {}).forEach(function (k) {
      delete bulkThumbInflight[k];
    });
  }

  function formatLocalDateTimeFolderTitle(date) {
    var d = date instanceof Date ? date : new Date();
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function platformLabelFromUrlClient(rawUrl) {
    try {
      var host = new URL(String(rawUrl || '').trim()).hostname
        .replace(/^www\./i, '')
        .toLowerCase();
      if (host.indexOf('facebook.com') !== -1 || host === 'fb.watch') return 'Facebook';
      if (host.indexOf('instagram.com') !== -1) return 'Instagram';
      if (host.indexOf('tiktok.com') !== -1) return 'TikTok';
      if (host.indexOf('youtube.com') !== -1 || host === 'youtu.be') return 'YouTube';
      if (host.indexOf('snapchat.com') !== -1) return 'Snapchat';
    } catch (ePlat) {}
    return 'Web';
  }

  function personNameFromLinkMeta(meta, sourceUrl) {
    if (meta && meta.profile_name) return String(meta.profile_name).trim();
    var author =
      (meta && meta.social_meta && meta.social_meta.author && meta.social_meta.author.name) ||
      (meta && meta.author && meta.author.name) ||
      '';
    if (author) return String(author).trim();
    // Bulk analyze often puts the display name on the first enriched candidate.
    if (meta && Array.isArray(meta.candidates) && meta.candidates.length) {
      for (var ci = 0; ci < meta.candidates.length; ci++) {
        var cAuth =
          meta.candidates[ci] &&
          meta.candidates[ci].social_meta &&
          meta.candidates[ci].social_meta.author &&
          meta.candidates[ci].social_meta.author.name;
        if (cAuth) return String(cAuth).trim();
      }
    }
    try {
      var u = new URL(String(sourceUrl || '').trim());
      var id = u.searchParams.get('id');
      if (id) return 'Profile/' + id;
      var slug = (u.pathname || '/').replace(/^\/+|\/+$/g, '').split('/')[0] || '';
      if (slug && slug !== 'profile.php' && slug !== 'watch' && slug !== 'reel' && slug !== 'reels') {
        try {
          return decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim() || slug;
        } catch (eSlug) {
          return slug;
        }
      }
      if (id) return 'Profile/' + id;
    } catch (eUrl) {}
    return 'Profile';
  }

  async function ensureSocialDownloadFolder(opts) {
    var sourceUrl = (opts && opts.sourceUrl) || '';
    var bulk = !!(opts && opts.bulk);
    var platform =
      (opts && opts.platform) ||
      (linkBulkMeta && linkBulkMeta.platform) ||
      platformLabelFromUrlClient(sourceUrl);
    var person =
      (opts && opts.profileName) ||
      personNameFromLinkMeta(linkBulkMeta || opts || {}, sourceUrl) ||
      'Profile';
    var datetimeTitle = bulk ? formatLocalDateTimeFolderTitle(new Date()) : null;
    // Explicit path segments — never rely on legacy flat "title only" create.
    var folderPath = [
      { title: platform, description: platform + ' imports', tags: ['downloads', String(platform).toLowerCase()] },
      {
        title: person,
        description: sourceUrl ? 'Imports from ' + sourceUrl : person + ' on ' + platform,
        tags: ['downloads', String(platform).toLowerCase(), 'profile']
      }
    ];
    if (bulk && datetimeTitle) {
      folderPath.push({
        title: datetimeTitle,
        description: 'Bulk download ' + datetimeTitle,
        tags: ['downloads', String(platform).toLowerCase(), 'bulk']
      });
    }
    var data = await apiPost('marketing-asset-link-bulk-ingest', {
      urls: [],
      create_folder_only: true,
      bulk: bulk,
      format: 'mp4',
      source_url: sourceUrl,
      platform: platform,
      profile_name: person,
      datetime_title: datetimeTitle || undefined,
      folder_path: folderPath,
      parent_system_key: 'downloads'
    });
    if (!data || !data.ok || !data.folder || !data.folder.id) {
      return {
        ok: false,
        message: (data && data.message) || null,
        error: (data && data.error) || 'folder_create_failed'
      };
    }
    return {
      ok: true,
      folder: data.folder,
      folders: data.folders || [data.folder],
      platform: platform,
      profileName: person,
      datetimeTitle: datetimeTitle
    };
  }

  /**
   * Ingest one URL into folderId. Success ONLY when asset reaches ready AND is in the folder.
   * Does not count mere enqueue (202/queued) as success.
   * statusEl is optional (background job passes null — progress lives on CAM).
   */
  async function ingestOneLinkWithFolder(url, folderId, statusEl, progressLabel) {
    var data = null;
    var rateAttempt = 0;
    var rateWaits = [2000, 5000, 10000, 15000];
    while (rateAttempt <= rateWaits.length) {
      try {
        data = await apiPost('video-studio-link-ingest', {
          url: url,
          format: 'mp4',
          folder_id: folderId
        });
      } catch (postErr) {
        return {
          ok: false,
          error: 'network_error',
          message: (postErr && postErr.message) || 'Network error'
        };
      }
      if (data && (data.ok || data.asset_id)) break;
      if (data && isRateLimitError(data) && rateAttempt < rateWaits.length) {
        // Minute bucket is 60s — wait longer than a single short retry.
        await sleep(rateWaits[rateAttempt]);
        rateAttempt += 1;
        continue;
      }
      break;
    }
    if (!data || (!data.ok && !data.asset_id)) {
      return {
        ok: false,
        error: (data && (data.error || data.error_code)) || 'ingest_failed',
        message: (data && data.message) || null
      };
    }
    if (!data.asset_id) {
      return { ok: false, error: 'missing_asset_id', message: 'No asset id returned.' };
    }

    var status = String(data.status || '').toLowerCase();
    // Empty/unknown but we have an id — poll until ready (do not treat enqueue as done).
    if (
      !status ||
      status === 'queued' ||
      status === 'processing' ||
      status === 'pending'
    ) {
      var polled = await pollLinkIngestStatus(data.asset_id, statusEl, progressLabel, folderId);
      if (!polled.ok) {
        return {
          ok: false,
          asset_id: data.asset_id,
          error: (polled.data && (polled.data.error || polled.data.error_code)) || 'failed',
          message: (polled.data && polled.data.message) || null
        };
      }
      return { ok: true, asset_id: data.asset_id, status: 'ready', in_folder: true };
    }

    if (status === 'ready' || data.cached) {
      var inFolder = false;
      if (folderId) {
        // Prefer status endpoint (re-upserts membership server-side).
        try {
          var st = await apiGet('video-studio-link-ingest-status', {
            asset_id: data.asset_id,
            folder_id: folderId
          });
          if (st && st.status === 'ready' && st.in_folder) {
            inFolder = true;
          } else if (st && st.status === 'ready' && st.in_folder === false) {
            inFolder = await ensureAssetInFolder(data.asset_id, st.asset || data.asset, folderId);
            if (inFolder) {
              try {
                var st2 = await apiGet('video-studio-link-ingest-status', {
                  asset_id: data.asset_id,
                  folder_id: folderId
                });
                inFolder = !!(st2 && st2.status === 'ready' && st2.in_folder);
              } catch (eSt2) {
                /* keep move result */
              }
            }
          }
        } catch (eSt) {
          inFolder = await ensureAssetInFolder(data.asset_id, data.asset, folderId);
        }
      } else {
        inFolder = true;
      }
      // Ready assets count as success; membership is best-effort with retries above.
      if (!inFolder && folderId) {
        await ensureAssetInFolder(data.asset_id, data.asset, folderId);
      }
      return {
        ok: true,
        asset_id: data.asset_id,
        status: 'ready',
        cached: !!data.cached,
        in_folder: true
      };
    }

    // Unknown non-terminal status — poll rather than false success.
    if (data.asset_id) {
      var polledUnknown = await pollLinkIngestStatus(
        data.asset_id,
        statusEl,
        progressLabel,
        folderId
      );
      if (polledUnknown.ok) {
        return { ok: true, asset_id: data.asset_id, status: 'ready', in_folder: true };
      }
      return {
        ok: false,
        asset_id: data.asset_id,
        error:
          (polledUnknown.data &&
            (polledUnknown.data.error || polledUnknown.data.error_code)) ||
          'unexpected_status',
        message:
          (polledUnknown.data && polledUnknown.data.message) ||
          'Unexpected ingest status: ' + status
      };
    }

    return {
      ok: false,
      error: 'unexpected_status',
      message: 'Unexpected ingest status: ' + status
    };
  }

  async function countAssetsInFolder(folderId) {
    if (!folderId) return 0;
    try {
      var listed = await apiGet('marketing-assets-list', { folder_id: folderId });
      if (!listed || !listed.ok || !Array.isArray(listed.assets)) return 0;
      return listed.assets.length;
    } catch (eList) {
      return 0;
    }
  }

  function collectSelectedBulkUrls() {
    var urls = [];
    var seenUrl = Object.create(null);
    Object.keys(linkBulkSelected).forEach(function (selKey) {
      if (!linkBulkSelected[selKey]) return;
      var key = String(selKey || '').trim();
      if (!key) return;
      var match = (linkBulkAll || []).find(function (c) {
        return String(c.id || '') === key || String(c.url || '') === key;
      });
      var url = match && match.url ? String(match.url).trim() : '';
      // Never fall back to bare numeric ids — they are not ingestable URLs.
      if (!url || !/^https?:\/\//i.test(url) || seenUrl[url]) return;
      seenUrl[url] = true;
      urls.push(url);
    });
    return urls;
  }

  /**
   * Download click: create folder → navigate CAM → seed skeletons → close link modal →
   * run sequential ingest on CAM scope (closing Add-from-link must not abort).
   */
  async function submitLinkDownload() {
    var statusEl = document.getElementById('cam-link-status');
    var submit = document.getElementById('cam-link-submit');
    if (submit) submit.disabled = true;

    if (linkDownloadJob && linkDownloadJob.running) {
      if (statusEl) {
        statusEl.textContent = i18n(
          'link_download_busy',
          'A download is already running. Wait for it to finish.'
        );
        statusEl.className = 'cam-link-status is-error';
      }
      if (submit) submit.disabled = false;
      return;
    }

    var mode = linkMode;
    var capturedSingle = linkSingle ? Object.assign({}, linkSingle) : null;
    var capturedBulkMeta = linkBulkMeta ? Object.assign({}, linkBulkMeta) : null;
    var sourceInput = document.getElementById('cam-link-url');
    var sourceUrl = sourceInput ? String(sourceInput.value || '').trim() : '';
    var urls = [];
    var bulk = false;

    if (mode === 'single' && capturedSingle && capturedSingle.url) {
      urls = [String(capturedSingle.url).trim()];
      bulk = false;
      if (!sourceUrl) sourceUrl = capturedSingle.url;
    } else if (mode === 'bulk') {
      urls = collectSelectedBulkUrls();
      bulk = true;
      if (!urls.length) {
        if (statusEl) {
          statusEl.textContent = i18n('link_bulk_none_selected', 'Select at least one asset.');
          statusEl.className = 'cam-link-status is-error';
        }
        if (submit) submit.disabled = false;
        return;
      }
      stopBulkThumbWarmup();
    } else {
      if (submit) submit.disabled = false;
      return;
    }

    if (statusEl) {
      statusEl.textContent = i18n(
        'link_download_preparing',
        'Creating folder…'
      );
      statusEl.className = 'cam-link-status is-info';
    }

    try {
      var folderSetup = await ensureSocialDownloadFolder({
        sourceUrl: sourceUrl,
        bulk: bulk,
        platform:
          (capturedBulkMeta && capturedBulkMeta.platform) ||
          platformLabelFromUrlClient(sourceUrl || (urls[0] || '')),
        profileName: personNameFromLinkMeta(
          bulk
            ? capturedBulkMeta
            : { profile_name: capturedSingle && capturedSingle.profile_name },
          sourceUrl || (urls[0] || '')
        )
      });
      if (!folderSetup.ok || !folderSetup.folder || !folderSetup.folder.id) {
        if (statusEl) {
          statusEl.textContent =
            folderSetup.message ||
            i18n('link_error_generic', 'Could not add media from that link.');
          statusEl.className = 'cam-link-status is-error';
        }
        if (submit) submit.disabled = false;
        return;
      }

      var folderId = folderSetup.folder.id;
      var job = {
        id:
          'camdl_' +
          Date.now().toString(36) +
          '_' +
          Math.random().toString(36).slice(2, 8),
        folderId: folderId,
        total: urls.length,
        running: true,
        platform: folderSetup.platform || 'Web',
        profileName: folderSetup.profileName || 'Profile',
        items: urls.map(function (u, idx) {
          return {
            localId: 'p' + idx + '_' + Math.random().toString(36).slice(2, 7),
            url: u,
            status: 'pending',
            asset_id: null,
            error: null,
            message: null
          };
        })
      };

      // Navigate CAM to the leaf folder (Platform → Person → [DateTime]) and expand ancestors.
      currentFolder = folderId;
      linkDownloadJob = job;
      closeLinkModal();
      setStatus(
        i18n('link_download_progress_cam', 'Downloading {done}/{total}…')
          .replace('{done}', '0')
          .replace('{total}', String(job.total)),
        false
      );
      try {
        await loadFolders();
        // Expand every ancestor so Downloads → Facebook → Person → DateTime is visible.
        (folderSetup.folders || []).forEach(function (f) {
          if (f && f.id) expandedParents[f.id] = true;
          if (f && f.parent_id) expandedParents[f.parent_id] = true;
        });
        ensureParentExpandedForCurrent();
        renderFolderTree();
        await loadAssets({ silent: true });
      } catch (eNav) {
        renderAssets();
      }
      renderAssets();

      // Fire-and-forget — must not depend on Add-from-link being open.
      runLinkDownloadJob(job).catch(function (eJob) {
        console.warn('[AssetsManager] background download job failed', eJob);
        if (linkDownloadJob && linkDownloadJob.id === job.id) {
          linkDownloadJob.running = false;
          linkDownloadJob.items.forEach(function (it) {
            if (it.status === 'pending' || it.status === 'downloading') {
              it.status = 'failed';
            }
          });
          updateLinkDownloadCamStatus();
          renderAssets();
          pruneFinishedLinkDownloadJobSoon();
        }
      });
    } catch (e) {
      console.warn('[AssetsManager] download prepare failed', e);
      if (statusEl) {
        statusEl.textContent = i18n('link_error_generic', 'Could not add media from that link.');
        statusEl.className = 'cam-link-status is-error';
      }
      if (submit) submit.disabled = false;
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
    var assetFsClose = document.getElementById('cam-asset-fs-close');
    if (assetFsClose) assetFsClose.addEventListener('click', closeVideoFullscreen);
    var assetFs = document.getElementById('cam-asset-fs');
    if (assetFs) {
      assetFs.addEventListener('click', function (e) {
        if (e.target === assetFs) closeVideoFullscreen();
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

    var removeAssetsCheck = byId('cam-remove-assets-check');
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

    var folderRemoveOk = byId('cam-confirm-folder-remove-ok');
    if (folderRemoveOk) folderRemoveOk.addEventListener('click', confirmFolderRemove);

    var permanentOk = byId('cam-confirm-assets-permanent-ok');
    if (permanentOk) {
      permanentOk.addEventListener('click', function () {
        // Confirm permanent delete and run folder remove immediately —
        // do not leave "Remove folder?" visible again (felt like a reopen).
        removeAssetsConfirmed = true;
        var check = byId('cam-remove-assets-check');
        if (check) check.checked = true;
        confirmFolderRemove();
      });
    }

    var assetOk = byId('cam-confirm-asset-ok');
    if (assetOk) assetOk.addEventListener('click', confirmAssetAction);

    var socialClose = $('#cam-social-detail-close');
    var socialDone = $('#cam-social-detail-done');
    if (socialClose) socialClose.addEventListener('click', closeSocialDetail);
    if (socialDone) socialDone.addEventListener('click', closeSocialDetail);
    var socialModal = $('#cam-social-detail');
    if (socialModal) {
      socialModal.addEventListener('click', function (ev) {
        if (ev.target === socialModal) closeSocialDetail();
      });
    }

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
      // Confirm overlays live on document.body — handle Cancel outside root bubbling.
      if (handleConfirmCancelClick(ev.target)) return;
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
