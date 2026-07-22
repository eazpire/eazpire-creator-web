/**
 * Creator Widget – Central payload builder and submit for design generation.
 * Used by desktop (creator-widget) and mobile (creator-generator) generator UIs.
 * No dependency on CreatorWidgetLib so mobile can use it standalone.
 */
(function () {
  'use strict';

  var API_BASE = (window.CreatorWidgetConfig && typeof window.CreatorWidgetConfig === 'object') 
    ? (Object.values(window.CreatorWidgetConfig)[0]?.api_dispatch || Object.values(window.CreatorWidgetConfig)[0]?.api_base)
    : (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL 
        ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
        : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var DESIGN_TYPES = ['classic', 'pattern', 'all-over', 'full-coverage', 'panorama'];

  /**
   * Defaults for ratio and background based on design type.
   * Panoramas use landscape + transparent (GPT native alpha); all-over uses portrait + solid; full-coverage uses solid.
   * @param {string} designType - classic, pattern, all-over, full-coverage, panorama
   * @returns {{ ratio?: string, background?: { mode: string } }}
   */
  function getDesignTypeDefaults(designType) {
    var t = (designType || '').toLowerCase();
    var out = {};
    if (t === 'panorama') {
      out.ratio = 'landscape';
      out.background = { mode: 'transparent' };
    } else if (t === 'all-over') {
      out.ratio = 'portrait';
      out.background = { mode: 'solid' };
    } else if (t === 'full-coverage') {
      out.background = { mode: 'solid' };
    }
    return out;
  }

  /**
   * Assign stable labels A, B, C, ... to reference images by order.
   * When an image is removed, labels of others stay stable; next added gets next letter.
   * @param {Array<{label?: string, url: string, [key: string]: any}>} referenceImages
   * @returns {Array<{label: string, url: string, [key: string]: any}>}
   */
  function assignReferenceLabels(referenceImages) {
    if (!Array.isArray(referenceImages) || referenceImages.length === 0) return [];
    var used = {};
    var nextLetter = function () {
      for (var i = 0; i < 26; i++) {
        var letter = String.fromCharCode(65 + i);
        if (!used[letter]) return letter;
      }
      return 'Z';
    };
    return referenceImages.map(function (ref, index) {
      var label = (ref && ref.label && /^[A-Z]$/i.test(ref.label)) ? ref.label.toUpperCase() : nextLetter();
      used[label] = true;
      var out = { label: label, url: (ref && ref.url) ? String(ref.url).trim() : '' };
      if (!out.url) return null;
      if (ref.role) out.role = ref.role;
      if (typeof ref.strength === 'number') out.strength = ref.strength;
      if (typeof ref.similarity === 'number') out.similarity = ref.similarity;
      if (ref.source) out.source = ref.source;
      if (ref.asset_id) out.asset_id = ref.asset_id;
      if (ref.quick_inspiration_id) out.quick_inspiration_id = ref.quick_inspiration_id;
      return out;
    }).filter(Boolean);
  }

  /**
   * Select primary reference image for legacy image_url field.
   * Rule: role=primary first, else highest similarity/strength, else first.
   * @param {Array<{label: string, url: string, role?: string, strength?: number, similarity?: number}>} referenceImages
   * @returns {{label: string, url: string, [key: string]: any}|null}
   */
  function selectPrimaryReferenceImage(referenceImages) {
    if (!Array.isArray(referenceImages) || referenceImages.length === 0) return null;
    var withLabel = assignReferenceLabels(referenceImages);
    if (withLabel.length === 0) return null;
    var primary = withLabel.find(function (r) { return r.role === 'primary'; });
    if (primary) return primary;
    var byScore = withLabel.slice().sort(function (a, b) {
      var sa = (typeof a.similarity === 'number' ? a.similarity : a.strength) ?? 0;
      var sb = (typeof b.similarity === 'number' ? b.similarity : b.strength) ?? 0;
      return sb - sa;
    });
    return byScore[0] || withLabel[0];
  }

  /**
   * Build API payload from a unified UI state object.
   * @param {{
   *   prompt?: string,
   *   designType?: string,
   *   targetProduct?: string,
   *   ratio?: string,
   *   contentType?: string,
   *   styles?: string[],
   *   designColors?: string[],
   *   backgroundColors?: string[],
   *   background?: { mode?: string, color?: string },
   *   language?: { mode?: string, language?: string },
   *   referenceStrength?: number|null,
   *   parentDesignId?: string|null,
   *   referenceImages?: Array<{url: string, label?: string, role?: string, strength?: number, similarity?: number, source?: string, asset_id?: string}>,
   *   owner_id?: string|null,
   *   image_url?: string|null
   * }} uiState
   * @returns {Object} Payload for POST ?op=accept
   */
  function buildGeneratorPayloadFromUI(uiState) {
    var s = uiState || {};
    var refs = Array.isArray(s.referenceImages) ? s.referenceImages : [];
    var withLabels = assignReferenceLabels(refs);
    var primary = selectPrimaryReferenceImage(refs);
    var imageUrl = (s.image_url && String(s.image_url).trim()) || (primary ? primary.url : null);

    var designType = (s.designType && String(s.designType).trim()) || 'classic';
    if (DESIGN_TYPES.indexOf(designType.toLowerCase()) === -1) designType = 'classic';

    var ratio = (s.ratio && String(s.ratio).trim()) || 'portrait';
    var contentType = (s.contentType && String(s.contentType).trim()) || 'design-text';
    var styles = Array.isArray(s.styles) ? s.styles.filter(function (v) { return v != null && String(v).trim(); }) : [];
    var designColors = Array.isArray(s.designColors) ? s.designColors.filter(function (v) { return v != null && String(v).trim(); }) : [];
    var background = (s.background && typeof s.background === 'object' && s.background.mode) ? { mode: s.background.mode } : { mode: 'transparent' };
    var backgroundColors = (background.mode === 'solid' && Array.isArray(s.backgroundColors))
      ? s.backgroundColors.filter(function (v) { return v != null && String(v).trim(); }).slice(0, 5)
      : [];
    var language = (s.language && typeof s.language === 'object') ? { mode: s.language.mode || 'as-design', language: s.language.language } : { mode: 'as-design' };
    var refStrength = s.referenceStrength;
    if (refStrength != null) {
      refStrength = parseInt(refStrength, 10);
      if (isNaN(refStrength)) refStrength = null;
      else refStrength = Math.max(0, Math.min(100, refStrength));
    } else refStrength = null;

    var prompt = (s.prompt && String(s.prompt).trim()) || null;
    if (!prompt && !imageUrl) prompt = ''; // allow empty prompt if image present; backend may still require one

    var generatorMode = (s.generatorMode && String(s.generatorMode).trim()) || 'design';
    generatorMode = generatorMode.toLowerCase().replace(/-/g, '_');
    if (generatorMode !== 'quick_inspirations') generatorMode = 'design';

    // Quick Inspirations mode: force collage settings
    if (generatorMode === 'quick_inspirations') {
      ratio = '16:9';
      background = { mode: 'auto' };
      backgroundColors = [];
    }

    return {
      prompt: prompt || '',
      image_url: imageUrl,
      parent_design_id: (s.parentDesignId && String(s.parentDesignId).trim()) || null,
      quick_inspiration_id: (s.quickInspirationId && String(s.quickInspirationId).trim()) || null,
      design_type: designType,
      target_product: (s.targetProduct && String(s.targetProduct).trim()) || 'tshirt',
      ratio: ratio,
      content_type: contentType,
      styles: styles,
      design_colors: designColors,
      background_colors: backgroundColors,
      background: background,
      language: language,
      reference_strength: refStrength,
      reference_images: withLabels,
      owner_id: (s.owner_id && String(s.owner_id).trim()) || null,
      generator_mode: generatorMode
    };
  }

  /**
   * Submit generation job to POST /apps/creator-dispatch?op=accept.
   * @param {Object} payload - From buildGeneratorPayloadFromUI (must include owner_id or caller adds via query)
   * @param {{ apiBase?: string }} options
   * @returns {Promise<{ jobId: string }>}
   */
  function submitGenerateJob(payload, options) {
    var base = (options && options.apiBase) || API_BASE;
    var url = base + '?op=accept';
    var body = JSON.stringify(payload);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      credentials: 'include'
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          var msg = (data && data.message) || (data && data.error) || ('HTTP ' + response.status);
          var err = new Error(msg);
          err.status = response.status;
          err.data = data;
          throw err;
        });
      }
      return response.json();
    }).then(function (data) {
      var jobId = (data && data.jobId && String(data.jobId).trim()) || null;
      if (!jobId) throw new Error('Server did not return a job ID');
      return { jobId: jobId };
    });
  }

  /**
   * Shop "Create Product" — same generator payload as creator, but job queued as customer design (private, shop_design metadata).
   */
  function submitShopDesignGenerateJob(payload, productKey, ownerId, options) {
    var base = (options && options.apiBase) || API_BASE;
    var url = base + '?op=accept-customer-design&owner_id=' + encodeURIComponent(ownerId || '') +
      '&logged_in_customer_id=' + encodeURIComponent(ownerId || '');
    var body = {
      type: 'generate',
      product_key: productKey,
      shop_design: true,
      prompt: payload.prompt,
      image_url: payload.image_url || null,
      parent_design_id: payload.parent_design_id || null,
      quick_inspiration_id: payload.quick_inspiration_id || null,
      design_type: payload.design_type,
      target_product: payload.target_product,
      ratio: payload.ratio,
      content_type: payload.content_type,
      styles: payload.styles,
      design_colors: payload.design_colors,
      background_colors: payload.background_colors,
      background: payload.background,
      language: payload.language,
      reference_strength: payload.reference_strength,
      reference_images: payload.reference_images,
      generator_mode: payload.generator_mode || 'design'
    };
    if (payload.generator_ui_snapshot != null && typeof payload.generator_ui_snapshot === 'object') {
      body.generator_ui_snapshot = payload.generator_ui_snapshot;
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          var msg = (data && data.message) || (data && data.error) || ('HTTP ' + response.status);
          var err = new Error(msg);
          err.status = response.status;
          err.data = data;
          throw err;
        });
      }
      return response.json();
    }).then(function (data) {
      var jobId = (data && data.job_id && String(data.job_id).trim()) || null;
      if (!jobId) throw new Error('Server did not return a job ID');
      return { jobId: jobId };
    });
  }

  window.CreatorGeneratorPayload = {
    assignReferenceLabels: assignReferenceLabels,
    selectPrimaryReferenceImage: selectPrimaryReferenceImage,
    buildGeneratorPayloadFromUI: buildGeneratorPayloadFromUI,
    submitGenerateJob: submitGenerateJob,
    submitShopDesignGenerateJob: submitShopDesignGenerateJob,
    getDesignTypeDefaults: getDesignTypeDefaults,
    getApiBase: function () { return API_BASE; },
    setApiBase: function (url) { API_BASE = url; }
  };
})();
