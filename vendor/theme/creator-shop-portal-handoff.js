/**
 * Shop → creator.eazpire.com session handoff.
 *
 * Logged-in switch issues an exchange ticket on the current shop page (prefetch
 * in the background), then navigates once to creator.eazpire.com/auth/complete.
 * /auth/complete sets the session cookie and serves the Creator SPA in the same
 * response, so Safari bounce-tracking cannot drop the cookie.
 *
 * /pages/creator-handoff is only for Shopify login return_to and as a last
 * fallback when ticket issue fails.
 */
(function () {
  "use strict";

  var CREATOR_ORIGIN = "https://creator.eazpire.com";
  var SHOP_ORIGIN = "https://www.eazpire.com";
  var PORTAL_HOME = CREATOR_ORIGIN + "/";
  var BRIDGE_PATH = "/pages/creator-handoff";
  var ISSUE_TIMEOUT_MS = 10000;
  var TOKEN_REUSE_MS = 90000;

  function onShopHost() {
    try {
      var host = String(window.location.hostname || "").toLowerCase();
      return host === "www.eazpire.com" || host === "eazpire.com" || host === "allyoucanpink.myshopify.com";
    } catch (e) {
      return false;
    }
  }

  function shopPath(path) {
    return onShopHost() ? path : SHOP_ORIGIN + path;
  }

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
    return shopPath("/customer_authentication/login?return_to=" + encodeURIComponent(BRIDGE_PATH));
  }

  function portalHomeUrl() {
    return PORTAL_HOME;
  }

  function readNextParam() {
    try {
      var next = new URLSearchParams(window.location.search || "").get("next");
      if (!next) return "";
      next = String(next);
      if (next.charAt(0) !== "/" || next.charAt(1) === "/") return "";
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return "";
      return next;
    } catch (e) {
      return "";
    }
  }

  function completeUrl(exchangeToken) {
    var url =
      CREATOR_ORIGIN +
      "/auth/complete?exchange_token=" +
      encodeURIComponent(String(exchangeToken || ""));
    var next = readNextParam() || "/dashboard";
    url += "&next=" + encodeURIComponent(next);
    return url;
  }

  function formatIssueError(issue) {
    if (!issue || typeof issue !== "object") return "Could not verify your account. Please try again.";
    var parts = [];
    if (issue.error) parts.push(String(issue.error));
    if (issue.detail) parts.push(String(issue.detail));
    return parts.length ? parts.join(" — ") : "Could not verify your account. Please try again.";
  }

  var inflightIssue = null;
  var inflightCid = "";
  var inflightAt = 0;

  function resultIsFresh(result) {
    if (!result || !result.ok || !result.url) return false;
    var issuedAt = Number(result.issuedAt || inflightAt || 0);
    if (!issuedAt) return false;
    return Date.now() - issuedAt < TOKEN_REUSE_MS;
  }

  function fetchExchangeToken(customerId) {
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
    }, ISSUE_TIMEOUT_MS);
    var fetchOpts = { credentials: "include", cache: "no-store" };
    if (controller) fetchOpts.signal = controller.signal;

    return fetch(issueUrl.toString(), fetchOpts)
      .then(function (issueRes) {
        return issueRes
          .json()
          .catch(function () {
            return {};
          })
          .then(function (issue) {
            if (!issueRes.ok || !issue.ok || !issue.exchange_token) {
              return {
                ok: false,
                error: formatIssueError(issue),
                reason: issue.reason || "",
                loginUrl: storefrontLoginUrl(),
              };
            }
            return { ok: true, url: completeUrl(issue.exchange_token), issuedAt: Date.now() };
          });
      })
      .catch(function (err) {
        var name = err && err.name ? String(err.name) : "";
        var aborted = name === "AbortError" || name === "TimeoutError";
        return {
          ok: false,
          error: aborted ? "timeout" : "Network error. Please try again.",
          loginUrl: storefrontLoginUrl(),
        };
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function issueExchangeToken(customerId) {
    var cid = readCustomerId(customerId);
    if (!cid) {
      return Promise.resolve({ ok: false, error: "not_logged_in", loginUrl: storefrontLoginUrl() });
    }
    if (inflightIssue && inflightCid === cid && Date.now() - inflightAt < TOKEN_REUSE_MS) {
      return inflightIssue.then(function (result) {
        if (resultIsFresh(result)) return result;
        inflightIssue = null;
        inflightCid = "";
        inflightAt = 0;
        return issueExchangeToken(cid);
      });
    }
    inflightCid = cid;
    inflightAt = Date.now();
    inflightIssue = fetchExchangeToken(cid).then(function (result) {
      if (!(result && result.ok && result.url)) {
        inflightIssue = null;
        inflightCid = "";
        inflightAt = 0;
      } else if (!result.issuedAt) {
        result.issuedAt = inflightAt;
      }
      return result;
    });
    return inflightIssue;
  }

  function takeInflightIssue() {
    if (!inflightIssue || Date.now() - inflightAt >= TOKEN_REUSE_MS) {
      inflightIssue = null;
      inflightCid = "";
      inflightAt = 0;
      return null;
    }
    var pending = inflightIssue;
    inflightIssue = null;
    inflightCid = "";
    inflightAt = 0;
    return pending;
  }

  function prefetchExchangeToken(opts) {
    opts = opts || {};
    return issueExchangeToken(opts.customerId);
  }

  function loggedInFallbackUrl() {
    var next = readNextParam() || "/dashboard";
    return shopPath(BRIDGE_PATH + "?next=" + encodeURIComponent(next));
  }

  function isRetryableIssue(result) {
    if (!result) return true;
    if (result.error === "timeout") return true;
    return /network/i.test(String(result.error || ""));
  }

  // Issue the ticket on the current shop page, then go once to /auth/complete.
  // The Shopify handoff page is only used if issue fails after retries.
  function resolveTargetUrl(opts) {
    opts = opts || {};
    var cid = readCustomerId(opts.customerId);
    if (!cid) {
      return Promise.resolve(storefrontLoginUrl());
    }
    var attempts = 0;
    function attempt() {
      attempts += 1;
      return issueExchangeToken(cid).then(function (result) {
        if (result && result.ok && result.url) return result.url;
        if (result && result.error === "not_logged_in") return storefrontLoginUrl();
        if (isRetryableIssue(result) && attempts < 2) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 280 * attempts);
          }).then(attempt);
        }
        return loggedInFallbackUrl();
      });
    }
    return attempt();
  }

  function navigateToPortal(opts) {
    opts = opts || {};
    return resolveTargetUrl(opts).then(function (url) {
      window.location.replace(url);
      return url;
    });
  }

  function onHandoffPage() {
    try {
      return String(window.location.pathname || "").indexOf(BRIDGE_PATH) === 0;
    } catch (e) {
      return false;
    }
  }

  function armBackgroundPrefetch() {
    if (!onShopHost() || onHandoffPage() || !readCustomerId()) return;
    function run() {
      prefetchExchangeToken({});
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 400);
    }
  }

  window.EazCreatorPortalHandoff = {
    CREATOR_ORIGIN: CREATOR_ORIGIN,
    BRIDGE_PATH: BRIDGE_PATH,
    TOKEN_REUSE_MS: TOKEN_REUSE_MS,
    portalHomeUrl: portalHomeUrl,
    storefrontLoginUrl: storefrontLoginUrl,
    readCustomerId: readCustomerId,
    issueExchangeToken: issueExchangeToken,
    prefetchExchangeToken: prefetchExchangeToken,
    takeInflightIssue: takeInflightIssue,
    resolveTargetUrl: resolveTargetUrl,
    navigateToPortal: navigateToPortal,
    completeUrl: completeUrl,
    formatIssueError: formatIssueError,
  };

  armBackgroundPrefetch();
})();
