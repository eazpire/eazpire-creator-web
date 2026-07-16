/**
 * Creator Automations — main tabs, design generator status tabs, list + modal.
 */
(function () {
  'use strict';

  /**
   * When the design-automation UI is open as a native <dialog>, sibling nodes on document.body
   * stay beneath the dialog top layer. Reparent dependent modals into the open automation subtree.
   */
  window.eazCreatorAutomationLayerHost = function () {
    var ref = document.getElementById('autoRefImageOverlay');
    if (ref && ref.open) return ref;
    var ped = document.getElementById('creatorAutoPromptEditDlg');
    if (ped && ped.open) return ped;
    var main = document.getElementById('creatorAutomationsModal');
    if (main && main.open) return main;
    return null;
  };

  window.eazReparentIntoCreatorAutomationLayer = function (el) {
    if (!el || !el.parentNode) return function () {};
    var host =
      typeof window.eazCreatorAutomationLayerHost === 'function'
        ? window.eazCreatorAutomationLayerHost()
        : null;
    if (!host) return function () {};
    var prevParent = el.parentNode;
    var nextSib = el.nextSibling;
    host.appendChild(el);
    return function () {
      try {
        if (nextSib && nextSib.parentNode === prevParent) {
          prevParent.insertBefore(el, nextSib);
        } else {
          prevParent.appendChild(el);
        }
      } catch (e) {
        try {
          document.body.appendChild(el);
        } catch (e2) {}
      }
    };
  };

  var I = function () {
    return (window.CreatorI18n && window.CreatorI18n.automations) || {};
  };

  function ownerId() {
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID);
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId);
    var dbg = document.querySelector('[data-debug-owner]');
    if (dbg && dbg.dataset && dbg.dataset.debugOwner) {
      try {
        var p = JSON.parse(dbg.dataset.debugOwner);
        if (p) return String(p);
      } catch (_e) {}
    }
    return '';
  }

  function apiBase() {
    return (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || 'https://creator-engine.eazpire.workers.dev';
  }

  function getOp(op, params) {
    if (typeof window.creatorApiFetch === 'function') {
      return window.creatorApiFetch(op, params || {});
    }
    var url = new URL(apiBase() + '/apps/creator-dispatch');
    url.searchParams.set('op', op);
    url.searchParams.set('_t', String(Date.now()));
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== '') url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { credentials: 'include', cache: 'no-store' }).then(function (r) {
      return r.json();
    });
  }

  function postJsonOp(op, body) {
    var payload = Object.assign({}, body || {});
    if (typeof window.creatorApiFetch === 'function') {
      return window
        .creatorApiFetch(
          op,
          {},
          {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        )
        .catch(function (err) {
          if (err && err.body && typeof err.body === 'object') return err.body;
          throw err;
        });
    }
    var base = String(apiBase() || '').replace(/\/+$/, '') || 'https://creator-engine.eazpire.workers.dev';
    var url = new URL(base + '/apps/creator-dispatch');
    url.searchParams.set('op', op);
    url.searchParams.set('_t', String(Date.now()));
    return fetch(url.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json();
    });
  }

  var currentMainTab = 'design-generator';
  var currentStatusFilter = 'active';
  var loading = false;

  function isAutomationsMobileSlideVisible() {
    var vp = document.getElementById('creatorMobileSwipeViewport');
    return !!(vp && vp.classList.contains('slide-4'));
  }

  function isAutomationsDesktopPanelVisible() {
    var panel = document.querySelector('[data-desktop-screen="automations"]');
    if (!panel) return false;
    if (panel.hidden) return false;
    return panel.classList.contains('is-active');
  }

  function isAutomationsShellVisible() {
    return isAutomationsMobileSlideVisible() || isAutomationsDesktopPanelVisible();
  }

  function setAutomationsGridLoadingUi(visible) {
    var wrap = document.querySelector('.creator-automations-list-wrap');
    var el = document.getElementById('creatorAutomationsGridLoading');
    var grid = document.getElementById('creatorAutomationsGrid');
    if (!el) return;
    if (visible) {
      el.hidden = false;
      el.setAttribute('aria-busy', 'true');
      if (wrap) wrap.classList.add('creator-automations-list-wrap--loading');
      if (grid) grid.setAttribute('aria-busy', 'true');
    } else {
      el.hidden = true;
      el.setAttribute('aria-busy', 'false');
      if (wrap) wrap.classList.remove('creator-automations-list-wrap--loading');
      if (grid) grid.removeAttribute('aria-busy');
    }
  }

  var MAX_AUTO_PROMPTS = 10;
  var MAX_AUTO_REFS = 5;
  var autoPrompts = [];
  var autoRefImages = [];
  /** Multi-select pools; each cron run samples randomly from these arrays (see generator_pool_json). */
  var automationGenPool = {
    ratios: [],
    content_types: [],
    design_types: [],
    target_products: [],
    styles: [],
    languages: [],
    color_presets: [],
    reference_strengths: []
  };
  var automationGenPoolBound = false;
  var editingPromptIndex = -1;
  var automationExtrasBound = false;
  var overviewAutomationId = null;
  var editAutomationContext = null;

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTs(ms) {
    var n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '—';
    try {
      return new Date(n).toLocaleString();
    } catch (_e) {
      return '—';
    }
  }

  function isDesktopAutomationsSheet() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 992px)').matches;
  }

  /**
   * Desktop bottom-sheet: CSS keeps [open] panels off-screen until --animate-in (see creator-automations.css).
   * Must match openModal/closeModal for creatorAutomationsModal.
   */
  function openAutomationsSheetDialog(dlg) {
    if (!dlg) return;
    dlg.classList.remove('creator-automations-modal--animate-in');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    if (isDesktopAutomationsSheet()) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          dlg.classList.add('creator-automations-modal--animate-in');
        });
      });
    }
  }

  function closeAutomationsSheetDialog(dlg) {
    if (!dlg || typeof dlg.close !== 'function' || !dlg.open) return;
    dlg.classList.remove('creator-automations-modal--edit-fullscreen');
    if (isDesktopAutomationsSheet() && dlg.classList.contains('creator-automations-modal--animate-in')) {
      dlg.classList.remove('creator-automations-modal--animate-in');
      var finished = false;
      var done = function () {
        if (finished) return;
        finished = true;
        if (dlg.open) dlg.close();
      };
      dlg.addEventListener(
        'transitionend',
        function onTe(ev) {
          if (ev.propertyName !== 'transform') return;
          dlg.removeEventListener('transitionend', onTe);
          done();
        }
      );
      window.setTimeout(done, 450);
    } else {
      dlg.classList.remove('creator-automations-modal--animate-in');
      dlg.close();
    }
  }

  function bumpHeader() {
    var headerTitle = document.querySelector('.creator-header__title');
    if (headerTitle && typeof window.__creatorGoTo === 'function') {
      var vp = document.getElementById('creatorMobileSwipeViewport');
      if (vp && vp.classList.contains('slide-4')) {
        headerTitle.textContent = getHeaderTitle();
      }
    }
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }
  }

  function setMainPanelHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle('creator-automations-panel--hidden', hidden);
    if (hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  function switchMainTab(tab) {
    currentMainTab = tab || 'design-generator';
    var root = document.getElementById('creatorAutomations');
    if (root) root.setAttribute('data-automations-maintab', currentMainTab);

    document.querySelectorAll('.creator-automations-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.maintab === currentMainTab);
    });

    var pDesign = document.getElementById('creatorAutomationsPanelDesign');
    var pPub = document.getElementById('creatorAutomationsPanelPublish');
    var pMar = document.getElementById('creatorAutomationsPanelMarketing');
    setMainPanelHidden(pDesign, currentMainTab !== 'design-generator');
    setMainPanelHidden(pPub, currentMainTab !== 'publish');
    setMainPanelHidden(pMar, currentMainTab !== 'marketing');

    if (currentMainTab !== 'design-generator') {
      setAutomationsGridLoadingUi(false);
    }

    if (currentMainTab === 'design-generator') {
      loadList();
    }
    bumpHeader();
  }

  function switchStatusFilter(filter) {
    currentStatusFilter = filter || 'active';
    document.querySelectorAll('.creator-automations-status-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.statusfilter === currentStatusFilter);
    });
    loadList();
    bumpHeader();
  }

  function getHeaderTitle() {
    var loc = I();
    if (currentMainTab === 'publish') return loc.tab_publish || 'Publish';
    if (currentMainTab === 'marketing') return loc.tab_marketing || 'Marketing';
    if (currentStatusFilter === 'scheduled') return loc.status_scheduled || 'Scheduled';
    if (currentStatusFilter === 'expired') return loc.status_expired || 'Expired';
    return loc.status_active || 'Active';
  }

  function renderList(automations) {
    var grid = document.getElementById('creatorAutomationsGrid');
    var msg = document.getElementById('creatorAutomationsListMsg');
    if (!grid) return;
    var loc = I();
    var parts = [];

    parts.push(
      '<article class="creator-automations-card creator-automations-card--add" type="button" data-automations-add>' +
        '<span class="creator-automations-card-add-icon" aria-hidden="true">+</span>' +
        '<span class="creator-automations-card-add-label">' +
        esc(loc.add_tile || 'Add') +
        '</span>' +
        '</article>'
    );

    var PREVIEW_SLOTS = 4;

    (automations || []).forEach(function (a) {
      var previews = Array.isArray(a.preview_urls) ? a.preview_urls.slice(0, PREVIEW_SLOTS) : [];
      var hasAny = previews.length > 0;
      var cells = '';
      if (hasAny) {
        for (var i = 0; i < PREVIEW_SLOTS; i++) {
          var u = previews[i];
          if (u) {
            cells += '<div class="creator-automations-card-cell"><img src="' + esc(u) + '" alt="" loading="lazy"></div>';
          } else {
            cells += '<div class="creator-automations-card-cell"></div>';
          }
        }
      }
      var aidStr = esc(String(a.id));
      var previewBlock = hasAny
        ? '<div class="creator-automations-card-previews" data-automation-overview="' +
          aidStr +
          '" role="button" tabindex="0">' +
          cells +
          '</div>'
        : '<div class="creator-automations-card-previews" data-automation-overview="' +
          aidStr +
          '" role="button" tabindex="0"><div class="creator-automations-card-placeholder">' +
          esc(loc.no_designs_yet || 'No design generated yet') +
          '</div></div>';

      var showSwitch =
        currentStatusFilter !== 'expired' && (a.status === 'active' || a.status === 'scheduled');
      var paused = !!a.paused;
      var switchRow = showSwitch
        ? '<div class="creator-automations-card-row creator-automations-card-row--switch">' +
          '<span class="creator-automations-switch-label">' +
          esc(loc.active_switch_label || 'Active') +
          '</span>' +
          '<label class="creator-automations-switch">' +
          '<input type="checkbox" class="creator-automations-switch-input" data-automation-paused-toggle="' +
          aidStr +
          '"' +
          (paused ? '' : ' checked') +
          ' aria-label="' +
          esc(loc.active_switch_label || 'Active') +
          '">' +
          '<span class="creator-automations-switch-slider" aria-hidden="true"></span>' +
          '</label></div>'
        : '';

      var titleIsDynamic =
        a.automation_kind === 'interests_dynamic' || a.automation_kind === 'designs_dynamic';
      var titleHtml = titleIsDynamic
        ? '<button type="button" class="creator-automations-card-title-btn" data-edit-automation-id="' +
          aidStr +
          '">' +
          esc(a.title) +
          '</button>'
        : esc(a.title);

      var kindLine = '';
      if (a.automation_kind === 'interests_dynamic') {
        kindLine =
          '<p class="creator-automations-card-kind">' +
          esc(loc.kind_interests_dynamic || 'Interests — dynamic prompts & references') +
          '</p>';
      } else if (a.automation_kind === 'designs_dynamic') {
        kindLine =
          '<p class="creator-automations-card-kind">' +
          esc(loc.kind_designs_dynamic || 'Your designs — similar creative variations') +
          '</p>';
      }

      parts.push(
        '<article class="creator-automations-card" data-automation-id="' +
          esc(String(a.id)) +
          '">' +
          '<div class="creator-automations-card-meta">' +
          '<h3 class="creator-automations-card-title">' +
          titleHtml +
          '</h3>' +
          kindLine +
          '<p class="creator-automations-card-stat">' +
          esc(loc.stat_created || 'Created') +
          ': ' +
          esc(formatTs(a.created_at)) +
          '</p>' +
          '<p class="creator-automations-card-stat">' +
          esc(loc.stat_last_run || 'Last run') +
          ': ' +
          esc(formatTs(a.last_run_at)) +
          '</p>' +
          '<p class="creator-automations-card-stat">' +
          esc(loc.stat_generations || 'Generations') +
          ': ' +
          esc(String(a.total_generations != null ? a.total_generations : 0)) +
          '</p>' +
          '</div>' +
          switchRow +
          previewBlock +
          '</article>'
      );
    });

    grid.innerHTML = parts.join('');

    grid.querySelector('[data-automations-add]') &&
      grid.querySelector('[data-automations-add]').addEventListener('click', openModal);

    grid.querySelectorAll('[data-automation-paused-toggle]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var id = inp.getAttribute('data-automation-paused-toggle');
        if (!id) return;
        var wantPaused = !inp.checked;
        postJsonOp('update-design-automation', { id: Number(id), paused: wantPaused }).then(function (d) {
          if (!d || !d.ok) {
            inp.checked = !wantPaused;
            return;
          }
        });
      });
    });

    grid.querySelectorAll('[data-edit-automation-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-edit-automation-id');
        if (id) openAutomationEditModal(id);
      });
    });

    grid.querySelectorAll('[data-automation-overview]').forEach(function (el) {
      function go() {
        var id = el.getAttribute('data-automation-overview');
        if (id) openAutomationOverviewModal(id);
      }
      el.addEventListener('click', function () {
        go();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });

    if (msg) {
      if (!automations || automations.length === 0) {
        msg.textContent = loc.empty_list || 'No automations.';
        msg.hidden = false;
      } else {
        msg.hidden = true;
      }
    }
  }

  function loadList() {
    var oid = ownerId();
    var grid = document.getElementById('creatorAutomationsGrid');
    var msg = document.getElementById('creatorAutomationsListMsg');
    if (!grid || currentMainTab !== 'design-generator') {
      setAutomationsGridLoadingUi(false);
      return;
    }
    if (!oid) {
      setAutomationsGridLoadingUi(false);
      renderList([]);
      if (msg) {
        msg.textContent = I().login_required || 'Log in';
        msg.hidden = false;
      }
      return;
    }
    if (loading) {
      if (isAutomationsShellVisible()) setAutomationsGridLoadingUi(true);
      return;
    }
    loading = true;
    setAutomationsGridLoadingUi(true);
    if (msg) {
      msg.textContent = '';
      msg.hidden = true;
    }
    postJsonOp('ensure-dynamic-automations', {})
      .catch(function () {})
      .then(function () {
        return getOp('list-design-automations', { owner_id: oid, filter: currentStatusFilter });
      })
      .then(function (d) {
        loading = false;
        setAutomationsGridLoadingUi(false);
        if (!d || !d.ok) {
          if (msg) {
            msg.textContent = I().load_error || 'Error';
            msg.hidden = false;
          }
          renderList([]);
          return;
        }
        renderList(d.automations || []);
      })
      .catch(function () {
        loading = false;
        setAutomationsGridLoadingUi(false);
        if (msg) {
          msg.textContent = I().load_error || 'Error';
          msg.hidden = false;
        }
        renderList([]);
      });
  }

  function endAutomation(id) {
    var oid = ownerId();
    if (!oid) return;
    postJsonOp('end-design-automation', { id: Number(id) }).then(function (d) {
      if (d && d.ok) loadList();
    });
  }

  function renderEditContextHtml(ctx) {
    var loc = I();
    var k = ctx.automation_kind;
    var parts = [];
    parts.push(
      '<p class="creator-automations-edit-hint">' + esc(loc.exclude_hint || 'Checked items are excluded.') + '</p>'
    );
    if (k === 'interests_dynamic' && ctx.interests_sources) {
      var s = ctx.interests_sources;
      function section(title, items, kindAttr) {
        if (!items || !items.length) return;
        parts.push('<p class="creator-automations-edit-section">' + esc(title) + '</p><ul class="creator-automations-exclude-list">');
        items.forEach(function (it) {
          var id = it.id;
          var chk = it.excluded ? ' checked' : '';
          var label = esc(it.label || it.public_url || String(id));
          if (it.preview_url) {
            parts.push(
              '<li class="creator-automations-exclude-row">' +
                '<label class="creator-automations-exclude-tile creator-automations-exclude-tile--compact">' +
                '<span class="creator-automations-exclude-tile__frame">' +
                '<img src="' +
                esc(it.preview_url) +
                '" alt="">' +
                '</span>' +
                '<span class="creator-automations-exclude-tile__bar">' +
                '<input type="checkbox" data-exclude-kind="' +
                kindAttr +
                '" value="' +
                esc(String(id)) +
                '"' +
                chk +
                '>' +
                '<span class="creator-automations-exclude-tile__bar-text">' +
                label +
                '</span></span></label></li>'
            );
          } else {
            parts.push(
              '<li><label><input type="checkbox" data-exclude-kind="' +
                kindAttr +
                '" value="' +
                esc(String(id)) +
                '"' +
                chk +
                '> ' +
                label +
                '</label></li>'
            );
          }
        });
        parts.push('</ul>');
      }
      section(loc.exclude_section_themes || 'Themes', s.themes, 'interest_ids');
      section(loc.exclude_section_styles || 'Styles', s.styles, 'style_ids');
      section(loc.exclude_section_own_uploads || 'Your uploads', s.own_uploads, 'upload_ids');
      section(loc.exclude_section_design_refs || 'Reference designs', s.design_refs, 'design_ref_ids');
      section(loc.exclude_section_upload_refs || 'Reference uploads', s.upload_refs, 'upload_ids');
    }
    if (k === 'designs_dynamic' && ctx.portfolio_creations && ctx.portfolio_creations.length) {
      parts.push(
        '<p class="creator-automations-edit-section">' +
          esc(loc.exclude_section_portfolio || 'Portfolio') +
          '</p><div class="creator-automations-exclude-portfolio">'
      );
      ctx.portfolio_creations.forEach(function (p) {
        var chk = p.excluded ? ' checked' : '';
        parts.push(
          '<label class="creator-automations-exclude-tile">' +
            '<span class="creator-automations-exclude-tile__frame">' +
            '<img src="' +
            esc(p.preview_url || '') +
            '" alt="">' +
            '</span>' +
            '<input type="checkbox" data-exclude-kind="portfolio_creation_ids" value="' +
            esc(String(p.id)) +
            '"' +
            chk +
            ' aria-label="' +
            esc(loc.exclude_hint || 'Exclude') +
            '">' +
            '</label>'
        );
      });
      parts.push('</div>');
    }
    return parts.join('');
  }

  function openAutomationEditModal(automationIdStr) {
    var oid = ownerId();
    if (!oid) return;
    var dlg = document.getElementById('creatorAutomationEditDlg');
    var body = document.getElementById('creatorAutomationEditBody');
    var titleEl = document.getElementById('creatorAutomationEditTitle');
    if (!dlg || !body) return;
    body.innerHTML =
      '<p class="creator-automations-loading">' + esc(I().edit_loading || 'Loading…') + '</p>';
    openAutomationsSheetDialog(dlg);
    getOp('get-design-automation-edit-context', {
      owner_id: oid,
      automation_id: automationIdStr
    }).then(function (ctx) {
      editAutomationContext = ctx;
      if (!ctx || !ctx.ok) {
        body.innerHTML = '<p>' + esc(I().load_error || 'Error') + '</p>';
        return;
      }
      if (titleEl) titleEl.textContent = ctx.title || 'Automation';
      var dynKind =
        ctx.automation_kind === 'interests_dynamic' || ctx.automation_kind === 'designs_dynamic';
      if (dynKind) {
        dlg.classList.add('creator-automations-modal--edit-fullscreen');
      } else {
        dlg.classList.remove('creator-automations-modal--edit-fullscreen');
      }
      body.innerHTML = renderEditContextHtml(ctx);
      var saveBtn = document.getElementById('creatorAutomationEditSave');
      if (saveBtn) {
        saveBtn.onclick = function () {
          var ex = {
            interest_ids: [],
            style_ids: [],
            upload_ids: [],
            design_ref_ids: [],
            portfolio_creation_ids: []
          };
          body.querySelectorAll('input[type="checkbox"][data-exclude-kind]').forEach(function (inp) {
            if (!inp.checked) return;
            var kind = inp.getAttribute('data-exclude-kind');
            var id = Number(inp.value);
            if (!kind || !Number.isFinite(id)) return;
            if (!ex[kind]) ex[kind] = [];
            ex[kind].push(id);
          });
          postJsonOp('update-design-automation', {
            id: Number(ctx.id),
            dynamic_exclusions: ex
          }).then(function (d) {
            if (d && d.ok) {
              closeAutomationsSheetDialog(dlg);
              loadList();
            }
          });
        };
      }
    });
  }

  function setOverviewTabActive(which) {
    var g = document.getElementById('creatorAutomationOverviewTabGen');
    var s = document.getElementById('creatorAutomationOverviewTabSaved');
    if (g) g.classList.toggle('is-active', which === 'generated');
    if (s) s.classList.toggle('is-active', which === 'saved');
  }

  function openAutomationOverviewModal(aid) {
    overviewAutomationId = aid;
    var dlg = document.getElementById('creatorAutomationOverviewDlg');
    var grid = document.getElementById('creatorAutomationOverviewGrid');
    var oid = ownerId();
    if (!dlg || !grid || !oid) return;
    openAutomationsSheetDialog(dlg);
    function loadTab(which) {
      setOverviewTabActive(which);
      grid.innerHTML =
        '<p class="creator-automations-loading">' + esc(I().edit_loading || 'Loading…') + '</p>';
      var tab = which === 'saved' ? 'saved' : 'generated';
      getOp('list-design-automation-designs', {
        owner_id: oid,
        automation_id: aid,
        tab: tab
      }).then(function (d) {
        grid.innerHTML = '';
        if (!d || !d.ok || !d.designs || !d.designs.length) {
          grid.innerHTML =
            '<p class="creator-automations-overview-empty">' + esc(I().empty_list || 'Empty') + '</p>';
          return;
        }
        d.designs.forEach(function (item) {
          var cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'creator-automations-overview-cell';
          var img = document.createElement('img');
          img.src = item.preview_url || '';
          img.alt = '';
          cell.appendChild(img);
          cell.addEventListener('click', function () {
            if (tab === 'generated') {
              var ptext = item.prompt || item.user_prompt || '';
              if (!ptext && item.design_prompt) {
                var dp = String(item.design_prompt);
                var m = dp.toLowerCase().lastIndexOf('user prompt:');
                ptext = m !== -1 ? dp.slice(m + 'user prompt:'.length).trim() : '';
              }
              var titleSlice = String(ptext || '').trim().slice(0, 80) || 'Design';
              if (window.CreatorDesignModal && typeof window.CreatorDesignModal.open === 'function') {
                void window.CreatorDesignModal.open({
                  job_id: item.job_id,
                  preview_url: item.preview_url,
                  image_url: item.image_url || item.preview_url,
                  prompt: ptext || null,
                  owner_id: oid,
                  title: titleSlice,
                  metadata: { automation_overview: 'inactive' }
                }).catch(function () {});
              } else if (
                window.CreatorNotificationCategories &&
                window.CreatorNotificationCategories.generated &&
                typeof window.CreatorNotificationCategories.generated.openPreviewModal === 'function'
              ) {
                window.CreatorNotificationCategories.generated.openPreviewModal(
                  {
                    job_id: item.job_id,
                    preview_url: item.preview_url,
                    image_url: item.image_url || item.preview_url
                  },
                  null
                );
              }
            } else if (window.CreatorDesignModal && typeof window.CreatorDesignModal.open === 'function') {
              void window.CreatorDesignModal.open({
                id: item.id,
                design_id: item.id,
                preview_url: item.preview_url,
                prompt: item.prompt || null,
                owner_id: oid,
                title: String(item.prompt || '').trim().slice(0, 80) || 'Design',
                metadata: { automation_overview: 'active' }
              }).catch(function () {});
            }
          });
          grid.appendChild(cell);
        });
      });
    }
    var gBtn = document.getElementById('creatorAutomationOverviewTabGen');
    var sBtn = document.getElementById('creatorAutomationOverviewTabSaved');
    if (gBtn) {
      gBtn.onclick = function () {
        loadTab('generated');
      };
    }
    if (sBtn) {
      sBtn.onclick = function () {
        loadTab('saved');
      };
    }
    loadTab('generated');
  }

  function defaultModalDates() {
    var start = document.getElementById('creatorAutoStarts');
    var end = document.getElementById('creatorAutoEnds');
    if (!start || !end) return;
    var now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    var s = new Date(now.getTime() + 3600000);
    s.setMinutes(0, 0, 0);
    var e = new Date(s.getTime() + 7 * 86400000);
    start.value = s.toISOString().slice(0, 16);
    end.value = e.toISOString().slice(0, 16);
  }

  function resetAutomationGenPool() {
    automationGenPool = {
      ratios: [],
      content_types: [],
      design_types: [],
      target_products: [],
      styles: [],
      languages: [],
      color_presets: [],
      reference_strengths: []
    };
    syncAutomationGenPoolUI();
  }

  function isAutomationGenPoolEmpty() {
    var p = automationGenPool;
    return (
      !p.ratios.length &&
      !p.content_types.length &&
      !p.design_types.length &&
      !p.target_products.length &&
      !p.styles.length &&
      !p.languages.length &&
      !p.color_presets.length &&
      !p.reference_strengths.length
    );
  }

  function togglePoolValue(arr, val) {
    var i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(val);
  }

  function syncAutomationGenPoolUI() {
    var p = automationGenPool;
    var loc = I();
    document.querySelectorAll('[data-auto-pool-ratio]').forEach(function (btn) {
      var v = btn.getAttribute('data-auto-pool-ratio');
      btn.classList.toggle('is-active', v && p.ratios.indexOf(v) >= 0);
    });
    document.querySelectorAll('[data-auto-pool-content]').forEach(function (btn) {
      var v = btn.getAttribute('data-auto-pool-content');
      btn.classList.toggle('is-active', v && p.content_types.indexOf(v) >= 0);
    });
    document.querySelectorAll('[data-auto-pool-design]').forEach(function (btn) {
      var v = btn.getAttribute('data-auto-pool-design');
      btn.classList.toggle('is-active', v && p.design_types.indexOf(v) >= 0);
    });
    document.querySelectorAll('[data-auto-pool-target]').forEach(function (btn) {
      var v = btn.getAttribute('data-auto-pool-target');
      btn.classList.toggle('is-active', v && p.target_products.indexOf(v) >= 0);
    });
    document.querySelectorAll('[data-auto-pool-refstr]').forEach(function (btn) {
      var v = btn.getAttribute('data-auto-pool-refstr');
      var n = v ? parseInt(v, 10) : NaN;
      btn.classList.toggle('is-active', Number.isFinite(n) && p.reference_strengths.indexOf(n) >= 0);
    });
    var stEl = document.getElementById('creatorAutoPoolStylesSummary');
    if (stEl) {
      stEl.textContent = p.styles.length + ' ' + (loc.pool_styles_selected || 'styles selected');
    }
    var sum = document.getElementById('creatorAutoPoolSummary');
    if (sum) {
      var parts = [];
      if (p.ratios.length) parts.push((loc.pool_summary_ratio || 'Ratio') + ': ' + p.ratios.length);
      if (p.content_types.length) parts.push((loc.pool_summary_content || 'Content') + ': ' + p.content_types.length);
      if (p.design_types.length) parts.push((loc.pool_summary_design || 'Design') + ': ' + p.design_types.length);
      if (p.target_products.length) parts.push((loc.pool_summary_target || 'Product') + ': ' + p.target_products.length);
      if (p.styles.length) parts.push((loc.pool_summary_styles || 'Styles') + ': ' + p.styles.length);
      if (p.languages.length) parts.push((loc.pool_summary_lang || 'Lang') + ': ' + p.languages.length);
      if (p.color_presets.length) parts.push((loc.pool_summary_colors || 'Color presets') + ': ' + p.color_presets.length);
      if (p.reference_strengths.length) {
        parts.push((loc.pool_summary_ref || 'Ref %') + ': ' + p.reference_strengths.join(', '));
      }
      sum.textContent = parts.length ? parts.join(' · ') : loc.pool_summary_empty || '';
    }
  }

  function bindAutomationGenPool() {
    if (automationGenPoolBound) return;
    automationGenPoolBound = true;
    var wrap = document.getElementById('creatorAutomationsGenPool');
    if (!wrap) return;

    wrap.querySelectorAll('[data-auto-pool-ratio]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-auto-pool-ratio');
        if (!v) return;
        togglePoolValue(automationGenPool.ratios, v);
        syncAutomationGenPoolUI();
      });
    });
    wrap.querySelectorAll('[data-auto-pool-content]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-auto-pool-content');
        if (!v) return;
        togglePoolValue(automationGenPool.content_types, v);
        syncAutomationGenPoolUI();
      });
    });
    wrap.querySelectorAll('[data-auto-pool-design]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-auto-pool-design');
        if (!v) return;
        togglePoolValue(automationGenPool.design_types, v);
        syncAutomationGenPoolUI();
      });
    });
    wrap.querySelectorAll('[data-auto-pool-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-auto-pool-target');
        if (!v) return;
        togglePoolValue(automationGenPool.target_products, v);
        syncAutomationGenPoolUI();
      });
    });
    wrap.querySelectorAll('[data-auto-pool-refstr]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-auto-pool-refstr');
        var n = v ? parseInt(v, 10) : NaN;
        if (!Number.isFinite(n)) return;
        togglePoolValue(automationGenPool.reference_strengths, n);
        syncAutomationGenPoolUI();
      });
    });

    var stylesBtn = document.getElementById('creatorAutoPoolStylesBtn');
    if (stylesBtn && window.GenStylesModal && typeof window.GenStylesModal.open === 'function') {
      stylesBtn.addEventListener('click', function () {
        window.GenStylesModal.open({
          selected: automationGenPool.styles.slice(),
          summaryEl: document.getElementById('creatorAutoPoolStylesSummary'),
          onApply: function (arr) {
            automationGenPool.styles = Array.isArray(arr) ? arr.slice() : [];
            syncAutomationGenPoolUI();
          }
        });
      });
    }

    var langBtn = document.getElementById('creatorAutoPoolLangBtn');
    if (langBtn && window.GenLanguageModal && typeof window.GenLanguageModal.open === 'function') {
      langBtn.addEventListener('click', function () {
        window.GenLanguageModal.open({
          mode: 'as-design',
          lang: '',
          langLabel: '',
          dialect: '',
          dialectLabel: '',
          script: '',
          scriptLabel: '',
          summaryEl: null,
          onApply: function (data) {
            if (!data) return;
            automationGenPool.languages.push(data);
            syncAutomationGenPoolUI();
          }
        });
      });
    }

    var colorBtn = document.getElementById('creatorAutoPoolColorBtn');
    if (colorBtn && window.GenColorModal && typeof window.GenColorModal.open === 'function') {
      colorBtn.addEventListener('click', function () {
        window.GenColorModal.open({
          designColors: [],
          backgroundColors: [],
          backgroundTransparent: true,
          summaryEl: null,
          onApply: function (data) {
            if (!data) return;
            automationGenPool.color_presets.push({
              designColors: data.designColors || [],
              backgroundColors: data.backgroundColors || [],
              backgroundTransparent: data.backgroundTransparent !== false
            });
            syncAutomationGenPoolUI();
          }
        });
      });
    }

    var clearBtn = document.getElementById('creatorAutoPoolClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        resetAutomationGenPool();
      });
    }

    syncAutomationGenPoolUI();
  }

  function resetAutomationModalState() {
    autoPrompts = [];
    autoRefImages = [];
    editingPromptIndex = -1;
    window.__automationsRefPickActive = false;
    resetAutomationGenPool();
    var draft = document.getElementById('creatorAutoPromptDraft');
    if (draft) draft.value = '';
    renderAutoPromptGrid();
    renderAutoRefGrid();
    updatePromptsSummary();
  }

  function updatePromptsSummary() {
    var el = document.getElementById('creatorAutoPromptsSummary');
    var loc = I();
    var base = loc.prompts_section || 'Prompts';
    if (el) el.textContent = base + ' (' + autoPrompts.length + ')';
  }

  function renderAutoPromptGrid() {
    var grid = document.getElementById('creatorAutoPromptsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    autoPrompts.forEach(function (text, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'creator-automations-prompt-cell';
      btn.setAttribute('data-prompt-index', String(idx));
      btn.textContent = text;
      grid.appendChild(btn);
    });
    updatePromptsSummary();
  }

  function similarityStepFromValue(sim) {
    var steps = [0.05, 0.2, 0.4, 0.6, 0.8, 1.0];
    var t = typeof sim === 'number' ? sim : 0.8;
    var best = 4;
    var bestD = 2;
    for (var i = 0; i < steps.length; i++) {
      var d = Math.abs(steps[i] - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  var expectReturnToAutoRefOverlay = false;
  var autoFilePickerWatchToken = 0;

  function returnToAutoRefOverlay() {
    expectReturnToAutoRefOverlay = false;
    try {
      window.__eazPendingRefSourceReturn = null;
    } catch (e) {}
    setTimeout(function () {
      openAutoRefOverlay();
    }, 0);
  }

  function makeReturnToAutoRef() {
    return function () {
      returnToAutoRefOverlay();
    };
  }

  function watchAutoFilePickerCancel(fileInput, onCancel) {
    if (!fileInput || typeof onCancel !== 'function') return;
    var token = ++autoFilePickerWatchToken;
    var settled = false;
    function finish(selected) {
      if (settled || token !== autoFilePickerWatchToken) return;
      settled = true;
      fileInput.removeEventListener('change', onChange);
      window.removeEventListener('focus', onWindowFocus);
      if (!selected) onCancel();
    }
    function onChange() {
      finish(!!(fileInput.files && fileInput.files.length > 0));
    }
    function onWindowFocus() {
      setTimeout(function () {
        finish(!!(fileInput.files && fileInput.files.length > 0));
      }, 350);
    }
    fileInput.addEventListener('change', onChange);
    setTimeout(function () {
      window.addEventListener('focus', onWindowFocus);
    }, 0);
  }

  function withSimilarityForImageUrlAuto(imageUrl, done, onCancel) {
    if (!imageUrl) {
      done(null);
      return;
    }
    if (window.ReferenceInfluenceModal && typeof window.ReferenceInfluenceModal.open === 'function') {
      window.ReferenceInfluenceModal.open({
        imageUrl: imageUrl,
        onApply: function (result) {
          expectReturnToAutoRefOverlay = false;
          try {
            window.__eazPendingRefSourceReturn = null;
          } catch (eClr) {}
          if (!result) {
            done(null);
            return;
          }
          var outUrl = result.imageUrl;
          if (!outUrl && result.file) {
            try {
              outUrl = URL.createObjectURL(result.file);
            } catch (eUrl) {}
          }
          done({
            dataUrl: outUrl || imageUrl,
            similarity: typeof result.strength === 'number' ? result.strength : 0.6,
            inspiration_mode: result.inspiration_mode || null,
            elements: result.elements || null,
            include_elements: result.include_elements || null,
            exclude_elements: result.exclude_elements || null
          });
        },
        onCancel: function () {
          var pending =
            typeof window.__eazPendingRefSourceReturn === 'function'
              ? window.__eazPendingRefSourceReturn
              : null;
          try {
            window.__eazPendingRefSourceReturn = null;
          } catch (eP) {}
          if (typeof onCancel === 'function') onCancel();
          else if (pending) pending();
          else if (expectReturnToAutoRefOverlay) returnToAutoRefOverlay();
          done(null);
        }
      });
      return;
    }
    done({ dataUrl: imageUrl, similarity: 0.6 });
  }

  function withSimilarityForFileAuto(file, done, onCancel) {
    if (!file) {
      done(null);
      return;
    }
    if (!(window.ReferenceInfluenceModal && typeof window.ReferenceInfluenceModal.open === 'function')) {
      done({ file: file, similarity: 0.6 });
      return;
    }
    window.ReferenceInfluenceModal.open({
      file: file,
      onApply: function (result) {
        expectReturnToAutoRefOverlay = false;
        try {
          window.__eazPendingRefSourceReturn = null;
        } catch (eClr) {}
        if (!result || !result.file) {
          done(null);
          return;
        }
        done({
          file: result.file,
          similarity: typeof result.strength === 'number' ? result.strength : 0.6,
          inspiration_mode: result.inspiration_mode || null,
          elements: result.elements || null,
          include_elements: result.include_elements || null,
          exclude_elements: result.exclude_elements || null
        });
      },
      onCancel: function () {
        var pending =
          typeof window.__eazPendingRefSourceReturn === 'function'
            ? window.__eazPendingRefSourceReturn
            : null;
        try {
          window.__eazPendingRefSourceReturn = null;
        } catch (eP) {}
        if (typeof onCancel === 'function') onCancel();
        else if (pending) pending();
        else if (expectReturnToAutoRefOverlay) returnToAutoRefOverlay();
        done(null);
      }
    });
  }

  function pushAutoRefItem(item) {
    if (autoRefImages.length >= MAX_AUTO_REFS) return false;
    autoRefImages.push(item);
    renderAutoRefGrid();
    return true;
  }

  function renderAutoRefGrid() {
    var grid = document.getElementById('creatorAutoRefGrid');
    if (!grid) return;
    var drawLabel = (window.CreatorI18n && window.CreatorI18n.generator_draw) || 'Canvas';
    grid.innerHTML = '';
    autoRefImages.forEach(function (item, index) {
      var wrap = document.createElement('div');
      wrap.className = 'creator-automations-ref-item';
      var letter = String.fromCharCode(65 + index);
      wrap.innerHTML =
        '<img class="creator-automations-ref-item__thumb" data-auto-ref-idx="' +
        index +
        '" src="' +
        esc(item.dataUrl) +
        '" alt="' +
        esc(letter) +
        '">' +
        '<button type="button" class="creator-automations-ref-item__draw" data-auto-draw-idx="' +
        index +
        '" aria-label="' +
        esc(drawLabel) +
        '" title="' +
        esc(drawLabel) +
        '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>' +
        '</button>' +
        '<button type="button" class="creator-automations-ref-item__remove" data-auto-remove-idx="' +
        index +
        '" aria-label="Remove">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>' +
        '</button>';
      grid.appendChild(wrap);
    });
  }

  function openAutoRefInfluenceEdit(idx) {
    var item = autoRefImages[idx];
    if (!item || !item.dataUrl) return;
    if (!window.ReferenceInfluenceModal || typeof window.ReferenceInfluenceModal.open !== 'function') return;
    window.ReferenceInfluenceModal.open({
      imageUrl: item.dataUrl,
      initialStrength: typeof item.similarity === 'number' ? item.similarity : 0.6,
      initialMode: item.inspiration_mode || undefined,
      onApply: function (res) {
        if (!res || !res.file) return;
        var reader = new FileReader();
        reader.onload = function () {
          autoRefImages[idx] = {
            file: res.file,
            dataUrl: reader.result,
            similarity: typeof res.strength === 'number' ? res.strength : item.similarity,
            canvasStrokes: item.canvasStrokes,
            inspiration_mode: res.inspiration_mode || null,
            elements: res.elements || null,
            include_elements: res.include_elements || null,
            exclude_elements: res.exclude_elements || null
          };
          renderAutoRefGrid();
        };
        reader.readAsDataURL(res.file);
      }
    });
  }

  function openAutoRefOverlay() {
    var o = document.getElementById('autoRefImageOverlay');
    if (!o) return;
    if (typeof o.showModal === 'function') {
      try {
        o.showModal();
      } catch (e) {
        o.classList.add('is-open');
      }
    } else {
      o.classList.add('is-open');
    }
    o.setAttribute('aria-hidden', 'false');
    if (autoScreenshotBinder) autoScreenshotBinder.refresh();
    if (autoPasteBinder) autoPasteBinder.refresh();
  }

  function closeAutoRefOverlay() {
    var o = document.getElementById('autoRefImageOverlay');
    if (!o) return;
    var focused = o.querySelector(':focus');
    if (focused) focused.blur();
    if (typeof o.close === 'function' && o.open) {
      try {
        o.close();
      } catch (e2) {}
    }
    o.classList.remove('is-open');
    o.setAttribute('aria-hidden', 'true');
  }

  function isAutoRefOverlayOpen() {
    var o = document.getElementById('autoRefImageOverlay');
    if (!o) return false;
    return o.classList.contains('is-open') || !!o.open;
  }

  var autoScreenshotBinder = null;
  var autoPasteBinder = null;

  function triggerAutoFileInput(useCamera) {
    var input = document.getElementById('creatorAutoImageInput');
    if (!input) return;
    input.value = '';
    if (useCamera) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  }

  function openAutoSource(source) {
    var returnHere = makeReturnToAutoRef();
    var pasteBtn =
      document.getElementById('autoRefImageOverlay') &&
      document.getElementById('autoRefImageOverlay').querySelector('[data-auto-source="paste"]');

    // Paste: keep overlay open; show inline error above Paste when empty.
    if (source === 'paste') {
      if (!(window.EazClipboardImage && typeof window.EazClipboardImage.start === 'function')) {
        return;
      }
      window.EazClipboardImage.start({ pasteBtn: pasteBtn, toast: false }).then(function (file) {
        if (!file) return;
        expectReturnToAutoRefOverlay = true;
        closeAutoRefOverlay();
        addAutoFilesFromInput([file]);
      });
      return;
    }

    if (source === 'screenshot') {
      if (!(window.EazScreenshotCapture && typeof window.EazScreenshotCapture.start === 'function')) {
        return;
      }
      var shotPromise = window.EazScreenshotCapture.start();
      expectReturnToAutoRefOverlay = true;
      closeAutoRefOverlay();
      shotPromise.then(function (file) {
        if (!file) {
          returnHere();
          return;
        }
        addAutoFilesFromInput([file]);
      });
      return;
    }

    expectReturnToAutoRefOverlay = true;
    closeAutoRefOverlay();

    if (source === 'device') {
      var inputDev = document.getElementById('creatorAutoImageInput');
      watchAutoFilePickerCancel(inputDev, returnHere);
      triggerAutoFileInput(false);
      return;
    }
    if (source === 'camera') {
      var inputCam = document.getElementById('creatorAutoImageInput');
      watchAutoFilePickerCancel(inputCam, returnHere);
      triggerAutoFileInput(true);
      return;
    }
    if (source === 'phone') {
      window.__automationsRefPickActive = true;
      if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
        window.CreatorPhoneUploadModal.open({ sectionId: null, onCancel: returnHere });
      } else {
        returnHere();
      }
      return;
    }
    if (source === 'inspirations') {
      window.__automationsRefPickActive = true;
      window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = true;
      if (window.CreatorInspirationModal && typeof window.CreatorInspirationModal.open === 'function') {
        window.CreatorInspirationModal.open({ onCancel: returnHere });
      } else {
        returnHere();
      }
      return;
    }
    if (source === 'quick-inspirations') {
      window.__automationsRefPickActive = true;
      window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = true;
      if (window.QuickInspirationsModal && typeof window.QuickInspirationsModal.open === 'function') {
        window.QuickInspirationsModal.open({ onCancel: returnHere });
      } else {
        returnHere();
      }
      return;
    }
    if (source === 'designs') {
      window.__automationsRefPickActive = true;
      if (window.GenMyDesignsModal && typeof window.GenMyDesignsModal.open === 'function') {
        window.GenMyDesignsModal.open({ onCancel: returnHere });
      } else {
        returnHere();
      }
      return;
    }
    if (source === 'canvas') {
      if (window.CanvasSketchModal && typeof window.CanvasSketchModal.open === 'function') {
        window.CanvasSketchModal.open({
          onConfirm: function (result) {
            if (result && (result.image_url || result.blob)) {
              var dataUrl = result.image_url;
              if (result.blob) {
                var reader = new FileReader();
                reader.onload = function () {
                  withSimilarityForImageUrlAuto(reader.result, function (picked) {
                    if (!picked) return;
                    pushAutoRefItem({
                      file: result.blob,
                      dataUrl: picked.dataUrl,
                      similarity: picked.similarity,
                      canvasStrokes: result.strokes || null,
                      inspiration_mode: picked.inspiration_mode || null,
                      elements: picked.elements || null,
                      include_elements: picked.include_elements || null,
                      exclude_elements: picked.exclude_elements || null
                    });
                  }, returnHere);
                };
                reader.readAsDataURL(result.blob);
              } else {
                withSimilarityForImageUrlAuto(dataUrl, function (picked) {
                  if (!picked) return;
                  pushAutoRefItem({
                    file: null,
                    dataUrl: picked.dataUrl,
                    similarity: picked.similarity,
                    canvasStrokes: result.strokes || null,
                    inspiration_mode: picked.inspiration_mode || null,
                    elements: picked.elements || null,
                    include_elements: picked.include_elements || null,
                    exclude_elements: picked.exclude_elements || null
                  });
                }, returnHere);
              }
            }
          },
          onCancel: returnHere
        });
      } else {
        returnHere();
      }
    }
  }

  function addAutoFilesFromInput(files) {
    if (!files || files.length === 0) return;
    var imageFiles = Array.prototype.filter.call(files, function (f) {
      return f.type && f.type.indexOf('image/') === 0;
    });
    if (imageFiles.length === 0) return;
    function processNext(idx) {
      if (idx >= imageFiles.length || autoRefImages.length >= MAX_AUTO_REFS) {
        renderAutoRefGrid();
        return;
      }
      var file = imageFiles[idx];
      withSimilarityForFileAuto(file, function (picked) {
        if (!picked || !picked.file) {
          processNext(idx + 1);
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          pushAutoRefItem({
            file: picked.file,
            dataUrl: reader.result,
            similarity: picked.similarity,
            canvasStrokes: null,
            inspiration_mode: picked.inspiration_mode || null,
            elements: picked.elements || null,
            include_elements: picked.include_elements || null,
            exclude_elements: picked.exclude_elements || null
          });
          processNext(idx + 1);
        };
        reader.readAsDataURL(picked.file);
      });
    }
    processNext(0);
  }

  function onGenDesignSelectedForAutomations(e) {
    if (!window.__automationsRefPickActive) return;
    var imageUrl = e.detail && e.detail.imageUrl;
    if (!imageUrl) return;
    window.__automationsRefPickActive = false;
    try {
      window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = false;
    } catch (e0) {}
    withSimilarityForImageUrlAuto(imageUrl, function (picked) {
      if (!picked) return;
      pushAutoRefItem({
        file: null,
        dataUrl: picked.dataUrl,
        similarity: picked.similarity,
        canvasStrokes: null,
        inspiration_mode: picked.inspiration_mode || null,
        elements: picked.elements || null,
        include_elements: picked.include_elements || null,
        exclude_elements: picked.exclude_elements || null
      });
    });
  }

  function serializeAutoReferenceAssets() {
    return autoRefImages.map(function (it, i) {
      var sim = typeof it.similarity === 'number' ? it.similarity : 0.6;
      var pct = sim <= 1 && sim >= 0 ? Math.round(sim * 100) : Math.max(0, Math.min(100, Math.round(sim)));
      var row = {
        url: it.dataUrl,
        label: String.fromCharCode(65 + i),
        strength: pct
      };
      if (it.canvasStrokes && it.canvasStrokes.length) row.canvas_strokes = it.canvasStrokes;
      if (it.inspiration_mode) row.inspiration_mode = it.inspiration_mode;
      if (it.elements) row.elements = it.elements;
      if (it.include_elements) row.include_elements = it.include_elements;
      if (it.exclude_elements) row.exclude_elements = it.exclude_elements;
      return row;
    });
  }

  function openPromptEditDialog(index) {
    editingPromptIndex = index;
    var dlg = document.getElementById('creatorAutoPromptEditDlg');
    var ta = document.getElementById('creatorAutoPromptEditText');
    if (!dlg || !ta) return;
    ta.value = autoPrompts[index] != null ? autoPrompts[index] : '';
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  function closePromptEditDialog() {
    var dlg = document.getElementById('creatorAutoPromptEditDlg');
    editingPromptIndex = -1;
    if (dlg && typeof dlg.close === 'function' && dlg.open) dlg.close();
  }

  function bindAutomationModalExtras() {
    if (automationExtrasBound) return;
    automationExtrasBound = true;
    var addBtn = document.getElementById('creatorAutoPromptAdd');
    var draft = document.getElementById('creatorAutoPromptDraft');
    var grid = document.getElementById('creatorAutoPromptsGrid');
    var uploadBtn = document.getElementById('creatorAutoRefUploadBtn');
    var fileInput = document.getElementById('creatorAutoImageInput');
    var refGrid = document.getElementById('creatorAutoRefGrid');
    var overlay = document.getElementById('autoRefImageOverlay');
    var closeRef = document.getElementById('autoRefImageClose');
    var dlg = document.getElementById('creatorAutoPromptEditDlg');
    var dlgClose = document.getElementById('creatorAutoPromptEditClose');
    var dlgSave = document.getElementById('creatorAutoPromptEditSave');
    var dlgDelete = document.getElementById('creatorAutoPromptEditDelete');
    var dlgTa = document.getElementById('creatorAutoPromptEditText');

    window.addEventListener('gen-design-selected', onGenDesignSelectedForAutomations);

    if (addBtn && draft) {
      addBtn.addEventListener('click', function () {
        var t = String(draft.value || '').trim();
        if (!t) return;
        if (autoPrompts.length >= MAX_AUTO_PROMPTS) {
          window.alert(I().prompts_max || 'You can add up to 10 prompts.');
          return;
        }
        autoPrompts.push(t);
        draft.value = '';
        renderAutoPromptGrid();
      });
    }

    if (grid) {
      grid.addEventListener('click', function (e) {
        var cell = e.target.closest('.creator-automations-prompt-cell');
        if (!cell || cell.dataset.promptIndex === undefined) return;
        openPromptEditDialog(parseInt(cell.dataset.promptIndex, 10));
      });
    }

    if (dlgClose) dlgClose.addEventListener('click', closePromptEditDialog);
    if (dlg) {
      dlg.addEventListener('cancel', function (e) {
        e.preventDefault();
        closePromptEditDialog();
      });
    }
    if (dlgSave) {
      dlgSave.addEventListener('click', function () {
        if (editingPromptIndex < 0 || !dlgTa) return;
        var t = String(dlgTa.value || '').trim();
        if (!t) return;
        autoPrompts[editingPromptIndex] = t;
        renderAutoPromptGrid();
        closePromptEditDialog();
      });
    }
    if (dlgDelete) {
      dlgDelete.addEventListener('click', function () {
        if (editingPromptIndex < 0) return;
        autoPrompts.splice(editingPromptIndex, 1);
        renderAutoPromptGrid();
        closePromptEditDialog();
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        openAutoRefOverlay();
      });
    }
    if (closeRef) closeRef.addEventListener('click', closeAutoRefOverlay);
    if (overlay) {
      overlay.addEventListener('close', function () {
        overlay.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('is-open');
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeAutoRefOverlay();
      });
    }
    if (overlay) {
      overlay.querySelectorAll('[data-auto-source]').forEach(function (card) {
        card.addEventListener('click', function () {
          if (card.disabled || card.getAttribute('aria-disabled') === 'true' || card.classList.contains('is-disabled')) {
            return;
          }
          var source = card.getAttribute('data-auto-source');
          if (source) openAutoSource(source);
        });
      });
      var shotBtn = overlay.querySelector('[data-auto-source="screenshot"]');
      if (shotBtn && window.EazScreenshotCapture && typeof window.EazScreenshotCapture.bindOption === 'function') {
        autoScreenshotBinder = window.EazScreenshotCapture.bindOption(shotBtn);
      }
      var pasteBtn = overlay.querySelector('[data-auto-source="paste"]');
      if (pasteBtn && window.EazClipboardImage && typeof window.EazClipboardImage.bindOption === 'function') {
        autoPasteBinder = window.EazClipboardImage.bindOption(pasteBtn, {
          isOpen: isAutoRefOverlayOpen
        });
      }
    }
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length > 0) {
          addAutoFilesFromInput(fileInput.files);
        }
      });
    }
    if (refGrid) {
      refGrid.addEventListener('click', function (e) {
        var rm = e.target.closest('.creator-automations-ref-item__remove');
        if (rm && rm.dataset.autoRemoveIdx !== undefined) {
          e.stopPropagation();
          autoRefImages.splice(parseInt(rm.dataset.autoRemoveIdx, 10), 1);
          renderAutoRefGrid();
          return;
        }
        var drawBtn = e.target.closest('.creator-automations-ref-item__draw');
        if (drawBtn && drawBtn.dataset.autoDrawIdx !== undefined) {
          e.stopPropagation();
          var idx = parseInt(drawBtn.dataset.autoDrawIdx, 10);
          var item = autoRefImages[idx];
          if (!item || !item.dataUrl) return;
          var img = new Image();
          img.onload = function () {
            if (window.CanvasSketchModal && typeof window.CanvasSketchModal.open === 'function') {
              window.CanvasSketchModal.open({
                designImage: img,
                initialStrokes: item.canvasStrokes && item.canvasStrokes.length ? item.canvasStrokes : null,
                onConfirm: function (result) {
                  if (result && (result.image_url || result.blob)) {
                    if (result.blob) {
                      var reader = new FileReader();
                      reader.onload = function () {
                        withSimilarityForImageUrlAuto(reader.result, function (picked) {
                          if (!picked) return;
                          autoRefImages[idx] = {
                            file: result.blob,
                            dataUrl: picked.dataUrl,
                            similarity: picked.similarity,
                            canvasStrokes: result.strokes || null,
                            inspiration_mode: picked.inspiration_mode || null,
                            elements: picked.elements || null,
                            include_elements: picked.include_elements || null,
                            exclude_elements: picked.exclude_elements || null
                          };
                          renderAutoRefGrid();
                        });
                      };
                      reader.readAsDataURL(result.blob);
                    } else {
                      withSimilarityForImageUrlAuto(result.image_url, function (picked) {
                        if (!picked) return;
                        autoRefImages[idx] = {
                          file: null,
                          dataUrl: picked.dataUrl,
                          similarity: picked.similarity,
                          canvasStrokes: result.strokes || null,
                          inspiration_mode: picked.inspiration_mode || null,
                          elements: picked.elements || null,
                          include_elements: picked.include_elements || null,
                          exclude_elements: picked.exclude_elements || null
                        };
                        renderAutoRefGrid();
                      });
                    }
                  }
                }
              });
            }
          };
          img.src = item.dataUrl;
          return;
        }
        var thumb = e.target.closest('.creator-automations-ref-item__thumb');
        if (thumb && thumb.dataset.autoRefIdx !== undefined) {
          e.preventDefault();
          openAutoRefInfluenceEdit(parseInt(thumb.dataset.autoRefIdx, 10));
        }
      });
    }
  }

  function openModal() {
    var dlg = document.getElementById('creatorAutomationsModal');
    if (!dlg) return;
    var form = document.getElementById('creatorAutomationsModalForm');
    if (form) form.reset();
    resetAutomationModalState();
    defaultModalDates();
    openAutomationsSheetDialog(dlg);
  }

  function closeModal() {
    window.__automationsRefPickActive = false;
    var dlg = document.getElementById('creatorAutomationsModal');
    closeAutomationsSheetDialog(dlg);
  }

  function onSubmitForm(e) {
    e.preventDefault();
    var oid = ownerId();
    if (!oid) return;
    var title = (document.getElementById('creatorAutoTitle') && document.getElementById('creatorAutoTitle').value) || '';
    var promptsPayload = autoPrompts.slice();
    var refPayload = serializeAutoReferenceAssets();
    var perDay = parseInt((document.getElementById('creatorAutoPerDay') && document.getElementById('creatorAutoPerDay').value) || '1', 10);
    var wfEl = document.querySelector('#creatorAutomationsModalForm input[name="workflow"]:checked');
    var workflow = wfEl ? wfEl.value : 'generate_only';
    var startsEl = document.getElementById('creatorAutoStarts');
    var endsEl = document.getElementById('creatorAutoEnds');
    var startsAt = startsEl && startsEl.value ? new Date(startsEl.value).getTime() : NaN;
    var endsAt = endsEl && endsEl.value ? new Date(endsEl.value).getTime() : NaN;
    if (!title.trim() || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return;

    var createBody = {
      title: title.trim(),
      prompt: promptsPayload.length ? promptsPayload.join('\n---\n') : '',
      prompts: promptsPayload,
      reference_assets: refPayload.length ? refPayload : undefined,
      workflow: workflow,
      designs_per_day: perDay,
      starts_at: startsAt,
      ends_at: endsAt
    };
    if (!isAutomationGenPoolEmpty()) {
      createBody.generator_pool = automationGenPool;
    }

    postJsonOp('create-design-automation', createBody).then(function (d) {
      if (d && d.ok) {
        closeModal();
        loadList();
      } else {
        window.alert((d && d.error) || I().create_error || 'Error');
      }
    });
  }

  function bind() {
    document.querySelectorAll('.creator-automations-tab').forEach(function (btn) {
      var t = btn.dataset.maintab;
      if (t) btn.addEventListener('click', function () { switchMainTab(t); });
    });
    document.querySelectorAll('.creator-automations-status-tab').forEach(function (btn) {
      var f = btn.dataset.statusfilter;
      if (f) btn.addEventListener('click', function () { switchStatusFilter(f); });
    });

    var modal = document.getElementById('creatorAutomationsModal');
    var closeBtn = document.getElementById('creatorAutomationsModalClose');
    var cancelBtn = document.getElementById('creatorAutomationsModalCancel');
    var form = document.getElementById('creatorAutomationsModalForm');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (form) form.addEventListener('submit', onSubmitForm);
    if (modal) {
      modal.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeModal();
      });
    }

    var editDlg = document.getElementById('creatorAutomationEditDlg');
    var editClose = document.getElementById('creatorAutomationEditClose');
    if (editDlg) {
      editDlg.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeAutomationsSheetDialog(editDlg);
      });
    }
    if (editClose && editDlg) {
      editClose.addEventListener('click', function () {
        closeAutomationsSheetDialog(editDlg);
      });
    }
    var ovDlg = document.getElementById('creatorAutomationOverviewDlg');
    var ovClose = document.getElementById('creatorAutomationOverviewClose');
    if (ovDlg) {
      ovDlg.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeAutomationsSheetDialog(ovDlg);
      });
    }
    if (ovClose && ovDlg) {
      ovClose.addEventListener('click', function () {
        closeAutomationsSheetDialog(ovDlg);
      });
    }

    var viewport = document.getElementById('creatorMobileSwipeViewport');
    function isAutomationsViewport(vp) {
      if (!vp) return false;
      if (vp.classList.contains('slide-4')) return true;
      return String(vp.getAttribute('data-initial-slide') || '') === '4';
    }

    /** Load list when the automations UI is actually visible (mobile swipe or desktop shell). */
    function refreshAutomationsListIfContextVisible() {
      if (currentMainTab !== 'design-generator') {
        setAutomationsGridLoadingUi(false);
        return;
      }
      if (!isAutomationsShellVisible()) {
        setAutomationsGridLoadingUi(false);
        return;
      }
      loadList();
      if (isAutomationsMobileSlideVisible()) bumpHeader();
    }

    if (viewport) {
      var observer = new MutationObserver(function () {
        if (viewport.classList.contains('slide-4')) {
          refreshAutomationsListIfContextVisible();
        } else {
          setAutomationsGridLoadingUi(false);
          bumpHeader();
        }
      });
      observer.observe(viewport, { attributes: true, attributeFilter: ['class'] });
    }

    var deskAutoPanel = document.querySelector('[data-desktop-screen="automations"]');
    if (deskAutoPanel) {
      var deskObserver = new MutationObserver(function () {
        refreshAutomationsListIfContextVisible();
      });
      deskObserver.observe(deskAutoPanel, { attributes: true, attributeFilter: ['hidden', 'class'] });
    }

    refreshAutomationsListIfContextVisible();
    window.setTimeout(refreshAutomationsListIfContextVisible, 0);
    window.setTimeout(refreshAutomationsListIfContextVisible, 160);

    if (isAutomationsViewport(viewport)) {
      var hadOwner = !!ownerId();
      renderList([]);
      switchMainTab('design-generator');
      switchStatusFilter('active');
      if (!hadOwner) {
        window.setTimeout(function () {
          if (currentMainTab === 'design-generator' && ownerId()) loadList();
        }, 120);
      }
    }

    bindAutomationModalExtras();
    bindAutomationGenPool();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.AutomationsScreen = {
    switchMainTab: switchMainTab,
    switchStatusFilter: switchStatusFilter,
    getHeaderTitle: getHeaderTitle,
    refreshList: loadList,
    getCurrentMainTab: function () { return currentMainTab; },
    getCurrentStatusFilter: function () { return currentStatusFilter; }
  };
})();
