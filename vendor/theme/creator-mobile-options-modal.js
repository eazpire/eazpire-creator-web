/**
 * Weitere Optionen Modal (dev prototype)
 * Ratio, Content Type, Styles, Language, Colors, Background
 * Entspricht theme/snippets/generator-options-modal.liquid, angepasst an Mobile-Layout
 */
(function () {
  'use strict';

  var state = {
    ratio: 'portrait',
    contentType: 'design-text',
    languageMode: 'as-design',
    languageLang: '',
    languageLangLabel: '',
    languageDialect: '',
    languageDialectLabel: '',
    languageScript: '',
    languageScriptLabel: '',
    stylesSelected: [],
    stylesCount: 0,
    designColors: [],
    backgroundColors: [],
    backgroundTransparent: true
  };

  function open() {
    var overlay = document.getElementById('genOptionsOverlay');
    if (!overlay) return;

    var ext = window.__creatorGenOptionsState || {};
    if (ext.ratio) state.ratio = ext.ratio;
    if (ext.background && typeof ext.background === 'object') {
      state.backgroundTransparent = ext.background.mode === 'transparent';
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    syncUI();
  }

  function close() {
    var overlay = document.getElementById('genOptionsOverlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function syncUI() {
    document.querySelectorAll('.gen-options-ratio[data-ratio]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.ratio === state.ratio);
    });
    document.querySelectorAll('.gen-options-content-type-card[data-content-type]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.contentType === state.contentType);
    });
    var langSummary = document.getElementById('genOptionsLanguageSummary');
    if (langSummary) {
      if (state.languageMode === 'as-design') langSummary.textContent = 'Wie Design';
      else if (state.languageMode === 'as-prompt') langSummary.textContent = 'Wie Prompt';
      else if (state.languageMode === 'manual' && state.languageLang) {
        var s = state.languageLangLabel || state.languageLang;
        if (state.languageDialectLabel) s += ' + ' + state.languageDialectLabel;
        if (state.languageScriptLabel) s += ' (' + state.languageScriptLabel + ')';
        langSummary.textContent = s;
      } else langSummary.textContent = 'Sprache waehlen';
    }
    state.stylesCount = (state.stylesSelected || []).length;
    var stylesEl = document.getElementById('genOptionsStylesSummary');
    if (stylesEl) stylesEl.textContent = state.stylesCount + ' Styles ausgewaehlt';
    var colorsEl = document.getElementById('genOptionsColorsSummary');
    if (colorsEl) {
      var parts = [];
      parts.push('Design: ' + (state.designColors || []).length + ' Farben');
      parts.push(state.backgroundTransparent ? 'Hintergrund: Transparent' : 'Hintergrund: ' + (state.backgroundColors || []).length + ' Farben');
      colorsEl.textContent = parts.join(' · ');
    }
    renderColorDots();
  }

  function renderColorDots() {
    var designDots = document.getElementById('genOptionsDesignDots');
    var bgDots = document.getElementById('genOptionsBgDots');
    if (!designDots || !bgDots) return;
    var dc = state.designColors || [];
    var bc = state.backgroundColors || [];
    var transparent = state.backgroundTransparent;
    designDots.innerHTML = '';
    dc.forEach(function (hex) {
      var dot = document.createElement('span');
      dot.className = 'gen-options-colors-dot';
      dot.style.background = hex;
      dot.setAttribute('aria-label', hex);
      designDots.appendChild(dot);
    });
    bgDots.innerHTML = '';
    if (transparent) {
      var span = document.createElement('span');
      span.className = 'gen-options-colors-transparent';
      span.textContent = 'Transparent';
      bgDots.appendChild(span);
    } else {
      bc.forEach(function (hex) {
        var dot = document.createElement('span');
        dot.className = 'gen-options-colors-dot';
        dot.style.background = hex;
        dot.setAttribute('aria-label', hex);
        bgDots.appendChild(dot);
      });
    }
  }

  function bind() {
    var overlay = document.getElementById('genOptionsOverlay');
    var closeBtn = document.getElementById('genOptionsClose');
    var applyBtn = document.getElementById('genOptionsApply');

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        close();
        if (typeof window.GenOptionsModal !== 'undefined' && window.GenOptionsModal.onApply) {
          window.GenOptionsModal.onApply(state);
        }
      });
    }

    document.querySelectorAll('.gen-options-ratio[data-ratio]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.ratio = btn.dataset.ratio;
        syncUI();
      });
    });

    document.querySelectorAll('.gen-options-content-type-card[data-content-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.contentType = btn.dataset.contentType;
        document.querySelectorAll('.gen-options-content-type-card').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });

    var languageBtn = document.getElementById('genOptionsLanguageBtn');
    if (languageBtn) {
      languageBtn.addEventListener('click', function () {
        if (!(window.GenLanguageModal && typeof window.GenLanguageModal.open === 'function')) return;
        window.GenLanguageModal.open({
          mode: state.languageMode,
          lang: state.languageLang,
          langLabel: state.languageLangLabel,
          dialect: state.languageDialect,
          dialectLabel: state.languageDialectLabel,
          script: state.languageScript,
          scriptLabel: state.languageScriptLabel,
          summaryEl: document.getElementById('genOptionsLanguageSummary'),
          onApply: function (data) {
            state.languageMode = data.mode;
            state.languageLang = data.lang;
            state.languageLangLabel = data.langLabel;
            state.languageDialect = data.dialect;
            state.languageDialectLabel = data.dialectLabel;
            state.languageScript = data.script;
            state.languageScriptLabel = data.scriptLabel;
            syncUI();
          }
        });
      });
    }

    var stylesBtn = document.getElementById('genOptionsStylesBtn');
    if (stylesBtn) {
      stylesBtn.addEventListener('click', function () {
        if (!(window.GenStylesModal && typeof window.GenStylesModal.open === 'function')) return;
        window.GenStylesModal.open({
          selected: state.stylesSelected || [],
          summaryEl: document.getElementById('genOptionsStylesSummary'),
          onApply: function (arr) {
            state.stylesSelected = arr || [];
            state.stylesCount = state.stylesSelected.length;
            syncUI();
          }
        });
      });
    }

    var colorsBtn = document.getElementById('genOptionsColorsBtn');
    if (colorsBtn) {
      colorsBtn.addEventListener('click', function () {
        if (!(window.GenColorModal && typeof window.GenColorModal.open === 'function')) return;
        window.GenColorModal.open({
          designColors: state.designColors || [],
          backgroundColors: state.backgroundColors || [],
          backgroundTransparent: state.backgroundTransparent,
          summaryEl: document.getElementById('genOptionsColorsSummary'),
          onApply: function (data) {
            state.designColors = data.designColors || [];
            state.backgroundColors = data.backgroundColors || [];
            state.backgroundTransparent = data.backgroundTransparent;
            syncUI();
          }
        });
      });
    }
  }

  function getState() {
    return Object.assign({}, state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.GenOptionsModal = {
    open: open,
    close: close,
    getState: getState
  };
})();
