/**
 * Shop → creator.eazpire.com session handoff (exchange token, no visible bridge page).
 */
(function () {
  "use strict";

  var CREATOR_ORIGIN = "https://creator.eazpire.com";
  var PORTAL_HOME = CREATOR_ORIGIN + "/";
  var BRIDGE_PATH = "/pages/creator-handoff";

  function dispatchBase() {
    if (
      typeof window.CREATOR_API_CONFIG !== "undefined" &&
      typeof window.CREATOR_API_CONFIG.getDispatchUrl === "function"
    ) {
      try {
        return window.CREATOR_API_CONFIG.getDispatchUrl();
      } catch (e) {}
    }
    return window.location.origin.replace(/\/$/, "") + "/__eaz/creator-dispatch";
  }

  function readCustomerId(explicit) {
    var cid = explicit != null ? String(explicit).trim() : "";
    if (cid) return cid;
    if (typeof window._resolveEazOwnerId === "function") {
      try {
        var resolved = window._resolveEazOwnerId();
        if (resolved) return String(resolved).trim();
      } catch (e) {}
    }
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    if (window.logged_in_customer_id) return String(window.logged_in_customer_id).trim();
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId).trim();
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta) {
      var metaId = String(meta.getAttribute("content") || "").trim();
      if (metaId) return metaId;
    }
    return "";
  }

  function storefrontLoginUrl() {
    return "/customer_authentication/login?return_to=" + encodeURIComponent(BRIDGE_PATH);
  }

  function portalHomeUrl() {
    return PORTAL_HOME;
  }

  function completeUrl(exchangeToken) {
    return (
      CREATOR_ORIGIN +
      "/auth/complete?exchange_token=" +
      encodeURIComponent(String(exchangeToken || ""))
    );
  }

  function formatIssueError(issue) {
    if (!issue || typeof issue !== "object") return "Could not verify your account. Please try again.";
    var parts = [];
    if (issue.error) parts.push(String(issue.error));
    if (issue.detail) parts.push(String(issue.detail));
    return parts.length ? parts.join(" — ") : "Could not verify your account. Please try again.";
  }

  var cachedHandoff = null;
  var cachedHandoffAt = 0;
  var HANDOFF_CACHE_MS = 90000;

  function issueExchangeToken(customerId) {
    var cid = readCustomerId(customerId);
    if (!cid) {
      return Promise.resolve({ ok: false, error: "not_logged_in", loginUrl: storefrontLoginUrl() });
    }

    var issueUrl = new URL(dispatchBase());
    issueUrl.searchParams.set("op", "community-issue-exchange-token");
    issueUrl.searchParams.set("logged_in_customer_id", cid);

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) {
        try {
          controller.abort();
        } catch (e) {}
      }
    }, 6000);
    var fetchOpts = { credentials: "include" };
    if (controller) fetchOpts.signal = controller.signal;

    return fetch(issueUrl.toString(), fetchOpts)
      .then(function (issueRes) {
        return issueRes.json().catch(function () {
          return {};
        }).then(function (issue) {
          if (!issueRes.ok || !issue.ok || !issue.exchange_token) {
            return {
              ok: false,
              error: formatIssueError(issue),
              loginUrl: storefrontLoginUrl(),
            };
          }
          return { ok: true, url: completeUrl(issue.exchange_token) };
        });
      })
      .catch(function () {
        // Timed out / network — fall back to portal home (guest session or re-login there).
        return { ok: false, error: "Network error. Please try again.", url: portalHomeUrl() };
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function prefetchExchangeToken(opts) {
    opts = opts || {};
    var cid = readCustomerId(opts.customerId);
    if (!cid) return Promise.resolve(null);
    if (cachedHandoff && Date.now() - cachedHandoffAt < HANDOFF_CACHE_MS) {
      return cachedHandoff;
    }
    cachedHandoffAt = Date.now();
    cachedHandoff = issueExchangeToken(cid).then(function (result) {
      if (!(result && result.ok && result.url)) {
        cachedHandoff = null;
        cachedHandoffAt = 0;
      }
      return result;
    });
    return cachedHandoff;
  }

  function resolveTargetUrl(opts) {
    opts = opts || {};
    var cid = readCustomerId(opts.customerId);
    if (!cid) {
      return Promise.resolve(portalHomeUrl());
    }
    var pending =
      cachedHandoff && Date.now() - cachedHandoffAt < HANDOFF_CACHE_MS
        ? cachedHandoff
        : prefetchExchangeToken({ customerId: cid });
    return pending.then(function (result) {
      if (result && result.ok && result.url) return result.url;
      // Prefer portal home over loginUrl so switch always reaches Creator Hub.
      if (result && result.url) return result.url;
      if (result && result.loginUrl) return result.loginUrl;
      return portalHomeUrl();
    });
  }

  function navigateToPortal(opts) {
    opts = opts || {};
    return resolveTargetUrl(opts).then(function (url) {
      window.location.replace(url);
      return url;
    });
  }

  window.EazCreatorPortalHandoff = {
    CREATOR_ORIGIN: CREATOR_ORIGIN,
    BRIDGE_PATH: BRIDGE_PATH,
    portalHomeUrl: portalHomeUrl,
    storefrontLoginUrl: storefrontLoginUrl,
    readCustomerId: readCustomerId,
    issueExchangeToken: issueExchangeToken,
    prefetchExchangeToken: prefetchExchangeToken,
    resolveTargetUrl: resolveTargetUrl,
    navigateToPortal: navigateToPortal,
    completeUrl: completeUrl,
    formatIssueError: formatIssueError,
  };
})();
