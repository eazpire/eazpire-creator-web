/**
 * Creator Dashboard V5 — widget canvas, 12/8/4 grid, layout manager.
 */
(function (global) {
  "use strict";

  var CELL = 56;
  var GAP = 10;
  var DRAFT_KEY = "eazy-dashboard-draft-v1";

  function t(key, fallback) {
    var i18n = global.CreatorI18n || global.CreatorPortalI18n;
    if (i18n && typeof i18n.t === "function") {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    var el = document.querySelector('[data-t="' + key + '"]');
    if (el && el.textContent) return el.textContent.trim();
    return fallback || key;
  }

  function ownerId() {
    if (global.__EAZ_OWNER_ID) return String(global.__EAZ_OWNER_ID);
    var auth = global.CreatorPortalAuth && global.CreatorPortalAuth.state;
    if (auth && auth.ownerId) return String(auth.ownerId);
    return "";
  }

  function apiGet(op, params) {
    if (typeof global.creatorApiFetch === "function") return global.creatorApiFetch(op, params || {});
    if (global.CreatorPortalApi && typeof global.CreatorPortalApi.dispatch === "function") {
      return global.CreatorPortalApi.dispatch(op, { query: params || {} });
    }
    var url = new URL("https://creator-engine.eazpire.workers.dev/apps/creator-dispatch");
    url.searchParams.set("op", op);
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== "") url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { credentials: "include", cache: "no-store" }).then(function (r) {
      return r.json();
    });
  }

  function apiPost(op, body) {
    var payload = body || {};
    if (typeof global.creatorApiFetch === "function") {
      return global.creatorApiFetch(op, payload, { method: "POST" });
    }
    return fetch("https://creator-engine.eazpire.workers.dev/apps/creator-dispatch?op=" + encodeURIComponent(op), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json();
    });
  }

  function detectSurface(root) {
    var forced = root.getAttribute("data-ed-surface");
    if (forced === "mobile" || forced === "tablet" || forced === "desktop") return forced;
    var w = root.clientWidth || (global.innerWidth || 1200);
    if (w <= 699) return "mobile";
    if (w <= 1099) return "tablet";
    return "desktop";
  }

  function widgetById(reg, id) {
    var list = (reg && reg.widgets) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function dualHtml(idA, labA, idB, labB) {
    return (
      '<div class="eazy-dashboard__dual">' +
      '<div><span class="eazy-dashboard__dual-label">' +
      labA +
      '</span><span class="eazy-dashboard__dual-value" id="' +
      idA +
      '">–</span></div>' +
      '<div><span class="eazy-dashboard__dual-label">' +
      labB +
      '</span><span class="eazy-dashboard__dual-value" id="' +
      idB +
      '">–</span></div></div>'
    );
  }

  function trackingHtml() {
    return '<p class="eazy-dashboard__tracking">' + t("creator.dashboard.tracking_required", "Tracking required") + "</p>";
  }

  function prefixFor(root) {
    return root.getAttribute("data-ed-prefix") || "creator-desktop";
  }

  function kpiBody(root, kind) {
    var p = prefixFor(root);
    if (kind === "designs") {
      return dualHtml(p + "-stat-designs-generated", t("creator.overview.designs_generated", "Generated"), p + "-stat-designs-uploaded", t("creator.overview.designs_uploaded", "Uploaded"));
    }
    if (kind === "products") {
      return dualHtml(p + "-stat-products-online", t("creator.overview.products_online", "Online"), p + "-stat-products-offline", t("creator.overview.products_offline", "Offline"));
    }
    if (kind === "heroes") {
      return dualHtml(p + "-stat-heroes-generated", t("creator.overview.designs_generated", "Generated"), p + "-stat-heroes-online", t("creator.overview.products_online", "Online"));
    }
    if (kind === "sales") {
      return dualHtml(p + "-stat-sales-eazpire", t("creator.overview.sales_eazpire", "eazpire"), p + "-stat-sales-amazon", t("creator.overview.sales_amazon", "Amazon"));
    }
    return "";
  }

  function journeyBody(root) {
    var p = prefixFor(root);
    var openId = p === "creator-mobile" ? "creator-mobile-journey-open" : "creator-desktop-journey-open-list";
    var doneId = p === "creator-mobile" ? "creator-mobile-journey-completed" : "creator-desktop-journey-completed-list";
    var fillId = p === "creator-mobile" ? "creator-mobile-journey-bar-fill" : "creator-desktop-journey-fill";
    return (
      '<div class="eazy-dashboard__bar"><span id="' +
      fillId +
      '" style="width:0%"></span></div>' +
      '<div class="' +
      (p === "creator-mobile" ? "creator-journey-list creator-journey-list--open" : "creator-desktop-journey__list") +
      ' eazy-dashboard__quest-list" id="' +
      openId +
      '"><p class="eazy-dashboard__empty">' +
      t("creator.overview.loading_todos", "Loading your journey...") +
      "</p></div>" +
      '<div id="' +
      doneId +
      '" hidden></div>' +
      '<button type="button" class="eazy-dashboard__toolbar-btn creator-journey-trigger" data-ed-open-journey>' +
      t("creator.dashboard.open_all_quests", "Open all quests") +
      "</button>" +
      (p === "creator-mobile"
        ? ""
        : '<div id="creator-desktop-journey-guest-cta" class="creator-desktop-journey__guest-cta" hidden></div>')
    );
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function qaIconSvg(id) {
    var paths = {
      generator:
        '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
      designs:
        '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M20 16l-5-5-8 8"/>',
      products: '<path d="M4 8h16l-1.2 12H5.2L4 8z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
      content: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 9h8M8 13h6"/>',
      automations: '<path d="M13 2 8 13h5l-2 9 9-13h-5l3-7z"/>',
      research: '<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>',
    };
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[id] || paths.designs) + "</svg>"
    );
  }

  function quickActionHtml(item) {
    var href = "#";
    var extra = ' data-goto="' + (item.goto || "") + '"';
    if (item.creationsTab) extra += ' data-creations-tab="' + item.creationsTab + '"';
    if (item.marketingSubtab) extra += ' data-marketing-subtab="' + item.marketingSubtab + '"';
    if (item.goto === "research") extra += ' data-desktop-screen="research"';
    return (
      '<a class="eazy-dashboard__qa-item" href="' +
      href +
      '"' +
      extra +
      '><span class="eazy-dashboard__qa-icon">' +
      qaIconSvg(item.id) +
      "</span><strong>" +
      escHtml(t(item.titleKey, item.id)) +
      "</strong></a>"
    );
  }

  function bodyFor(root, widget, payload) {
    var id = widget.id;
    if (id === "designs" || id === "products" || id === "heroes" || id === "sales") return kpiBody(root, id);
    if (id === "creator-journey") return journeyBody(root);
    if (id === "quick-actions") {
      var settings = (payload.activeLayout && payload.activeLayout.widgetSettings) || {};
      var ids = (settings["quick-actions"] && settings["quick-actions"].visibleIds) || ["generator", "designs", "content", "automations", "products"];
      var catalog = (payload.registry && payload.registry.quickActionItems) || [];
      var html = '<div class="eazy-dashboard__qa">';
      catalog.forEach(function (item) {
        if (ids.indexOf(item.id) === -1) return;
        html += quickActionHtml(item);
      });
      return html + "</div>";
    }
    if (widget.trackingRequired) return trackingHtml();
    if (id === "hero-impressions") {
      var n = payload.data && payload.data.hero ? payload.data.hero.impressions : null;
      return n == null ? trackingHtml() : '<div class="eazy-dashboard__dual-value">' + Number(n).toLocaleString() + "</div>";
    }
    if (id === "hero-clicks") {
      var c = payload.data && payload.data.hero ? payload.data.hero.clicks : null;
      return c == null ? trackingHtml() : '<div class="eazy-dashboard__dual-value">' + Number(c).toLocaleString() + "</div>";
    }
    if (id === "product-clicks") {
      return (
        '<p class="eazy-dashboard__empty">' +
        t("creator.dashboard.hero_hotspot_clicks", "Hero hotspot product clicks") +
        "</p><div class=\"eazy-dashboard__dual-value\">" +
        Number((payload.data && payload.data.hero && payload.data.hero.product_clicks) || 0).toLocaleString() +
        "</div>" +
        trackingHtml()
      );
    }
    if (id === "performance") {
      var h = payload.data && payload.data.hero;
      if (!h || h.impressions == null) return trackingHtml();
      return (
        '<p class="eazy-dashboard__empty">' +
        t("creator.dashboard.performance_caption", "Hero impressions / clicks · last 30 days") +
        "</p>" +
        dualHtml("ed-perf-imp", t("creator.dashboard.impressions", "Impressions"), "ed-perf-clk", t("creator.dashboard.clicks", "Clicks"))
      );
    }
    if (id === "conversion-funnel") return trackingHtml();
    if (id === "skill-unlock") {
      return '<p class="eazy-dashboard__empty">' + t("creator.dashboard.skill_hint", "Opens the existing skill tree in Creator Journey.") + "</p>";
    }
    if (id === "publish-grow" || id === "amazon-listings" || id === "social-posts" || id === "automations") {
      return '<p class="eazy-dashboard__empty">' + t("creator.dashboard.status_from_screens", "Status from the matching Creator screen. Counts appear when that feature reports them.") + "</p>";
    }
    return '<p class="eazy-dashboard__empty">' + t("creator.dashboard.no_data", "No data yet") + "</p>";
  }

  function handleSvg() {
    var s = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">';
    for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) s += '<circle cx="' + (2 + x * 4) + '" cy="' + (2 + y * 4) + '" r="1.05" fill="currentColor"/>';
    return s + "</svg>";
  }

  function renderWidget(root, item, spec, payload) {
    var el = document.createElement("article");
    el.className = "eazy-dashboard__widget";
    el.setAttribute("data-ed-id", item.id);
    el.style.gridColumn = item.x + 1 + " / span " + item.w;
    el.style.gridRow = item.y + 1 + " / span " + item.h;
    if (item.visible === false) el.hidden = true;
    var title = t((spec && spec.titleKey) || "", item.id);
    el.innerHTML =
      '<div class="eazy-dashboard__head">' +
      '<button type="button" class="eazy-dashboard__handle" aria-label="' +
      t("creator.dashboard.move_widget", "Move widget") +
      '">' +
      handleSvg() +
      "</button>" +
      '<span class="eazy-dashboard__title"></span>' +
      '<span class="eazy-dashboard__meta"></span>' +
      '<button type="button" class="eazy-dashboard__menu-btn" aria-label="' +
      t("creator.dashboard.widget_menu", "Widget menu") +
      '">···</button></div>' +
      '<div class="eazy-dashboard__body"></div>';
    el.querySelector(".eazy-dashboard__title").textContent = title;
    if (spec && spec.trackingRequired) el.querySelector(".eazy-dashboard__meta").textContent = t("creator.dashboard.tracking_required", "Tracking required");
    el.querySelector(".eazy-dashboard__body").innerHTML = bodyFor(root, spec || item, payload);
    return el;
  }

  function activeLayout(payload) {
    var id = payload.activeLayoutId;
    var list = payload.layouts || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }

  function paint(root, payload) {
    var surface = detectSurface(root);
    var layout = activeLayout(payload);
    payload.activeLayout = layout;
    var cols = (layout && layout[surface] && layout[surface].columns) || (surface === "mobile" ? 4 : surface === "tablet" ? 8 : 12);
    var canvas = root.querySelector("[data-ed-canvas]");
    canvas.style.setProperty("--ed-cols", String(cols));
    canvas.innerHTML = "";
    var widgets = (layout && layout[surface] && layout[surface].widgets) || [];
    widgets.forEach(function (item) {
      if (item.visible === false) return;
      canvas.appendChild(renderWidget(root, item, widgetById(payload.registry, item.id), payload));
    });
    var sales = payload.data && payload.data.sales;
    if (sales && sales.eazpire != null) {
      var se = document.getElementById(prefixFor(root) + "-stat-sales-eazpire");
      if (se) se.textContent = Number(sales.eazpire).toLocaleString();
      var sa = document.getElementById(prefixFor(root) + "-stat-sales-amazon");
      if (sa) sa.textContent = sales.amazon == null ? "–" : Number(sales.amazon).toLocaleString();
    }
    var perfI = document.getElementById("ed-perf-imp");
    var perfC = document.getElementById("ed-perf-clk");
    if (perfI && payload.data && payload.data.hero) perfI.textContent = Number(payload.data.hero.impressions || 0).toLocaleString();
    if (perfC && payload.data && payload.data.hero) perfC.textContent = Number(payload.data.hero.clicks || 0).toLocaleString();
    if (global.CreatorDashboardData && payload.data && payload.data.stats) {
      global.CreatorDashboardData.applyDashboardStats(payload.data.stats);
    }
    root._edPayload = payload;
    root._edSurface = surface;
    bindWidgetChrome(root);
  }

  function currentWidgets(root) {
    var layout = activeLayout(root._edPayload || {});
    var surface = root._edSurface || detectSurface(root);
    return ((layout && layout[surface] && layout[surface].widgets) || []).map(function (w) {
      return Object.assign({}, w);
    });
  }

  function persistSurfaces(root) {
    var layout = activeLayout(root._edPayload || {});
    if (!layout || !layout.id) return Promise.resolve();
    return mutate("update", {
      id: layout.id,
      version: layout.version,
      desktop: layout.desktop,
      tablet: layout.tablet,
      mobile: layout.mobile,
      widgetSettings: layout.widgetSettings,
    }).then(function (res) {
      if (res && res.ok && res.layout) {
        var list = root._edPayload.layouts || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === res.layout.id) list[i] = res.layout;
        }
        paint(root, root._edPayload);
        return;
      }
      if (res && res.error === "version_conflict") reload();
    });
  }

  function writeWidgets(root, widgets) {
    var payload = root._edPayload;
    var layout = activeLayout(payload);
    var surface = root._edSurface;
    layout[surface] = layout[surface] || { columns: surface === "mobile" ? 4 : surface === "tablet" ? 8 : 12, widgets: [] };
    layout[surface].widgets = widgets;
    paint(root, payload);
    persistSurfaces(root);
  }

  function saveDraft(root) {
    try {
      var payload = root._edPayload;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeLayoutId: payload.activeLayoutId, layout: activeLayout(payload), at: Date.now() }));
    } catch (_e) {}
  }

  function closeWidgetMenu() {
    var existing = document.getElementById("eazyDashboardWidgetMenu");
    if (existing) existing.remove();
  }

  function bindWidgetChrome(root) {
    /* Open-all-quests uses .creator-journey-trigger so creator-journey-modal.js opens the existing modal. */
    root.querySelectorAll(".eazy-dashboard__menu-btn").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var widget = btn.closest("[data-ed-id]");
        openWidgetMenu(root, widget && widget.getAttribute("data-ed-id"), btn);
      });
    });
    bindDrag(root);
  }

  function openWidgetMenu(root, id, anchor) {
    closeWidgetMenu();
    if (!id || !anchor) return;
    var menu = document.createElement("div");
    menu.id = "eazyDashboardWidgetMenu";
    menu.className = "eazy-dashboard-widget-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML =
      '<button type="button" role="menuitem" data-ed-menu-customize>' +
      escHtml(t("creator.dashboard.widget_customize", "Customize")) +
      '</button><button type="button" role="menuitem" data-ed-menu-hide>' +
      escHtml(t("creator.dashboard.hide_widget", "Hide")) +
      "</button>";
    document.body.appendChild(menu);
    var rect = anchor.getBoundingClientRect();
    menu.style.top = rect.bottom + 6 + "px";
    menu.style.left = Math.max(8, rect.right - 180) + "px";
    menu.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-ed-menu-customize]")) {
        closeWidgetMenu();
        openManager(root);
        return;
      }
      if (ev.target.closest("[data-ed-menu-hide]")) {
        closeWidgetMenu();
        var widgets = currentWidgets(root);
        widgets.forEach(function (w) {
          if (w.id === id) w.visible = false;
        });
        writeWidgets(root, widgets);
      }
    });
    setTimeout(function () {
      function dismiss(ev) {
        if (menu.contains(ev.target) || (anchor && anchor.contains(ev.target))) return;
        closeWidgetMenu();
        document.removeEventListener("pointerdown", dismiss, true);
      }
      document.addEventListener("pointerdown", dismiss, true);
    }, 0);
  }

  function bindDrag(root) {
    var canvas = root.querySelector("[data-ed-canvas]");
    if (!canvas || canvas._edDragBound) return;
    canvas._edDragBound = true;
    var dragging = null;
    canvas.addEventListener("pointerdown", function (ev) {
      var handle = ev.target.closest(".eazy-dashboard__handle");
      if (!handle) return;
      var widget = ev.target.closest("[data-ed-id]");
      if (!widget) return;
      ev.preventDefault();
      closeWidgetMenu();
      var origin = currentWidgets(root).filter(function (w) {
        return w.id === widget.getAttribute("data-ed-id");
      })[0];
      if (!origin) return;
      var rect = canvas.getBoundingClientRect();
      var cols = Number(getComputedStyle(canvas).getPropertyValue("--ed-cols")) || 12;
      dragging = {
        el: widget,
        id: origin.id,
        startX: ev.clientX,
        startY: ev.clientY,
        colW: (rect.width - GAP * (cols - 1)) / cols,
        origin: Object.assign({}, origin),
        dx: 0,
        dy: 0,
        cols: cols,
      };
      widget.classList.add("is-dragging");
      try {
        widget.setPointerCapture(ev.pointerId);
      } catch (_e) {}
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      dragging.dx = Math.round((ev.clientX - dragging.startX) / (dragging.colW + GAP));
      dragging.dy = Math.round((ev.clientY - dragging.startY) / (CELL + GAP));
      var nextX = Math.max(0, Math.min(dragging.cols - dragging.origin.w, dragging.origin.x + dragging.dx));
      var nextY = Math.max(0, dragging.origin.y + dragging.dy);
      dragging.el.style.gridColumn = nextX + 1 + " / span " + dragging.origin.w;
      dragging.el.style.gridRow = nextY + 1 + " / span " + dragging.origin.h;
    });
    canvas.addEventListener("pointerup", function () {
      if (!dragging) return;
      var moved = dragging.dx || dragging.dy;
      var widgets = currentWidgets(root);
      widgets.forEach(function (w) {
        if (w.id !== dragging.id) return;
        w.x = Math.max(0, Math.min(dragging.cols - dragging.origin.w, dragging.origin.x + dragging.dx));
        w.y = Math.max(0, dragging.origin.y + dragging.dy);
      });
      dragging.el.classList.remove("is-dragging");
      dragging = null;
      if (moved) writeWidgets(root, widgets);
      else paint(root, root._edPayload);
    });
  }

  function mutate(action, extra) {
    var body = Object.assign({ action: action }, extra || {});
    var oid = ownerId();
    if (oid) body.owner_id = oid;
    return apiPost("mutate-dashboard-layout", body);
  }

  function qaIdsFromLayout(lay) {
    var ids = lay && lay.widgetSettings && lay.widgetSettings["quick-actions"] && lay.widgetSettings["quick-actions"].visibleIds;
    return Array.isArray(ids) && ids.length ? ids.slice() : ["generator", "designs", "content", "automations", "products"];
  }

  function applyTemplateSurfaces(draft, tpl) {
    if (!draft || !tpl) return;
    if (tpl.desktop) draft.desktop = cloneJson(tpl.desktop);
    if (tpl.tablet) draft.tablet = cloneJson(tpl.tablet);
    if (tpl.mobile) draft.mobile = cloneJson(tpl.mobile);
    draft.templateId = tpl.id;
  }

  function openManager(root) {
    var payload = root._edPayload;
    if (!payload) return;
    var overlay = document.getElementById("eazyDashboardLayoutModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "eazyDashboardLayoutModal";
      overlay.className = "eazy-dashboard-modal";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div class="eazy-dashboard-modal__panel" role="dialog" aria-modal="true" aria-label="' +
      escHtml(t("creator.dashboard.layout_manager", "Dashboard layouts")) +
      '"><header class="eazy-dashboard-modal__head"><h2 class="eazy-dashboard-modal__title">' +
      escHtml(t("creator.dashboard.customize", "Customize dashboard")) +
      '</h2><div class="eazy-dashboard-modal__modes"><button type="button" class="eazy-dashboard-modal__mode is-on" data-ed-mode="layout">' +
      escHtml(t("creator.dashboard.layout_tab", "Dashboard Layout")) +
      '</button><button type="button" class="eazy-dashboard-modal__mode" data-ed-mode="settings">' +
      escHtml(t("creator.dashboard.widget_settings_tab", "Widget Settings")) +
      '</button></div><button type="button" class="eazy-dashboard-modal__close" data-ed-close aria-label="' +
      escHtml(t("creator.common.close", "Close")) +
      '">×</button></header><div class="eazy-dashboard-modal__templates" data-ed-templates></div><div class="eazy-dashboard-modal__split"><aside class="eazy-dashboard-modal__side"><div class="eazy-dashboard-modal__side-scroll" data-ed-side></div><div class="eazy-dashboard-modal__side-foot"><button type="button" class="eazy-dashboard__toolbar-btn" data-ed-new>+ ' +
      escHtml(t("creator.dashboard.new_layout", "New layout")) +
      '</button></div></aside><div class="eazy-dashboard-modal__main"><div class="eazy-dashboard-modal__main-body" data-ed-main></div><div class="eazy-dashboard-modal__foot"><button type="button" class="eazy-dashboard__toolbar-btn" data-ed-cancel>' +
      escHtml(t("creator.common.cancel", "Cancel")) +
      '</button><button type="button" class="eazy-dashboard__toolbar-btn is-on" data-ed-save>' +
      escHtml(t("creator.common.save", "Save")) +
      "</button></div></div></div></div>";
    overlay.classList.add("is-open");

    var source = activeLayout(payload) || (payload.layouts || [])[0] || { title: "My dashboard", desktop: { columns: 12, widgets: [] }, tablet: { columns: 8, widgets: [] }, mobile: { columns: 4, widgets: [] }, widgetSettings: {} };
    var draft = cloneJson(source);
    var selectedId = source.id || "__draft__";
    var isNew = !source.id;
    var selectedTemplateId = draft.templateId || "";
    var mode = "layout";
    var qaIds = qaIdsFromLayout(draft);

    function paintManager() {
      overlay.querySelectorAll("[data-ed-mode]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-ed-mode") === mode);
      });
      var tplRow = overlay.querySelector("[data-ed-templates]");
      var tplHtml = "";
      (payload.registry.templates || []).forEach(function (tpl) {
        tplHtml +=
          '<button type="button" class="eazy-dashboard-modal__tpl' +
          (tpl.id === selectedTemplateId ? " is-on" : "") +
          '" data-ed-tpl="' +
          escHtml(tpl.id) +
          '">' +
          escHtml(tpl.title) +
          "</button>";
      });
      tplRow.innerHTML = tplHtml;

      var side = overlay.querySelector("[data-ed-side]");
      var sideHtml = '<p class="eazy-dashboard-modal__kicker">' + escHtml(t("creator.dashboard.my_layouts", "My layouts")) + "</p>";
      (payload.layouts || []).forEach(function (l) {
        sideHtml +=
          '<button type="button" class="eazy-dashboard-modal__item' +
          (l.id === selectedId ? " is-on" : "") +
          '" data-ed-lay="' +
          escHtml(l.id) +
          '">' +
          escHtml(l.title || l.id) +
          (l.id === payload.activeLayoutId ? " · " + escHtml(t("creator.dashboard.active", "Active")) : "") +
          "</button>";
      });
      if (isNew) {
        sideHtml +=
          '<button type="button" class="eazy-dashboard-modal__item is-on" data-ed-lay="__draft__">' +
          escHtml(draft.title || t("creator.dashboard.new_layout", "New layout")) +
          "</button>";
      }
      side.innerHTML = sideHtml;

      var main = overlay.querySelector("[data-ed-main]");
      if (mode === "settings") {
        var qaHtml = '<h3>' + escHtml(t("creator.dashboard.quick_action_items", "Quick Actions items")) + "</h3>";
        qaHtml += '<div class="eazy-dashboard__qa">';
        (payload.registry.quickActionItems || []).forEach(function (item) {
          qaHtml +=
            '<button type="button" class="eazy-dashboard__qa-item' +
            (qaIds.indexOf(item.id) >= 0 ? " is-on" : "") +
            '" data-ed-qa="' +
            escHtml(item.id) +
            '"><span class="eazy-dashboard__qa-icon">' +
            qaIconSvg(item.id) +
            "</span><strong>" +
            escHtml(t(item.titleKey, item.id)) +
            "</strong></button>";
        });
        main.innerHTML = qaHtml + "</div>";
        return;
      }

      var surface = root._edSurface || detectSurface(root);
      var cols = (draft[surface] && draft[surface].columns) || (surface === "mobile" ? 4 : surface === "tablet" ? 8 : 12);
      var widgets = (draft[surface] && draft[surface].widgets) || [];
      var preview = '<p><strong>' + escHtml(draft.title || "") + "</strong></p>";
      if (draft.description) preview += "<p>" + escHtml(draft.description) + "</p>";
      preview += '<div class="eazy-dashboard-modal__preview" style="--ed-cols:' + cols + '">';
      widgets.forEach(function (item) {
        if (item.visible === false) return;
        var spec = widgetById(payload.registry, item.id);
        preview +=
          '<div class="eazy-dashboard-modal__tile" style="grid-column:' +
          (item.x + 1) +
          " / span " +
          item.w +
          ";grid-row:" +
          (item.y + 1) +
          " / span " +
          item.h +
          '"><span class="eazy-dashboard-modal__tile-label">' +
          escHtml(t((spec && spec.titleKey) || "", item.id)) +
          "</span></div>";
      });
      main.innerHTML = preview + "</div>";
    }

    paintManager();
    overlay.onclick = function (ev) {
      if (ev.target === overlay || ev.target.closest("[data-ed-cancel], [data-ed-close]")) {
        overlay.classList.remove("is-open");
        return;
      }
      var modeBtn = ev.target.closest("[data-ed-mode]");
      if (modeBtn) {
        mode = modeBtn.getAttribute("data-ed-mode") || "layout";
        paintManager();
        return;
      }
      var tplBtn = ev.target.closest("[data-ed-tpl]");
      if (tplBtn) {
        var tplId = tplBtn.getAttribute("data-ed-tpl");
        var tplDoc = (payload.registry.templates || []).filter(function (x) {
          return x.id === tplId;
        })[0];
        if (tplDoc) {
          applyTemplateSurfaces(draft, tplDoc);
          selectedTemplateId = tplDoc.id;
          paintManager();
        }
        return;
      }
      var layBtn = ev.target.closest("[data-ed-lay]");
      if (layBtn) {
        var layId = layBtn.getAttribute("data-ed-lay");
        if (layId === "__draft__") {
          paintManager();
          return;
        }
        var found = (payload.layouts || []).filter(function (l) {
          return l.id === layId;
        })[0];
        if (found) {
          draft = cloneJson(found);
          selectedId = found.id;
          isNew = false;
          selectedTemplateId = draft.templateId || "";
          qaIds = qaIdsFromLayout(draft);
          paintManager();
        }
        return;
      }
      if (ev.target.closest("[data-ed-new]")) {
        var title = global.prompt(t("creator.dashboard.layout_title", "Layout title"), "My dashboard");
        if (!title) return;
        var seed = (payload.registry.templates || []).filter(function (x) {
          return x.id === (selectedTemplateId || "mission-control");
        })[0] || (payload.registry.templates || [])[0];
        draft = {
          id: "__draft__",
          title: title,
          description: (seed && seed.description) || "",
          version: 1,
          templateId: (seed && seed.id) || "mission-control",
          widgetSettings: { "quick-actions": { visibleIds: qaIds.slice() } },
        };
        applyTemplateSurfaces(draft, seed);
        selectedId = "__draft__";
        isNew = true;
        selectedTemplateId = draft.templateId || "";
        paintManager();
        return;
      }
      var qaBtn = ev.target.closest("[data-ed-qa]");
      if (qaBtn) {
        var qa = qaBtn.getAttribute("data-ed-qa");
        if (qaIds.indexOf(qa) >= 0) {
          qaIds = qaIds.filter(function (x) {
            return x !== qa;
          });
        } else {
          qaIds = qaIds.concat([qa]);
        }
        draft.widgetSettings = draft.widgetSettings || {};
        draft.widgetSettings["quick-actions"] = { visibleIds: qaIds.slice() };
        paintManager();
        return;
      }
      if (ev.target.closest("[data-ed-save]")) {
        var settings = { "quick-actions": { visibleIds: qaIds.slice() } };
        var body = {
          desktop: draft.desktop,
          tablet: draft.tablet,
          mobile: draft.mobile,
          widgetSettings: settings,
        };
        var done = function () {
          overlay.classList.remove("is-open");
          reload();
        };
        if (isNew) {
          mutate(
            "create",
            Object.assign(
              {
                title: draft.title,
                templateId: selectedTemplateId || "mission-control",
                setActive: true,
              },
              body
            )
          ).then(done);
          return;
        }
        mutate("update", Object.assign({ id: selectedId, version: draft.version }, body)).then(function () {
          return mutate("set-active", { id: selectedId });
        }).then(done);
      }
    };
  }

  function reload() {
    document.querySelectorAll("[data-eazy-dashboard]").forEach(function (root) {
      bootOne(root, true);
    });
  }

  function bootOne(root, force) {
    if (root._edBusy && !force) return;
    root._edBusy = true;
    var oid = ownerId();
    apiGet("get-dashboard-v5", oid ? { owner_id: oid } : {})
      .then(function (payload) {
        if (!payload || !payload.ok) return;
        paint(root, payload);
      })
      .catch(function (err) {
        console.warn("[eazy-dashboard] load failed", err);
      })
      .finally(function () {
        root._edBusy = false;
      });
  }

  function boot() {
    document.querySelectorAll("[data-eazy-dashboard]").forEach(function (root) {
      var bar = root.querySelector("[data-ed-toolbar]");
      if (bar) bar.remove();
      bootOne(root);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.EazyDashboard = { boot: boot, reload: reload };
})(typeof window !== "undefined" ? window : globalThis);
