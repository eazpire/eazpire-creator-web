/**
 * EAZ feature costs — mirrors src/features/billing/pricing.js EAZ_PRICING (UI defaults).
 * Live owner costs come from get-balance → eaz_costs.
 */
(function (global) {
  'use strict';

  var DEFAULT_COSTS = {
    design_generate: 15,
    design_upload: 5,
    bg_remove: 0,
    design_remove_object: 0.5,
    design_generative_fill: 2,
    design_edit: 0,
    design_variation: 0,
    export_high_res: 1,
    export_print: 0.5,
    mockup_generate: 0,
    mockup_save: 0,
    hero_generate: 0.5,
    hero_impression: 0.01,
    video_generate: 2,
    wardrobe_generate: 0.5,
    creator_image: 5
  };

  /** Display order + i18n keys for Creator Settings → EAZ Costs tab */
  var CATALOG = [
    { feature: 'design_generate', labelKey: 'eazCostDesignGenerate', labelDefault: 'Generate design' },
    { feature: 'design_upload', labelKey: 'eazCostDesignUpload', labelDefault: 'Upload design' },
    { feature: 'hero_generate', labelKey: 'eazCostHeroGenerate', labelDefault: 'Hero image generation' },
    { feature: 'hero_impression', labelKey: 'eazCostHeroImpression', labelDefault: 'Hero impression' },
    { feature: 'video_generate', labelKey: 'eazCostVideoGenerate', labelDefault: 'Video generation' },
    { feature: 'wardrobe_generate', labelKey: 'eazCostWardrobeGenerate', labelDefault: 'Wardrobe generation' },
    { feature: 'creator_image', labelKey: 'eazCostCreatorImage', labelDefault: 'Creator image' },
    { feature: 'export_high_res', labelKey: 'eazCostExportHighRes', labelDefault: 'High-res export' },
    { feature: 'export_print', labelKey: 'eazCostExportPrint', labelDefault: 'Print export' }
  ];

  function fmtEaz(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    if (v <= 0) return '0';
    return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, '');
  }

  function defaultCost(feature) {
    var c = DEFAULT_COSTS[feature];
    return Number.isFinite(Number(c)) ? Number(c) : 0;
  }

  function resolveCost(costsMap, feature) {
    if (costsMap && costsMap[feature] != null) {
      var n = Number(costsMap[feature]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return defaultCost(feature);
  }

  function labelFor(item) {
    if (!item) return '';
    var i18n = global.CreatorI18n || {};
    var fromI18n = i18n[item.labelKey];
    if (fromI18n != null && String(fromI18n).trim()) return String(fromI18n);
    return item.labelDefault || item.feature;
  }

  global.EazCostCatalog = {
    DEFAULT_COSTS: DEFAULT_COSTS,
    CATALOG: CATALOG,
    fmtEaz: fmtEaz,
    defaultCost: defaultCost,
    resolveCost: resolveCost,
    labelFor: labelFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
