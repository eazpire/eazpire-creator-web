/**
 * eazy Research creator page — Amazon.de catalog snapshots, reprint-safe by default.
 * Reviews/BSR come from stored observations only. No invented sales.
 */
(function (global) {
  "use strict";

  function t(key, fallback) {
    if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.t === "function") {
      var v = global.CreatorPortalI18n.t(key);
      if (v) return v;
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

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.firstElementChild;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDelta(n, suffix) {
    if (n == null || !isFinite(Number(n))) return t("creator.research.unknown", "Unknown");
    var v = Number(n);
    return (v > 0 ? "+" : "") + v + (suffix || "");
  }

  function productRow(p) {
    var img = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="">'
      : '<span class="eazy-research__meta">No image</span>';
    var trend = p.trend || "unknown";
    var reviews = p.latest && p.latest.reviews_count != null ? p.latest.reviews_count : "—";
    var bsr = p.latest && p.latest.bsr != null ? "BSR " + p.latest.bsr : t("creator.research.bsr_missing", "No BSR");
    return (
      '<button type="button" class="eazy-research__item" data-asin="' + esc(p.asin) + '">' +
        img +
        "<div><strong>" + esc(p.title || p.asin) + "</strong>" +
        '<div class="eazy-research__meta">' + esc(bsr) + " · " + esc(String(reviews)) + " " + t("creator.research.reviews", "reviews") +
        " · " + t("creator.research.review_delta", "Review change") + " " + esc(fmtDelta(p.review_delta)) + "</div></div>" +
        '<span class="eazy-research__badge is-' + esc(trend) + '">' + esc(trend) + "</span>" +
      "</button>"
    );
  }

  function renderList(node, rows, emptyText) {
    if (!node) return;
    if (!rows || !rows.length) {
      node.innerHTML = '<p class="eazy-research__empty">' + esc(emptyText) + "</p>";
      return;
    }
    node.innerHTML = rows.map(productRow).join("");
  }

  function bindAsins(root, onOpen) {
    root.querySelectorAll("[data-asin]").forEach(function (btn) {
      btn.addEventListener("click", function () { onOpen(btn.getAttribute("data-asin")); });
    });
  }

  async function openDetail(root, asin) {
    var box = root.querySelector("[data-erz-detail]");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = "<p>" + esc(t("creator.research.loading", "Loading...")) + "</p>";
    var data = await api("eazy-research-product", { asin: asin });
    var p = data && data.product;
    if (!p) {
      box.innerHTML = "<p>" + esc(t("creator.research.not_found", "Product not found.")) + "</p>";
      return;
    }
    var hist = (p.observations || []).map(function (o) {
      return "<li>" + new Date(o.collected_at).toISOString().slice(0, 10) +
        " · " + t("creator.research.reviews", "reviews") + " " + (o.reviews_count == null ? "—" : o.reviews_count) +
        " · BSR " + (o.bsr == null ? "—" : o.bsr) + "</li>";
    }).join("");
    box.innerHTML =
      (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : "") +
      "<h3>" + esc(p.title || p.asin) + "</h3>" +
      '<p class="eazy-research__meta">' + esc(p.asin) + " · " + (p.reprint_ok ? t("creator.research.reprint_ok", "Reprint-safe") : t("creator.research.blocked", "Hidden from ranking")) + "</p>" +
      "<p>" + t("creator.research.review_delta", "Review change") + ": " + esc(fmtDelta(p.review_delta)) + "</p>" +
      "<p>" + t("creator.research.no_sales_claim", "We never show invented unit sales. BSR and reviews are observed snapshots only.") + "</p>" +
      "<ul>" + hist + "</ul>";
  }

  async function load(root) {
    var status = root.querySelector("[data-erz-status]");
    if (status) status.textContent = t("creator.research.loading", "Loading...");
    var data = await api("eazy-research-overview").catch(function () { return null; });
    if (!data || !data.ok) {
      if (status) status.textContent = t("creator.research.error", "Research data could not be loaded.");
      return;
    }
    var last = data.last_run;
    if (status) {
      status.textContent = last
        ? t("creator.research.last_run", "Last snapshot") + ": " + new Date(last.collected_at).toLocaleString() +
          " · " + (last.niche_pack || "") + " · " + t("creator.research.reviews_note", "Review counts stay empty until Amazon returns them.")
        : t("creator.research.empty", "No Amazon.de snapshots yet. Official catalog collection runs in the background.");
    }
    renderList(root.querySelector("[data-erz-rising]"), data.rising, t("creator.research.empty_rising", "No rising reprint-safe products yet."));
    renderList(root.querySelector("[data-erz-reviews]"), data.review_growth, t("creator.research.empty_reviews", "No review growth yet — needs at least two snapshots."));
    var niches = root.querySelector("[data-erz-niches]");
    if (niches) {
      var list = data.niches || [];
      niches.innerHTML = list.length
        ? list.map(function (n) {
            return '<div class="eazy-research__item"><div><strong>' + esc(n.label || n.niche_key) + "</strong>" +
              '<div class="eazy-research__meta">' + t("creator.research.review_velocity", "Review velocity") + " " +
              esc(fmtDelta(n.review_velocity)) + "</div></div></div>";
          }).join("")
        : '<p class="eazy-research__empty">' + esc(t("creator.research.empty_niches", "Niche packs are ready; snapshots will fill scores.")) + "</p>";
    }
    var runs = root.querySelector("[data-erz-runs]");
    if (runs) {
      var rr = data.last_run ? [data.last_run] : [];
      runs.innerHTML = rr.length
        ? rr.map(function (r) {
            return '<p class="eazy-research__meta">' + esc(r.id) + " · " + esc(r.status || "") + " · " +
              (r.product_count || 0) + " products</p>";
          }).join("")
        : '<p class="eazy-research__empty">' + esc(t("creator.research.empty_runs", "Collector has not completed a run yet.")) + "</p>";
    }
    bindAsins(root, function (asin) { openDetail(root, asin); });
  }

  function mount(root) {
    if (!root || root.dataset.erzBound === "1") return;
    root.dataset.erzBound = "1";
    load(root);
  }

  function boot() {
    document.querySelectorAll("[data-eazy-research]").forEach(mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.EazyResearchPage = { boot: boot, load: load };
})(typeof window !== "undefined" ? window : globalThis);
