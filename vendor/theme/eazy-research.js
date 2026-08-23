/**
 * eazy Research creator page — reprint-safe Amazon.de demand signals.
 * Reviews / BSR only. Never invents unit sales.
 */
(function (global) {
  "use strict";

  var state = {
    products: [],
    niches: [],
    preview: false,
    lastRun: null,
    q: "",
    niche: "all",
    sort: "review_growth",
    reprintOk: true,
    view: "opportunities",
    loading: false,
  };

  function t(key, fallback) {
    if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.t === "function") {
      var v = global.CreatorPortalI18n.t(key);
      if (v) return v;
    }
    if (global.CreatorI18n && typeof global.CreatorI18n.t === "function") {
      var v2 = global.CreatorI18n.t(key);
      if (v2) return v2;
    }
    return fallback;
  }

  function api(op, params) {
    params = params || {};
    if (typeof global.creatorApiFetch === "function") return global.creatorApiFetch(op, params);
    var url = new URL("/apps/creator-dispatch", global.location.origin);
    url.searchParams.set("op", op);
    Object.keys(params).forEach(function (k) {
      if (params[k] != null && params[k] !== "") url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { credentials: "include" }).then(function (r) { return r.json(); });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDelta(n) {
    if (n == null || !isFinite(Number(n))) return null;
    var v = Number(n);
    return (v > 0 ? "+" : "") + v;
  }

  function fmtPrice(p) {
    if (p == null || p.price == null || !isFinite(Number(p.price))) return t("creator.research.price_na", "Price n/a");
    try {
      return new Intl.NumberFormat("de-DE", { style: "currency", currency: p.currency || "EUR" }).format(Number(p.price));
    } catch (_e) {
      return "€" + Number(p.price).toFixed(2);
    }
  }

  function timeAgo(ts) {
    var n = Number(ts);
    if (!n) return "";
    var mins = Math.max(1, Math.round((Date.now() - n) / 60000));
    if (mins < 60) return mins + "m";
    var hours = Math.round(mins / 60);
    if (hours < 48) return hours + "h";
    return Math.round(hours / 24) + "d";
  }

  function stars(rating) {
    var r = Number(rating);
    if (!isFinite(r)) return "—";
    return r.toFixed(1) + " ★";
  }

  function amazonUrl(asin) {
    return "https://www.amazon.de/dp/" + encodeURIComponent(asin);
  }

  function goGenerator() {
    if (global.CreatorDesktopShell && typeof global.CreatorDesktopShell.switchScreen === "function") {
      global.CreatorDesktopShell.switchScreen("generator");
      return;
    }
    if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.showScreen === "function") {
      global.CreatorPortalRouter.showScreen("generator");
      return;
    }
    try {
      var u = new URL(global.location.href);
      u.hash = "generator";
      global.history.replaceState(global.history.state, "", u.pathname + u.search + u.hash);
      global.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (_e) {
      global.location.hash = "generator";
    }
  }

  function filterClient(rows) {
    var out = rows.slice();
    if (state.reprintOk) out = out.filter(function (p) { return p.reprint_ok === true || Number(p.reprint_ok) === 1; });
    if (state.niche && state.niche !== "all") out = out.filter(function (p) { return p.niche_key === state.niche; });
    var q = String(state.q || "").trim().toLowerCase();
    if (q) {
      out = out.filter(function (p) {
        return [p.title, p.brand, p.asin, p.niche_key].join(" ").toLowerCase().indexOf(q) !== -1;
      });
    }
    if (state.view === "rising") out = out.filter(function (p) { return p.trend === "rising" || (p.rising_score || 0) > 0; });
    if (state.view === "review_growth") out = out.filter(function (p) { return p.review_delta != null && p.review_delta > 0; });
    if (state.view === "watched") return [];
    var sort = state.sort;
    out.sort(function (a, b) {
      if (state.view === "rising" || sort === "rising") return (b.rising_score || 0) - (a.rising_score || 0);
      if (sort === "reviews") return (Number(b.latest && b.latest.reviews_count) || 0) - (Number(a.latest && a.latest.reviews_count) || 0);
      if (sort === "bsr") {
        var av = a.latest && a.latest.bsr != null ? Number(a.latest.bsr) : Infinity;
        var bv = b.latest && b.latest.bsr != null ? Number(b.latest.bsr) : Infinity;
        return av - bv;
      }
      if (sort === "newest") return (Number(b.latest && b.latest.captured_at) || 0) - (Number(a.latest && a.latest.captured_at) || 0);
      return (Number(b.review_delta) || 0) - (Number(a.review_delta) || 0);
    });
    return out;
  }

  function nicheLabel(key) {
    var n = (state.niches || []).find(function (x) { return x.niche_key === key || x.key === key; });
    return (n && (n.label || n.niche_key)) || key || "";
  }

  function productCard(p) {
    var img = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">'
      : '<div class="eazy-research-card__ph">' + esc(t("creator.research.unknown", "Unknown")) + "</div>";
    var reviews = p.latest && p.latest.reviews_count != null ? p.latest.reviews_count : "—";
    var bsr = p.latest && p.latest.bsr != null
      ? t("creator.research.bsr_label", "BSR") + " " + Number(p.latest.bsr).toLocaleString("de-DE")
      : t("creator.research.bsr_missing", "No BSR");
    var delta = fmtDelta(p.review_delta);
    var deltaHtml = delta
      ? '<span class="eazy-research-card__delta is-' + esc(p.trend || "unknown") + '">' +
        esc(delta) + " " + t("creator.research.reviews", "reviews") +
        (p.review_delta_window ? " / " + esc(p.review_delta_window) : "") +
        "</span>"
      : "";
    return (
      '<article class="eazy-research-card" data-asin="' + esc(p.asin) + '">' +
        '<button type="button" class="eazy-research-card__hit" data-erz-open="' + esc(p.asin) + '">' +
          '<div class="eazy-research-card__media">' + img +
            (p.reprint_ok ? '<span class="eazy-research-card__safe">' + esc(t("creator.research.reprint_ok", "Reprint-safe")) + "</span>" : "") +
          "</div>" +
          '<div class="eazy-research-card__body">' +
            "<h3>" + esc(p.title || p.asin) + "</h3>" +
            '<div class="eazy-research-card__metrics">' +
              "<span>" + esc(stars(p.latest && p.latest.rating)) + " · " + esc(String(reviews)) + "</span>" +
              deltaHtml +
            "</div>" +
            '<div class="eazy-research-card__meta">' +
              "<span>" + esc(bsr) + "</span>" +
              "<span>" + esc(fmtPrice(p)) + "</span>" +
            "</div>" +
            '<div class="eazy-research-card__tags">' +
              (p.niche_key ? "<span>" + esc(nicheLabel(p.niche_key)) + "</span>" : "") +
              "<span>DE</span>" +
            "</div>" +
          "</div>" +
        "</button>" +
        '<details class="eazy-research-card__menu">' +
          "<summary aria-label=\"" + esc(t("creator.research.menu", "Product actions")) + "\">⋯</summary>" +
          '<div class="eazy-research-card__menu-list">' +
            '<a href="' + esc(amazonUrl(p.asin)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("creator.research.open_source", "Open on Amazon.de")) + "</a>" +
            '<button type="button" data-erz-watch disabled>' + esc(t("creator.research.watch", "Watch")) + " · " + esc(t("creator.research.coming_soon", "Coming soon")) + "</button>" +
            '<button type="button" data-erz-gen>' + esc(t("creator.research.send_generator", "Send to Generator")) + "</button>" +
          "</div>" +
        "</details>" +
      "</article>"
    );
  }

  function renderChips(root) {
    var wrap = root.querySelector("[data-erz-chips]");
    if (!wrap) return;
    var all = [{ niche_key: "all", label: t("creator.research.niche_all", "All") }].concat(state.niches || []);
    wrap.innerHTML = all.map(function (n) {
      var key = n.niche_key || n.key || "all";
      var on = state.niche === key ? " is-active" : "";
      return '<button type="button" class="eazy-research__chip' + on + '" data-erz-niche="' + esc(key) + '">' +
        esc(n.label || key) + "</button>";
    }).join("");
  }

  function renderGrid(root) {
    var grid = root.querySelector("[data-erz-grid]");
    var empty = root.querySelector("[data-erz-empty]");
    if (!grid) return;
    if (state.loading) {
      grid.innerHTML = Array.from({ length: 8 }).map(function () {
        return '<div class="eazy-research-card is-skeleton" aria-hidden="true"></div>';
      }).join("");
      if (empty) empty.hidden = true;
      return;
    }
    var rows = filterClient(state.products);
    if (!rows.length) {
      grid.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = state.view === "watched"
          ? t("creator.research.empty_watched", "Watchlists are coming next. Browse Opportunities to find products worth tracking.")
          : (state.q || (state.niche && state.niche !== "all"))
            ? t("creator.research.empty_search", "No reprint-safe products match this search. Try a broader niche such as Coffee or Hiking.")
            : t("creator.research.empty_action", "Pick a niche above or type a search to explore reprint-safe products.");
      }
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = rows.map(productCard).join("");
  }

  function renderStatus(root) {
    var banner = root.querySelector("[data-erz-banner]");
    if (banner) banner.hidden = !state.preview;
    var status = root.querySelector("[data-erz-status]");
    if (!status) return;
    if (state.preview) {
      var count = state.products.length;
      var ago = state.lastRun && state.lastRun.collected_at ? timeAgo(state.lastRun.collected_at) : "";
      status.textContent = t("creator.research.collector_ok", "Collector · preview") +
        " · " + count + " " + t("creator.research.reprint_ok", "Reprint-safe") +
        (ago ? " · " + ago : "");
      return;
    }
    var last = state.lastRun;
    status.textContent = last
      ? t("creator.research.last_run", "Last snapshot") + " · " + (last.niche_pack || "") +
        (last.collected_at ? " · " + timeAgo(last.collected_at) : "")
      : t("creator.research.empty", "No Amazon.de snapshots yet. Official catalog collection runs in the background.");
  }

  function render(root) {
    renderChips(root);
    renderGrid(root);
    renderStatus(root);
    root.querySelectorAll("[data-erz-view]").forEach(function (btn) {
      var on = btn.getAttribute("data-erz-view") === state.view;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  async function openDetail(root, asin) {
    var drawer = root.querySelector("[data-erz-drawer]");
    var box = drawer && drawer.querySelector("[data-erz-detail]");
    if (!drawer || !box) return;
    drawer.hidden = false;
    box.innerHTML = "<p>" + esc(t("creator.research.loading", "Loading...")) + "</p>";
    var data = await api("eazy-research-product", { asin: asin }).catch(function () { return null; });
    var p = data && data.product;
    if (!p) {
      box.innerHTML = "<p>" + esc(t("creator.research.not_found", "Product not found.")) + "</p>";
      return;
    }
    var hist = (p.observations || data.snapshots || []).map(function (o) {
      var when = o.collected_at || o.captured_at;
      var day = when ? new Date(Number(when) || when).toISOString().slice(0, 10) : "";
      return "<li>" + esc(day) +
        " · " + t("creator.research.reviews", "reviews") + " " + (o.reviews_count == null ? "—" : o.reviews_count) +
        " · BSR " + (o.bsr == null ? "—" : Number(o.bsr).toLocaleString("de-DE")) + "</li>";
    }).join("");
    var captured = p.latest && p.latest.captured_at;
    var confidence = state.preview
      ? t("creator.research.confidence_preview", "Preview catalog — not live Amazon snapshots yet")
      : t("creator.research.confidence", "Based on last snapshot {time}").replace("{time}", timeAgo(captured) || "—");
    box.innerHTML =
      (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : "") +
      "<h3>" + esc(p.title || p.asin) + "</h3>" +
      '<p class="eazy-research__meta">' + esc(p.asin) + " · " +
        (p.reprint_ok ? t("creator.research.reprint_ok", "Reprint-safe") : t("creator.research.blocked", "Hidden from ranking")) +
        (p.niche_key ? " · " + esc(nicheLabel(p.niche_key)) : "") +
      "</p>" +
      '<p class="eazy-research-drawer__metrics">' +
        esc(stars(p.latest && p.latest.rating)) + " · " +
        (p.latest && p.latest.reviews_count != null ? p.latest.reviews_count : "—") + " " + t("creator.research.reviews", "reviews") +
        (fmtDelta(p.review_delta) ? " · " + esc(fmtDelta(p.review_delta)) : "") +
        " · " + esc(p.latest && p.latest.bsr != null ? "BSR " + Number(p.latest.bsr).toLocaleString("de-DE") : t("creator.research.bsr_missing", "No BSR")) +
        " · " + esc(fmtPrice(p)) +
      "</p>" +
      "<p>" + esc(confidence) + "</p>" +
      "<p>" + t("creator.research.no_sales_claim", "We never show invented unit sales. BSR and reviews are observed snapshots only.") + "</p>" +
      "<h4>" + esc(t("creator.research.history_title", "Snapshot history")) + "</h4>" +
      "<ul>" + hist + "</ul>" +
      '<div class="eazy-research-drawer__cta">' +
        '<a class="eazy-research-drawer__btn" href="' + esc(amazonUrl(p.asin)) + '" target="_blank" rel="noopener noreferrer">' +
          esc(t("creator.research.open_source", "Open on Amazon.de")) + "</a>" +
        '<button type="button" class="eazy-research-drawer__btn" data-erz-gen>' +
          esc(t("creator.research.send_generator", "Send to Generator")) + "</button>" +
      "</div>";
  }

  function closeDetail(root) {
    var drawer = (root && root.querySelector("[data-erz-drawer]")) || document.querySelector("[data-erz-drawer]");
    if (drawer) drawer.hidden = true;
  }

  async function load(root) {
    state.loading = true;
    render(root);
    var data = await api("eazy-research-products", {
      reprint_ok: state.reprintOk ? 1 : 0,
      limit: 80,
      sort: state.sort,
    }).catch(function () { return null; });
    state.loading = false;
    if (!data || !data.ok) {
      var status = root.querySelector("[data-erz-status]");
      if (status) status.textContent = t("creator.research.error", "Research data could not be loaded.");
      state.products = [];
      renderGrid(root);
      return;
    }
    state.preview = Boolean(data.preview);
    state.products = data.products || [];
    state.niches = data.niches || [];
    state.lastRun = data.last_run || null;
    render(root);
  }

  function bind(root) {
    var qTimer = null;
    var q = root.querySelector("[data-erz-q]");
    if (q) {
      q.addEventListener("input", function () {
        state.q = q.value || "";
        clearTimeout(qTimer);
        qTimer = setTimeout(function () { renderGrid(root); }, 180);
      });
    }
    var sort = root.querySelector("[data-erz-sort]");
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value || "review_growth";
        renderGrid(root);
      });
    }
    var safe = root.querySelector("[data-erz-safe]");
    if (safe) {
      safe.addEventListener("change", function () {
        state.reprintOk = Boolean(safe.checked);
        load(root);
      });
    }
    root.addEventListener("click", function (ev) {
      var chip = ev.target.closest("[data-erz-niche]");
      if (chip) {
        state.niche = chip.getAttribute("data-erz-niche") || "all";
        render(root);
        return;
      }
      var tab = ev.target.closest("[data-erz-view]");
      if (tab) {
        state.view = tab.getAttribute("data-erz-view") || "opportunities";
        render(root);
        return;
      }
      var open = ev.target.closest("[data-erz-open]");
      if (open) {
        openDetail(root, open.getAttribute("data-erz-open"));
        return;
      }
      if (ev.target.closest("[data-erz-gen]")) {
        goGenerator();
      }
    });
  }

  function bindDrawer(root) {
    var drawer = root.querySelector("[data-erz-drawer]");
    if (!drawer || drawer.dataset.erzBound === "1") return;
    drawer.dataset.erzBound = "1";
    drawer.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-erz-close]")) closeDetail(root);
      if (ev.target.closest("[data-erz-gen]")) goGenerator();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeDetail(root);
    });
  }

  function mount(root) {
    if (!root || root.dataset.erzBound === "1") return;
    root.dataset.erzBound = "1";
    bind(root);
    bindDrawer(root);
    load(root);
  }

  function boot() {
    document.querySelectorAll("[data-eazy-research]").forEach(mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.EazyResearchPage = { boot: boot, load: load };
})(typeof window !== "undefined" ? window : globalThis);
