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
      "><strong>" +
      t(item.titleKey, item.id) +
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
      '<div class="eazy-dashboard__body"></div>' +
      '<span class="eazy-dashboard__resize" data-ed-resize></span>';
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

  function writeWidgets(root, widgets) {
    var payload = root._edPayload;
    var layout = activeLayout(payload);
    var surface = root._edSurface;
    layout[surface] = layout[surface] || { columns: surface === "mobile" ? 4 : surface === "tablet" ? 8 : 12, widgets: [] };
    layout[surface].widgets = widgets;
    paint(root, payload);
    saveDraft(root);
  }

  function saveDraft(root) {
    try {
      var payload = root._edPayload;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ activeLayoutId: payload.activeLayoutId, layout: activeLayout(payload), at: Date.now() }));
    } catch (_e) {}
  }

  function bindWidgetChrome(root) {
    /* Open-all-quests uses .creator-journey-trigger so creator-journey-modal.js opens the existing modal. */
    root.querySelectorAll(".eazy-dashboard__menu-btn").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var widget = btn.closest("[data-ed-id]");
        openWidgetMenu(root, widget && widget.getAttribute("data-ed-id"));
      });
    });
    bindDrag(root);
  }

  function openWidgetMenu(root, id) {
    if (!id) return;
    var hide = global.confirm ? null : null;
    var choice = global.prompt(
      t("creator.dashboard.widget_menu_prompt", "Type hide, reset, or first"),
      "hide"
    );
    if (!choice) return;
    var widgets = currentWidgets(root);
    var item = widgets.filter(function (w) {
      return w.id === id;
    })[0];
    if (!item) return;
    if (choice === "hide") item.visible = false;
    if (choice === "first") {
      item.x = 0;
      item.y = 0;
    }
    if (choice === "reset") {
      var spec = widgetById(root._edPayload.registry, id);
      var surface = root._edSurface;
      if (spec && spec.defaultSize && spec.defaultSize[surface]) {
        item.w = spec.defaultSize[surface].w;
        item.h = spec.defaultSize[surface].h;
      }
    }
    writeWidgets(root, widgets);
    void hide;
  }

  function bindDrag(root) {
    var canvas = root.querySelector("[data-ed-canvas]");
    var dragging = null;
    canvas.addEventListener("pointerdown", function (ev) {
      if (!root.classList.contains("is-editing")) return;
      var handle = ev.target.closest(".eazy-dashboard__handle");
      var resize = ev.target.closest("[data-ed-resize]");
      if (!handle && !resize) return;
      var widget = ev.target.closest("[data-ed-id]");
      if (!widget) return;
      ev.preventDefault();
      var origin = currentWidgets(root).filter(function (w) {
        return w.id === widget.getAttribute("data-ed-id");
      })[0];
      if (!origin) return;
      var rect = canvas.getBoundingClientRect();
      var cols = Number(getComputedStyle(canvas).getPropertyValue("--ed-cols")) || 12;
      dragging = {
        el: widget,
        id: origin.id,
        resize: !!resize,
        startX: ev.clientX,
        startY: ev.clientY,
        colW: (rect.width - GAP * (cols - 1)) / cols,
        origin: Object.assign({}, origin),
        dx: 0,
        dy: 0,
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
      var next = Object.assign({}, dragging.origin);
      if (dragging.resize) {
        next.w = Math.max(2, dragging.origin.w + dragging.dx);
        next.h = Math.max(2, dragging.origin.h + dragging.dy);
      } else {
        next.x = Math.max(0, dragging.origin.x + dragging.dx);
        next.y = Math.max(0, dragging.origin.y + dragging.dy);
      }
      dragging.el.style.gridColumn = next.x + 1 + " / span " + next.w;
      dragging.el.style.gridRow = next.y + 1 + " / span " + next.h;
    });
    canvas.addEventListener("pointerup", function () {
      if (!dragging) return;
      var widgets = currentWidgets(root);
      widgets.forEach(function (w) {
        if (w.id !== dragging.id) return;
        if (dragging.resize) {
          w.w = Math.max(2, dragging.origin.w + dragging.dx);
          w.h = Math.max(2, dragging.origin.h + dragging.dy);
        } else {
          w.x = Math.max(0, dragging.origin.x + dragging.dx);
          w.y = Math.max(0, dragging.origin.y + dragging.dy);
        }
      });
      dragging = null;
      writeWidgets(root, widgets);
    });
  }

  function mutate(action, extra) {
    var body = Object.assign({ action: action }, extra || {});
    var oid = ownerId();
    if (oid) body.owner_id = oid;
    return apiPost("mutate-dashboard-layout", body);
  }

  function openManager(root) {
    var payload = root._edPayload;
    var overlay = document.getElementById("eazyDashboardLayoutModal");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "eazyDashboardLayoutModal";
      overlay.className = "eazy-dashboard-modal";
      overlay.innerHTML =
        '<div class="eazy-dashboard-modal__panel" role="dialog" aria-label="' +
        t("creator.dashboard.layout_manager", "Dashboard layouts") +
        '"><aside class="eazy-dashboard-modal__side" data-ed-side></aside><div class="eazy-dashboard-modal__main"><div class="eazy-dashboard-modal__main-body" data-ed-main></div><div class="eazy-dashboard-modal__foot"><button type="button" class="eazy-dashboard__toolbar-btn" data-ed-cancel>' +
        t("creator.common.cancel", "Cancel") +
        '</button><button type="button" class="eazy-dashboard__toolbar-btn is-on" data-ed-save>' +
        t("creator.common.save", "Save") +
        "</button></div></div></div>";
      document.body.appendChild(overlay);
    }
    overlay.classList.add("is-open");
    var selectedId = payload.activeLayoutId;
    function renderSide() {
      var side = overlay.querySelector("[data-ed-side]");
      var html = "<h3>" + t("creator.dashboard.templates", "Templates") + "</h3>";
      (payload.registry.templates || []).forEach(function (tpl) {
        html += '<button type="button" class="eazy-dashboard-modal__item" data-ed-tpl="' + tpl.id + '">' + tpl.title + "</button>";
      });
      html += "<h3>" + t("creator.dashboard.my_layouts", "My layouts") + "</h3>";
      (payload.layouts || []).forEach(function (l) {
        html +=
          '<button type="button" class="eazy-dashboard-modal__item' +
          (l.id === selectedId ? " is-on" : "") +
          '" data-ed-lay="' +
          l.id +
          '">' +
          (l.title || l.id) +
          (l.id === payload.activeLayoutId ? " · " + t("creator.dashboard.active", "Active") : "") +
          "</button>";
      });
      html +=
        '<button type="button" class="eazy-dashboard__toolbar-btn" data-ed-new>+ ' +
        t("creator.dashboard.new_layout", "New layout") +
        "</button>";
      side.innerHTML = html;
    }
    function renderMain() {
      var lay = (payload.layouts || []).filter(function (l) {
        return l.id === selectedId;
      })[0];
      var main = overlay.querySelector("[data-ed-main]");
      if (!lay) {
        main.textContent = "";
        return;
      }
      var catalog = (payload.registry.widgets || [])
        .map(function (w) {
          var used = ((lay[root._edSurface] && lay[root._edSurface].widgets) || []).some(function (x) {
            return x.id === w.id && x.visible !== false;
          });
          if (used) return "";
          return '<button type="button" data-ed-add="' + w.id + '">' + t(w.titleKey, w.id) + "</button>";
        })
        .join("");
      var qa = (lay.widgetSettings && lay.widgetSettings["quick-actions"] && lay.widgetSettings["quick-actions"].visibleIds) || [];
      var qaHtml = (payload.registry.quickActionItems || [])
        .map(function (item) {
          return (
            '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-ed-qa="' +
            item.id +
            '"' +
            (qa.indexOf(item.id) >= 0 ? " checked" : "") +
            "> " +
            t(item.titleKey, item.id) +
            "</label>"
          );
        })
        .join("");
      main.innerHTML =
        "<p><strong>" +
        (lay.title || "") +
        "</strong></p><p>" +
        (lay.description || "") +
        "</p><p>" +
        t("creator.dashboard.hidden_widgets", "Hidden widgets") +
        '</p><div class="eazy-dashboard-catalog">' +
        catalog +
        "</div><p>" +
        t("creator.dashboard.quick_action_items", "Quick Actions items") +
        "</p>" +
        qaHtml;
    }
    renderSide();
    renderMain();
    overlay.onclick = function (ev) {
      if (ev.target === overlay || ev.target.getAttribute("data-ed-cancel") != null) overlay.classList.remove("is-open");
      var tpl = ev.target.getAttribute("data-ed-tpl");
      if (tpl && global.confirm(t("creator.dashboard.apply_template_confirm", "Replace this layout with the template?"))) {
        var tplDoc = (payload.registry.templates || []).filter(function (x) {
          return x.id === tpl;
        })[0];
        if (tplDoc) {
          mutate("update", {
            id: selectedId,
            version: activeLayout(payload).version,
            desktop: tplDoc.desktop,
            tablet: tplDoc.tablet,
            mobile: tplDoc.mobile,
          }).then(reload);
        }
      }
      var layId = ev.target.getAttribute("data-ed-lay");
      if (layId) {
        selectedId = layId;
        mutate("set-active", { id: layId }).then(reload);
      }
      if (ev.target.getAttribute("data-ed-new") != null) {
        var title = global.prompt(t("creator.dashboard.layout_title", "Layout title"), "My dashboard");
        if (title) mutate("create", { title: title, templateId: "mission-control" }).then(reload);
      }
      var addId = ev.target.getAttribute("data-ed-add");
      if (addId) {
        var widgets = currentWidgets(root);
        widgets.push({ id: addId, visible: true, x: 0, y: 99, w: 3, h: 2 });
        writeWidgets(root, widgets);
        renderMain();
      }
      if (ev.target.getAttribute("data-ed-save") != null) {
        var lay = activeLayout(payload);
        var asNew = global.confirm(t("creator.dashboard.save_choice", "OK = overwrite this layout. Cancel = save as a new version."));
        var body = {
          id: lay.id,
          version: lay.version,
          desktop: lay.desktop,
          tablet: lay.tablet,
          mobile: lay.mobile,
          widgetSettings: lay.widgetSettings,
        };
        (asNew ? mutate("update", body) : mutate("save-as-new", Object.assign({ title: lay.title + " copy" }, body))).then(function () {
          overlay.classList.remove("is-open");
          reload();
        });
      }
      var qaEl = ev.target.closest("[data-ed-qa]");
      if (qaEl) {
        var qa = qaEl.getAttribute("data-ed-qa");
        var lay2 = activeLayout(payload);
        lay2.widgetSettings = lay2.widgetSettings || {};
        lay2.widgetSettings["quick-actions"] = lay2.widgetSettings["quick-actions"] || { visibleIds: [] };
        var ids = (lay2.widgetSettings["quick-actions"].visibleIds || []).slice();
        var checked = qaEl.tagName === "INPUT" ? qaEl.checked : ids.indexOf(qa) < 0;
        if (checked) {
          if (ids.indexOf(qa) < 0) ids.push(qa);
        } else {
          ids = ids.filter(function (x) {
            return x !== qa;
          });
        }
        lay2.widgetSettings["quick-actions"].visibleIds = ids;
        paint(root, payload);
        renderMain();
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

  function ensureToolbar(root) {
    if (root.querySelector("[data-ed-toolbar]")) return;
    var bar = document.createElement("div");
    bar.className = "eazy-dashboard__toolbar";
    bar.setAttribute("data-ed-toolbar", "1");
    bar.innerHTML =
      '<button type="button" class="eazy-dashboard__toolbar-btn" data-ed-edit>' +
      t("creator.dashboard.edit_layout", "Edit layout") +
      '</button><button type="button" class="eazy-dashboard__toolbar-btn" data-ed-manage>' +
      t("creator.dashboard.customize", "Customize dashboard") +
      "</button>";
    root.insertBefore(bar, root.firstChild);
    bar.querySelector("[data-ed-edit]").addEventListener("click", function () {
      root.classList.toggle("is-editing");
      bar.querySelector("[data-ed-edit]").classList.toggle("is-on", root.classList.contains("is-editing"));
    });
    bar.querySelector("[data-ed-manage]").addEventListener("click", function () {
      openManager(root);
    });
  }

  function boot() {
    document.querySelectorAll("[data-eazy-dashboard]").forEach(function (root) {
      ensureToolbar(root);
      bootOne(root);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.EazyDashboard = { boot: boot, reload: reload };
})(typeof window !== "undefined" ? window : globalThis);
