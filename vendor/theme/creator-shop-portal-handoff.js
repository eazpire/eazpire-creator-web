/**
 * Shop → creator.eazpire.com session handoff (exchange token, no visible bridge page).
 * Prefetched tickets expire after 2 minutes; reuse at most 8s so a long shop
 * visit never lands on /auth/complete with a stale token.
 */
(function () {
  "use strict";

  var CREATOR_ORIGIN = "https://creator.eazpire.com";
  var PORTAL_HOME = CREATOR_ORIGIN + "/";
  var BRIDGE_PATH = "/pages/creator-handoff";
  var ISSUE_TIMEOUT_MS = 20000;
  var TOKEN_REUSE_MS = 8000;

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
      return inflightIssue;
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
    return BRIDGE_PATH + "?next=" + encodeURIComponent(next);
  }

  function resolveTargetUrl(opts) {
    opts = opts || {};
    var cid = readCustomerId(opts.customerId);
    if (!cid) {
      return Promise.resolve(storefrontLoginUrl());
    }
    var consume = opts.consume !== false;
    var pending = consume ? takeInflightIssue() || issueExchangeToken(cid) : issueExchangeToken(cid);

    function toUrl(result) {
      if (resultIsFresh(result)) return result.url;
      if (result && result.error === "not_logged_in") return storefrontLoginUrl();
      return null;
    }

    return Promise.resolve(pending)
      .then(function (result) {
        var url = toUrl(result);
        if (url) return url;
        inflightIssue = null;
        inflightCid = "";
        inflightAt = 0;
        return fetchExchangeToken(cid).then(function (retry) {
          var retryUrl = toUrl(retry);
          if (retryUrl) return retryUrl;
          if (retry && retry.error === "not_logged_in") return storefrontLoginUrl();
          return loggedInFallbackUrl();
        });
      })
      .catch(function () {
        return loggedInFallbackUrl();
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
    TOKEN_REUSE_MS: TOKEN_REUSE_MS,
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
