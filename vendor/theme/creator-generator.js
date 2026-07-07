/**
 * Creator Mobile – Generator Screen
 * Target product, design type, prompt, suggest, clear, more options, generate
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL)
    ? window.CREATOR_API_CONFIG.BASE_URL
    : 'https://creator-engine.eazpire.workers.dev';
  var DISPATCH_URL = API_BASE + '/apps/creator-dispatch';
  var GENERATOR_URL = (typeof window.location !== 'undefined' ? window.location.origin : '') + '/generator';

  function refreshCreatorGenEazyUi() {
    if (typeof window.syncCreatorHeaderEazySpeech === 'function') {
      window.syncCreatorHeaderEazySpeech();
    }
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }
  }
  window.refreshCreatorGenEazyUi = refreshCreatorGenEazyUi;

  function initGenEazyHeaderSpeech() {
    var ta = document.getElementById('genPrompt');
    if (ta) {
      ta.addEventListener('input', refreshCreatorGenEazyUi);
      ta.addEventListener('keyup', refreshCreatorGenEazyUi);
    }
    document.addEventListener('gen-design-selected', refreshCreatorGenEazyUi);
    refreshCreatorGenEazyUi();
  }

  function tCreator(key, fallback) {
    function isValid(val) {
      return typeof val === 'string' && val && val.indexOf('Translation missing') === -1;
    }
    var val;
    if (window.CreatorI18n && isValid((val = window.CreatorI18n[key]))) return val;
    if (window.CreatorMobileI18n && isValid((val = window.CreatorMobileI18n[key]))) return val;
    return fallback;
  }

  /** blob: URLs cannot reach the worker — convert to data: before accept. */
  function resolveReferenceUrlForSubmit(url) {
    return new Promise(function (resolve) {
      var u = String(url || '').trim();
      if (!u) {
        resolve(null);
        return;
      }
      if (u.indexOf('data:') === 0 || u.indexOf('http://') === 0 || u.indexOf('https://') === 0) {
        resolve(u);
        return;
      }
      if (u.indexOf('blob:') !== 0) {
        resolve(u);
        return;
      }
      fetch(u)
        .then(function (res) {
          return res.blob();
        })
        .then(function (blob) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve(typeof reader.result === 'string' ? reader.result : u);
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(blob);
        })
        .catch(function () {
          resolve(null);
        });
    });
  }

  function init() {
    if (window.__creatorGeneratorFullyInited) return true;
    var targetBtn = document.getElementById('genTargetProduct');
    var overlay = document.getElementById('genSelectOverlay');
    if (!targetBtn || !overlay) return false;
    window.__creatorGeneratorFullyInited = true;
    initPills();
    initUpload();
    initSuggest();
    initClear();
    initMoreOptions();
    initGenerate();
    initGenEazyHeaderSpeech();
    if (window.GenOptionsModal) {
      window.GenOptionsModal.onApply = function (opts) {
        window.__creatorGenOptionsState = opts || {};
      };
    }
    return true;
  }

  function initUpload() {
    var zone = document.getElementById('genUploadZone');
    var input = document.getElementById('genImageInput');
    var refImageOverlay = document.getElementById('genRefImageOverlay');
    var refImageClose = document.getElementById('genRefImageClose');
    var refImageCards = document.querySelectorAll('.gen-ref-image-card');
    var selectedCard = document.getElementById('genSelectedImagesCard');
    var selectedGrid = document.getElementById('genSelectedImagesGrid');
    var selectedCount = document.getElementById('genSelectedImagesCount');
    if (!zone || !input) return;

    var selectedImages = [];
    window.__creatorGenSelectedImages = selectedImages;

    function openRefImageModal() {
      if (refImageOverlay) {
        refImageOverlay.classList.add('is-open');
        refImageOverlay.setAttribute('aria-hidden', 'false');
      }
    }

    function closeRefImageModal() {
      if (refImageOverlay) {
        var focused = refImageOverlay.querySelector(':focus');
        if (focused) focused.blur();
        refImageOverlay.classList.remove('is-open');
        refImageOverlay.setAttribute('aria-hidden', 'true');
      }
    }

    function triggerFileInput(useCamera) {
      input.value = '';
      if (useCamera) input.setAttribute('capture', 'environment');
      else input.removeAttribute('capture');
      input.click();
    }

    function navigateFallback(card) {
      var fallbackUrl = card && card.dataset ? card.dataset.fallbackUrl : '';
      if (fallbackUrl) {
        window.location.href = fallbackUrl;
      }
    }

    function withSimilarityForImageUrl(imageUrl, done) {
      if (!imageUrl) {
        done(null);
        return;
      }
      if (window.ReferenceInfluenceModal && typeof window.ReferenceInfluenceModal.open === 'function') {
        window.ReferenceInfluenceModal.open({
          imageUrl: imageUrl,
          initialStep: 4,
          onApply: function (result) {
            if (!result) {
              done(null);
              return;
            }
            var outUrl = result.imageUrl;
            if (!outUrl && result.file) {
              try {
                outUrl = URL.createObjectURL(result.file);
              } catch (eUrl) {}
            }
            done({
              dataUrl: outUrl || imageUrl,
              similarity: typeof result.strength === 'number' ? result.strength : 0.8
            });
          }
        });
        return;
      }
      done({ dataUrl: imageUrl, similarity: 0.8 });
    }

    function normalizeDesignTypeSlug(raw) {
      if (!raw) return null;
      return String(raw)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/_/g, '-');
    }

    function applyDesignTypeFromDetail(detail) {
      if (!detail) return;
      var slug = normalizeDesignTypeSlug(detail.designType || detail.design_type);
      if (!slug) return;
      var designVal = document.getElementById('genDesignTypeVal');
      if (!designVal) return;
      var opt = DESIGN_TYPE_OPTIONS.find(function (o) {
        return o.value === slug;
      });
      if (!opt) return;
      designVal.dataset.value = opt.value;
      designVal.textContent = opt.label;
      if (typeof applyDesignTypeDefaults === 'function') {
        applyDesignTypeDefaults(opt.value);
      } else if (window.CreatorGeneratorPayload && typeof window.CreatorGeneratorPayload.getDesignTypeDefaults === 'function') {
        var def = window.CreatorGeneratorPayload.getDesignTypeDefaults(opt.value);
        if (def && (def.ratio || def.background)) {
          var opts = window.__creatorGenOptionsState || {};
          if (def.ratio) opts.ratio = def.ratio;
          if (def.background) opts.background = def.background;
          window.__creatorGenOptionsState = opts;
        }
      }
    }

    function withSimilarityForFile(file, done) {
      if (!file) {
        done(null);
        return;
      }
      if (!(window.ReferenceInfluenceModal && typeof window.ReferenceInfluenceModal.open === 'function')) {
        done({ file: file, similarity: 0.8 });
        return;
      }
      window.ReferenceInfluenceModal.open({
        file: file,
        initialStep: 4,
        onApply: function (result) {
          if (!result || !result.file) {
            done(null);
            return;
          }
          done({
            file: result.file,
            similarity: typeof result.strength === 'number' ? result.strength : 0.8
          });
        }
      });
    }

    function openSource(source, card) {
      if (source === 'device') {
        triggerFileInput(false);
        return;
      }
      if (source === 'camera') {
        triggerFileInput(true);
        return;
      }
      if (source === 'phone') {
        if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
          var sidGen = null;
          try {
            var w = document.querySelector('[data-eaz-shop-design-studio="1"]');
            if (w && w.id && /^creator-widget-(.+)$/.test(w.id)) {
              sidGen = RegExp.$1;
            }
          } catch (eGen) {}
          if (!sidGen) {
            var pPhone = (window.location.pathname || '').toLowerCase();
            if (
              pPhone.indexOf('creator-dashboard') !== -1 ||
              pPhone.indexOf('creator-overview') !== -1 ||
              document.querySelector('[data-eaz-shop-design-studio="1"]')
            ) {
              var m2 = document.querySelector('[id^="creator-widget-"]');
              if (m2 && m2.id && /^creator-widget-(.+)$/.test(m2.id)) sidGen = RegExp.$1;
            }
          }
          window.CreatorPhoneUploadModal.open({ sectionId: sidGen });
          return;
        }
        return;
      }
      if (source === 'inspirations') {
        if (window.CreatorInspirationModal && typeof window.CreatorInspirationModal.open === 'function') {
          window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = true;
          window.CreatorInspirationModal.open({ purpose: 'remix' });
          return;
        }
        navigateFallback(card);
        return;
      }
      if (source === 'designs') {
        if (window.GenMyDesignsModal && typeof window.GenMyDesignsModal.open === 'function') {
          window.GenMyDesignsModal.open();
          return;
        }
        navigateFallback(card);
        return;
      }
      if (source === 'canvas') {
        if (window.CanvasSketchModal && typeof window.CanvasSketchModal.open === 'function') {
          window.CanvasSketchModal.open({
            onConfirm: function (result) {
              if (result && (result.image_url || result.blob)) {
                var dataUrl = result.image_url;
                if (result.blob) {
                  var reader = new FileReader();
                  reader.onload = function () {
                    withSimilarityForImageUrl(reader.result, function (picked) {
                      if (!picked) return;
                      selectedImages.push({ file: result.blob, dataUrl: picked.dataUrl, similarity: picked.similarity, canvasStrokes: result.strokes || null });
                      renderSelectedGrid();
                    });
                  };
                  reader.readAsDataURL(result.blob);
                } else {
                  withSimilarityForImageUrl(dataUrl, function (picked) {
                    if (!picked) return;
                    selectedImages.push({ file: null, dataUrl: picked.dataUrl, similarity: picked.similarity, canvasStrokes: result.strokes || null });
                    renderSelectedGrid();
                  });
                }
              }
            }
          });
          return;
        }
        navigateFallback(card);
      }
    }

    function updateUploadText() {
      var textEl = zone.querySelector('.creator-gen-upload-text');
      if (!textEl) return;
      textEl.textContent = selectedImages.length > 0
        ? (window.CreatorI18n && window.CreatorI18n.generator_another_one ? window.CreatorI18n.generator_another_one : 'Another One')
        : (window.CreatorI18n && window.CreatorI18n.upload ? window.CreatorI18n.upload : 'Upload');
    }

    function updatePromptPlaceholder() {
      var textarea = document.getElementById('genPrompt');
      if (!textarea) return;
      textarea.placeholder = selectedImages.length > 1
        ? (window.CreatorI18n && window.CreatorI18n.generator_reference_hint ? window.CreatorI18n.generator_reference_hint : 'Reference images with A, B, C, e.g. "Combine A and B"')
        : (window.CreatorI18n && window.CreatorI18n.generator_prompt_placeholder ? window.CreatorI18n.generator_prompt_placeholder : 'Describe your design or upload an image – both optional');
    }

    function renderSelectedGrid() {
      if (!selectedGrid || !selectedCount) return;
      selectedGrid.innerHTML = '';
      selectedImages.forEach(function (item, index) {
        var wrap = document.createElement('div');
        var letter = String.fromCharCode(65 + index);
        wrap.className = 'gen-selected-images__item';
        var drawLabel = window.CreatorI18n && window.CreatorI18n.generator_draw ? window.CreatorI18n.generator_draw : 'Draw';
        wrap.innerHTML =
          '<span class="gen-selected-images__thumb" data-index="' + index + '" role="button" tabindex="0">' +
          '<img src="' + item.dataUrl + '" alt="">' +
          '<button type="button" class="gen-selected-images__draw" data-index="' + index + '" aria-label="' + drawLabel + '" title="' + drawLabel + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg></button>' +
          '<button type="button" class="gen-selected-images__remove" data-index="' + index + '" aria-label="Remove">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>' +
          '</button></span>' +
          '<span class="gen-selected-images__label">' + letter + '</span>';
        selectedGrid.appendChild(wrap);
      });
      selectedCount.textContent = selectedImages.length;
      if (selectedCard) {
        selectedCard.style.display = selectedImages.length > 0 ? '' : 'none';
      }
      updateUploadText();
      updatePromptPlaceholder();
      if (typeof window.refreshCreatorGenEazyUi === 'function') window.refreshCreatorGenEazyUi();
    }

    function addFiles(files) {
      if (!files || files.length === 0) return;
      var imageFiles = Array.prototype.filter.call(files, function (f) {
        return f.type && f.type.indexOf('image/') === 0;
      });
      if (imageFiles.length === 0) return;
      function processNext(idx) {
        if (idx >= imageFiles.length) {
          renderSelectedGrid();
          return;
        }
        var file = imageFiles[idx];
        withSimilarityForFile(file, function (picked) {
          if (!picked || !picked.file) {
            processNext(idx + 1);
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            selectedImages.push({ file: picked.file, dataUrl: reader.result, similarity: picked.similarity, canvasStrokes: null });
            processNext(idx + 1);
          };
          reader.readAsDataURL(picked.file);
        });
      }
      processNext(0);
    }

    function removeImage(index) {
      selectedImages.splice(index, 1);
      renderSelectedGrid();
    }

    function similarityStepFromValue(sim) {
      var steps = [0.05, 0.2, 0.4, 0.6, 0.8, 1.0];
      var t = typeof sim === 'number' ? sim : 0.8;
      var best = 4;
      var bestD = 2;
      for (var i = 0; i < steps.length; i++) {
        var d = Math.abs(steps[i] - t);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    function openRefInfluenceEdit(idx) {
      var item = selectedImages[idx];
      if (!item || !item.dataUrl) return;
      if (!window.ReferenceInfluenceModal || typeof window.ReferenceInfluenceModal.open !== 'function') return;
      window.ReferenceInfluenceModal.open({
        imageUrl: item.dataUrl,
        initialStep: similarityStepFromValue(item.similarity),
        onApply: function (res) {
          if (!res || !res.file) return;
          var reader = new FileReader();
          reader.onload = function () {
            selectedImages[idx] = {
              file: res.file,
              dataUrl: reader.result,
              similarity: typeof res.strength === 'number' ? res.strength : item.similarity,
              canvasStrokes: item.canvasStrokes
            };
            renderSelectedGrid();
          };
          reader.readAsDataURL(res.file);
        }
      });
    }

    zone.addEventListener('click', function () {
      openRefImageModal();
    });

    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRefImageModal();
      }
    });

    if (refImageClose) {
      refImageClose.addEventListener('click', closeRefImageModal);
    }

    if (refImageOverlay) {
      refImageOverlay.addEventListener('click', function (e) {
        if (e.target === refImageOverlay) closeRefImageModal();
      });
    }

    [].forEach.call(refImageCards || [], function (card) {
      card.addEventListener('click', function () {
        var source = card.dataset.source;
        closeRefImageModal();
        openSource(source, card);
      });
    });

    window.addEventListener('gen-design-selected', function (e) {
      if (window.__automationsRefPickActive) return;
      var imageUrl = e.detail && e.detail.imageUrl;
      if (!imageUrl) return;
      applyDesignTypeFromDetail(e.detail || {});
      var remixPick = !!(e.detail && (e.detail.remixMode || window.__creatorInspirationRemixMode));
      var parentDesignId =
        e.detail && e.detail.parentDesignId != null ? String(e.detail.parentDesignId).trim() : '';
      withSimilarityForImageUrl(imageUrl, function (picked) {
        if (!picked) return;
        if (remixPick) {
          selectedImages.length = 0;
          try {
            window.__creatorGenParentDesignId = parentDesignId || null;
          } catch (_ePd) {}
        }
        selectedImages.push({ file: null, dataUrl: picked.dataUrl, similarity: picked.similarity, canvasStrokes: null });
        renderSelectedGrid();
      });
    });

    function applyShopRegenerateJob(job) {
      if (!job || !job.generator_ui_snapshot) return;
      var snap = job.generator_ui_snapshot;
      var ta = document.getElementById('genPrompt');
      if (ta && job.prompt) {
        ta.value = String(job.prompt);
        try {
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e2) {}
      }
      var opts = snap.generator_options;
      if (opts && typeof opts === 'object') {
        window.__creatorGenOptionsState = {
          ratio: opts.ratio || 'portrait',
          content_type: opts.content_type || opts.contentType || 'design-text',
          contentType: opts.contentType || opts.content_type || 'design-text',
          styles: Array.isArray(opts.styles) ? opts.styles : [],
          stylesSelected: Array.isArray(opts.stylesSelected) ? opts.stylesSelected : [],
          design_colors: Array.isArray(opts.design_colors) ? opts.design_colors : [],
          designColors: Array.isArray(opts.designColors) ? opts.designColors : [],
          background_colors: Array.isArray(opts.background_colors) ? opts.background_colors : [],
          backgroundColors: Array.isArray(opts.backgroundColors) ? opts.backgroundColors : [],
          background: opts.background && typeof opts.background === 'object' ? opts.background : { mode: 'transparent' },
          backgroundTransparent: opts.background && opts.background.mode === 'transparent',
          language: opts.language && typeof opts.language === 'object' ? opts.language : { mode: 'as-design' },
          reference_strength: opts.reference_strength != null ? opts.reference_strength : null
        };
      }
      var refs = job.reference_images || [];
      var strokes = (snap.reference_canvas_strokes && Array.isArray(snap.reference_canvas_strokes)) ? snap.reference_canvas_strokes : [];
      selectedImages.length = 0;
      refs.forEach(function (r, i) {
        var url = r.url;
        if (!url) return;
        var st = typeof r.strength === 'number' ? r.strength : 80;
        var sim = st <= 1 && st >= 0 ? st : Math.max(0, Math.min(1, st / 100));
        selectedImages.push({
          file: null,
          dataUrl: url,
          similarity: sim,
          canvasStrokes: strokes[i] != null ? strokes[i] : null
        });
      });
      renderSelectedGrid();
    }

    document.addEventListener('eazShopRegenerateHydrate', function (ev) {
      try {
        applyShopRegenerateJob(ev.detail);
      } catch (err) {
        console.warn('[Generator] eazShopRegenerateHydrate', err);
      }
    });

    if (selectedGrid) {
      selectedGrid.addEventListener('click', function (e) {
        var removeBtn = e.target.closest('.gen-selected-images__remove');
        if (removeBtn && removeBtn.dataset.index !== undefined) {
          e.stopPropagation();
          removeImage(parseInt(removeBtn.dataset.index, 10));
          return;
        }
        var thumbWrap = e.target.closest('.gen-selected-images__thumb');
        if (thumbWrap && thumbWrap.dataset.index !== undefined && !e.target.closest('button')) {
          e.preventDefault();
          e.stopPropagation();
          openRefInfluenceEdit(parseInt(thumbWrap.dataset.index, 10));
          return;
        }
        var drawBtn = e.target.closest('.gen-selected-images__draw');
        if (drawBtn && drawBtn.dataset.index !== undefined) {
          e.stopPropagation();
          var idx = parseInt(drawBtn.dataset.index, 10);
          var item = selectedImages[idx];
          if (!item || !item.dataUrl) return;
          var img = new Image();
          img.onload = function () {
            if (window.CanvasSketchModal && typeof window.CanvasSketchModal.open === 'function') {
              window.CanvasSketchModal.open({
                designImage: img,
                initialStrokes: item.canvasStrokes && item.canvasStrokes.length ? item.canvasStrokes : null,
                onConfirm: function (result) {
                  if (result && (result.image_url || result.blob)) {
                    if (result.blob) {
                      var reader = new FileReader();
                      reader.onload = function () {
                        withSimilarityForImageUrl(reader.result, function (picked) {
                          if (!picked) return;
                          selectedImages[idx] = { file: result.blob, dataUrl: picked.dataUrl, similarity: picked.similarity, canvasStrokes: result.strokes || null };
                          renderSelectedGrid();
                        });
                      };
                      reader.readAsDataURL(result.blob);
                    } else {
                      withSimilarityForImageUrl(result.image_url, function (picked) {
                        if (!picked) return;
                        selectedImages[idx] = { file: null, dataUrl: picked.dataUrl, similarity: picked.similarity, canvasStrokes: result.strokes || null };
                        renderSelectedGrid();
                      });
                    }
                  }
                }
              });
            }
          };
          img.src = item.dataUrl;
        }
      });
      selectedGrid.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var thumbWrap = e.target.closest('.gen-selected-images__thumb');
        if (!thumbWrap || thumbWrap.dataset.index === undefined || e.target.closest('button')) return;
        e.preventDefault();
        openRefInfluenceEdit(parseInt(thumbWrap.dataset.index, 10));
      });
    }

    input.addEventListener('change', function () {
      if (input.files && input.files.length > 0) {
        addFiles(input.files);
      }
    });

    window.__creatorGenApplyRemixDetail = function (detail) {
      if (!detail || !Array.isArray(selectedImages)) return false;
      var mode = String(detail.mode || '').toLowerCase();
      var ta = document.getElementById('genPrompt');
      selectedImages.length = 0;
      try {
        window.__creatorGenParentDesignId = null;
      } catch (_clr) {}
      if (mode === 'remix') {
        var img = detail.imageUrl && String(detail.imageUrl).trim();
        if (!img) return false;
        selectedImages.push({
          file: null,
          dataUrl: img,
          similarity: typeof detail.similarity === 'number' ? detail.similarity : 0.8,
          canvasStrokes: null
        });
        if (ta) {
          ta.value = '';
          try {
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (eInp) {}
        }
        var pd = detail.parentDesignId != null ? String(detail.parentDesignId).trim() : '';
        if (pd) {
          try {
            window.__creatorGenParentDesignId = pd;
          } catch (ePd) {}
        }
      } else if (mode === 'similar') {
        var uImg = detail.userImageUrl && String(detail.userImageUrl).trim();
        if (uImg) {
          selectedImages.push({ file: null, dataUrl: uImg, similarity: 0.8, canvasStrokes: null });
        }
        var up = detail.userPrompt != null ? String(detail.userPrompt) : '';
        if (ta) {
          ta.value = up.trim();
          try {
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (eInp2) {}
        }
      } else {
        return false;
      }
      renderSelectedGrid();
      updateUploadText();
      return true;
    };
  }

  var MOCKUP_BASE = API_BASE + '/mockup';
  var TARGET_PRODUCT_OPTIONS = [
    { value: 'all', label: 'Anything', placeholder: true },
    { value: 'unisex-softstyle-cotton-tee', label: 'Unisex Softstyle Cotton Tee', mockupUrl: MOCKUP_BASE + '/mockups/unisex-softstyle-cotton-tee/white-front.png' }
  ];

  var DESIGN_TYPE_OPTIONS = [
    { value: 'classic', label: 'Classic', preview: 'classic' },
    { value: 'pattern', label: 'Pattern', preview: 'pattern' },
    { value: 'all-over', label: 'All-Over', preview: 'all-over' },
    { value: 'full-coverage', label: 'Full-Coverage', preview: 'full-coverage' },
    { value: 'panorama', label: 'Panorama', preview: 'panorama' }
  ];

  function getDesignTypePreviewSvg(type) {
    var w = 64;
    var h = 64;
    var stroke = 'stroke="rgba(255,255,255,0.75)" stroke-width="1.4" fill="none" stroke-linejoin="round"';
    var green = 'rgba(34, 197, 94, 0.65)';
    var greenStroke = 'rgba(34, 197, 94, 1)';
    var dots = '';
    for (var y = 22; y <= 42; y += 5) {
      for (var x = 24; x <= 40; x += 4) {
        dots += '<circle cx="' + x + '" cy="' + y + '" r="2" fill="' + green + '" stroke="' + greenStroke + '"/>';
      }
    }
    var svgs = {
      classic:
        '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M32 4 L20 8 L14 14 L14 50 L50 50 L50 14 L44 8 Z" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.75)" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path d="M20 8 L6 10 L6 22 L14 14 Z" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.65)" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<path d="M44 8 L58 10 L58 22 L50 14 Z" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.65)" stroke-width="1.2" stroke-linejoin="round"/>' +
        '<ellipse cx="32" cy="12" rx="5" ry="2.5" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.55)" stroke-width="0.8"/>' +
        '<rect x="27" y="22" width="10" height="24" rx="1" fill="' + green + '" stroke="' + greenStroke + '" stroke-width="1.2"/>' +
        '</svg>',
      pattern:
        '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M32 4 L38 10 L38 48 L26 48 L26 10 Z M26 10 L16 12 L8 22 L8 50 L56 50 L56 22 L48 12 L38 10" fill="rgba(255,255,255,0.05)" ' + stroke + '/>' +
        '<path d="M26 12 L26 48 L56 48 L56 22 L48 12 L38 10 L26 12" fill="rgba(0,0,0,0.06)"/>' +
        dots +
        '</svg>',
      'all-over':
        '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M22 8 L42 8 L46 14 L46 46 L18 46 L14 14 Z" fill="' + green + '" stroke="' + greenStroke + '" stroke-width="1.3"/>' +
        '<path d="M22 8 L28 16 L28 42 L36 42 L36 16 L42 8" fill="rgba(0,0,0,0.2)" stroke="rgba(255,255,255,0.35)" stroke-width="0.8"/>' +
        '<path d="M18 20 L18 44 L46 44 L46 20" stroke="rgba(255,255,255,0.4)" stroke-width="0.6" fill="none"/>' +
        '</svg>',
      'full-coverage':
        '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="6" y="4" width="52" height="56" rx="3" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/>' +
        '<rect x="12" y="10" width="40" height="44" rx="1" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/>' +
        '<rect x="14" y="12" width="36" height="40" rx="1" fill="' + green + '" stroke="' + greenStroke + '" stroke-width="1.2"/>' +
        '</svg>',
      panorama:
        '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
        '<ellipse cx="32" cy="48" rx="24" ry="10" fill="rgba(255,255,255,0.05)" ' + stroke + '/>' +
        '<path d="M8 48 L8 24 Q8 10 28 6 L36 6 Q56 10 56 24 L56 48" fill="rgba(255,255,255,0.05)" ' + stroke + '/>' +
        '<path d="M6 22 L6 42 Q6 52 18 52 L22 52" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<rect x="14" y="16" width="36" height="16" rx="1" fill="' + green + '" stroke="' + greenStroke + '" stroke-width="1.2"/>' +
        '</svg>'
    };
    return svgs[type] || '';
  }

  function initPills() {
    var targetBtn = document.getElementById('genTargetProduct');
    var targetVal = document.getElementById('genTargetProductVal');
    var designBtn = document.getElementById('genDesignType');
    var designVal = document.getElementById('genDesignTypeVal');
    var overlay = document.getElementById('genSelectOverlay');
    var modalTitle = document.getElementById('genSelectTitle');
    var modalList = document.getElementById('genSelectList');
    var modalClose = document.getElementById('genSelectClose');

    if (!targetBtn || !designBtn || !overlay || !modalList) return;

    function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function applyDesignTypeDefaults(designType) {
      var getDefaults = window.CreatorGeneratorPayload && window.CreatorGeneratorPayload.getDesignTypeDefaults;
      if (!getDefaults) return;
      var def = getDefaults(designType);
      if (!def.ratio && !def.background) return;
      var opts = window.__creatorGenOptionsState || {};
      if (def.ratio) opts.ratio = def.ratio;
      if (def.background) opts.background = def.background;
      window.__creatorGenOptionsState = opts;
    }

    function openModal(title, options, currentValue, valueEl, isDesignType, isTargetProduct) {
      modalTitle.textContent = title;
      modalList.innerHTML = '';
      var useGrid = !!isDesignType || !!isTargetProduct;
      modalList.classList.toggle('gen-select-modal__list--grid', useGrid && !isTargetProduct);
      modalList.classList.toggle('gen-select-modal__list--product', !!isTargetProduct);

      var container = modalList;
      if (isTargetProduct) {
        var gridWrap = document.createElement('div');
        gridWrap.className = 'gen-product-select-grid';
        modalList.appendChild(gridWrap);
        container = gridWrap;
      }

      options.forEach(function (opt) {
        var btn = document.createElement(isTargetProduct && (opt.mockupUrl || opt.placeholder) ? 'div' : 'button');
        if (btn.tagName === 'button') btn.type = 'button';
        btn.className = 'gen-select-modal__option' + (opt.value === currentValue ? ' is-selected' : '');
        if (isTargetProduct && (opt.mockupUrl || opt.placeholder)) {
          btn.className += ' gen-select-modal__option--mockup';
          btn.setAttribute('role', 'button');
          btn.setAttribute('tabindex', '0');
          var infoAria = tCreator('generatorProductInfoAria', 'Product information');
          var infoSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
          if (opt.placeholder) {
            btn.innerHTML =
              '<button type="button" class="gen-select-modal__option-info" aria-label="' + escapeHtml(infoAria) + '">' + infoSvg + '</button>' +
              '<span class="gen-select-modal__preview gen-select-modal__preview--placeholder">' +
              '<span class="gen-select-modal__placeholder-text">Anything</span></span>' +
              '<span class="gen-select-modal__label">' + escapeHtml(opt.label) + '</span>';
          } else {
            btn.innerHTML =
              '<button type="button" class="gen-select-modal__option-info" aria-label="' + escapeHtml(infoAria) + '">' + infoSvg + '</button>' +
              '<span class="gen-select-modal__preview"><img src="' + escapeHtml(opt.mockupUrl) + '" alt="" loading="lazy"></span>' +
              '<span class="gen-select-modal__label">' + escapeHtml(opt.label) + '</span>';
          }
          var infoBtn = btn.querySelector('.gen-select-modal__option-info');
          if (infoBtn) {
            infoBtn.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              openProductInfoModal(opt);
            });
          }
          btn.addEventListener('click', function (e) {
            if (e.target.closest('.gen-select-modal__option-info')) return;
            valueEl.textContent = opt.label;
            valueEl.dataset.value = opt.value;
            closeModal();
          });
          btn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              valueEl.textContent = opt.label;
              valueEl.dataset.value = opt.value;
              closeModal();
            }
          });
        } else if (isDesignType && opt.preview) {
          btn.className += ' gen-select-modal__option--visual';
          btn.innerHTML =
            '<span class="gen-select-modal__preview">' + getDesignTypePreviewSvg(opt.preview) + '</span>' +
            '<span class="gen-select-modal__label">' + escapeHtml(opt.label) + '</span>';
          btn.addEventListener('click', function () {
            valueEl.textContent = opt.label;
            valueEl.dataset.value = opt.value;
            applyDesignTypeDefaults(opt.value);
            closeModal();
          });
        } else {
          btn.textContent = opt.label;
          btn.addEventListener('click', function () {
            valueEl.textContent = opt.label;
            valueEl.dataset.value = opt.value;
            if (isDesignType) applyDesignTypeDefaults(opt.value);
            closeModal();
          });
        }
        btn.dataset.value = opt.value;
        container.appendChild(btn);
      });
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }

    function openProductInfoModal(opt) {
      var infoOverlay = document.getElementById('genProductInfoOverlay');
      var infoContent = document.getElementById('genProductInfoContent');
      var infoClose = document.getElementById('genProductInfoClose');
      if (!infoOverlay || !infoContent) return;

      infoContent.textContent = tCreator('generatorProductInfoComingSoon', 'Product information coming soon');
      infoOverlay.classList.add('is-open');
      infoOverlay.setAttribute('aria-hidden', 'false');

      function closeInfoModal() {
        infoOverlay.classList.remove('is-open');
        infoOverlay.setAttribute('aria-hidden', 'true');
      }

      if (infoClose) {
        infoClose.onclick = closeInfoModal;
      }
      infoOverlay.onclick = function (e) {
        if (e.target === infoOverlay) closeInfoModal();
      };
    }

    var targetLabel = window.CreatorI18n && window.CreatorI18n.generator_target_product ? window.CreatorI18n.generator_target_product : 'Target Product';
    var designLabel = window.CreatorI18n && window.CreatorI18n.generator_design_type ? window.CreatorI18n.generator_design_type : 'Design Type';

    targetBtn.addEventListener('click', function () {
      openModal(targetLabel, TARGET_PRODUCT_OPTIONS, targetVal.dataset.value || 'all', targetVal, false, true);
    });

    designBtn.addEventListener('click', function () {
      openModal(designLabel, DESIGN_TYPE_OPTIONS, designVal.dataset.value || 'classic', designVal, true);
    });

    if (modalClose) {
      modalClose.addEventListener('click', closeModal);
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
  }

  function initSuggest() {
    var btn = document.getElementById('genSuggest');
    var textarea = document.getElementById('genPrompt');
    if (!btn || !textarea) return;

    btn.addEventListener('click', function () {
      btn.disabled = true;
      var originalHtml = btn.innerHTML;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' + tCreator('generatorSuggestLoading', 'Loading…');

      fetch(DISPATCH_URL + '?op=suggest-prompt', {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok && data.suggestedPrompt) {
            textarea.value = data.suggestedPrompt;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            textarea.placeholder = tCreator('generatorNoSuggestions', 'No suggestions. Try searching in the shop first.');
          }
        })
        .catch(function (err) {
          console.warn('[Generator] Suggest error:', err);
        })
        .finally(function () {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        });
    });
  }

  function initClear() {
    var btn = document.getElementById('genClear');
    var textarea = document.getElementById('genPrompt');
    if (!btn || !textarea) return;

    btn.addEventListener('click', function () {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function initMoreOptions() {
    var btn = document.getElementById('genMoreOptions');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.GenOptionsModal && window.GenOptionsModal.open) {
        window.GenOptionsModal.open();
      }
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function clearGeneratorForm() {
    var textarea = document.getElementById('genPrompt');
    var targetVal = document.getElementById('genTargetProductVal');
    var designVal = document.getElementById('genDesignTypeVal');
    var selectedCard = document.getElementById('genSelectedImagesCard');
    var selectedGrid = document.getElementById('genSelectedImagesGrid');
    var selectedCount = document.getElementById('genSelectedImagesCount');

    if (textarea) {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (window.__creatorGenSelectedImages) {
      window.__creatorGenSelectedImages.length = 0;
    }
    try {
      window.__creatorGenParentDesignId = null;
    } catch (_pc) {}
    if (selectedGrid) selectedGrid.innerHTML = '';
    if (selectedCount) selectedCount.textContent = '0';
    if (selectedCard) selectedCard.style.display = 'none';

    var anythingLabel = tCreator('generatorAnything', 'Anything');
    var classicLabel = tCreator('designTypeClassic', 'Classic');
    if (targetVal) {
      targetVal.dataset.value = 'all';
      targetVal.textContent = anythingLabel;
    }
    if (designVal) {
      designVal.dataset.value = 'classic';
      designVal.textContent = classicLabel;
    }

    window.__creatorGenOptionsState = {
      ratio: 'portrait',
      content_type: 'design-text',
      styles: [],
      stylesSelected: [],
      design_colors: [],
      background_colors: [],
      background: { mode: 'transparent' },
      language: { mode: 'as-design' }
    };
    if (typeof window.refreshCreatorGenEazyUi === 'function') window.refreshCreatorGenEazyUi();
  }

  function initGenerate() {
    var btn = document.getElementById('genGenerate');
    var textarea = document.getElementById('genPrompt');
    var targetVal = document.getElementById('genTargetProductVal');
    var designVal = document.getElementById('genDesignTypeVal');
    var confirmOverlay = document.getElementById('genConfirmOverlay');
    var confirmClose = document.getElementById('genConfirmClose');
    var confirmCancel = document.getElementById('genConfirmCancel');
    var confirmConfirm = document.getElementById('genConfirmConfirm');
    var confirmSummary = document.getElementById('genConfirmSummary');
    var confirmBalance = document.getElementById('genConfirmBalance');
    var triggerLocked = false;

    function closeConfirmModal() {
      if (confirmOverlay) {
        confirmOverlay.classList.remove('is-open');
        confirmOverlay.setAttribute('aria-hidden', 'true');
      }
      try {
        document.documentElement.classList.remove('gen-confirm-open');
      } catch (e) {}
      if (typeof window.refreshCreatorGenEazyUi === 'function') window.refreshCreatorGenEazyUi();
    }

    function openConfirmModal() {
      if (confirmOverlay) {
        confirmOverlay.classList.add('is-open');
        confirmOverlay.setAttribute('aria-hidden', 'false');
      }
      try {
        document.documentElement.classList.add('gen-confirm-open');
      } catch (e2) {}
      if (window.EazCoinBrand && typeof window.EazCoinBrand.applyCoinImages === 'function') {
        window.EazCoinBrand.applyCoinImages(confirmOverlay);
      }
      if (typeof window.refreshCreatorGenEazyUi === 'function') window.refreshCreatorGenEazyUi();
    }

    function ensureConfirmModalLabels() {
      var titleEl = document.getElementById('genConfirmTitle');
      if (titleEl && !String(titleEl.textContent || '').trim()) {
        titleEl.textContent = tCreator('generatorConfirmTitle', 'Generate design?');
      }
      if (confirmCancel && !String(confirmCancel.textContent || '').trim()) {
        confirmCancel.textContent = tCreator('commonCancel', 'Cancel');
      }
      if (confirmConfirm && !String(confirmConfirm.textContent || '').trim()) {
        confirmConfirm.textContent = tCreator('generatorConfirmGenerate', 'Generate');
      }
    }
    ensureConfirmModalLabels();

    if (confirmClose) confirmClose.addEventListener('click', closeConfirmModal);
    if (confirmCancel) confirmCancel.addEventListener('click', closeConfirmModal);
    if (confirmOverlay) {
      confirmOverlay.addEventListener('click', function (e) {
        if (e.target === confirmOverlay) closeConfirmModal();
      });
    }

    var lastGeneratePayload = null;
    var lastShopProductKey = null;

    function runGenerateFlow() {
      if (triggerLocked || (btn && btn.disabled)) return;

      if (!window.__EAZ_BILLING_LEVEL && typeof window.loadCreatorBillingLevel === 'function') {
        window.loadCreatorBillingLevel().catch(function () {});
      }

      var payloadLib = window.CreatorGeneratorPayload;
      var shopCtx = window.__EAZ_SHOP_CREATE_PRODUCT__;
      var isShop = !!(shopCtx && shopCtx.product_key);
      if (!payloadLib || typeof payloadLib.buildGeneratorPayloadFromUI !== 'function') {
        console.warn('[Generator] CreatorGeneratorPayload not loaded');
        window.alert(tCreator('chat.genericErrorRetryLater', 'Something went wrong. Please try again.'));
        return;
      }
      if (!isShop && typeof payloadLib.submitGenerateJob !== 'function') {
        console.warn('[Generator] CreatorGeneratorPayload not loaded');
        window.alert(tCreator('chat.genericErrorRetryLater', 'Something went wrong. Please try again.'));
        return;
      }
      if (isShop && typeof payloadLib.submitShopDesignGenerateJob !== 'function') {
        window.alert(tCreator('chat.genericErrorRetryLater', 'Something went wrong. Please try again.'));
        return;
      }

      var prompt = (textarea && textarea.value) ? textarea.value.trim() : '';
      var selectedImages = window.__creatorGenSelectedImages || [];

      Promise.all(
        selectedImages.map(function (item, index) {
          var url = item.dataUrl || item.url;
          if (!url) return Promise.resolve(null);
          return resolveReferenceUrlForSubmit(url).then(function (resolved) {
            if (!resolved) return null;
            return {
              url: resolved,
              similarity: typeof item.similarity === 'number' ? item.similarity : 0.8,
              label: String.fromCharCode(65 + index)
            };
          });
        })
      )
        .then(function (refImagesRaw) {
          var refImages = refImagesRaw.filter(Boolean);
          continueGenerateWithRefs(prompt, refImages, payloadLib, shopCtx, isShop);
        })
        .catch(function () {
          window.alert(tCreator('chat.genericErrorRetryLater', 'Something went wrong. Please try again.'));
        });
    }

    function continueGenerateWithRefs(prompt, refImages, payloadLib, shopCtx, isShop) {
      var opts = window.__creatorGenOptionsState || {};
      var bg = (opts.background && typeof opts.background === 'object' && opts.background.mode)
        ? opts.background
        : { mode: opts.backgroundTransparent === false ? 'solid' : 'transparent' };
      var uiState = {
        prompt: prompt,
        designType: (designVal && designVal.dataset.value) ? designVal.dataset.value : 'classic',
        targetProduct: (targetVal && targetVal.dataset.value) ? targetVal.dataset.value : 'all',
        ratio: opts.ratio || 'portrait',
        contentType: (opts.content_type || opts.contentType) || 'design-text',
        styles: Array.isArray(opts.styles) ? opts.styles : (Array.isArray(opts.stylesSelected) ? opts.stylesSelected : []),
        designColors: Array.isArray(opts.design_colors) ? opts.design_colors : (Array.isArray(opts.designColors) ? opts.designColors : []),
        backgroundColors: Array.isArray(opts.background_colors) ? opts.background_colors : (Array.isArray(opts.backgroundColors) ? opts.backgroundColors : []),
        background: bg,
        language: (opts.language && typeof opts.language === 'object') ? opts.language : { mode: 'as-design' },
        referenceStrength: opts.reference_strength != null ? opts.reference_strength : null,
        parentDesignId: (function () {
          try {
            var id =
              typeof window.__creatorGenParentDesignId !== 'undefined' && window.__creatorGenParentDesignId != null
                ? String(window.__creatorGenParentDesignId).trim()
                : '';
            return id || null;
          } catch (_pid) {
            return null;
          }
        })(),
        referenceImages: refImages,
        owner_id: (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) ? String(window.__EAZ_OWNER_ID) : null
      };

      if (!uiState.prompt && refImages.length === 0) {
        window.alert(tCreator('pleasePromptOrImage', 'Please enter a prompt or add a reference image.'));
        return;
      }
      if (!uiState.owner_id) {
        window.alert(tCreator('eazy_chat.login_required_title', 'Login required'));
        return;
      }

      if (isShop && shopCtx.product_key) {
        uiState.targetProduct = shopCtx.product_key;
      }

      var payload = payloadLib.buildGeneratorPayloadFromUI(uiState);
      if (isShop) {
        var snapOpts = {};
        try {
          snapOpts = JSON.parse(JSON.stringify(window.__creatorGenOptionsState || {}));
        } catch (e0) {
          snapOpts = window.__creatorGenOptionsState || {};
        }
        payload.generator_ui_snapshot = {
          v: 1,
          prompt: prompt,
          reference_canvas_strokes: (window.__creatorGenSelectedImages || []).map(function (it) {
            return it.canvasStrokes || null;
          }),
          generator_options: snapOpts
        };
      }
      lastGeneratePayload = payload;
      lastShopProductKey = isShop ? shopCtx.product_key : null;
      var targetLabel = (targetVal && targetVal.textContent) ? targetVal.textContent.trim() : TARGET_PRODUCT_OPTIONS.find(function (o) { return o.value === uiState.targetProduct; })?.label || 'Anything';
      var designLabel = (designVal && designVal.textContent) ? designVal.textContent.trim() : DESIGN_TYPE_OPTIONS.find(function (o) { return o.value === uiState.designType; })?.label || 'Classic';
      var ratioLabel = (uiState.ratio === 'square') ? tCreator('generatorRatioSquare', 'Square') : (uiState.ratio === 'landscape') ? tCreator('generatorRatioLandscape', 'Landscape') : tCreator('generatorRatioPortrait', 'Portrait');
      var stylesCount = (uiState.styles && uiState.styles.length) ? uiState.styles.length : 0;
      var promptTrunc = (prompt && prompt.length > 80) ? prompt.slice(0, 77) + '…' : (prompt || '—');

      function buildSummaryHtml() {
        var rows = [
          [tCreator('generatorConfirmSummaryTarget', 'Target product'), targetLabel],
          [tCreator('generatorConfirmSummaryDesign', 'Design type'), designLabel],
          [tCreator('generatorConfirmSummaryPrompt', 'Prompt'), promptTrunc],
          [tCreator('generatorConfirmSummaryRefs', 'Reference images'), refImages.length > 0 ? refImages.length + ' ' + (refImages.length === 1 ? 'image' : 'images') : '—'],
          [tCreator('generatorConfirmSummaryRatio', 'Ratio'), ratioLabel],
          [tCreator('generatorConfirmSummaryStyles', 'Styles'), stylesCount > 0 ? stylesCount + ' ' + tCreator('generatorStylesSelected', 'selected') : '—']
        ];
        return rows.map(function (r) {
          return '<div class="gen-confirm-row"><span class="gen-confirm-row__label">' + escapeHtml(r[0]) + '</span><span class="gen-confirm-row__value">' + escapeHtml(r[1]) + '</span></div>';
        }).join('');
      }

      var balanceVal = '—';
      var ownerId = uiState.owner_id;

      function formatEazDisplay(num) {
        if (num == null || !Number.isFinite(Number(num))) return '—';
        var v = Math.round(Number(num) * 100) / 100;
        return v % 1 === 0 ? String(v) : v.toFixed(2);
      }

      function applyCostBalanceTpl(tpl, costStr, balStr) {
        if (!tpl) return '';
        return String(tpl)
          .replace(/\{\{\s*cost\s*\}\}/gi, costStr)
          .replace(/\{\{\s*balance\s*\}\}/gi, balStr)
          .replace(/__COST__/g, costStr)
          .replace(/__BALANCE__/g, balStr);
      }

      function openConfirmWithBalance() {
        var costStr = '10';
        var confirmIsFreeGeneration = false;
        fetch(DISPATCH_URL + '?op=get-balance&_t=' + Date.now() + '&owner_id=' + encodeURIComponent(ownerId || ''), { credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.ok !== false) {
              var balRaw =
                data.balance_eazg != null
                  ? data.balance_eazg
                  : data.balance_total != null
                    ? data.balance_total
                    : data.balance_eaz;
              balanceVal = formatEazDisplay(balRaw);
              var dgRaw = data.eaz_costs && data.eaz_costs.design_generate;
              var explicitOff = !!(data.eaz_feature_active && data.eaz_feature_active.design_generate === false);
              var nCost = dgRaw !== undefined && dgRaw !== null ? Number(dgRaw) : NaN;
              confirmIsFreeGeneration = explicitOff || (Number.isFinite(nCost) && nCost <= 0);
              if (confirmIsFreeGeneration) {
                costStr = tCreator('eazFree', 'Free');
              } else if (Number.isFinite(nCost) && nCost > 0) {
                costStr = formatEazDisplay(nCost);
              }
            }
          })
          .catch(function () {})
          .then(function () {
            if (confirmSummary) confirmSummary.innerHTML = buildSummaryHtml();
            var costTpl = tCreator('generatorConfirmCost', 'Cost: {{ cost }} EAZV');
            var costFreeLine = tCreator('generatorConfirmCostFree', 'Cost: Free');
            var balanceTpl = tCreator('generatorConfirmBalance', 'Available: {{ balance }} EAZV');
            var isCostFree = confirmIsFreeGeneration;
            if (confirmBalance) {
              var balOut = applyCostBalanceTpl(balanceTpl, costStr, balanceVal);
              confirmBalance.textContent = (balOut && balOut.indexOf('{{') === -1 && balOut.indexOf('__BALANCE__') === -1)
                ? balOut
                : ('Available: ' + balanceVal + ' EAZV');
            }
            var costEl = document.querySelector('.gen-confirm-eaz__cost');
            if (costEl) {
              if (isCostFree) {
                costEl.textContent =
                  costFreeLine && costFreeLine.indexOf('Translation missing') === -1 ? costFreeLine : 'Cost: Free';
              } else {
                var costOut = applyCostBalanceTpl(costTpl, costStr, balanceVal);
                costEl.textContent = (costOut && costOut.indexOf('{{') === -1 && costOut.indexOf('__COST__') === -1)
                  ? costOut
                  : ('Cost: ' + costStr + ' EAZV');
              }
            }
            openConfirmModal();
          });
      }

      if (isShop) {
        if (confirmSummary) confirmSummary.innerHTML = buildSummaryHtml();
        if (confirmBalance) {
          confirmBalance.textContent = (window.CreatorI18n && window.CreatorI18n.eaz_shop_shop_design_confirm_balance)
            ? window.CreatorI18n.eaz_shop_shop_design_confirm_balance
            : 'Shop design — uses your daily shop limits (not EAZ).';
        }
        var costElShop = document.querySelector('.gen-confirm-eaz__cost');
        if (costElShop) {
          costElShop.textContent = (window.CreatorI18n && window.CreatorI18n.eaz_shop_shop_design_confirm_cost)
            ? window.CreatorI18n.eaz_shop_shop_design_confirm_cost
            : '—';
        }
        openConfirmModal();
      } else {
        openConfirmWithBalance();
      }

      if (confirmConfirm) {
        confirmConfirm.onclick = function () {
          closeConfirmModal();
          clearGeneratorForm();
          triggerLocked = true;
          if (btn) btn.disabled = true;
          var originalText = btn && btn.querySelector('span:first-child') ? btn.querySelector('span:first-child').textContent : '';
          if (btn && btn.querySelector('span:first-child')) {
            btn.querySelector('span:first-child').textContent = tCreator('generatorSuggestLoading', 'Loading…');
          }
          var p = lastGeneratePayload;
          var shopKey = lastShopProductKey;
          var submitPromise = shopKey && typeof payloadLib.submitShopDesignGenerateJob === 'function'
            ? payloadLib.submitShopDesignGenerateJob(p, shopKey, ownerId, { apiBase: DISPATCH_URL })
            : payloadLib.submitGenerateJob(p, { apiBase: DISPATCH_URL });
          submitPromise
            .then(function (res) {
              if (window.CreatorChat && typeof window.CreatorChat.openJobs === 'function') {
                window.CreatorChat.openJobs({ focusJobId: res.jobId });
              }
              if (typeof window.reloadCreatorFooterEazBalance === 'function') {
                window.reloadCreatorFooterEazBalance();
              } else if (typeof window.loadCreatorBalance === 'function') {
                window.loadCreatorBalance();
              }
              setTimeout(function () {
                if (typeof window.reloadCreatorFooterEazBalance === 'function') {
                  window.reloadCreatorFooterEazBalance();
                } else if (typeof window.loadCreatorBalance === 'function') {
                  window.loadCreatorBalance();
                }
              }, 8000);
            })
            .catch(function (err) {
              var msg = (err && err.message) || tCreator('chat.genericErrorRetryLater', 'Something went wrong. Please try again.');
              window.alert(msg);
            })
            .finally(function () {
              triggerLocked = false;
              if (btn) btn.disabled = false;
              if (btn && btn.querySelector('span:first-child')) {
                btn.querySelector('span:first-child').textContent = originalText;
              }
            });
        };
      }
    }

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        runGenerateFlow();
      });
    }

    window.CreatorGenerator = window.CreatorGenerator || {};
    window.CreatorGenerator.triggerGenerate = runGenerateFlow;
  }

  window.CreatorGenerator = window.CreatorGenerator || {};
  window.CreatorGenerator.init = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
