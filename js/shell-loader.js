/**
 * Assembles theme creator shell (desktop + mobile) from static partials.
 */
(function (global) {
  "use strict";

  var CREATOR_LOGO =
    "https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950";

  async function fetchPartial(name) {
    var res = await fetch("/partials/" + name, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load partial " + name);
    return res.text();
  }

  function mobileFooterHtml() {
    return (
      '<footer class="creator-global-footer">' +
      '<div class="creator-global-footer__left">' +
      '<span class="creator-global-footer__copyright">© ' +
      new Date().getFullYear() +
      ' <span class="creator-global-footer__brand" translate="no" data-no-translate="1">eazpire</span></span>' +
      '<span class="creator-global-footer__sep">*</span>' +
      '<button type="button" class="creator-global-footer__link creator-global-footer__link--btn" data-creator-terms-trigger>Terms &amp; Policies</button>' +
      "</div>" +
      '<div class="creator-global-footer__right">' +
      '<div class="creator-global-footer__balance creator-global-footer__balance--eaz" role="button" tabindex="0" data-footer-eaz-mode="balance">' +
      '<span class="creator-global-footer__eaz-normal" data-footer-eaz-normal>' +
      '<img class="creator-global-footer__balance-coin" src="https://pub-2ffb11d4a361463498b9a842a87a870c.r2.dev/brand/coin/eaz-coin-logo.png" alt="" width="14" height="14" loading="lazy">' +
      '<span class="creator-global-footer__balance-value" id="creator-footer-eaz-value">—</span>' +
      '<span class="creator-global-footer__balance-unit">EAZ</span>' +
      "</span></div></div></footer>"
    );
  }

  async function loadShell() {
    var host = document.getElementById("creatorPortalShell");
    if (!host || host.dataset.loaded === "1") return;

    var parts = await Promise.all([
      fetchPartial("creator-desktop-overview.html"),
      fetchPartial("creator-mobile-dashboard.html"),
      fetchPartial("creator-mobile-generator.html"),
      fetchPartial("creator-mobile-creations.html"),
      fetchPartial("creator-mobile-marketing.html"),
      fetchPartial("creator-mobile-automations.html"),
      fetchPartial("creator-mobile-header.html"),
      fetchPartial("creator-mobile-drawer.html"),
    ]);

    host.innerHTML =
      parts[0] +
      '<div class="creator-mobile-app" id="creatorMobileApp">' +
      '<div class="creator-swipe-viewport slide-0" id="creatorMobileSwipeViewport" data-initial-slide="0">' +
      '<div class="creator-swipe-track">' +
      '<section class="creator-screen" data-screen="0">' +
      parts[1] +
      "</section>" +
      '<section class="creator-screen" data-screen="1">' +
      parts[2] +
      "</section>" +
      '<section class="creator-screen" data-screen="2">' +
      parts[3] +
      "</section>" +
      '<section class="creator-screen" data-screen="3">' +
      parts[4] +
      "</section>" +
      '<section class="creator-screen" data-screen="4">' +
      parts[5] +
      "</section>" +
      "</div></div>" +
      parts[6] +
      parts[7] +
      mobileFooterHtml() +
      "</div>";

    host.querySelectorAll('img[src*="eazpire-creator-logo"]').forEach(function (img) {
      img.src = CREATOR_LOGO;
    });
    host.querySelectorAll(".creator-desktop-header__brand").forEach(function (a) {
      a.setAttribute("href", "/#dashboard");
    });

    if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.applyDataT === "function") {
      global.CreatorPortalI18n.applyDataT(host);
    }

    host.dataset.loaded = "1";
  }

  async function loadAudioModal() {
    var host = document.getElementById("creatorPortalModals");
    if (!host || host.querySelector('[data-partial="creator-audio-modal.html"]')) return;
    try {
      var html = await fetchPartial("creator-audio-modal.html");
      var wrap = document.createElement("div");
      wrap.setAttribute("data-partial", "creator-audio-modal.html");
      wrap.innerHTML = html;
      host.appendChild(wrap);
      if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.applyDataT === "function") {
        global.CreatorPortalI18n.applyDataT(wrap);
      }
      await loadScript("/vendor/theme/creator-audio-modal.js");
    } catch (e) {
      console.warn("[CreatorPortal] audio modal load failed", e);
    }
  }

  function loadScript(src) {
    if (document.querySelector('script[data-portal-runtime="' + src + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src + "?v=6";
      s.defer = true;
      s.setAttribute("data-portal-runtime", src);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(s);
    });
  }

  async function loadThemeRuntime() {
    await loadScript("/vendor/theme/creator-dashboard-data.js");
    await loadScript("/vendor/theme/particle-reveal.js");
    await loadScript("/vendor/theme/design-particle-reveal.js");
    await loadScript("/vendor/theme/drawer-aquarium.js");
    await loadScript("/vendor/theme/creator-footer-eaz-ui.js");
    await loadScript("/vendor/theme/creator-mobile.js");
    await loadScript("/vendor/theme/creator-desktop.js");
    await loadScript("/vendor/theme/creator-theme-background.js");
    await loadAudioModal();
    if (global.CreatorPortalEazy && typeof global.CreatorPortalEazy.ensure === "function") {
      try {
        await global.CreatorPortalEazy.ensure();
      } catch (e) {
        console.warn("[CreatorPortal] Eazy load failed", e);
      }
    }
    if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.ensureDashboard === "function") {
      try {
        await global.CreatorPortalFeatures.ensureDashboard();
      } catch (e) {
        console.warn("[CreatorPortal] dashboard modals load failed", e);
      }
    }
  }

  global.CreatorPortalShell = {
    loadShell: loadShell,
    loadThemeRuntime: loadThemeRuntime,
    loadAudioModal: loadAudioModal,
  };
})(typeof window !== "undefined" ? window : globalThis);
