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

    const isGet = method === "GET" || method === "HEAD";
    const maxAttempts = isGet ? 3 : 1;
    let res = null;
    let data = {};
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await new Promise(function (r) {
          setTimeout(r, 160 * attempt * attempt);
        });
      }
      res = await fetch(url.toString(), init);
      data = await res.json().catch(function () {
        return {};
      });
      const retryable = isGet && attempt < maxAttempts && res.status >= 502 && res.status <= 504;
      if (!retryable) break;
    }
    if (!res.ok && !data.error) data.error = "request_failed";
    data._status = res ? res.status : 0;
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
      // Longer timeout budget: logged-in bootstrap may include chrome prefetch.
      return fetch("/api/bootstrap", { credentials: "include", cache: "no-store" }).then(function (r) {
        return r.json();
      });
    },
    dashboardChrome: function (ownerId) {
      var oid = ownerId;
      return Promise.all([
        dispatch("get-balance", { query: { owner_id: oid } }).catch(function () {
          return null;
        }),
        dispatch("get-level", { query: { owner_id: oid } }).catch(function () {
          return null;
        }),
        dispatch("get-onboarding-progress", { query: { owner_id: oid } }).catch(function () {
          return null;
        }),
        dispatch("get-daily-limits", { query: { owner_id: oid } }).catch(function () {
          return null;
        }),
        dispatch("get-dashboard-stats", { query: { owner_id: oid } }).catch(function () {
          return null;
        }),
      ]).then(function (parts) {
        return {
          balance: parts[0],
          level: parts[1],
          onboarding: parts[2],
          daily_limits: parts[3],
          dashboard_stats: parts[4],
        };
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
