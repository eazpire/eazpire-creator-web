/**
 * eazy Research creator page — reprint-safe demand signals.
 * Cards/modal: image, title, niche, BSR + category, BSR change, reviews if present.
 * Never invents unit sales. No price or star rating in the UI.
 */
(function (global) {
  "use strict";

  var WATCH_KEY = "eazy-research-watched";
  var HEART_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';

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
    watched: [],
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

  function timeAgo(ts) {
    var n = Number(ts);
    if (!n) return "";
    var mins = Math.max(1, Math.round((Date.now() - n) / 60000));
    if (mins < 60) return mins + "m";
    var hours = Math.round(mins / 60);
    if (hours < 48) return hours + "h";
    return Math.round(hours / 24) + "d";
  }

  function amazonUrl(asin) {
    return "https://www.amazon.de/dp/" + encodeURIComponent(asin);
  }

  function loadWatched() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(WATCH_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  function saveWatched(asins) {
    state.watched = asins.slice();
    try {
      if (global.localStorage) global.localStorage.setItem(WATCH_KEY, JSON.stringify(asins));
    } catch (_e) { /* guest storage may be blocked */ }
  }

  function isWatched(asin) {
    return state.watched.indexOf(String(asin)) !== -1;
  }

  function toggleWatch(asin) {
    if (!asin) return;
    var id = String(asin);
    var next = state.watched.filter(function (x) { return x !== id; });
    if (next.length === state.watched.length) next.push(id);
    saveWatched(next);
  }

  function subNicheOf(p) {
    if (!p) return "";
    return p.sub_niche || p.sub_niche_key || p.subniche || "";
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
    out = out.filter(function (p) { return p.reprint_ok === true || Number(p.reprint_ok) === 1; });
    if (state.niche && state.niche !== "all") out = out.filter(function (p) { return p.niche_key === state.niche; });
    var q = String(state.q || "").trim().toLowerCase();
    if (q) {
      out = out.filter(function (p) {
        return [p.title, p.brand, p.asin, p.niche_key].join(" ").toLowerCase().indexOf(q) !== -1;
      });
    }
    if (state.view === "rising") out = out.filter(function (p) { return p.trend === "rising" || (p.rising_score || 0) > 0; });
    if (state.view === "review_growth") out = out.filter(function (p) { return p.review_delta != null && p.review_delta > 0; });
    if (state.view === "watched") {
      out = out.filter(function (p) { return isWatched(p.asin); });
    }
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

  function bsrCategoryOf(p) {
    if (!p) return "";
    if (p.latest && p.latest.bsr_category) return String(p.latest.bsr_category);
    return String(p.bsr_category || "");
  }

  function fmtBsr(p) {
    var rank = p && p.latest && p.latest.bsr != null ? Number(p.latest.bsr) : null;
    if (rank == null || !isFinite(rank) || rank <= 0) return t("creator.research.bsr_missing", "No BSR");
    var rankText = Number(rank).toLocaleString("de-DE");
    var cat = bsrCategoryOf(p);
    if (cat) {
      return t("creator.research.bsr_with_category", "BSR {rank} · {category}")
        .replace("{rank}", rankText)
        .replace("{category}", cat);
    }
    return t("creator.research.bsr_label", "BSR") + " " + rankText;
  }

  function bsrChange(p) {
    var delta = p && p.bsr_delta;
    if (delta == null || !isFinite(Number(delta)) || Number(delta) === 0) return null;
    var improved = p.bsr_improved === true || Number(delta) < 0;
    return {
      improved: improved,
      label: improved
        ? t("creator.research.bsr_change_improved", "↑ Improved")
        : t("creator.research.bsr_change_worse", "↓ Worse"),
    };
  }

  function productCard(p) {
    var img = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">'
      : '<div class="eazy-research-card__ph">' + esc(t("creator.research.unknown", "Unknown")) + "</div>";
    var reviewsCount = p.latest && p.latest.reviews_count != null ? Number(p.latest.reviews_count) : null;
    var reviewsHtml = reviewsCount != null && isFinite(reviewsCount)
      ? '<div class="eazy-research-card__reviews">' +
        esc(t("creator.research.reviews_count", "{count} reviews").replace("{count}", String(reviewsCount))) +
        "</div>"
      : "";
    var change = bsrChange(p);
    var changeHtml = change
      ? '<div class="eazy-research-card__bsr-delta is-' + (change.improved ? "improved" : "worse") + '">' +
        esc(change.label) + "</div>"
      : "";
    var watched = isWatched(p.asin);
    var watchLabel = watched
      ? t("creator.research.watch_remove", "Remove from watchlist")
      : t("creator.research.watch_add", "Add to watchlist");
    return (
      '<article class="eazy-research-card" data-asin="' + esc(p.asin) + '">' +
        '<button type="button" class="eazy-research-card__watch' + (watched ? " is-on" : "") +
          '" data-erz-watch="' + esc(p.asin) + '" aria-pressed="' + (watched ? "true" : "false") +
          '" aria-label="' + esc(watchLabel) + '">' + HEART_SVG + "</button>" +
        '<button type="button" class="eazy-research-card__hit" data-erz-open="' + esc(p.asin) + '">' +
          '<div class="eazy-research-card__media">' + img + "</div>" +
          '<div class="eazy-research-card__body">' +
            "<h3>" + esc(p.title || p.asin) + "</h3>" +
            (p.niche_key
              ? '<div class="eazy-research-card__tags"><span>' + esc(nicheLabel(p.niche_key)) + "</span></div>"
              : "") +
            '<div class="eazy-research-card__bsr">' + esc(fmtBsr(p)) + "</div>" +
            changeHtml +
            reviewsHtml +
          "</div>" +
        "</button>" +
        '<details class="eazy-research-card__menu">' +
          "<summary aria-label=\"" + esc(t("creator.research.menu", "Product actions")) + "\">⋯</summary>" +
          '<div class="eazy-research-card__menu-list">' +
            '<a href="' + esc(amazonUrl(p.asin)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("creator.research.open_source", "Open on Amazon.de")) + "</a>" +
            '<button type="button" data-erz-watch="' + esc(p.asin) + '">' +
              esc(watched ? t("creator.research.watch_remove", "Remove from watchlist") : t("creator.research.watch", "Watch")) +
            "</button>" +
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
          ? t("creator.research.empty_watched", "No watched products yet. Tap the heart on a product to start tracking it.")
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
        " · " + count +
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

  function statRow(label, value) {
    return (
      '<div class="eazy-research-modal__stat">' +
        '<span class="eazy-research-modal__stat-label">' + esc(label) + "</span>" +
        '<span class="eazy-research-modal__stat-value">' + esc(value) + "</span>" +
      "</div>"
    );
  }

  function detailHtml(p) {
    var reviewsCount = p.latest && p.latest.reviews_count != null ? Number(p.latest.reviews_count) : null;
    var reviewsRow = reviewsCount != null && isFinite(reviewsCount)
      ? statRow(t("creator.research.reviews_total", "Reviews total"), String(reviewsCount))
      : "";
    var change = bsrChange(p);
    var changeRow = change
      ? statRow(t("creator.research.bsr_change", "BSR change"), change.label)
      : "";
    var niche = p.niche_key ? nicheLabel(p.niche_key) : "";
    var sub = subNicheOf(p);
    var nicheLine = [niche, sub].filter(Boolean).join(" · ");
    return (
      (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : "") +
      '<h3 id="eazy-research-modal-title">' + esc(p.title || p.asin) + "</h3>" +
      (nicheLine ? '<p class="eazy-research__meta">' + esc(nicheLine) + "</p>" : "") +
      '<div class="eazy-research-modal__stats">' +
        statRow(t("creator.research.bsr_label", "BSR"), fmtBsr(p)) +
        changeRow +
        reviewsRow +
      "</div>"
    );
  }

  async function openDetail(root, asin) {
    var modal = root.querySelector("[data-erz-modal]");
    var box = modal && modal.querySelector("[data-erz-detail]");
    if (!modal || !box) return;
    modal.hidden = false;
    box.innerHTML = "<p>" + esc(t("creator.research.loading", "Loading...")) + "</p>";
    var local = (state.products || []).find(function (x) { return x.asin === asin; }) || null;
    var data = await api("eazy-research-product", { asin: asin }).catch(function () { return null; });
    var p = (data && data.product) || local;
    if (!p) {
      box.innerHTML = "<p>" + esc(t("creator.research.not_found", "Product not found.")) + "</p>";
      return;
    }
    if (local) {
      if (p.review_delta == null && local.review_delta != null) p.review_delta = local.review_delta;
      if (!p.review_delta_window && local.review_delta_window) p.review_delta_window = local.review_delta_window;
      if (p.bsr_delta == null && local.bsr_delta != null) p.bsr_delta = local.bsr_delta;
      if (p.bsr_improved == null && local.bsr_improved != null) p.bsr_improved = local.bsr_improved;
      if (!p.bsr_category && local.bsr_category) p.bsr_category = local.bsr_category;
      if (!p.niche_key && local.niche_key) p.niche_key = local.niche_key;
      if (p.latest && local.latest && !p.latest.bsr_category && local.latest.bsr_category) {
        p.latest.bsr_category = local.latest.bsr_category;
      }
    }
    box.innerHTML = detailHtml(p);
  }

  function closeDetail(root) {
    var modal = (root && root.querySelector("[data-erz-modal]")) || document.querySelector("[data-erz-modal]");
    if (modal) modal.hidden = true;
  }

  async function load(root) {
    state.loading = true;
    render(root);
    var data = await api("eazy-research-products", {
      reprint_ok: 1,
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
    var toolbar = root.querySelector("[data-erz-toolbar]");
    if (toolbar) {
      toolbar.addEventListener("submit", function (ev) { ev.preventDefault(); });
    }
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
    root.addEventListener("click", function (ev) {
      var watch = ev.target.closest("[data-erz-watch]");
      if (watch) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleWatch(watch.getAttribute("data-erz-watch"));
        render(root);
        return;
      }
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

  function bindModal(root) {
    var modal = root.querySelector("[data-erz-modal]");
    if (!modal || modal.dataset.erzBound === "1") return;
    modal.dataset.erzBound = "1";
    modal.addEventListener("click", function (ev) {
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
    state.watched = loadWatched();
    bind(root);
    bindModal(root);
    load(root);
  }

  function boot() {
    document.querySelectorAll("[data-eazy-research]").forEach(mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.EazyResearchPage = { boot: boot, load: load };
})(typeof window !== "undefined" ? window : globalThis);
