(function () {
  'use strict';

  if (window.CreatorHeroRegions) return;

  var REGION_FLAGS = {
    EU: '\uD83C\uDDEA\uD83C\uDDFA',
    GB: '\uD83C\uDDEC\uD83C\uDDE7',
    US: '\uD83C\uDDFA\uD83C\uDDF8',
    CA: '\uD83C\uDDE8\uD83C\uDDE6',
    AU: '\uD83C\uDDE6\uD83C\uDDFA',
    CN: '\uD83C\uDDE8\uD83C\uDDF3',
    PRINTIFY_CHOICE: '\u2728',
  };

  var REGION_TABS = [
    { code: 'EU', label: 'Europa' },
    { code: 'US', label: 'USA' },
    { code: 'GB', label: 'UK' },
    { code: 'CA', label: 'Kanada' },
    { code: 'AU', label: 'Australien' },
    { code: 'CN', label: 'China' },
    { code: 'PRINTIFY_CHOICE', label: 'Printify Choice' }
  ];

  var COUNTRY_TO_REGION = {
    DE: 'EU', AT: 'EU', CH: 'EU', FR: 'EU', NL: 'EU', IT: 'EU', ES: 'EU', PT: 'EU', BE: 'EU', LU: 'EU',
    IE: 'EU', DK: 'EU', SE: 'EU', FI: 'EU', NO: 'EU', PL: 'EU', CZ: 'EU', SK: 'EU', HU: 'EU', SI: 'EU',
    HR: 'EU', BG: 'EU', RO: 'EU', GR: 'EU', CY: 'EU', MT: 'EU', LT: 'EU', LV: 'EU', EE: 'EU',
    GB: 'GB', UK: 'GB',
    US: 'US',
    CA: 'CA',
    AU: 'AU', NZ: 'AU',
    CN: 'CN'
  };

  function normalizeRegionCode(value) {
    var code = String(value || '').trim().toUpperCase();
    if (!code) return 'EU';
    if (code === 'UK') return 'GB';
    if (code === 'AU_NZ') return 'AU';
    if (code === 'PC' || code === 'PRINTIFY') return 'PRINTIFY_CHOICE';
    for (var i = 0; i < REGION_TABS.length; i += 1) {
      if (REGION_TABS[i].code === code) return code;
    }
    return 'EU';
  }

  var ISO3_TO_ISO2 = {
    CHE: 'CH', DEU: 'DE', AUT: 'AT', FRA: 'FR', ITA: 'IT', ESP: 'ES', NLD: 'NL', BEL: 'BE',
    POL: 'PL', CZE: 'CZ', SWE: 'SE', DNK: 'DK', FIN: 'FI', NOR: 'NO', GBR: 'GB', USA: 'US',
    CAN: 'CA', AUS: 'AU', NZL: 'NZ', CHN: 'CN'
  };

  function countryToRegion(countryCode) {
    var cc = String(countryCode || '').trim().toUpperCase();
    if (!cc) return 'EU';
    if (cc.length === 3 && ISO3_TO_ISO2[cc]) cc = ISO3_TO_ISO2[cc];
    return COUNTRY_TO_REGION[cc] || 'EU';
  }

  function resolveFromShopContext() {
    var shopifyCountry =
      window.__SHOP_SELECTED_COUNTRY ||
      (window.Shopify && (window.Shopify.country || window.Shopify.Country)) ||
      '';
    if (shopifyCountry && typeof shopifyCountry === 'object') {
      shopifyCountry = shopifyCountry.isoCode || shopifyCountry.country_code || shopifyCountry.code || '';
    }
    shopifyCountry = String(shopifyCountry || '').trim();
    if (shopifyCountry) {
      return countryToRegion(shopifyCountry);
    }

    var htmlLang = (document.documentElement && document.documentElement.lang) || '';
    if (htmlLang) {
      var segments = htmlLang.split('-');
      if (segments.length > 1) {
        return countryToRegion(segments[1]);
      }
    }
    return 'EU';
  }

  /**
   * Catalog API region for Shop Create Product (must match worker ?region=EU|US|…).
   * Uses Shopify localization country only — never document.lang (e.g. en-US → US) or navigator.language;
   * those reflect UI language, not delivery market. If unknown, default EU (aligned with creator-api-helper default DE).
   */
  function resolveCatalogRegion() {
    var shopifyCountry =
      window.__SHOP_SELECTED_COUNTRY ||
      (window.Shopify && (window.Shopify.country || window.Shopify.Country)) ||
      '';
    if (shopifyCountry && typeof shopifyCountry === 'object') {
      shopifyCountry = shopifyCountry.isoCode || shopifyCountry.country_code || shopifyCountry.code || '';
    }
    shopifyCountry = String(shopifyCountry || '').trim();
    if (shopifyCountry) {
      return countryToRegion(shopifyCountry);
    }
    return 'EU';
  }

  function resolveShopCountry() {
    var cc =
      window.__SHOP_SELECTED_COUNTRY ||
      (window.Shopify && (window.Shopify.country || window.Shopify.Country)) ||
      '';
    if (cc && typeof cc === 'object') {
      cc = cc.isoCode || cc.country_code || cc.code || '';
    }
    return String(cc || '').trim().toUpperCase();
  }

  window.CreatorHeroRegions = {
    tabs: REGION_TABS,
    flags: REGION_FLAGS,
    normalizeRegionCode: normalizeRegionCode,
    countryToRegion: countryToRegion,
    resolveFromShopContext: resolveFromShopContext,
    resolveCatalogRegion: resolveCatalogRegion,
    resolveShopCountry: resolveShopCountry
  };
})();
