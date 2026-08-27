/**
 * Creator Dashboard V5 — widget canvas, 12/8/4 grid, layout manager.
 */
(function (global) {
  "use strict";

  var CELL = 56;
  var GAP = 10;
  var DRAFT_KEY = "eazy-dashboard-draft-v1";
  var WIDGET_LONG_PRESS_MS = 300;
  var WIDGET_DRAG_SLOP = 10;

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

  function widgetsCollide(a, b) {
    if (!a || !b || a.visible === false || b.visible === false) return false;
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function compactWidgetsVertical(widgets, columns, freezeId) {
    var cols = columns || 12;
    var visible = (widgets || [])
      .filter(function (w) {
        return w && w.visible !== false;
      })
      .map(function (w) {
        return Object.assign({}, w);
      });
    var frozen = freezeId
      ? visible.filter(function (w) {
          return w.id === freezeId;
        })
      : [];
    var movable = (
      freezeId
        ? visible.filter(function (w) {
            return w.id !== freezeId;
          })
        : visible
    ).sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });
    var placed = frozen.map(function (item) {
      item.x = Math.max(0, Math.min(Math.max(0, cols - item.w), item.x));
      item.y = Math.max(0, item.y);
      return item;
    });
    movable.forEach(function (item) {
      item.x = Math.max(0, Math.min(Math.max(0, cols - item.w), item.x));
      var y = 0;
      var fits = false;
      while (!fits) {
        var probe = Object.assign({}, item, { y: y });
        var hit = placed.some(function (p) {
          return widgetsCollide(probe, p);
        });
        if (!hit) {
          item.y = y;
          placed.push(item);
          fits = true;
        } else {
          y += 1;
          if (y > 200) {
            item.y = y;
            placed.push(item);
            fits = true;
          }
        }
      }
    });
    var hidden = (widgets || [])
      .filter(function (w) {
        return w && w.visible === false;
      })
      .map(function (w) {
        return Object.assign({}, w);
      });
    return placed.concat(hidden);
  }

  /* Dragged widget stays put; others are pushed down, then packed around it. */
  function resolveWidgetCollisions(widgets, movedId, columns) {
    var items = (widgets || []).map(function (w) {
      return Object.assign({}, w);
    });
    var moved = null;
    items.forEach(function (w) {
      if (w.id === movedId) moved = w;
    });
    if (!moved) return items;
    var cols = columns || 12;
    moved.x = Math.max(0, Math.min(Math.max(0, cols - moved.w), moved.x));
    moved.y = Math.max(0, moved.y);
    var changed = true;
    var guard = 0;
    while (changed && guard++ < 200) {
      changed = false;
      items.forEach(function (item) {
        if (item.id === movedId || item.visible === false) return;
        var blockers = items.filter(function (p) {
          return p.id !== item.id && widgetsCollide(item, p);
        });
        if (!blockers.length) return;
        var nextY = 0;
        blockers.forEach(function (b) {
          nextY = Math.max(nextY, b.y + b.h);
        });
        if (item.y !== nextY) {
          item.y = nextY;
          changed = true;
        }
      });
    }
    return compactWidgetsVertical(items, cols, movedId);
  }

  function applyWidgetGrid(canvas, widgets) {
    if (!canvas) return;
    (widgets || []).forEach(function (w) {
      if (w.visible === false) return;
      var el = canvas.querySelector('[data-ed-id="' + w.id + '"]');
      if (!el) return;
      el.style.gridColumn = w.x + 1 + " / span " + w.w;
      el.style.gridRow = w.y + 1 + " / span " + w.h;
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

  function guestFallbackPayload() {
    function w(id, x, y, width, height) {
      return { id: id, x: x, y: y, w: width, h: height, visible: true };
    }
    var layout = {
      id: "guest-mission-control",
      title: "Mission Control",
      desktop: { columns: 12, widgets: [w("designs", 0, 0, 3, 2), w("products", 3, 0, 3, 2), w("heroes", 6, 0, 3, 2), w("sales", 9, 0, 3, 2), w("creator-journey", 0, 2, 6, 4), w("performance", 6, 2, 6, 4), w("quick-actions", 0, 6, 4, 4), w("skill-unlock", 4, 6, 4, 3), w("publish-grow", 8, 6, 4, 3)] },
      tablet: { columns: 8, widgets: [w("designs", 0, 0, 2, 2), w("products", 2, 0, 2, 2), w("heroes", 4, 0, 2, 2), w("sales", 6, 0, 2, 2), w("creator-journey", 0, 2, 8, 5), w("performance", 0, 7, 8, 4), w("quick-actions", 0, 11, 4, 4), w("skill-unlock", 4, 11, 4, 4)] },
      mobile: { columns: 4, widgets: [w("designs", 0, 0, 2, 2), w("products", 2, 0, 2, 2), w("heroes", 0, 2, 2, 2), w("sales", 2, 2, 2, 2), w("creator-journey", 0, 4, 4, 5), w("quick-actions", 0, 9, 4, 3)] },
    };
    return {
      ok: true,
      activeLayoutId: layout.id,
      layouts: [layout],
      registry: {
        widgets: [
          { id: "designs", titleKey: "creator.overview.designs" },
          { id: "products", titleKey: "creator.overview.products" },
          { id: "heroes", titleKey: "creator.overview.heroes" },
          { id: "sales", titleKey: "creator.overview.sales" },
          { id: "creator-journey", titleKey: "creator.overview.journey" },
          { id: "performance", titleKey: "creator.dashboard.performance", trackingRequired: true },
          { id: "quick-actions", titleKey: "creator.dashboard.quick_actions" },
          { id: "skill-unlock", titleKey: "creator.dashboard.skill_unlock" },
          { id: "publish-grow", titleKey: "creator.dashboard.publish_grow" },
        ],
        quickActionItems: [
          { id: "generator", titleKey: "creator.overview.action_generator_title", goto: "2" },
          { id: "designs", titleKey: "creator.overview.action_designs_title", goto: "3", creationsTab: "designs" },
          { id: "products", titleKey: "creator.overview.action_products_title", goto: "3", creationsTab: "products" },
          { id: "content", titleKey: "creator.overview.action_content_title", goto: "4", marketingSubtab: "content-creation" },
          { id: "automations", titleKey: "creator.overview.action_automations_title", goto: "5" },
        ],
      },
      data: {},
    };
  }

  function showGuestJourneyCta(root) {
    if (ownerId()) return;
    var cta = root.querySelector("#creator-desktop-journey-guest-cta");
    if (!cta) return;
    cta.hidden = false;
    if (!cta.innerHTML.trim()) {
      var loginHref = global.__CREATOR_PORTAL_HOST__ ? "/auth/login?next=/dashboard" : "/account/login";
      cta.innerHTML =
        "<p>" +
        escHtml(t("creator.dashboard.guest_cta", "Sign in to track your journey and use Creator tools.")) +
        '</p><a class="eazy-dashboard__toolbar-btn" href="' +
        loginHref +
        '">' +
        escHtml(t("creator.common.login", "Log in")) +
        "</a>";
    }
  }

  function paint(root, payload) {
    var surface = detectSurface(root);
    var layout = activeLayout(payload);
    payload.activeLayout = layout;
    var cols = (layout && layout[surface] && layout[surface].columns) || (surface === "mobile" ? 4 : surface === "tablet" ? 8 : 12);
    var canvas = root.querySelector("[data-ed-canvas]");
    if (!canvas) return;
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
    showGuestJourneyCta(root);
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
    var pending = null;

    function clearPending() {
      if (!pending) return;
      if (pending.timer) clearTimeout(pending.timer);
      if (pending.el) pending.el.classList.remove("is-drag-ready", "is-dragging");
      pending = null;
    }

    function armDrag(hold) {
      var widget = hold.el;
      var origin = hold.origin;
      var snapshot = hold.snapshot;
      var rect = canvas.getBoundingClientRect();
      var cols = Number(getComputedStyle(canvas).getPropertyValue("--ed-cols")) || 12;
      dragging = {
        el: widget,
        id: origin.id,
        startX: hold.startX,
        startY: hold.startY,
        colW: (rect.width - GAP * (cols - 1)) / cols,
        origin: Object.assign({}, origin),
        snapshot: snapshot,
        resolved: null,
        dx: 0,
        dy: 0,
        cols: cols,
        pointerId: hold.pointerId,
      };
      widget.classList.add("is-drag-ready", "is-dragging");
      try {
        if (navigator.vibrate) navigator.vibrate(30);
      } catch (_v) {}
      try {
        widget.setPointerCapture(hold.pointerId);
      } catch (_e) {}
    }

    canvas.addEventListener("pointerdown", function (ev) {
      var handle = ev.target.closest(".eazy-dashboard__handle");
      if (!handle) return;
      var widget = ev.target.closest("[data-ed-id]");
      if (!widget) return;
      closeWidgetMenu();
      var snapshot = currentWidgets(root);
      var origin = snapshot.filter(function (w) {
        return w.id === widget.getAttribute("data-ed-id");
      })[0];
      if (!origin) return;
      clearPending();
      pending = {
        el: widget,
        origin: origin,
        snapshot: snapshot.map(function (w) {
          return Object.assign({}, w);
        }),
        startX: ev.clientX,
        startY: ev.clientY,
        pointerId: ev.pointerId,
        timer: setTimeout(function () {
          var hold = pending;
          pending = null;
          if (!hold) return;
          armDrag(hold);
        }, WIDGET_LONG_PRESS_MS),
      };
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (pending && pending.pointerId === ev.pointerId) {
        var pdx = ev.clientX - pending.startX;
        var pdy = ev.clientY - pending.startY;
        if (Math.hypot(pdx, pdy) > WIDGET_DRAG_SLOP) {
          clearPending();
        }
        return;
      }
      if (!dragging) return;
      if (dragging.pointerId != null && ev.pointerId !== dragging.pointerId) return;
      ev.preventDefault();
      dragging.dx = Math.round((ev.clientX - dragging.startX) / (dragging.colW + GAP));
      dragging.dy = Math.round((ev.clientY - dragging.startY) / (CELL + GAP));
      var next = dragging.snapshot.map(function (w) {
        return Object.assign({}, w);
      });
      next.forEach(function (w) {
        if (w.id !== dragging.id) return;
        w.x = Math.max(0, Math.min(dragging.cols - dragging.origin.w, dragging.origin.x + dragging.dx));
        w.y = Math.max(0, dragging.origin.y + dragging.dy);
      });
      dragging.resolved = resolveWidgetCollisions(next, dragging.id, dragging.cols);
      applyWidgetGrid(canvas, dragging.resolved);
    });
    function onPointerUp(ev) {
      if (pending && (!ev || pending.pointerId === ev.pointerId)) {
        clearPending();
        return;
      }
      if (!dragging) return;
      if (ev && dragging.pointerId != null && ev.pointerId !== dragging.pointerId) return;
      var moved = dragging.dx || dragging.dy;
      var widgets = dragging.resolved || currentWidgets(root);
      dragging.el.classList.remove("is-dragging", "is-drag-ready");
      try {
        dragging.el.releasePointerCapture(dragging.pointerId);
      } catch (_e) {}
      dragging = null;
      if (moved) writeWidgets(root, widgets);
      else paint(root, root._edPayload);
    }
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
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

  function closeLayoutMenu() {
    var existing = document.getElementById("eazyDashboardLayoutMenu");
    if (existing) existing.remove();
  }

  function draftWidgetIds(draft) {
    var ids = [];
    ["desktop", "tablet", "mobile"].forEach(function (s) {
      (((draft && draft[s]) || {}).widgets || []).forEach(function (w) {
        if (w && w.id && ids.indexOf(w.id) === -1) ids.push(w.id);
      });
    });
    return ids;
  }

  function layoutSurfacesBody(lay) {
    return {
      desktop: lay.desktop,
      tablet: lay.tablet,
      mobile: lay.mobile,
      widgetSettings: lay.widgetSettings,
    };
  }

  function openManager(root) {
    var payload = root._edPayload;
    if (!payload) return;
    closeLayoutMenu();
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
      '</h2><button type="button" class="eazy-dashboard-modal__close" data-ed-close aria-label="' +
      escHtml(t("creator.common.close", "Close")) +
      '">×</button></header><div class="eazy-dashboard-modal__templates" data-ed-templates></div><div class="eazy-dashboard-modal__split"><aside class="eazy-dashboard-modal__side"><div class="eazy-dashboard-modal__side-head" data-ed-side-modes><button type="button" class="eazy-dashboard-modal__mode is-on" data-ed-mode="layout">' +
      escHtml(t("creator.dashboard.layout_tab", "Layout")) +
      '</button><button type="button" class="eazy-dashboard-modal__mode" data-ed-mode="widgets">' +
      escHtml(t("creator.dashboard.widget_settings_tab", "Widgets")) +
      '</button></div><div class="eazy-dashboard-modal__side-scroll" data-ed-side></div><div class="eazy-dashboard-modal__side-foot" data-ed-side-foot><button type="button" class="eazy-dashboard__toolbar-btn" data-ed-new>+ ' +
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
    var selectedSystem = false;
    var mode = "layout";
    var selectedWidgetId = "quick-actions";
    var qaIds = qaIdsFromLayout(draft);

    function findLayout(id) {
      return (payload.layouts || []).filter(function (l) {
        return l.id === id;
      })[0];
    }

    function missionControlTemplate() {
      return (
        (payload.registry.templates || []).filter(function (x) {
          return x.id === "mission-control";
        })[0] || (payload.registry.templates || [])[0]
      );
    }

    function afterLayoutList(res, preferId) {
      if (!res || !res.ok) {
        if (res && res.error === "last_layout") {
          global.alert(t("creator.dashboard.last_layout", "Keep at least one layout."));
        }
        return;
      }
      payload.layouts = res.layouts || payload.layouts;
      if (res.activeLayoutId) payload.activeLayoutId = res.activeLayoutId;
      var pickId = preferId || selectedId;
      var found = pickId && pickId !== "__draft__" ? findLayout(pickId) : null;
      if (!found) found = (payload.layouts || [])[0] || null;
      if (found) {
        draft = cloneJson(found);
        selectedId = found.id;
        isNew = false;
        selectedSystem = false;
        selectedTemplateId = draft.templateId || "";
        qaIds = qaIdsFromLayout(draft);
      }
      paint(root, payload);
      paintManager();
    }

    function openLayoutOverflow(layoutId, anchor) {
      closeLayoutMenu();
      if (!layoutId || layoutId === "__draft__" || !anchor) return;
      var lay = findLayout(layoutId);
      if (!lay) return;
      var menu = document.createElement("div");
      menu.id = "eazyDashboardLayoutMenu";
      menu.className = "eazy-dashboard-widget-menu";
      menu.setAttribute("role", "menu");
      var canRemove = (payload.layouts || []).length > 1;
      menu.innerHTML =
        '<button type="button" role="menuitem" data-ed-lay-edit>' +
        escHtml(t("creator.dashboard.edit", "Edit")) +
        '</button><button type="button" role="menuitem" data-ed-lay-duplicate>' +
        escHtml(t("creator.dashboard.duplicate", "Duplicate")) +
        '</button><button type="button" role="menuitem" data-ed-lay-remove' +
        (canRemove ? "" : " disabled") +
        ">" +
        escHtml(t("creator.dashboard.remove", "Remove")) +
        "</button>";
      document.body.appendChild(menu);
      var rect = anchor.getBoundingClientRect();
      menu.style.top = rect.bottom + 6 + "px";
      menu.style.left = Math.max(8, rect.right - 180) + "px";
      menu.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.target.closest("[data-ed-lay-edit]")) {
          closeLayoutMenu();
          var nextTitle = global.prompt(t("creator.dashboard.layout_title", "Layout title"), lay.title || "");
          if (!nextTitle) return;
          mutate("update", Object.assign({ id: lay.id, version: lay.version, title: nextTitle }, layoutSurfacesBody(lay))).then(
            function (res) {
              afterLayoutList(res, lay.id);
            }
          );
          return;
        }
        if (ev.target.closest("[data-ed-lay-duplicate]")) {
          closeLayoutMenu();
          mutate("duplicate", { id: lay.id }).then(function (res) {
            afterLayoutList(res, res && res.layout && res.layout.id);
          });
          return;
        }
        if (ev.target.closest("[data-ed-lay-remove]")) {
          closeLayoutMenu();
          if (!canRemove) {
            global.alert(t("creator.dashboard.last_layout", "Keep at least one layout."));
            return;
          }
          if (!global.confirm(t("creator.errors.are_you_sure", "Are you sure?"))) return;
          mutate("delete", { id: lay.id }).then(function (res) {
            afterLayoutList(res);
          });
        }
      });
      setTimeout(function () {
        function dismiss(ev) {
          if (menu.contains(ev.target) || (anchor && anchor.contains(ev.target))) return;
          closeLayoutMenu();
          document.removeEventListener("pointerdown", dismiss, true);
        }
        document.addEventListener("pointerdown", dismiss, true);
      }, 0);
    }

    function paintManager() {
      overlay.querySelectorAll("[data-ed-mode]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-ed-mode") === mode);
      });
      var tplRow = overlay.querySelector("[data-ed-templates]");
      tplRow.hidden = mode !== "layout";
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

      var foot = overlay.querySelector("[data-ed-side-foot]");
      if (foot) foot.hidden = mode !== "layout";

      var side = overlay.querySelector("[data-ed-side]");
      var sideHtml = "";
      if (mode === "widgets") {
        var widgetIds = draftWidgetIds(draft);
        if (!widgetIds.length) {
          widgetIds = ((payload.registry && payload.registry.widgets) || []).map(function (w) {
            return w.id;
          });
        }
        if (!selectedWidgetId || widgetIds.indexOf(selectedWidgetId) === -1) {
          selectedWidgetId = widgetIds.indexOf("quick-actions") >= 0 ? "quick-actions" : widgetIds[0] || "";
        }
        widgetIds.forEach(function (id) {
          var spec = widgetById(payload.registry, id);
          sideHtml +=
            '<button type="button" class="eazy-dashboard-modal__item' +
            (id === selectedWidgetId ? " is-on" : "") +
            '" data-ed-widget-pick="' +
            escHtml(id) +
            '">' +
            escHtml(t((spec && spec.titleKey) || "", id)) +
            "</button>";
        });
        side.innerHTML = sideHtml;
      } else {
        sideHtml +=
          '<p class="eazy-dashboard-modal__kicker">' +
          escHtml(t("creator.dashboard.system_layouts", "System")) +
          "</p>";
        sideHtml +=
          '<button type="button" class="eazy-dashboard-modal__item' +
          (selectedSystem ? " is-on" : "") +
          '" data-ed-system-default>' +
          escHtml(t("creator.dashboard.default_layout", "Default")) +
          "</button>";
        sideHtml +=
          '<p class="eazy-dashboard-modal__kicker">' +
          escHtml(t("creator.dashboard.my_layouts", "My layouts")) +
          "</p>";
        (payload.layouts || []).forEach(function (l) {
          var on = !selectedSystem && l.id === selectedId;
          sideHtml +=
            '<div class="eazy-dashboard-modal__row' +
            (on ? " is-on" : "") +
            '"><button type="button" class="eazy-dashboard-modal__item" data-ed-lay="' +
            escHtml(l.id) +
            '">' +
            escHtml(l.title || l.id) +
            (l.id === payload.activeLayoutId ? " · " + escHtml(t("creator.dashboard.active", "Active")) : "") +
            '</button><button type="button" class="eazy-dashboard-modal__item-more" data-ed-lay-menu="' +
            escHtml(l.id) +
            '" aria-label="' +
            escHtml(t("creator.dashboard.layout_menu", "Layout menu")) +
            '">⋯</button></div>';
        });
        if (isNew) {
          sideHtml +=
            '<div class="eazy-dashboard-modal__row is-on"><button type="button" class="eazy-dashboard-modal__item" data-ed-lay="__draft__">' +
            escHtml(draft.title || t("creator.dashboard.new_layout", "New layout")) +
            "</button></div>";
        }
        side.innerHTML = sideHtml;
      }

      var main = overlay.querySelector("[data-ed-main]");
      if (mode === "widgets") {
        var spec = widgetById(payload.registry, selectedWidgetId);
        var heading = t((spec && spec.titleKey) || "", selectedWidgetId);
        if (selectedWidgetId === "quick-actions") {
          var qaHtml = "<h3>" + escHtml(t("creator.dashboard.quick_action_items", "Quick Actions items")) + "</h3>";
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
        main.innerHTML =
          "<h3>" +
          escHtml(heading) +
          '</h3><p class="eazy-dashboard-modal__placeholder">' +
          escHtml(t("creator.dashboard.widget_settings_placeholder", "Settings for this widget come later.")) +
          "</p>";
        return;
      }

      var surface = root._edSurface || detectSurface(root);
      var cols = (draft[surface] && draft[surface].columns) || (surface === "mobile" ? 4 : surface === "tablet" ? 8 : 12);
      var widgets = (draft[surface] && draft[surface].widgets) || [];
      var preview = "<p><strong>" + escHtml(selectedSystem ? t("creator.dashboard.default_layout", "Default") : draft.title || "") + "</strong></p>";
      if (draft.description) preview += "<p>" + escHtml(draft.description) + "</p>";
      preview += '<div class="eazy-dashboard-modal__preview" style="--ed-cols:' + cols + '">';
      widgets.forEach(function (item) {
        if (item.visible === false) return;
        var wspec = widgetById(payload.registry, item.id);
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
          escHtml(t((wspec && wspec.titleKey) || "", item.id)) +
          "</span></div>";
      });
      main.innerHTML = preview + "</div>";
    }

    paintManager();
    overlay.onclick = function (ev) {
      if (ev.target === overlay || ev.target.closest("[data-ed-cancel], [data-ed-close]")) {
        closeLayoutMenu();
        overlay.classList.remove("is-open");
        return;
      }
      var menuBtn = ev.target.closest("[data-ed-lay-menu]");
      if (menuBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        openLayoutOverflow(menuBtn.getAttribute("data-ed-lay-menu"), menuBtn);
        return;
      }
      var modeBtn = ev.target.closest("[data-ed-mode]");
      if (modeBtn) {
        mode = modeBtn.getAttribute("data-ed-mode") || "layout";
        paintManager();
        return;
      }
      var pickBtn = ev.target.closest("[data-ed-widget-pick]");
      if (pickBtn) {
        selectedWidgetId = pickBtn.getAttribute("data-ed-widget-pick") || selectedWidgetId;
        paintManager();
        return;
      }
      var sysBtn = ev.target.closest("[data-ed-system-default]");
      if (sysBtn) {
        var defTpl = missionControlTemplate();
        if (defTpl) {
          applyTemplateSurfaces(draft, defTpl);
          selectedTemplateId = defTpl.id;
          selectedSystem = true;
          paintManager();
        }
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
          selectedSystem = false;
          paintManager();
        }
        return;
      }
      var layBtn = ev.target.closest("[data-ed-lay]");
      if (layBtn) {
        var layId = layBtn.getAttribute("data-ed-lay");
        if (layId === "__draft__") {
          selectedSystem = false;
          paintManager();
          return;
        }
        var found = findLayout(layId);
        if (found) {
          draft = cloneJson(found);
          selectedId = found.id;
          isNew = false;
          selectedSystem = false;
          selectedTemplateId = draft.templateId || "";
          qaIds = qaIdsFromLayout(draft);
          paintManager();
        }
        return;
      }
      if (ev.target.closest("[data-ed-new]")) {
        var title = global.prompt(t("creator.dashboard.layout_title", "Layout title"), "My dashboard");
        if (!title) return;
        var seed =
          (payload.registry.templates || []).filter(function (x) {
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
        selectedSystem = false;
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
          closeLayoutMenu();
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
        mutate("update", Object.assign({ id: selectedId, version: draft.version }, body))
          .then(function () {
            return mutate("set-active", { id: selectedId });
          })
          .then(done);
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
        if (!payload || !payload.ok) {
          paint(root, guestFallbackPayload());
          return;
        }
        paint(root, payload);
      })
      .catch(function (err) {
        console.warn("[eazy-dashboard] load failed", err);
        paint(root, guestFallbackPayload());
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

  global.EazyDashboard = {
    boot: boot,
    reload: reload,
    resolveWidgetCollisions: resolveWidgetCollisions,
    widgetsCollide: widgetsCollide,
  };
})(typeof window !== "undefined" ? window : globalThis);
