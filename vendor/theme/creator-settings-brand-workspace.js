/**
 * Creator Settings → Brand Workspace panel (theme + creator portal)
 */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ownerId() {
    try {
      if (window.__CREATOR_OWNER_ID) return String(window.__CREATOR_OWNER_ID);
      if (window.ShopifyAnalytics?.meta?.page?.customerId) {
        return String(window.ShopifyAnalytics.meta.page.customerId);
      }
    } catch (e) {}
    return "";
  }

  async function dispatch(op, options) {
    options = options || {};
    if (window.CreatorPortalApi && typeof window.CreatorPortalApi.dispatch === "function") {
      return window.CreatorPortalApi.dispatch(op, options);
    }
    if (typeof window.creatorApiFetch === "function") {
      var params = Object.assign({}, options.query || {});
      var oid = ownerId();
      if (oid) {
        params.owner_id = oid;
        params.logged_in_customer_id = oid;
      }
      return window.creatorApiFetch(op, params, {
        method: options.method || "GET",
        body: options.body != null ? options.body : undefined,
      });
    }
    var url = new URL("/apps/creator-dispatch", window.location.origin);
    url.searchParams.set("op", op);
    var oid2 = ownerId();
    if (oid2) {
      url.searchParams.set("owner_id", oid2);
      url.searchParams.set("logged_in_customer_id", oid2);
    }
    Object.keys(options.query || {}).forEach(function (k) {
      if (options.query[k] != null) url.searchParams.set(k, String(options.query[k]));
    });
    var init = { method: options.method || "GET", credentials: "include", cache: "no-store", headers: {} };
    if (options.body != null) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    var res = await fetch(url.toString(), init);
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok && !data.error) data.error = "request_failed";
    return data;
  }

  async function load() {
    var mount = document.getElementById("csm-brand-workspace-mount");
    if (!mount) return;
    mount.innerHTML = '<p class="csm-brand-workspace__note">Loading…</p>';
    try {
      var data = await dispatch("creator-brand-workspaces");
      if (!data.ok) {
        mount.innerHTML =
          '<p class="csm-brand-workspace__note">' +
          escapeHtml(data.error || "Could not load brand workspaces.") +
          "</p>";
        return;
      }
      var workspaces = data.workspaces || [];
      var active = data.active;
      if (!workspaces.length) {
        mount.innerHTML =
          '<p class="csm-brand-workspace__note">No brand invites yet. Ask a brand owner to invite your email in the Brand Portal, then link your eazpire Account there.</p>';
        return;
      }
      var rows = workspaces
        .map(function (w) {
          var isActive = !!(active && active.brand_id === w.brand_id);
          return (
            '<div class="csm-brand-workspace__row">' +
            '<div class="csm-brand-workspace__meta">' +
            '<span class="csm-brand-workspace__name">' +
            escapeHtml(w.name || w.handle) +
            "</span>" +
            '<span class="csm-brand-workspace__sub">@' +
            escapeHtml(w.handle || "") +
            " · " +
            escapeHtml(w.role || "creator") +
            " · " +
            escapeHtml(w.publish_mode === "auto_publish" ? "Auto publish" : "Review") +
            (isActive ? " · active" : "") +
            "</span></div>" +
            (isActive
              ? '<button type="button" class="csm-brand-workspace__btn is-active" data-brand-clear>Personal</button>'
              : '<button type="button" class="csm-brand-workspace__btn" data-brand-set="' +
                escapeHtml(w.brand_id) +
                '">Switch</button>') +
            "</div>"
          );
        })
        .join("");
      mount.innerHTML =
        '<p class="csm-brand-workspace__note">Active workspace applies to new publishes. Review mode keeps Shopify listings unpublished until the brand promotes them.</p>' +
        '<div class="csm-brand-workspace__list">' +
        rows +
        "</div>";

      mount.querySelectorAll("[data-brand-set]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          btn.disabled = true;
          await dispatch("creator-brand-workspaces", {
            method: "POST",
            body: { brand_id: btn.getAttribute("data-brand-set") },
          });
          load();
        });
      });
      mount.querySelectorAll("[data-brand-clear]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          btn.disabled = true;
          await dispatch("creator-brand-workspaces", {
            method: "POST",
            body: { clear: true },
          });
          load();
        });
      });
    } catch (e) {
      mount.innerHTML =
        '<p class="csm-brand-workspace__note">' + escapeHtml(e.message || "Error") + "</p>";
    }
  }

  window.addEventListener("creator-settings-v2-tab-changed", function (ev) {
    if (ev && ev.detail && ev.detail.tab === "brand-workspace") load();
  });

  window.CreatorBrandWorkspacePanel = { refresh: load };
})();
