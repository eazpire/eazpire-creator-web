/**
 * Creator Settings Names Panel Controller (Single Render, NO Loop)
 * - Loads creator names reliably via get-settings
 * - Renders ONLY once into #creator-available-list
 * - No selection/active logic
 * - No "EIGEN" badge
 * - Counter: "x / 5 genutzt"
 * - Prevents infinite reload loops (inFlight + cooldown + observer pause)
 */
(function () {
  'use strict';

  const LOG_PREFIX = '[CreatorNamesPanel FIX]';
  const ENDPOINT_BASE = '/apps/creator-dispatch?path_prefix=/apps/creator-dispatch';
  let nameLimitMax = 5;

  // --- Guards to prevent loops ---
  let inFlight = false;
  let lastLoadedAt = 0;
  const COOLDOWN_MS = 1500; // min time between loads

  function getOwnerId() {
    return window.__EAZ_OWNER_ID || null;
  }

  function waitForOwnerId(maxMs = 8000, intervalMs = 100) {
    return new Promise((resolve) => {
      const start = Date.now();
      const t = setInterval(() => {
        const id = getOwnerId();
        if (id) {
          clearInterval(t);
          resolve(id);
          return;
        }
        if (Date.now() - start >= maxMs) {
          clearInterval(t);
          resolve(null);
        }
      }, intervalMs);
    });
  }

  function isProbablyBase64(str) {
    return typeof str === 'string'
      && /^[A-Za-z0-9+/]*={0,2}$/.test(str)
      && (str.length % 4 === 0);
  }

  function maybeDecodeBase64(name) {
    try {
      if (isProbablyBase64(name)) return decodeURIComponent(atob(name));
    } catch (e) {}
    return name;
  }

  function normalizeNames(names) {
    const seen = new Set();
    const out = [];
    (names || []).forEach((n) => {
      const trimmed = (maybeDecodeBase64(n) || '').trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (out.length < nameLimitMax) out.push(trimmed);
    });
    return out;
  }

  // Übersetzungssicherer Text (wie bei dir)
  function setCreatorNameText(element, name) {
    if (!element) return;

    try {
      const scriptTag = document.querySelector('script[data-creator-names-data]');
      if (scriptTag) {
        const data = JSON.parse(scriptTag.textContent || '{}');
        const id = 'name_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        data[id] = name;
        scriptTag.textContent = JSON.stringify(data);

        element.setAttribute('data-name-id', id);
        element.setAttribute('data-no-translate', 'true');
        element.setAttribute('translate', 'no');
        element.classList.add('notranslate');

        setTimeout(() => {
          try {
            const st = document.querySelector('script[data-creator-names-data]');
            const scriptData = JSON.parse((st && st.textContent) || '{}');
            const storedName = scriptData[element.getAttribute('data-name-id')];
            element.textContent = storedName || name;
          } catch (e) {
            element.textContent = name;
          }
        }, 50);
      } else {
        element.textContent = name;
        element.setAttribute('data-no-translate', 'true');
        element.setAttribute('translate', 'no');
        element.classList.add('notranslate');
      }
    } catch (error) {
      element.textContent = name;
      element.setAttribute('data-no-translate', 'true');
      element.setAttribute('translate', 'no');
      element.classList.add('notranslate');
    }
  }

  function findPanel() {
    return document.getElementById('creator-names-panel');
  }

  function getEls(panel) {
    return {
      nameInputEl: panel.querySelector('#creator-settings-name'),
      saveBtnEl: panel.querySelector('#creator-settings-save'),
      statusEl: panel.querySelector('#creator-settings-status'),
      availableListEl: panel.querySelector('#creator-available-list'),
      availableCountEl: panel.querySelector('#creator-available-count'),
      availableLoadingEl: panel.querySelector('#creator-available-loading')
    };
  }

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function validateCreatorNameInput(rawName) {
    if (window.EazCreatorProfileSlug && typeof window.EazCreatorProfileSlug.validateCreatorName === 'function') {
      return window.EazCreatorProfileSlug.validateCreatorName(rawName);
    }
    var name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, error: 'missing_name' };
    if (name.length < 3) return { ok: false, error: 'too_short' };
    if (!/^[\p{L}\p{N}\s-]+$/u.test(name)) return { ok: false, error: 'invalid_chars' };
    if (name.charAt(0) === '-' || name.charAt(name.length - 1) === '-') {
      return { ok: false, error: 'invalid_chars' };
    }
    return { ok: true, name: name };
  }

  function errorMessageForCode(code) {
    if (code === 'invalid_chars') return t('settings_names_invalid_chars', 'Only letters, numbers, spaces, and hyphens (-) are allowed.');
    if (code === 'name_taken') return t('settings_names_name_taken', 'This name is already taken. Try another one!');
    if (code === 'too_short') return t('settings_names_too_short', 'Name must be at least 3 characters.');
    if (code === 'limit_reached') {
      var lim = nameLimitMax || 5;
      return t('settings_names_limit_reached', 'You can register up to {max} creator names at your current level.').replace(
        /\{max\}/g,
        String(lim)
      );
    }
    if (code === 'already_added') return t('settings_names_already_added', 'You already added this name.');
    return t('settings_names_add_error', 'Could not add name.');
  }

  function setStatus(panel, message, type) {
    var statusEl = getEls(panel).statusEl;
    if (!statusEl) return;
    if (!message) {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
      statusEl.className = 'creator-names-panel__note';
      return;
    }
    statusEl.style.display = 'block';
    statusEl.textContent = message;
    statusEl.className = 'creator-names-panel__note creator-names-panel__note--' + (type || 'error');
  }

  async function submitNewName(panel) {
    var els = getEls(panel);
    var nameInputEl = els.nameInputEl;
    var saveBtnEl = els.saveBtnEl;
    if (!nameInputEl || !saveBtnEl) return;

    var validated = validateCreatorNameInput(nameInputEl.value);
    if (!validated.ok) {
      setStatus(panel, errorMessageForCode(validated.error), 'error');
      return;
    }

    var ownerId = await waitForOwnerId();
    if (!ownerId) {
      setStatus(panel, t('pleaseLogin', 'Please log in to manage creator names.'), 'error');
      return;
    }

    saveBtnEl.disabled = true;
    setStatus(panel, '', '');

    try {
      var url = ENDPOINT_BASE + '&op=add-creator-name&owner_id=' + encodeURIComponent(ownerId);
      var res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: validated.name })
      });
      var data = await res.json().catch(function () { return {}; });

      if (data.ok) {
        nameInputEl.value = '';
        setStatus(panel, t('settings_names_added_ok', 'Creator name added.'), 'success');
        lastLoadedAt = 0;
        await loadOnce(panel, 'after-add');
      } else {
        setStatus(panel, errorMessageForCode(data.error), 'error');
      }
    } catch (err) {
      console.error(LOG_PREFIX, 'Add failed:', err);
      setStatus(panel, t('settings_names_add_error', 'Could not add name.'), 'error');
    } finally {
      saveBtnEl.disabled = false;
    }
  }

  function attachSaveHandler(panel) {
    var els = getEls(panel);
    if (els.saveBtnEl && !els.saveBtnEl.dataset.boundSave) {
      els.saveBtnEl.dataset.boundSave = '1';
      els.saveBtnEl.addEventListener('click', function () {
        submitNewName(panel);
      });
    }
    if (els.nameInputEl && !els.nameInputEl.dataset.boundEnter) {
      els.nameInputEl.dataset.boundEnter = '1';
      els.nameInputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewName(panel);
        }
      });
    }
  }

  function showLoading(panel, msg) {
    const { availableLoadingEl, availableListEl } = getEls(panel);
    if (availableLoadingEl) {
      availableLoadingEl.style.display = 'block';
      availableLoadingEl.textContent = msg || (window.CreatorI18n && window.CreatorI18n.settings_names_loading) || 'Loading…';
    }
    if (availableListEl) availableListEl.style.display = 'none';
  }

  function showError(panel, msg) {
    const { availableLoadingEl, availableListEl } = getEls(panel);
    if (availableLoadingEl) {
      availableLoadingEl.style.display = 'block';
      availableLoadingEl.innerHTML =
        '<div class="creator-names-panel__available-loading">' +
        (msg || window.CreatorI18n?.errorLoadingCreators || 'Fehler beim Laden der Creator.') +
        '</div>';
    }
    if (availableListEl) availableListEl.style.display = 'none';
  }

  function showList(panel) {
    const { availableLoadingEl, availableListEl } = getEls(panel);
    if (availableLoadingEl) availableLoadingEl.style.display = 'none';
    if (availableListEl) availableListEl.style.display = 'block';
  }

  function renderAvailable(panel, names) {
    const { availableListEl, availableCountEl } = getEls(panel);
    if (!availableListEl) return;

    if (availableCountEl) {
      var usageTmpl = (window.CreatorI18n && window.CreatorI18n.settings_names_usage) || '{current} / {max} used';
      availableCountEl.textContent = usageTmpl
        .replace(/\{current\}/g, String(names.length || 0))
        .replace(/\{max\}/g, String(nameLimitMax || 5));
    }

    availableListEl.innerHTML = '';

    if (!names.length) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'creator-names-panel__available-loading';
      emptyDiv.textContent = (window.CreatorI18n && window.CreatorI18n.settings_names_empty) || 'No creator names yet.';
      availableListEl.appendChild(emptyDiv);
      return;
    }

    names.forEach((creatorName) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'creator-names-panel__available-item is-owned';
      itemDiv.style.cursor = 'pointer';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'creator-names-panel__available-name';
      itemDiv.appendChild(nameSpan);

      setCreatorNameText(nameSpan, creatorName);

      // Edit icon
      const editIcon = document.createElement('span');
      editIcon.className = 'creator-names-panel__edit-icon';
      editIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
      editIcon.title = window.CreatorI18n?.editCreatorProfile || 'Edit Creator Profile';
      itemDiv.appendChild(editIcon);

      // Click-Handler: öffnet das Detail-Modal
      itemDiv.addEventListener('click', function() {
        const ownerId = getOwnerId();
        if (window.CreatorDetailModal && ownerId) {
          window.CreatorDetailModal.open(creatorName, ownerId);
        } else {
          console.warn(LOG_PREFIX, 'CreatorDetailModal not loaded or no ownerId');
        }
      });

      availableListEl.appendChild(itemDiv);
    });
  }

  async function loadOnce(panel, reason) {
    // cooldown / in-flight guard
    const now = Date.now();
    if (inFlight) return;
    if (now - lastLoadedAt < COOLDOWN_MS) return;

    inFlight = true;
    lastLoadedAt = now;

    try {
      const ownerId = await waitForOwnerId();
      if (!ownerId) {
        showError(panel, window.CreatorI18n?.pleaseLogin || 'Bitte einloggen, um deine Creator-Namen zu sehen.');
        return;
      }

      console.log(LOG_PREFIX, 'Loading via get-settings. reason=', reason, 'ownerId=', ownerId);
      showLoading(panel, 'Lade deine Creator-Namen...');

      const url = ENDPOINT_BASE + '&op=get-settings&owner_id=' + encodeURIComponent(ownerId);
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });

      const data = await res.json().catch(() => ({}));
      const settings = data.settings || {};
      nameLimitMax = Number(settings.creator_name_limit);
      if (!Number.isFinite(nameLimitMax) || nameLimitMax < 0) nameLimitMax = 5;

      let names = settings.creator_names || [];
      if (settings.creator_name && !names.includes(settings.creator_name)) {
        names.unshift(settings.creator_name);
      }

      const creatorNames = normalizeNames(names);
      console.log(LOG_PREFIX, 'Loaded creator_names:', creatorNames);

      renderAvailable(panel, creatorNames);
      showList(panel);
    } catch (err) {
      console.error(LOG_PREFIX, 'Load failed:', err);
      showError(panel, window.CreatorI18n?.errorLoadingCreators || 'Fehler beim Laden der Creator.');
    } finally {
      inFlight = false;
    }
  }

  // Attach to events (sauber, ohne Observer-Spam)
  function isCreatorNamesTabActive() {
    if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.getCurrentTab === 'function') {
      return window.CreatorSettingsV2Modal.getCurrentTab() === 'creator-names';
    }
    return !!document.querySelector('[data-csm-panel="creator-names"].is-active');
  }

  function attachEventHooks() {
    window.addEventListener('creator-settings-v2-opened', function () {
      if (!isCreatorNamesTabActive()) return;
      const panel = findPanel();
      if (!panel) return;
      loadOnce(panel, 'event: creator-settings-v2-opened');
    });

    window.addEventListener('creator-settings-v2-tab-changed', function (e) {
      if (e && e.detail && e.detail.tab === 'creator-names') {
        const panel = findPanel();
        if (!panel) return;
        loadOnce(panel, 'event: creator-settings-v2-tab-changed');
      }
    });
  }

  // Minimaler Observer: reagiert NUR, wenn das Panel NEU in den DOM kommt (ignoriert Account-Modal – nur Creator-Bereich)
  function attachPanelArrivalObserver() {
    const mo = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => {
        if (m.type !== 'childList') return false;
        return Array.from(m.addedNodes).some((n) =>
          n.nodeType === Node.ELEMENT_NODE && (!n.closest || !n.closest('#account-modal'))
        );
      });
      if (!relevant) return;

      const panel = findPanel();
      if (!panel) return;

      // Wenn wir hier sind, existiert das Panel. Observer kann sich dann abschalten.
      try { mo.disconnect(); } catch (e) {}

      attachSaveHandler(panel);
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Init — kein get-settings beim Seitenstart; nur bei Tab „Creator Names“
  (function init() {
    const panel = findPanel();
    if (panel) {
      attachSaveHandler(panel);
    } else {
      attachPanelArrivalObserver();
    }
    attachEventHooks();
  })();

})();