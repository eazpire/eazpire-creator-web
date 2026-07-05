/**
 * Language Modal – dev prototype
 * Orientiert an theme/assets/eaz-redesign-common.js (Language + Dialect/Script)
 */
(function () {
  'use strict';

  var ALL_LANGUAGES = [
    { code: 'de', name: 'Deutsch', native: 'Deutsch', flag: 'DE' },
    { code: 'en', name: 'English', native: 'English', flag: 'GB' },
    { code: 'fr', name: 'Francais', native: 'Francais', flag: 'FR' },
    { code: 'es', name: 'Espanol', native: 'Espanol', flag: 'ES' },
    { code: 'it', name: 'Italiano', native: 'Italiano', flag: 'IT' },
    { code: 'pt', name: 'Portugues', native: 'Portugues', flag: 'PT' },
    { code: 'pt-BR', name: 'Portugues (Brasil)', native: 'Portugues (Brasil)', flag: 'BR' },
    { code: 'nl', name: 'Nederlands', native: 'Nederlands', flag: 'NL' },
    { code: 'pl', name: 'Polski', native: 'Polski', flag: 'PL' },
    { code: 'cs', name: 'Cestina', native: 'Cestina', flag: 'CZ' },
    { code: 'da', name: 'Dansk', native: 'Dansk', flag: 'DK' },
    { code: 'sv', name: 'Svenska', native: 'Svenska', flag: 'SE' },
    { code: 'nb', name: 'Norsk Bokmal', native: 'Norsk Bokmal', flag: 'NO' },
    { code: 'fi', name: 'Suomi', native: 'Suomi', flag: 'FI' },
    { code: 'hu', name: 'Magyar', native: 'Magyar', flag: 'HU' },
    { code: 'ro', name: 'Romana', native: 'Romana', flag: 'RO' },
    { code: 'bg', name: 'Bulgarian', native: 'Bulgarian', flag: 'BG' },
    { code: 'hr', name: 'Hrvatski', native: 'Hrvatski', flag: 'HR' },
    { code: 'sk', name: 'Slovencina', native: 'Slovencina', flag: 'SK' },
    { code: 'sl', name: 'Slovenscina', native: 'Slovenscina', flag: 'SI' },
    { code: 'el', name: 'Greek', native: 'Greek', flag: 'GR' },
    { code: 'ru', name: 'Russian', native: 'Russian', flag: 'RU' },
    { code: 'uk', name: 'Ukrainian', native: 'Ukrainian', flag: 'UA' },
    { code: 'tr', name: 'Turkce', native: 'Turkce', flag: 'TR' },
    { code: 'ar', name: 'Arabic', native: 'Arabic', flag: 'SA' },
    { code: 'he', name: 'Hebrew', native: 'Hebrew', flag: 'IL' },
    { code: 'hi', name: 'Hindi', native: 'Hindi', flag: 'IN' },
    { code: 'th', name: 'Thai', native: 'Thai', flag: 'TH' },
    { code: 'vi', name: 'Vietnamese', native: 'Vietnamese', flag: 'VN' },
    { code: 'id', name: 'Bahasa Indonesia', native: 'Bahasa Indonesia', flag: 'ID' },
    { code: 'zh-CN', name: 'Chinese Simplified', native: 'Chinese Simplified', flag: 'CN' },
    { code: 'zh-TW', name: 'Chinese Traditional', native: 'Chinese Traditional', flag: 'TW' },
    { code: 'zh-Hans', name: 'Chinese Simplified', native: 'Chinese Simplified', flag: 'CN' },
    { code: 'zh-Hant', name: 'Chinese Traditional', native: 'Chinese Traditional', flag: 'TW' },
    { code: 'ja', name: 'Japanese', native: 'Japanese', flag: 'JP' },
    { code: 'ko', name: 'Korean', native: 'Korean', flag: 'KR' },
    { code: 'sr', name: 'Serbian', native: 'Serbian', flag: 'RS' }
  ];

  var DIALECT_LANGUAGES = [
    { code: 'de-CH', name: 'Schweizerdeutsch', native: 'Schwiizerduetsch', flag: 'CH', baseLang: 'de', type: 'dialect' },
    { code: 'de-AT', name: 'Oesterreichisch', native: 'Oesterreichisch', flag: 'AT', baseLang: 'de', type: 'dialect' },
    { code: 'de-BAY', name: 'Bairisch', native: 'Boarisch', flag: 'DE', baseLang: 'de', type: 'dialect' },
    { code: 'de-KOELN', name: 'Koelsch', native: 'Koelsch', flag: 'DE', baseLang: 'de', type: 'dialect' },
    { code: 'de-BERLIN', name: 'Berlinerisch', native: 'Berlinerisch', flag: 'DE', baseLang: 'de', type: 'dialect' },
    { code: 'de-PLATT', name: 'Plattdeutsch', native: 'Plattduetsch', flag: 'DE', baseLang: 'de', type: 'dialect' },
    { code: 'nl-BE', name: 'Flemish', native: 'Vlaams', flag: 'BE', baseLang: 'nl', type: 'dialect' },
    { code: 'fr-CA', name: 'Canadien Francais', native: 'Francais canadien', flag: 'CA', baseLang: 'fr', type: 'dialect' },
    { code: 'es-MX', name: 'Mexican Spanish', native: 'Espanol mexicano', flag: 'MX', baseLang: 'es', type: 'dialect' },
    { code: 'en-SCOTS', name: 'Scots English', native: 'Scots', flag: 'GB', baseLang: 'en', type: 'dialect' },
    { code: 'sr-Cyrl', name: 'Serbian Cyrillic', native: 'Serbian Cyrillic', flag: 'RS', baseLang: 'sr', type: 'script' },
    { code: 'sr-Latn', name: 'Serbian Latin', native: 'Serbian Latin', flag: 'RS', baseLang: 'sr', type: 'script' },
    { code: 'zh-Latn', name: 'Chinese Pinyin', native: 'Pinyin', flag: 'CN', baseLang: 'zh', type: 'script' },
    { code: 'ja-Romaji', name: 'Japanese Romaji', native: 'Romaji', flag: 'JP', baseLang: 'ja', type: 'script' },
    { code: 'ru-Latn', name: 'Russian Romanized', native: 'Transliteratsiya', flag: 'RU', baseLang: 'ru', type: 'script' },
    { code: 'ar-Latn', name: 'Arabic Romanized', native: 'Arabi', flag: 'SA', baseLang: 'ar', type: 'script' },
    { code: 'hi-Latn', name: 'Hindi Romanized', native: 'Hindi', flag: 'IN', baseLang: 'hi', type: 'script' },
    { code: 'ko-Romaji', name: 'Korean Romanized', native: 'Romaja', flag: 'KR', baseLang: 'ko', type: 'script' }
  ];

  var childrenByLang = {};
  DIALECT_LANGUAGES.forEach(function (d) {
    if (!childrenByLang[d.baseLang]) childrenByLang[d.baseLang] = { dialects: [], scripts: [] };
    childrenByLang[d.baseLang][d.type === 'script' ? 'scripts' : 'dialects'].push(d);
  });

  var FLAG_EMOJI = {
    DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', BR: '🇧🇷', NL: '🇳🇱', PL: '🇵🇱',
    CZ: '🇨🇿', DK: '🇩🇰', SE: '🇸🇪', NO: '🇳🇴', FI: '🇫🇮', HU: '🇭🇺', RO: '🇷🇴', BG: '🇧🇬', HR: '🇭🇷',
    SK: '🇸🇰', SI: '🇸🇮', GR: '🇬🇷', RU: '🇷🇺', UA: '🇺🇦', TR: '🇹🇷', SA: '🇸🇦', IL: '🇮🇱', IN: '🇮🇳',
    TH: '🇹🇭', VN: '🇻🇳', ID: '🇮🇩', CN: '🇨🇳', TW: '🇹🇼', JP: '🇯🇵', KR: '🇰🇷', RS: '🇷🇸', CH: '🇨🇭',
    AT: '🇦🇹', BE: '🇧🇪', CA: '🇨🇦', MX: '🇲🇽'
  };

  function getFlagEmoji(cc) {
    if (!cc) return '';
    var c = (cc + '').toUpperCase();
    return FLAG_EMOJI[c] || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function findLanguageByCode(code) {
    return ALL_LANGUAGES.find(function (l) { return l.code === code; }) || null;
  }

  function findDialectOrScriptByCode(code) {
    return DIALECT_LANGUAGES.find(function (d) { return d.code === code; }) || null;
  }

  function getVariantMarker(type, flagCode, baseLangCode) {
    var emoji = getFlagEmoji(flagCode);
    if (emoji) return emoji;
    if (baseLangCode) {
      var base = findLanguageByCode(baseLangCode);
      var baseEmoji = getFlagEmoji(base && base.flag);
      if (baseEmoji) return baseEmoji;
    }
    return type === 'script' ? '🔤' : '🗣️';
  }

  function withFlag(label, flagCode, type, baseLangCode) {
    var marker = type ? getVariantMarker(type, flagCode, baseLangCode) : getFlagEmoji(flagCode);
    return marker ? (marker + ' ' + label) : label;
  }

  function variantDefaultLabel(type) {
    return type === 'script' ? 'Script' : 'Dialect';
  }

  function setVariantButtonLabel(btn, type, label, flagCode, baseLangCode) {
    if (!btn) return;
    var text = label || variantDefaultLabel(type);
    var marker = getVariantMarker(type, flagCode, baseLangCode);
    btn.innerHTML = '<span class="gen-lang-variant-text">' + (marker ? ('<span class="gen-lang-modal-flag">' + marker + '</span>') : '') + '<span>' + escapeHtml(text) + '</span></span><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2"/></svg>';
  }

  function getBaseLangForVariants(code) {
    var base = (code || '').split('-')[0].split('_')[0];
    if (childrenByLang[code]) return code;
    if (childrenByLang[base]) return base;
    return code;
  }

  var overlay = null;
  var dialectOverlay = null;
  var onApplyCb = null;
  var summaryEl = null;

  var draft = {
    mode: 'as-design',
    lang: 'de',
    langLabel: 'Deutsch',
    dialect: '',
    dialectLabel: '',
    script: '',
    scriptLabel: '',
    listViewExpanded: true
  };

  function getDisplayText() {
    if (draft.mode === 'as-design') return 'Wie Design';
    if (draft.mode === 'as-prompt') return 'Wie Prompt';
    if (!draft.lang) return 'Sprache waehlen';
    var lang = findLanguageByCode(draft.lang);
    var langLabel = draft.langLabel || draft.lang;
    var s = withFlag(langLabel, lang && lang.flag);
    if (draft.dialectLabel) {
      var dialect = findDialectOrScriptByCode(draft.dialect);
      s += ' + ' + withFlag(draft.dialectLabel, dialect && dialect.flag, 'dialect', dialect && dialect.baseLang);
    }
    if (draft.scriptLabel) {
      var script = findDialectOrScriptByCode(draft.script);
      s += ' (' + withFlag(draft.scriptLabel, script && script.flag, 'script', script && script.baseLang) + ')';
    }
    return s;
  }

  function renderLanguageList(container, collapsed, selectedLang) {
    if (!container) return;
    var q = (document.getElementById('genLangSearch') || {}).value || '';
    q = q.toLowerCase().trim();

    var list = container.querySelector('.gen-lang-modal-list');
    if (!list) return;

    if (collapsed && selectedLang) {
      list.innerHTML = '';
      var lang = ALL_LANGUAGES.find(function (l) { return l.code === selectedLang; });
      if (lang) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'gen-lang-modal-item gen-lang-modal-item--selected';
        item.dataset.langCode = lang.code;
        item.dataset.langName = lang.name;
        item.dataset.langNative = lang.native;
        item.innerHTML = '<span class="gen-lang-modal-flag">' + getFlagEmoji(lang.flag) + '</span><span class="gen-lang-modal-name">' + lang.native + '</span><svg class="gen-lang-modal-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2"/></svg>';
        list.appendChild(item);
      }
      return;
    }

    var filtered = ALL_LANGUAGES.filter(function (l) {
      if (!q) return true;
      var txt = (l.name + ' ' + l.native + ' ' + l.code).toLowerCase();
      return txt.indexOf(q) >= 0;
    });

    var html = '';
    filtered.forEach(function (l) {
      var isSel = l.code === selectedLang;
      html += '<button type="button" class="gen-lang-modal-item' + (isSel ? ' is-selected' : '') + '" data-lang-code="' + l.code + '" data-lang-name="' + l.name + '" data-lang-native="' + l.native + '"><span class="gen-lang-modal-flag">' + getFlagEmoji(l.flag) + '</span><span class="gen-lang-modal-name">' + l.native + '</span></button>';
    });
    if (filtered.length === 0) html = '<div class="gen-lang-modal-empty">Keine Sprachen gefunden</div>';
    list.innerHTML = html;
  }

  function openDialectModal(langCode, type) {
    if (!dialectOverlay) return;
    var children = childrenByLang[langCode];
    if (!children) return;

    var lang = ALL_LANGUAGES.find(function (l) { return l.code === langCode; });
    if (!lang) return;

    var list = type === 'dialect' ? children.dialects : children.scripts;
    var active = type === 'dialect' ? draft.dialect : draft.script;
    var dataName = type === 'dialect' ? 'dialect' : 'script';
    var titleEl = document.getElementById('genDialectTitle');
    var bodyEl = document.getElementById('genDialectBody');
    if (titleEl) titleEl.textContent = (type === 'dialect' ? 'Dialect' : 'Script') + ' - ' + lang.native;
    if (!bodyEl) return;

    var baseFlag = getFlagEmoji(lang.flag);
    var html = '<button type="button" class="gen-dialect-option' + (!active ? ' is-selected' : '') + '" data-value="">' + (baseFlag ? (baseFlag + ' ') : '') + 'Standard</button>';
    list.forEach(function (d) {
      html += '<button type="button" class="gen-dialect-option' + (active === d.code ? ' is-selected' : '') + '" data-value="' + d.code + '">' + withFlag(d.native, d.flag, d.type, d.baseLang) + '</button>';
    });
    bodyEl.innerHTML = html;
    bodyEl.dataset.dialectType = dataName;

    bodyEl.querySelectorAll('.gen-dialect-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = this.dataset.value || '';
        var label = val ? (DIALECT_LANGUAGES.find(function (x) { return x.code === val; }) || {}).native || val : '';
        if (dataName === 'dialect') {
          draft.dialect = val;
          draft.dialectLabel = label;
        } else {
          draft.script = val;
          draft.scriptLabel = label;
        }
        closeDialectModal();
        syncMainModal();
      });
    });

    dialectOverlay.classList.add('is-open');
    dialectOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeDialectModal() {
    if (!dialectOverlay) return;
    dialectOverlay.classList.remove('is-open');
    dialectOverlay.setAttribute('aria-hidden', 'true');
  }

  function syncMainModal() {
    var mode = draft.mode;
    var modeAsDesign = document.querySelector('.gen-lang-mode-opt[data-mode="as-design"]');
    var modeAsPrompt = document.querySelector('.gen-lang-mode-opt[data-mode="as-prompt"]');
    var modeManual = document.querySelector('.gen-lang-mode-opt[data-mode="manual"]');
    if (modeAsDesign) modeAsDesign.classList.toggle('is-selected', mode === 'as-design');
    if (modeAsPrompt) modeAsPrompt.classList.toggle('is-selected', mode === 'as-prompt');
    if (modeManual) modeManual.classList.toggle('is-selected', mode === 'manual');

    var manualBlock = document.getElementById('genLangManualBlock');
    if (manualBlock) manualBlock.style.display = mode === 'manual' ? 'flex' : 'none';

    var showCollapsed = mode === 'manual' && draft.lang && !draft.listViewExpanded;
    var showExpanded = mode === 'manual' && (!draft.lang || draft.listViewExpanded);
    var listCollapsed = document.getElementById('genLangListCollapsed');
    var listExpanded = document.getElementById('genLangListExpanded');
    if (listCollapsed) listCollapsed.style.display = showCollapsed ? 'block' : 'none';
    if (listExpanded) listExpanded.style.display = showExpanded ? 'block' : 'none';

    var baseLang = draft.lang ? getBaseLangForVariants(draft.lang) : null;
    var children = baseLang ? childrenByLang[baseLang] : null;
    var hasDialects = !!(children && children.dialects.length);
    var hasScripts = !!(children && children.scripts.length);
    var hasVariants = hasDialects || hasScripts;
    if (!hasDialects) { draft.dialect = ''; draft.dialectLabel = ''; }
    if (!hasScripts) { draft.script = ''; draft.scriptLabel = ''; }
    var row = document.getElementById('genLangDialectScriptRow');
    if (row) row.style.display = mode === 'manual' && draft.lang && hasVariants ? 'flex' : 'none';

    var dialectBtn = document.getElementById('genLangDialectBtn');
    var scriptBtn = document.getElementById('genLangScriptBtn');
    if (dialectBtn) {
      dialectBtn.style.display = hasDialects ? '' : 'none';
      var activeDialect = findDialectOrScriptByCode(draft.dialect);
      setVariantButtonLabel(dialectBtn, 'dialect', draft.dialectLabel, activeDialect && activeDialect.flag, activeDialect && activeDialect.baseLang);
    }
    if (scriptBtn) {
      scriptBtn.style.display = hasScripts ? '' : 'none';
      var activeScript = findDialectOrScriptByCode(draft.script);
      setVariantButtonLabel(scriptBtn, 'script', draft.scriptLabel, activeScript && activeScript.flag, activeScript && activeScript.baseLang);
    }

    var searchWrap = document.getElementById('genLangSearchWrap');
    if (searchWrap) searchWrap.style.display = (mode === 'manual' && showExpanded) ? 'block' : 'none';

    if (showCollapsed && listCollapsed) renderLanguageList(listCollapsed, true, draft.lang);
    if (showExpanded && listExpanded) renderLanguageList(listExpanded, false, draft.lang);
  }

  function close() {
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    closeDialectModal();
  }

  function open(opts) {
    opts = opts || {};
    overlay = document.getElementById('genLangOverlay');
    if (!overlay) return;
    onApplyCb = opts.onApply || function () {};
    summaryEl = opts.summaryEl || null;

    draft.mode = opts.mode || 'as-design';
    draft.lang = opts.lang || '';
    draft.langLabel = opts.langLabel || '';
    draft.dialect = opts.dialect || '';
    draft.dialectLabel = opts.dialectLabel || '';
    draft.script = opts.script || '';
    draft.scriptLabel = opts.scriptLabel || '';
    draft.listViewExpanded = !draft.lang;

    var search = document.getElementById('genLangSearch');
    if (search) search.value = '';

    syncMainModal();
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function bind() {
    overlay = document.getElementById('genLangOverlay');
    dialectOverlay = document.getElementById('genDialectOverlay');
    if (!overlay) return;

    var closeBtn = document.getElementById('genLangClose');
    var applyBtn = document.getElementById('genLangApply');
    var cancelBtn = document.getElementById('genLangCancel');
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        if (summaryEl) summaryEl.textContent = getDisplayText();
        onApplyCb({
          mode: draft.mode,
          lang: draft.lang,
          langLabel: draft.langLabel,
          dialect: draft.dialect,
          dialectLabel: draft.dialectLabel,
          script: draft.script,
          scriptLabel: draft.scriptLabel
        });
        close();
      });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    overlay.querySelectorAll('.gen-lang-mode-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        draft.mode = btn.dataset.mode || 'as-design';
        if (draft.mode !== 'manual') {
          draft.lang = '';
          draft.langLabel = '';
          draft.dialect = '';
          draft.dialectLabel = '';
          draft.script = '';
          draft.scriptLabel = '';
        } else if (!draft.lang) {
          draft.listViewExpanded = true;
        }
        syncMainModal();
      });
    });

    var listExpanded = document.getElementById('genLangListExpanded');
    if (listExpanded) {
      listExpanded.addEventListener('click', function (e) {
        var item = e.target.closest('.gen-lang-modal-item');
        if (!item) return;
        draft.lang = item.dataset.langCode;
        draft.langLabel = item.dataset.langNative || item.dataset.langName;
        draft.dialect = '';
        draft.dialectLabel = '';
        draft.script = '';
        draft.scriptLabel = '';
        draft.listViewExpanded = false;
        syncMainModal();
      });
    }

    var listCollapsed = document.getElementById('genLangListCollapsed');
    if (listCollapsed) {
      listCollapsed.addEventListener('click', function (e) {
        if (!e.target.closest('.gen-lang-modal-item')) return;
        draft.listViewExpanded = true;
        syncMainModal();
      });
    }

    var search = document.getElementById('genLangSearch');
    if (search) {
      search.addEventListener('input', function () {
        renderLanguageList(document.getElementById('genLangListExpanded'), false, draft.lang);
      });
    }

    var dialectBtn = document.getElementById('genLangDialectBtn');
    var scriptBtn = document.getElementById('genLangScriptBtn');
    if (dialectBtn) dialectBtn.addEventListener('click', function () { if (draft.lang) openDialectModal(getBaseLangForVariants(draft.lang), 'dialect'); });
    if (scriptBtn) scriptBtn.addEventListener('click', function () { if (draft.lang) openDialectModal(getBaseLangForVariants(draft.lang), 'script'); });

    if (dialectOverlay) {
      var dialectClose = document.getElementById('genDialectClose');
      if (dialectClose) dialectClose.addEventListener('click', closeDialectModal);
      dialectOverlay.addEventListener('click', function (e) { if (e.target === dialectOverlay) closeDialectModal(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.GenLanguageModal = {
    open: open,
    close: close,
    getDisplayText: getDisplayText
  };
})();
