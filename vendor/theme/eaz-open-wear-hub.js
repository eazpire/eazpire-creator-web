/**
 * Open Eazpire Wear hub — native app when installed, else wear.eazpire.com.
 */
(function () {
  "use strict";

  var WEB_URL = "https://wear.eazpire.com/";
  var ANDROID_PKG = "com.eazpire.wear";

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function buildOpenUrl() {
    if (isAndroid()) {
      var hostPath = WEB_URL.replace(/^https?:\/\//, "");
      return (
        "intent://" +
        hostPath +
        "#Intent;scheme=https;package=" +
        ANDROID_PKG +
        ";S.browser_fallback_url=" +
        encodeURIComponent(WEB_URL) +
        ";end"
      );
    }
    if (isIOS()) {
      return WEB_URL;
    }
    return WEB_URL;
  }

  function open() {
    var url = buildOpenUrl();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  window.EazOpenWearHub = {
    open: open,
    WEB_URL: WEB_URL,
  };
})();
