/**
 * Creator Level Panel JavaScript
 * Lädt Level/XP Daten und befüllt die UI
 * FIXES:
 * - benefits kann fehlen -> sichere Defaults
 * - level_thresholds kann fehlen -> sichere Defaults
 * - SQLite/JSON kann Strings liefern -> Number() Konvertierung
 * - robustere Panel-Aktiv-Erkennung (nicht nur id=csmPanelLevel)
 * - verhindert doppelte Fetches (inflight guard)
 */

(function() {
  'use strict';

  // DOM Elemente
  let panelElement = null;
  let loadingElement = null;
  let errorElement = null;
  let contentElement = null;

  // UI Elemente
  let levelNumberElement = null;
  let levelDisplayNameElement = null;
  let xpTextElement = null;
  let progressFillElement = null;
  let xpRemainingElement = null;
  let featuresListElement = null;
  let levelsGridElement = null;

  // Guards
  let listenersBound = false;
  let inflightPromise = null;

  /** Same auth chain as journey modal / balance bar — not only Liquid data-owner-id. */
  function resolveOwnerId() {
    if (panelElement) {
      var fromData = panelElement.dataset.ownerId;
      if (fromData && String(fromData).trim() &&
          fromData !== 'null' && fromData !== 'undefined') {
        return String(fromData).trim();
      }
    }
    if (typeof window._resolveEazOwnerId === 'function') {
      var resolved = window._resolveEazOwnerId();
      if (resolved) return String(resolved).trim();
    }
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    if (window.Shopify && window.Shopify.customerId) {
      return String(window.Shopify.customerId);
    }
    return null;
  }

  function syncOwnerIdToPanel(id) {
    if (!panelElement || !id) return;
    panelElement.dataset.ownerId = id;
  }

  function getSharedLevelData() {
    return window.__EAZ_JOURNEY_LEVEL_DATA__ || null;
  }

  async function waitForSharedLevelLoad() {
    if (!window.__EAZ_JOURNEY_LEVEL_LOAD_PROMISE__) return null;
    try {
      await window.__EAZ_JOURNEY_LEVEL_LOAD_PROMISE__;
    } catch (_e) { /* own fetch below */ }
    return getSharedLevelData();
  }

  function tpl(str, map) {
    var out = String(str || '');
    Object.keys(map).forEach(function (k) {
      out = out.replace(new RegExp('\\{\\{\\s*' + k + '\\s*\\}\\}', 'gi'), String(map[k]));
    });
    return out;
  }

  /** Max level number present in threshold rows (fallback 1). */
  function maxLevelFromThresholdRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var maxL = 1;
    for (var i = 0; i < list.length; i++) {
      var ln = Number(list[i].level);
      if (Number.isFinite(ln) && ln > maxL) maxL = ln;
    }
    return Math.max(1, maxL);
  }

  /** Client-side fallback matching worker estimateFreePoolEazCurve(). */
  function defaultLevelEaz(L) {
    var l = Math.max(1, Math.floor(Number(L) || 1));
    if (l <= 1) return { daily_eaz: 0, max_eaz: 0 };
    if (l === 2) return { daily_eaz: 50, max_eaz: 50 };
    var daily_eaz = 60 + (l - 3) * 10;
    var max_eaz = 80 + (l - 3) * 30;
    return { daily_eaz: daily_eaz, max_eaz: max_eaz };
  }

  function eazLookup(level, rows) {
    var list = Array.isArray(rows) ? rows : [];
    var hit = list.find(function (x) { return Number(x.level) === Number(level); });
    if (hit && hit.daily_eaz != null && hit.max_eaz != null) {
      return {
        daily_eaz: Number(hit.daily_eaz),
        max_eaz: Number(hit.max_eaz),
      };
    }
    var d = defaultLevelEaz(level);
    return { daily_eaz: d.daily_eaz, max_eaz: d.max_eaz };
  }

  function getLockedLevelLabel(levelNum) {
    const I = window.CreatorI18n || {};
    const raw = I.levelLockedLabelTpl || 'Level {{ n }}';
    return tpl(raw, { n: String(levelNum) });
  }

  /** Same tier names as storefront overview — for unlocked/current levels only in the grid. */
  function getUnlockedTierDisplayName(levelNum) {
    const n = Number(levelNum);
    const map = (window.CreatorI18n && window.CreatorI18n.levelTierNames) || {};
    const v = map[n];
    if (v != null && String(v).trim() !== '') return String(v).trim();
    return getLockedLevelLabel(n);
  }

  function resolvePanelRoot() {
    var journeyRoot = document.querySelector('#cjPanelLevel #creator-level-panel');
    if (journeyRoot) return journeyRoot;
    return document.getElementById('creator-level-panel');
  }

  function isLevelTabActive() {
    if (!panelElement) return false;
    var journeySection = document.getElementById('cjPanelLevel');
    if (journeySection && journeySection.contains(panelElement)) {
      return journeySection.classList.contains('is-active');
    }
    var settingsSection = document.querySelector('[data-csm-panel="level"]');
    if (settingsSection && settingsSection.contains(panelElement)) {
      return settingsSection.classList.contains('is-active');
    }
    return true;
  }

  function bindElementsFromRoot(root) {
    panelElement = root;
    loadingElement = root.querySelector('#clpLoading');
    errorElement = root.querySelector('#clpError');
    contentElement = root.querySelector('#clpContent');
    levelNumberElement = root.querySelector('#clpLevelNumber');
    levelDisplayNameElement = root.querySelector('#clpLevelDisplayName');
    xpTextElement = root.querySelector('#clpXpText');
    progressFillElement = root.querySelector('#clpProgressFill');
    xpRemainingElement = root.querySelector('#clpXpRemaining');
    featuresListElement = root.querySelector('#clpFeaturesList');
    levelsGridElement = root.querySelector('#clpLevelsGrid');
  }

  function hideAllPresentationStates() {
    if (loadingElement) loadingElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'none';
  }

  function hasVisiblePresentation() {
    function isShown(el) {
      if (!el) return false;
      var d = el.style.display;
      return d && d !== 'none';
    }
    return isShown(loadingElement) || isShown(errorElement) || isShown(contentElement);
  }

  function syncPresentationState() {
    if (!panelElement) return;
    // Inactive Level pane is already hidden by Journey/Settings CSS.
    // Do not blank loading/content/error here — that left an empty Level tab when
    // load() never ran (e.g. Creator Portal opened Journey without level-panel.js).
    if (!isLevelTabActive()) {
      return;
    }
    if (!hasVisiblePresentation()) {
      showLoading();
    }
  }

  /**
   * Initialisiert das Level Panel
   */
  function init() {
    var root = resolvePanelRoot();
    if (!root) {
      return;
    }

    bindElementsFromRoot(root);

    // Event Listener nur einmal binden
    if (!listenersBound) {
      setupEventListeners();
      listenersBound = true;
    }

    syncPresentationState();
    if (isLevelTabActive()) {
      loadLevelData();
    }
  }

  /**
   * Event Listener für Modal-Interaktionen
   */
  function setupEventListeners() {
    // Listener für Custom Event vom Creator Settings Modal
    document.addEventListener('creator-settings-v2-tab-changed', function(event) {
      if (event.detail && event.detail.tab === 'level') {
        loadLevelData();
      }
    });

    // Fallback: wenn Panel sichtbar wird (class toggles)
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target && target.id === 'cjPanelLevel') {
            if (target.classList.contains('is-active')) {
              if (!panelElement) init();
              loadLevelData();
            } else {
              syncPresentationState();
            }
            return;
          }
          if (target && target.matches && target.matches('[data-csm-panel="level"]') && target.classList.contains('is-active')) {
            loadLevelData();
          }
        }
      });
    });

    const journeyLevelPanel = document.getElementById('cjPanelLevel');
    if (journeyLevelPanel) {
      observer.observe(journeyLevelPanel, { attributes: true, attributeFilter: ['class'] });
    }

    const modalLevelPanel = document.querySelector('[data-csm-panel="level"]');
    if (modalLevelPanel) {
      observer.observe(modalLevelPanel, { attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('creator-journey-tab-changed', function(event) {
      if (event.detail && event.detail.tab === 'level') {
        if (!panelElement) init();
        loadLevelData();
      } else {
        syncPresentationState();
      }
    });

    document.addEventListener('creator-journey-level-data', function(event) {
      if (!isLevelTabActive()) return;
      var data = event.detail || getSharedLevelData();
      if (data && data.ok) renderLevelData(data);
    });

    // XP-Updates (z.B. nach Aktionen)
    document.addEventListener('xp-updated', function() {
      setTimeout(loadLevelData, 300);
    });

    // Modal opened -> init nach kurzer Verzögerung (falls DOM später gerendert wird)
    document.addEventListener('creator-settings-v2-opened', function() {
      setTimeout(init, 100);
    });
  }

  /**
   * Lädt Level-Daten vom Backend
   */
  async function loadLevelData() {
    if (!panelElement) {
      init();
    }
    if (!panelElement) return;
    if (!isLevelTabActive()) {
      syncPresentationState();
      return;
    }

    const ownerId = resolveOwnerId();
    syncOwnerIdToPanel(ownerId);

    if (!ownerId) {
      showError(
        (window.CreatorI18n && window.CreatorI18n.pleaseLogin) ||
          'Please sign in to view your level.'
      );
      return;
    }

    var shared = getSharedLevelData();
    if (shared && shared.ok) {
      try {
        renderLevelData(shared);
      } catch (renderErr) {
        console.error('[Creator Level Panel] render failed (shared):', renderErr);
        showError(
          ((window.CreatorI18n && window.CreatorI18n.error) || 'Error') +
            ': Could not display level data.'
        );
      }
      return;
    }

    // Join in-flight request instead of bailing with a blank pane (prior hideAll race).
    if (inflightPromise) {
      showLoading();
      try {
        var joined = await inflightPromise;
        if (!isLevelTabActive()) return;
        if (joined && joined.ok) {
          renderLevelData(joined);
        } else {
          showError(
            ((window.CreatorI18n && window.CreatorI18n.error) || 'Error') +
              ': ' +
              ((joined && joined.error) || 'Could not load level.')
          );
        }
      } catch (joinErr) {
        if (!isLevelTabActive()) return;
        showError(
          ((window.CreatorI18n && window.CreatorI18n.error) || 'Error') +
            ': ' +
            (joinErr && joinErr.message ? joinErr.message : 'Please try again.')
        );
      }
      return;
    }

    showLoading();

    try {
      var data = await waitForSharedLevelLoad();
      if (data && data.ok) {
        if (isLevelTabActive()) renderLevelData(data);
        return;
      }

      if (typeof window.creatorApiFetch === 'function') {
        inflightPromise = window.creatorApiFetch('get-level', { owner_id: ownerId });
        data = await inflightPromise;
      } else {
        const url = '/apps/creator-dispatch?path_prefix=/apps/creator-dispatch&op=get-level&owner_id=' + encodeURIComponent(ownerId);
        inflightPromise = fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }).then(async function (response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
          }
          const text = await response.text();
          try {
            return JSON.parse(text);
          } catch (e) {
            throw new Error('Antwort ist kein JSON (erste 120 Zeichen): ' + text.slice(0, 120));
          }
        });
        data = await inflightPromise;
      }

      if (!data || !data.ok) {
        throw new Error((data && data.error) || 'Unbekannter Fehler');
      }

      window.__EAZ_JOURNEY_LEVEL_DATA__ = data;
      if (isLevelTabActive()) renderLevelData(data);
    } catch (error) {
      console.error('[Creator Level Panel] Fehler beim Laden der Level-Daten:', error);
      if (isLevelTabActive()) {
        showError(
          ((window.CreatorI18n && window.CreatorI18n.error) || 'Error') +
            ': ' +
            (error && error.message ? error.message : 'Please try again later.')
        );
      }
    } finally {
      inflightPromise = null;
      if (isLevelTabActive() && !hasVisiblePresentation()) {
        showError(
          ((window.CreatorI18n && window.CreatorI18n.error) || 'Error') +
            ': Level data is temporarily unavailable.'
        );
      }
    }
  }

  /**
   * Rendert die Level-Daten in die UI
   */
  function renderLevelData(data) {
    if (!data || typeof data !== 'object') {
      showError(
        ((window.CreatorI18n && window.CreatorI18n.error) || 'Error') +
          ': Invalid level payload.'
      );
      return;
    }
    // ✅ defensive defaults
    const total_xp = Number(data.total_xp || 0);
    const current_level = Number(data.current_level || 1);
    const level_thresholds = Array.isArray(data.level_thresholds) ? data.level_thresholds : [];
    const level_eaz_by_level = Array.isArray(data.level_eaz_by_level)
      ? data.level_eaz_by_level
      : null;
    if (levelNumberElement) {
      levelNumberElement.textContent = String(current_level);
    }
    if (levelDisplayNameElement) {
      levelDisplayNameElement.textContent = getUnlockedTierDisplayName(current_level);
    }

    // XP Berechnungen
    const maxXpLevel = Math.max(maxLevelFromThresholdRows(level_thresholds), current_level);
    const currentThreshold = getThresholdForLevel(current_level, level_thresholds);
    const nextThresholdRaw = getThresholdForLevel(current_level + 1, level_thresholds);
    const hasNext = current_level < maxXpLevel && (
      nextThresholdRaw > currentThreshold ||
      level_thresholds.some(t => Number(t.level) === current_level + 1)
    );

    const nextThreshold = hasNext ? nextThresholdRaw : null;

    const xpInLevel = Math.max(0, total_xp - currentThreshold);
    const xpNeeded = nextThreshold !== null ? Math.max(0, nextThreshold - total_xp) : 0;

    const denom = (nextThreshold !== null) ? (nextThreshold - currentThreshold) : 0;
    const progressPercent = (nextThreshold !== null && denom > 0)
      ? Math.min(100, Math.max(0, (xpInLevel / denom) * 100))
      : 100;

    const I = window.CreatorI18n || {};
    if (xpTextElement) {
      if (nextThreshold !== null && denom > 0) {
        const segTpl = I.levelXpAtSegmentTpl;
        const a = xpInLevel.toLocaleString();
        const b = denom.toLocaleString();
        xpTextElement.textContent = segTpl
          ? tpl(segTpl, { current: a, total: b })
          : `${a} / ${b} XP`;
      } else {
        xpTextElement.textContent = I.levelXpMaxTitle || 'Max level reached';
      }
    }

    // Progress Bar aktualisieren
    if (progressFillElement) {
      progressFillElement.style.width = `${progressPercent}%`;
    }

    // XP Remaining Text aktualisieren
    if (xpRemainingElement) {
      if (nextThreshold !== null && xpNeeded > 0) {
        const remTpl = I.levelXpRemainingTpl;
        const cnt = xpNeeded.toLocaleString();
        const nxt = String(current_level + 1);
        xpRemainingElement.textContent = remTpl
          ? tpl(remTpl, { count: cnt, level: nxt })
          : `${cnt} XP until Level ${nxt}`;
      } else {
        xpRemainingElement.textContent = I.levelXpMaxTitle || 'Max level reached';
      }
    }

    // Features rendern (Trial = Starter-Pack; Creator = EAZ pooling)
    renderFeatures(data);

    // Level-Liste rendern
    renderLevelsList(current_level, level_thresholds, level_eaz_by_level, data);

    showContent();
  }

  function showLoading() {
    if (!isLevelTabActive()) {
      hideAllPresentationStates();
      return;
    }
    if (loadingElement) loadingElement.style.display = 'flex';
    if (errorElement) errorElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'none';
  }

  function showError(message) {
    if (!isLevelTabActive()) {
      hideAllPresentationStates();
      return;
    }
    if (loadingElement) loadingElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'none';
    if (errorElement) {
      errorElement.style.display = 'flex';
      const errorText = errorElement.querySelector('.clp-error-text');
      if (errorText) errorText.textContent = message;
    }
  }

  function showContent() {
    if (!isLevelTabActive()) {
      hideAllPresentationStates();
      return;
    }
    if (loadingElement) loadingElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'flex';
  }

  /**
   * Rendert die Feature-Liste
   */
  function renderFeatures(data) {
    if (!featuresListElement) return;

    const I = window.CreatorI18n || {};
    const trialMode = data.trial_mode === true;
    const eazWallet = data.eaz_wallet_active === true;

    /** Trial ohne EAZ-Wallet: Starter-Pack-Limits aus API */
    if (trialMode && !eazWallet) {
      let gen = Number(data.trial_generate_cap);
      let upl = Number(data.trial_upload_cap);
      gen = Number.isFinite(gen) && gen > 0 ? gen : 5;
      upl = Number.isFinite(upl) && upl > 0 ? upl : 20;
      const t1 = I.levelFeatureStarterGenTpl;
      const t2 = I.levelFeatureStarterUploadTpl;
      const features = [
        {
          title: t1 ? tpl(t1, { count: String(gen) }) : `Up to ${gen} Starter Pack generations`,
          icon: 'star',
        },
        {
          title: t2 ? tpl(t2, { count: String(upl) }) : `Up to ${upl} Starter Pack uploads`,
          icon: 'award',
        },
      ];
      featuresListElement.innerHTML = features.map(function (feature) {
        return `
      <div class="clp-feature-card">
        <div class="clp-feature-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="${getIconPath(feature.icon)}"></path>
          </svg>
        </div>
        <div class="clp-feature-content">
          <h5 class="clp-feature-title">${escapeHtml(feature.title)}</h5>
        </div>
      </div>
    `;
      }).join('');
      return;
    }

    let benefits =
      data.benefits && typeof data.benefits === 'object' ? data.benefits : {};
    benefits = typeof benefits === 'object' ? benefits : {};

    const features = [];

    const daily = Number(benefits.daily_eaz || 0);
    const max = Number(benefits.max_eaz || 0);

    if (daily > 0) {
      const t = I.levelFeatureDailyTpl;
      features.push({
        title: t ? tpl(t, { count: String(daily) }) : `${daily} EAZ daily (free pool)`,
        icon: 'star',
      });
    }

    if (max > 0) {
      const t = I.levelFeatureMaxTpl;
      features.push({
        title: t ? tpl(t, { max: String(max) }) : `${max} EAZ max free pool`,
        icon: 'award',
      });
    }

    if (features.length === 0) {
      const lvl = Number(data.current_level || 2);
      const fb = defaultLevelEaz(Math.max(2, lvl));
      const t1 = I.levelFeatureDailyTpl;
      const t2 = I.levelFeatureMaxTpl;
      features.push(
        {
          title: t1 ? tpl(t1, { count: String(fb.daily_eaz) }) : `${fb.daily_eaz} EAZ daily (free pool)`,
          icon: 'star',
        },
        {
          title: t2 ? tpl(t2, { max: String(fb.max_eaz) }) : `${fb.max_eaz} EAZ max free pool`,
          icon: 'award',
        }
      );
    }

    featuresListElement.innerHTML = features.map(feature => `
      <div class="clp-feature-card">
        <div class="clp-feature-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="${getIconPath(feature.icon)}"></path>
          </svg>
        </div>
        <div class="clp-feature-content">
          <h5 class="clp-feature-title">${escapeHtml(feature.title)}</h5>
        </div>
      </div>
    `).join('');
  }

  /**
   * Rendert die Level-Liste (kommende Level)
   */
  function renderLevelsList(currentLevel, levelThresholds, levelEazRows, data) {
    if (!levelsGridElement) return;

    const maxLevelsToShow = Math.max(
      maxLevelFromThresholdRows(levelThresholds),
      Number(currentLevel) || 1
    );
    const levels = [];
    const I = window.CreatorI18n || {};
    const gridTpl = I.levelGridDailyMaxTpl;
    const starterTpl = I.levelGridStarterTpl;

    let genCap = Number(data && data.trial_generate_cap);
    let upCap = Number(data && data.trial_upload_cap);
    genCap = Number.isFinite(genCap) && genCap > 0 ? genCap : 5;
    upCap = Number.isFinite(upCap) && upCap > 0 ? upCap : 20;

    for (let level = 1; level <= maxLevelsToShow; level++) {
      let state = 'locked';
      if (level < currentLevel) state = 'unlocked';
      if (level === currentLevel) state = 'current';

      let metaLine;
      if (level === 1) {
        metaLine = starterTpl
          ? tpl(starterTpl, { gens: String(genCap), uploads: String(upCap) })
          : `${genCap} generations · ${upCap} uploads · Starter Pack`;
      } else {
        const ez = eazLookup(level, levelEazRows);
        metaLine = gridTpl
          ? tpl(gridTpl, {
              daily: String(ez.daily_eaz),
              max: String(ez.max_eaz),
            })
          : `Daily ${ez.daily_eaz} · Max ${ez.max_eaz}`;
      }

      const displayName =
        state === 'locked' ? getLockedLevelLabel(level) : getUnlockedTierDisplayName(level);

      levels.push({
        level,
        state,
        name: displayName,
        meta: metaLine,
        badge: state === 'current' ? (I.levelBadgeCurrent || 'Current') : '',
      });
    }

    levelsGridElement.innerHTML = levels.map(lvl => `
      <div class="clp-level-item is-${lvl.state}">
        ${lvl.badge ? `<span class="clp-level-current-badge">${escapeHtml(lvl.badge)}</span>` : ''}
        <div class="clp-level-icon">
          ${lvl.state === 'locked'
            ? `<svg viewBox="0 0 24 24" aria-hidden="true">
                 <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                 <circle cx="12" cy="16" r="1"></circle>
                 <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
               </svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true">
                 <path d="${getIconPath('star')}"></path>
               </svg>`
          }
        </div>
        <span class="clp-level-number">${lvl.level}</span>
        <span class="clp-level-name">${escapeHtml(lvl.name)}</span>
        <span class="clp-level-meta">${escapeHtml(lvl.meta)}</span>
      </div>
    `).join('');
  }

  /**
   * Hilfsfunktion: XP Threshold für Level finden (robust gegen String/Number)
   */
  function getThresholdForLevel(level, thresholds) {
    const L = Number(level);
    const list = Array.isArray(thresholds) ? thresholds : [];
    const t = list.find(x => Number(x.level) === L);
    return t ? Number(t.xp_required) : 0;
  }

  /**
   * Hilfsfunktion: Icon-Pfade
   */
  function getIconPath(icon) {
    const star =
      'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
    const icons = {
      star,
      award: star,
      lock: star,
    };
    return icons[icon] || star;
  }

  /**
   * UI State Management — defined above renderFeatures (showLoading/showError/showContent)
   */

  /**
   * Simple HTML escaping to avoid accidental injection via titles
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Public API für externe Trigger (z.B. nach XP-Updates)
   */
  window.creatorLevelPanel = {
    reload: loadLevelData,
    load: loadLevelData,
    syncVisibility: syncPresentationState,
    showError: showError
  };

  document.addEventListener('eaz:creator-redeemed', function () {
    loadLevelData();
  });

  // Initialisierung wenn DOM bereit
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();