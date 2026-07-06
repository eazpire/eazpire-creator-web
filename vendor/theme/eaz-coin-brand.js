/**
 * EAZV (virtual) and EAZC (cash) coin logo URLs — hydrated from platform-asset-manifest when available.
 */
(function (global) {
  'use strict';

  var R2 = 'https://pub-2ffb11d4a361463498b9a842a87a870c.r2.dev/brand/coin';
  var LEGACY_EAZV = R2 + '/eaz-coin-logo.png';

  var FALLBACK = {
    eazv_coin_logo: LEGACY_EAZV,
    eazc_coin_logo: R2 + '/eazc-coin-logo.png',
  };

  function slotUrl(slot) {
    var map = global.__EazCoinUrls;
    if (map && map[slot]) return map[slot];
    return FALLBACK[slot] || LEGACY_EAZV;
  }

  function urlEazv() {
    return slotUrl('eazv_coin_logo');
  }

  function urlEazc() {
    return slotUrl('eazc_coin_logo');
  }

  function applyCoinImages(root) {
    var scope = root && root.querySelector ? root : document;
    scope.querySelectorAll('[data-eaz-coin="eazv"]').forEach(function (img) {
      if (img && img.tagName === 'IMG') img.src = urlEazv();
    });
    scope.querySelectorAll('[data-eaz-coin="eazc"]').forEach(function (img) {
      if (img && img.tagName === 'IMG') img.src = urlEazc();
    });
  }

  function hydrateFromManifest() {
    var base =
      (global.CreatorApiConfig && global.CreatorApiConfig.engineUrl) ||
      (global.CreatorEngine && global.CreatorEngine.baseUrl) ||
      'https://creator-engine.eazpire.workers.dev';
    var url =
      String(base).replace(/\/$/, '') +
      '/apps/creator-dispatch?op=platform-asset-manifest&_t=' +
      Date.now();
    return fetch(url, { credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data || !data.ok || !data.assets) return;
        global.__EazCoinUrls = global.__EazCoinUrls || {};
        if (data.assets.eazv_coin_logo) global.__EazCoinUrls.eazv_coin_logo = data.assets.eazv_coin_logo;
        if (data.assets.eazc_coin_logo) global.__EazCoinUrls.eazc_coin_logo = data.assets.eazc_coin_logo;
        applyCoinImages(document);
      })
      .catch(function () {
        /* keep fallbacks */
      });
  }

  global.EazCoinBrand = {
    urlEazv: urlEazv,
    urlEazc: urlEazc,
    applyCoinImages: applyCoinImages,
    hydrateFromManifest: hydrateFromManifest,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyCoinImages(document);
      hydrateFromManifest();
    });
  } else {
    applyCoinImages(document);
    hydrateFromManifest();
  }
})(typeof window !== 'undefined' ? window : globalThis);
