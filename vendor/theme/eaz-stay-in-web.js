/**
 * Keep Android Chrome/Samsung/Firefox on the website.
 *
 * Verified App Links for www.eazpire.com used to steal Shop ↔ Creator
 * navigations (especially creator.eazpire.com → www). Explicit browser-package
 * intents stay in the current browser. Native app still opens from join.*
 * shares, notifications, and the header app widget.
 */
(function (global) {
  "use strict";

  var SHOP_HOSTS = {
    "www.eazpire.com": true,
    "eazpire.com": true,
  };

  var PACKAGES = [
    { test: /SamsungBrowser/i, pkg: "com.sec.android.app.sbrowser" },
    { test: /EdgA/i, pkg: "com.microsoft.emmx" },
    { test: /OPR\/|Opera/i, pkg: "com.opera.browser" },
    { test: /Firefox/i, pkg: "org.mozilla.firefox" },
    { test: /Brave/i, pkg: "com.brave.browser" },
  ];

  function userAgent() {
    try {
      return String((global.navigator && global.navigator.userAgent) || "");
    } catch (e) {
      return "";
    }
  }

  function isAndroidBrowser() {
    var ua = userAgent();
    if (!/Android/i.test(ua)) return false;
    if (/; wv\)|\bWV\b/i.test(ua)) return false;
    return true;
  }

  function browserPackage(ua) {
    ua = ua || userAgent();
    for (var i = 0; i < PACKAGES.length; i++) {
      if (PACKAGES[i].test.test(ua)) return PACKAGES[i].pkg;
    }
    return "com.android.chrome";
  }

  function resolveUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw, global.location && global.location.href).href;
    } catch (e) {
      return raw;
    }
  }

  function hostnameOf(href) {
    try {
      return String(new URL(href).hostname || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function isClaimedShopHost(hostname) {
    return !!SHOP_HOSTS[String(hostname || "").toLowerCase()];
  }

  function currentHostname() {
    try {
      return String((global.location && global.location.hostname) || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function shouldStayInWeb(url) {
    if (!isAndroidBrowser()) return false;
    var href = resolveUrl(url);
    if (!href) return false;
    var destHost = hostnameOf(href);
    if (!isClaimedShopHost(destHost)) return false;
    var here = currentHostname();
    // Same-host shop clicks stay in Chrome; only cross-origin (Creator → Shop) is stolen.
    if (here && destHost === here) return false;
    return true;
  }

  /**
   * Android intent:// URL that opens HTTPS in the current browser package
   * instead of a verified App Link handler (the Eazpire app).
   */
  function hrefFor(url) {
    var href = resolveUrl(url);
    if (!href || !shouldStayInWeb(href)) return href;
    var parsed;
    try {
      parsed = new URL(href);
    } catch (e) {
      return href;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return href;
    var pkg = browserPackage();
    var path = parsed.pathname || "/";
    if (parsed.search) path += parsed.search;
    var hostAndPath = parsed.host + path;
    return (
      "intent://" +
      hostAndPath +
      "#Intent;scheme=" +
      parsed.protocol.replace(":", "") +
      ";package=" +
      pkg +
      ";S.browser_fallback_url=" +
      encodeURIComponent(href) +
      ";end"
    );
  }

  function go(url, replace) {
    var dest = hrefFor(url) || url;
    if (!dest) return;
    try {
      if (replace) global.location.replace(dest);
      else global.location.href = dest;
    } catch (e) {
      try {
        global.location.href = dest;
      } catch (e2) {}
    }
  }

  function onDocumentClick(e) {
    if (!e || e.defaultPrevented || e.button) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var node = e.target;
    var a = null;
    while (node && node !== global.document) {
      if (node.tagName === "A" && node.href) {
        a = node;
        break;
      }
      node = node.parentNode;
    }
    if (!a) return;
    var target = a.getAttribute("target");
    if (target && target !== "_self") return;
    var href = a.href;
    if (!shouldStayInWeb(href)) return;
    e.preventDefault();
    go(href, false);
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener("click", onDocumentClick, true);
  }

  global.EazStayInWeb = {
    SHOP_HOSTS: SHOP_HOSTS,
    isAndroidBrowser: isAndroidBrowser,
    isClaimedShopHost: isClaimedShopHost,
    browserPackage: browserPackage,
    shouldStayInWeb: shouldStayInWeb,
    hrefFor: hrefFor,
    replace: function (url) {
      go(url, true);
    },
    assign: function (url) {
      go(url, false);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
