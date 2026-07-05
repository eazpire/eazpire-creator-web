(function () {
  'use strict';

  function getModal(sectionId) {
    return document.getElementById('generator-options-modal-' + sectionId);
  }

  function openModal(sectionId) {
    var modal = getModal(sectionId);
    if (!modal) return;

    var sid = sectionId;

    // Populate from main form
    var ratioInput = document.getElementById('ratio-' + sid);
    var ratioVal = ratioInput ? ratioInput.value : 'portrait';
    modal.querySelectorAll('.creator-ratio-option').forEach(function (btn) {
      btn.classList.toggle('creator-ratio-option--active', (btn.getAttribute('data-ratio') || '') === ratioVal);
    });

    var ctDesignText = document.getElementById('contentType-design-text-' + sid);
    var ctDesignOnly = document.getElementById('contentType-design-only-' + sid);
    var ctTextOnly = document.getElementById('contentType-text-only-' + sid);
    var ctVal = 'design-text';
    if (ctDesignOnly && ctDesignOnly.checked) ctVal = 'design-only';
    else if (ctTextOnly && ctTextOnly.checked) ctVal = 'text-only';
    modal.querySelectorAll('input[name="content-type-modal-' + sid + '"]').forEach(function (r) {
      r.checked = r.value === ctVal;
    });

    var langAsDesign = document.getElementById('language-mode-as-design-' + sid);
    var langAsPrompt = document.getElementById('language-mode-as-prompt-' + sid);
    var langManual = document.getElementById('language-mode-manual-' + sid);
    var langModeVal = 'as-design';
    if (langAsPrompt && langAsPrompt.checked) langModeVal = 'as-prompt';
    else if (langManual && langManual.checked) langModeVal = 'manual';
    modal.querySelectorAll('input[name="language-mode-modal-' + sid + '"]').forEach(function (r) {
      r.checked = r.value === langModeVal;
    });

    var manualRow = modal.querySelector('.generator-language-manual-row');
    if (manualRow) manualRow.style.display = langModeVal === 'manual' ? 'block' : 'none';

    var bgCheck = document.getElementById('backgroundTransparent-' + sid);
    var bgModal = modal.querySelector('.generator-options-bg');
    if (bgModal && bgCheck) {
      bgModal.checked = bgCheck.checked;
      var lbl = modal.querySelector('#backgroundLabelModal-' + sid);
      if (lbl) lbl.textContent = bgModal.checked ? (window.CreatorI18n?.backgroundTransparent || 'Transparent') : (window.CreatorI18n?.backgroundSolid || 'Solid');
    }

    // Styles/colors summary (read from main form)
    var stylesInput = document.getElementById('styles-' + sid);
    var stylesSummary = modal.querySelector('#stylesSummaryModal-' + sid);
    if (stylesSummary && stylesInput) {
      var arr = [];
      try { arr = JSON.parse(stylesInput.value || '[]'); } catch (_) {}
      stylesSummary.textContent = arr.length + ' Styles ausgewählt';
    }
    var colorsInput = document.getElementById('designColors-' + sid);
    var colorsSummary = modal.querySelector('#colorsSummaryModal-' + sid);
    var colorDots = modal.querySelector('#colorDotsModal-' + sid);
    if (colorsSummary && colorsInput) {
      var cols = [];
      try { cols = JSON.parse(colorsInput.value || '[]'); } catch (_) {}
      colorsSummary.textContent = cols.length + ' Farben';
      if (colorDots) {
        colorDots.innerHTML = cols.map(function (h) {
          return '<span style="width:10px;height:10px;border-radius:50%;background:' + h + ';display:inline-block"></span>';
        }).join('');
      }
    }
    var langValInput = document.getElementById('languageValue-' + sid);
    var langSummary = modal.querySelector('#languageSummaryModal-' + sid);
    if (langSummary && langValInput) {
      var langLabels = { de: 'Deutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch' };
      langSummary.textContent = langLabels[langValInput.value] || langValInput.value || 'Deutsch';
    }

    modal.showModal();
  }

  function syncToMainForm(sectionId) {
    var modal = getModal(sectionId);
    if (!modal) return;
    var sid = sectionId;

    // Ratio
    var ratioBtn = modal.querySelector('.creator-ratio-option--active');
    var ratio = ratioBtn ? ratioBtn.getAttribute('data-ratio') : 'portrait';
    var ratioInput = document.getElementById('ratio-' + sid);
    if (ratioInput) ratioInput.value = ratio;

    // Content type
    var ctRadio = modal.querySelector('input[name="content-type-modal-' + sid + '"]:checked');
    var ctVal = ctRadio ? ctRadio.value : 'design-text';
    var ctDesignText = document.getElementById('contentType-design-text-' + sid);
    var ctDesignOnly = document.getElementById('contentType-design-only-' + sid);
    var ctTextOnly = document.getElementById('contentType-text-only-' + sid);
    if (ctDesignText) ctDesignText.checked = ctVal === 'design-text';
    if (ctDesignOnly) ctDesignOnly.checked = ctVal === 'design-only';
    if (ctTextOnly) ctTextOnly.checked = ctVal === 'text-only';

    // Language mode
    var lmRadio = modal.querySelector('input[name="language-mode-modal-' + sid + '"]:checked');
    var lmVal = lmRadio ? lmRadio.value : 'as-design';
    var lmAsDesign = document.getElementById('language-mode-as-design-' + sid);
    var lmAsPrompt = document.getElementById('language-mode-as-prompt-' + sid);
    var lmManual = document.getElementById('language-mode-manual-' + sid);
    if (lmAsDesign) lmAsDesign.checked = lmVal === 'as-design';
    if (lmAsPrompt) lmAsPrompt.checked = lmVal === 'as-prompt';
    if (lmManual) lmManual.checked = lmVal === 'manual';

    // Background
    var bgModal = modal.querySelector('.generator-options-bg');
    var bgMain = document.getElementById('backgroundTransparent-' + sid);
    if (bgMain && bgModal) bgMain.checked = bgModal.checked;
  }

  function bindCloseHandlers(modal) {
    if (!modal) return;
    var sid = modal.getAttribute('data-section-id');
    var closeBtn = modal.querySelector('.generator-options-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (modal.close) modal.close();
      });
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal && modal.close) modal.close();
    });
    modal.addEventListener('cancel', function () {
      if (modal.close) modal.close();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Open: generatorOptionsBtn-{sectionId}
    document.addEventListener('click', function (e) {
      var openBtn = e.target.closest('[id^="generatorOptionsBtn-"]');
      if (openBtn) {
        var sid = openBtn.id.replace('generatorOptionsBtn-', '');
        e.preventDefault();
        openModal(sid);
      }

      var closeBtn = e.target.closest('.generator-options-close');
      if (closeBtn) {
        var sid = closeBtn.getAttribute('data-section-id');
        var modal = getModal(sid);
        if (modal && modal.close) modal.close();
      }

      var applyBtn = e.target.closest('.generator-options-apply');
      if (applyBtn) {
        var sid = applyBtn.getAttribute('data-section-id');
        syncToMainForm(sid);
        var modal = getModal(sid);
        if (modal && modal.close) modal.close();
      }
    });

    // Bind close handlers once per modal
    document.querySelectorAll('.generator-options-modal').forEach(function (modal) {
      bindCloseHandlers(modal);
    });

    // Ratio buttons inside modal
    document.addEventListener('click', function (e) {
      var ratioBtn = e.target.closest('.generator-options-modal .creator-ratio-option');
      if (!ratioBtn) return;
      var modal = ratioBtn.closest('.generator-options-modal');
      if (!modal) return;
      var sid = modal.getAttribute('data-section-id');
      modal.querySelectorAll('.creator-ratio-option').forEach(function (b) { b.classList.remove('creator-ratio-option--active'); });
      ratioBtn.classList.add('creator-ratio-option--active');
      var ratioInput = document.getElementById('ratio-' + sid);
      if (ratioInput) ratioInput.value = ratioBtn.getAttribute('data-ratio');
    });

    // Content type radios -> sync to main form on change
    document.addEventListener('change', function (e) {
      var radio = e.target;
      if (!radio.name || radio.name.indexOf('content-type-modal-') !== 0) return;
      var sid = radio.name.replace('content-type-modal-', '');
      var val = radio.value;
      var ctDesignText = document.getElementById('contentType-design-text-' + sid);
      var ctDesignOnly = document.getElementById('contentType-design-only-' + sid);
      var ctTextOnly = document.getElementById('contentType-text-only-' + sid);
      if (ctDesignText) ctDesignText.checked = val === 'design-text';
      if (ctDesignOnly) ctDesignOnly.checked = val === 'design-only';
      if (ctTextOnly) ctTextOnly.checked = val === 'text-only';
    });

    // Language mode radios -> sync + show/hide manual row
    document.addEventListener('change', function (e) {
      var radio = e.target;
      if (!radio.name || radio.name.indexOf('language-mode-modal-') !== 0) return;
      var sid = radio.name.replace('language-mode-modal-', '');
      var val = radio.value;
      var lmAsDesign = document.getElementById('language-mode-as-design-' + sid);
      var lmAsPrompt = document.getElementById('language-mode-as-prompt-' + sid);
      var lmManual = document.getElementById('language-mode-manual-' + sid);
      if (lmAsDesign) lmAsDesign.checked = val === 'as-design';
      if (lmAsPrompt) lmAsPrompt.checked = val === 'as-prompt';
      if (lmManual) lmManual.checked = val === 'manual';
      var modal = getModal(sid);
      if (modal) {
        var manualRow = modal.querySelector('.generator-language-manual-row');
        if (manualRow) manualRow.style.display = val === 'manual' ? 'block' : 'none';
      }
    });

    // Background checkbox -> sync
    document.addEventListener('change', function (e) {
      if (!e.target.classList.contains('generator-options-bg')) return;
      var modal = e.target.closest('.generator-options-modal');
      if (!modal) return;
      var sid = modal.getAttribute('data-section-id');
      var bgMain = document.getElementById('backgroundTransparent-' + sid);
      if (bgMain) bgMain.checked = e.target.checked;
      var lbl = modal.querySelector('#backgroundLabelModal-' + sid);
      if (lbl) lbl.textContent = e.target.checked ? (window.CreatorI18n?.backgroundTransparent || 'Transparent') : (window.CreatorI18n?.backgroundSolid || 'Solid');
    });

    // Styles button in modal -> open Style modal (main form elements)
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.generator-options-styles-btn');
      if (!btn) return;
      e.preventDefault();
      var sid = btn.getAttribute('data-section-id');
      var modal = getModal(sid);
      var stylesInput = document.getElementById('styles-' + sid);
      var stylesSummary = modal ? modal.querySelector('#stylesSummaryModal-' + sid) : null;
      if (!window.StyleModal || !window.StyleModal.open) return;
      var sel = [];
      try { sel = JSON.parse(stylesInput && stylesInput.value ? stylesInput.value : '[]'); } catch (_) {}
      if (modal && modal.close) modal.close();
      window.StyleModal.open({
        selected: sel,
        summaryEl: stylesSummary,
        inputEl: stylesInput,
        onApply: function (arr) {
          if (stylesInput) stylesInput.value = JSON.stringify(arr);
          if (stylesSummary) stylesSummary.textContent = arr.length + ' Styles ausgewählt';
        }
      });
    });

    // Language button in modal -> open Language modal
    document.addEventListener('click', function (e) {
      var btn2 = e.target.closest('[id^="languageBtnModal-"]');
      if (!btn2) return;
      e.preventDefault();
      var sid = btn2.id.replace('languageBtnModal-', '');
      var modal = getModal(sid);
      var langSummary = modal ? modal.querySelector('#languageSummaryModal-' + sid) : null;
      var langInput = document.getElementById('languageValue-' + sid);
      if (!window.LanguageModal || !window.LanguageModal.open) return;
      window.LanguageModal.open({
        currentLang: langInput ? langInput.value : 'de',
        summaryEl: langSummary,
        onSelect: function (lang, label) {
          if (langSummary) langSummary.textContent = label;
          if (langInput) langInput.value = lang;
        }
      });
    });

    // Colors button in modal -> open Color modal
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[id^="colorsBtnModal-"]');
      if (!btn) return;
      e.preventDefault();
      var sid = btn.id.replace('colorsBtnModal-', '');
      var modal = getModal(sid);
      var colorsSummary = modal ? modal.querySelector('#colorsSummaryModal-' + sid) : null;
      var colorDots = modal ? modal.querySelector('#colorDotsModal-' + sid) : null;
      var colorsInput = document.getElementById('designColors-' + sid);
      if (!window.ColorModal || !window.ColorModal.open) return;
      var cols = [];
      try { cols = JSON.parse(colorsInput && colorsInput.value ? colorsInput.value : '[]'); } catch (_) {}
      window.ColorModal.open({
        selected: cols,
        summaryEl: colorsSummary,
        dotsEl: colorDots,
        inputEl: colorsInput,
        onApply: function (arr) {
          if (colorsInput) colorsInput.value = JSON.stringify(arr);
          if (colorsSummary) colorsSummary.textContent = arr.length + ' Farben';
          if (colorDots) {
            colorDots.innerHTML = arr.map(function (h) {
              return '<span style="width:10px;height:10px;border-radius:50%;background:' + h + ';display:inline-block"></span>';
            }).join('');
          }
        }
      });
    });
  });
})();
