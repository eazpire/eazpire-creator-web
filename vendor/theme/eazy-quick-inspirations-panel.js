/**
 * Eazy Chat — Quick Inspirations page (same list API as the QI modal).
 * Click opens a large preview only — no apply, edit, or upload.
 */
(function () {
  "use strict";

  var API_BASE = "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  var PAGE_SIZE = 36;
  var bound = false;
  var loading = false;
  var items = [];
  var total = 0;
  var offset = 0;
  var scope = "public";
  var searchQuery = "";
  var origin = "";
  var searchTimer = null;

  function t(key, fallback) {
    if (window.CreatorI18n && window.CreatorI18n[key]) return window.CreatorI18n[key];
    var el = document.querySelector('[data-t="' + key + '"]');
    if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    return fallback || key;
  }

  function getOwnerId() {
    try {
      if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    } catch (_e0) {}
    try {
      if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId).trim();
    } catch (_e1) {}
    try {
      if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.OWNER_ID) {
        return String(window.CREATOR_API_CONFIG.OWNER_ID).trim();
      }
    } catch (_e2) {}
    try {
      var meta = document.querySelector('meta[name="eaz-owner-id"], meta[name="creator-owner-id"]');
      if (meta && meta.content) return String(meta.content).trim();
    } catch (_e3) {}
    try {
      if (window.CreatorWidget && window.CreatorWidget.ownerId) {
        return String(window.CreatorWidget.ownerId).trim();
      }
    } catch (_e4) {}
    return "";
  }

  function apiUrl(op) {
    var u = new URL(API_BASE);
    u.searchParams.set("op", op);
    var oid = getOwnerId();
    if (oid) {
      u.searchParams.set("owner_id", oid);
      u.searchParams.set("logged_in_customer_id", oid);
    }
    return u;
  }

  function els() {
    return {
      root: document.getElementById("eazy-qi-root"),
      grid: document.getElementById("eazy-qi-grid"),
      empty: document.getElementById("eazy-qi-empty"),
      loading: document.getElementById("eazy-qi-loading"),
      more: document.getElementById("eazy-qi-more"),
      search: document.getElementById("eazy-qi-search"),
      preview: document.getElementById("eazy-qi-preview"),
      previewImg: document.getElementById("eazy-qi-preview-img"),
    };
  }

  function setEmpty(message) {
    var e = els();
    if (!e.empty) return;
    e.empty.textContent = message || "";
    e.empty.hidden = !message;
  }

  function renderGrid(append) {
    var e = els();
    if (!e.grid) return;
    if (!append) e.grid.innerHTML = "";
    items.forEach(function (item, index) {
      if (append && index < offset) return;
      var thumb = item.thumb_url || item.image_url || "";
      var full = item.image_url || thumb;
      if (!thumb && !full) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "eazy-qi__card";
      btn.setAttribute("data-qi-id", item.id || "");
      btn.setAttribute("aria-label", t("eazy_chat.qi_preview_open", "Open preview"));
      var img = document.createElement("img");
      img.src = thumb;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      btn.appendChild(img);
      btn.addEventListener("click", function () {
        openPreview(full);
      });
      e.grid.appendChild(btn);
    });
    if (e.more) e.more.hidden = items.length >= total || items.length === 0;
  }

  function openPreview(url) {
    var e = els();
    if (!e.preview || !e.previewImg || !url) return;
    e.previewImg.src = url;
    e.preview.hidden = false;
    e.preview.setAttribute("aria-hidden", "false");
  }

  function closePreview() {
    var e = els();
    if (!e.preview || !e.previewImg) return;
    e.preview.hidden = true;
    e.preview.setAttribute("aria-hidden", "true");
    e.previewImg.removeAttribute("src");
  }

  async function loadItems(opts) {
    opts = opts || {};
    var e = els();
    if (!e.grid || loading) return;
    if (scope === "yours" && !getOwnerId()) {
      items = [];
      total = 0;
      renderGrid(false);
      setEmpty(t("eazy_chat.qi_empty_yours_login", "Sign in to see your Quick Inspirations."));
      if (e.loading) e.loading.hidden = true;
      if (e.more) e.more.hidden = true;
      return;
    }

    loading = true;
    if (e.loading && !opts.append) e.loading.hidden = false;
    if (!opts.append) setEmpty("");

    try {
      var u = apiUrl("list-quick-inspirations");
      if (scope === "yours") u.searchParams.set("mine", "1");
      else if (getOwnerId()) u.searchParams.set("exclude_mine", "1");
      if (searchQuery) u.searchParams.set("search", searchQuery);
      if (origin) u.searchParams.set("origin", origin);
      u.searchParams.set("limit", String(PAGE_SIZE));
      u.searchParams.set("offset", String(opts.append ? items.length : 0));
      var res = await fetch(u.toString(), { credentials: "omit" });
      var data = await res.json().catch(function () {
        return {};
      });
      var page = (data && (data.items || data.designs)) || [];
      total = Number(data && data.total) || page.length;
      if (opts.append) items = items.concat(page);
      else items = page;
      offset = items.length;
      renderGrid(!!opts.append);
      if (!items.length) {
        setEmpty(
          scope === "yours"
            ? t("eazy_chat.qi_empty_yours", "You have no Quick Inspirations yet.")
            : t("eazy_chat.qi_empty", "No quick inspirations yet.")
        );
      }
    } catch (_err) {
      if (!opts.append) {
        items = [];
        renderGrid(false);
        setEmpty(t("eazy_chat.qi_error", "Could not load inspirations."));
      }
    } finally {
      loading = false;
      if (e.loading) e.loading.hidden = true;
    }
  }

  function setScope(next) {
    if (scope === next) return;
    scope = next;
    document.querySelectorAll("[data-eazy-qi-scope]").forEach(function (btn) {
      var on = btn.getAttribute("data-eazy-qi-scope") === next;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    closePreview();
    loadItems();
  }

  function setOrigin(next) {
    origin = next || "";
    document.querySelectorAll("[data-eazy-qi-origin]").forEach(function (btn) {
      var value = btn.getAttribute("data-eazy-qi-origin") || "";
      btn.classList.toggle("is-active", value === origin);
    });
    closePreview();
    loadItems();
  }

  function bind() {
    if (bound) return;
    var e = els();
    if (!e.root) return;
    bound = true;

    document.querySelectorAll("[data-eazy-qi-scope]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setScope(btn.getAttribute("data-eazy-qi-scope") || "public");
      });
    });
    document.querySelectorAll("[data-eazy-qi-origin]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setOrigin(btn.getAttribute("data-eazy-qi-origin") || "");
      });
    });
    if (e.search) {
      e.search.addEventListener("input", function () {
        var value = String(e.search.value || "").trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchQuery = value;
          closePreview();
          loadItems();
        }, 280);
      });
    }
    if (e.more) {
      e.more.addEventListener("click", function () {
        loadItems({ append: true });
      });
    }
    if (e.preview) {
      e.preview.addEventListener("click", function (ev) {
        if (ev.target && ev.target.closest("[data-eazy-qi-preview-close], .eazy-qi__preview-backdrop")) {
          closePreview();
        }
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closePreview();
    });
  }

  function init() {
    bind();
    closePreview();
    loadItems();
  }

  window.EazyQuickInspirationsPanel = {
    init: init,
    closePreview: closePreview,
  };
})();
