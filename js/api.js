/**
 * Creator portal API client — proxies via worker /api/dispatch.
 */
(function (global) {
  "use strict";

  const API_BASE = "/api/dispatch";

  async function dispatch(op, options) {
    options = options || {};
    const method = options.method || "GET";
    const params = options.query || {};
    const url = new URL(API_BASE, global.location.origin);
    url.searchParams.set("op", op);
    Object.keys(params).forEach(function (k) {
      if (params[k] != null && params[k] !== "") url.searchParams.set(k, String(params[k]));
    });

    const init = {
      method: method,
      credentials: "include",
      cache: "no-store",
      headers: {},
    };
    if (options.body != null) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url.toString(), init);
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok && !data.error) data.error = "request_failed";
    data._status = res.status;
    return data;
  }

  global.CreatorPortalApi = {
    dispatch: dispatch,
    me: function () {
      return fetch("/auth/me", { credentials: "include", cache: "no-store" }).then(function (r) {
        return r.json();
      });
    },
    bootstrap: function () {
      return fetch("/api/bootstrap", { credentials: "include", cache: "no-store" }).then(function (r) {
        return r.json();
      });
    },
    ping: function () {
      return fetch("/api/ping", { credentials: "include", cache: "no-store" }).then(function (r) {
        return r.json();
      });
    },
    getDashboardStats: function (ownerId, force) {
      const q = { owner_id: ownerId };
      if (force) q.force = "1";
      return dispatch("get-dashboard-stats", { query: q });
    },
    getBillingLevel: function (ownerId) {
      return dispatch("get-billing-level", { query: { owner_id: ownerId } });
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
