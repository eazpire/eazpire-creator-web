/* theme/assets/creator-notifications-modal.js
 * FIXED (2026-01-24):
 * - Does NOT permanently disable if markup is late (waits up to 3s)
 * - Uses window.__CNM_CSS_ACTIVE / cnmCssReady event for strict CSS gate
 * - Keeps: NO fallback layout, refuses open if CSS not active
 * - Keeps refresh(), auto refresh events, etc.
 */

(function () {
  "use strict";

  if (window.__creatorNotificationsModalInit) return;
  window.__creatorNotificationsModalInit = true;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let overlay, modal, closeBtn, listEl, searchEl, filterBtnEl, tabBtns, readTabBtns, scopeBtns;

  let REG, TAB_KEYS, CATS;
  let items = [];

  let externalJobs = [];
  let externalNotifications = [];
  let externalNotificationsUser = [];
  let externalNotificationsSystem = [];
  let externalGenerated = [];

  let _refreshPromise = null;
  let _saveQueuePollTimer = null;
  let _saveQueuePollStarted = 0;

  let activeTab = "jobs";
  let notifScope = "user";
  let activeFilters = new Set();
  let readFilter = "unread";
  let searchQuery = "";
  let _searchDebounce = null;

  function setSafeFallback(reason, silent) {
    if (!silent) console.warn("[CNM] Modal disabled:", reason);

    if (window.CreatorNotificationsModal && window.CreatorNotificationsModal.__isReal === true) return;

    window.CreatorNotificationsModal = {
      open: () => console.warn("[CNM] Modal disabled:", reason),
      close: () => {},
      toggle: () => {},
      openWithFilter: () => console.warn("[CNM] Modal disabled:", reason),
      setTab: () => {},
      markRead: () => {},
      getActiveFilters: () => new Set(),
      setActiveFilters: () => {},
      getActiveTab: () => "jobs",
      updateExternalData: () => {},
      loadNotificationsFromAPI: () => {},
      markAllNotificationsReadAPI: () => {},
      refresh: async () => {},
      isOpen: () => false,
      __isReal: false
    };
  }

  // Platzhalter nur setzen wenn etwas bereits auf CreatorNotificationsModal zugreift;
  // sonst warten bis init() die echte API setzt (kein Warn-Log beim normalen Laden).
  if (!window.CreatorNotificationsModal) {
    setSafeFallback("not initialized yet", true);
  }

  function isOpen() {
    return !!overlay && overlay.classList.contains("is-open");
  }

  function lockBody(lock) {
    document.documentElement.style.overflow = lock ? "hidden" : "";
    document.body.style.overflow = lock ? "hidden" : "";
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toTs(item) {
    const v = item?.ts;
    if (v instanceof Date) return v.getTime();
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function sortByNewest(a, b) {
    const ta = toTs(a);
    const tb = toTs(b);
    if (tb !== ta) return tb - ta;
    return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true });
  }

  // Strict CSS gate: either bootstrap flagged it OR computed style looks correct
  function isCnmCssActive() {
    if (window.__CNM_CSS_ACTIVE === true) return true;

    const el = document.getElementById("cnmOverlay");
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.position === "fixed" || cs.position === "absolute";
  }

  function requireCssOrRefuseOpen() {
    if (isCnmCssActive()) return true;
    console.error(
      "[CNM] ❌ Refusing to open: CNM CSS not active.\n" +
        "Fix: do NOT set window.__CNM_CSS_URL unless the CSS asset exists. Use inline canonical CSS via bootstrap."
    );
    return false;
  }

  async function waitForOverlay({ timeoutMs = 3000, intervalMs = 50 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.getElementById("cnmOverlay");
      if (el) return el;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  function setTab(tab) {
    activeTab = tab;
    activeFilters = new Set(CATS[activeTab] || []);
    tabBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.cnmTab === tab));
    
    // Hide/show elements based on active tab
    // "transactions" and "jobs" tabs: hide read tabs, search, and filter
    const hideNotifControls = (tab === "jobs" || tab === "transactions");
    if (readTabBtns && readTabBtns.length > 0) {
      readTabBtns.forEach((btn) => {
        const parent = btn.closest(".cnm-read-tabs");
        if (parent) {
          parent.style.display = hideNotifControls ? "none" : "";
        }
      });
    }
    if (searchEl) {
      const searchRow = searchEl.closest(".cnm-search-row");
      if (searchRow) {
        searchRow.style.display = hideNotifControls ? "none" : "";
      }
    }
    const scopeWrap = overlay ? overlay.querySelector("#cnmScopeTabs") : null;
    if (scopeWrap) scopeWrap.style.display = hideNotifControls ? "none" : "";

    // Filters section: hide for transactions tab
    const filtersEl = overlay ? overlay.querySelector(".cnm-filters") : null;
    if (filtersEl) {
      filtersEl.style.display = (tab === "transactions") ? "none" : "";
    }
    
    render();
  }

  function applyExclusiveFilter(targetCategory) {
    activeFilters.clear();
    activeFilters.add(targetCategory);
  }

  function getActiveFilters() {
    return new Set(activeFilters);
  }

  function setActiveFilters(arrOrSet) {
    activeFilters = new Set(Array.isArray(arrOrSet) ? arrOrSet : (arrOrSet && arrOrSet[Symbol.iterator] ? [...arrOrSet] : []));
    render();
  }

  function getActiveTab() {
    return activeTab;
  }

  function setReadFilter(v) {
    readFilter = v === "read" ? "read" : "unread";
    const btns = overlay ? overlay.querySelectorAll("[data-cnm-read]") : [];
    btns.forEach((b) => b.classList.toggle("is-active", b.dataset.cnmRead === readFilter));
    render();
  }

  function matchSearchQuery(item, q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return true;
    const parts = [];
    parts.push(String(item.id || ""));
    parts.push(String(item.cat || ""));
    parts.push(String(item.title || ""));
    parts.push(String(item.meta || ""));
    const d = item.data;
    if (d && typeof d === "object") {
      ["job_id", "design_id", "prompt", "design_prompt", "design_title", "title", "message", "creator_name"].forEach((k) => {
        if (d[k] != null) parts.push(String(d[k]));
      });
      try {
        parts.push(JSON.stringify(d));
      } catch (e) {}
    }
    const text = parts.join(" ").toLowerCase();
    return text.includes(s);
  }

  function renderDefaultItem(item, container) {
    const row = document.createElement("div");
    row.className = "cnm-item" + (item.unread ? " is-unread" : "");
    row.dataset.id = item.id;

    row.innerHTML =
      '<div class="cnm-item__title">' + escapeHtml(item.title) + "</div>" +
      '<div class="cnm-item__meta">' + escapeHtml(item.meta) + "</div>";

    row.addEventListener("click", () => {
      markRead(item.id).catch(() => {});
      row.classList.remove("is-unread");
    });

    container.appendChild(row);
  }

  function updateSingleItemAsRead(notificationId) {
    if (!listEl) return;
    const node = Array.from(listEl.querySelectorAll("[data-id]")).find(
      (el) => (el.dataset.id || "") === String(notificationId || "")
    );
    if (!node) return;
    if (readFilter === "unread") {
      node.remove();
    } else {
      node.classList.remove("is-unread");
    }
  }

  function renderList() {
    // Clean up timers / listeners on existing items before clearing the list
    if (listEl && listEl.children && listEl.children.length) {
      Array.from(listEl.children).forEach((child) => {
        try {
          if (typeof child._cleanup === "function") {
            child._cleanup();
          }
          if (typeof child._timerCleanup === "function") {
            child._timerCleanup();
          }
        } catch (e) {
          console.warn("[CNM] Item cleanup failed:", e);
        }
      });
    }

    listEl.innerHTML = "";

    // Transactions tab: delegate to dedicated renderer
    if (activeTab === "transactions") {
      if (window.CNM_Transactions && typeof window.CNM_Transactions.render === "function") {
        window.CNM_Transactions.render(listEl);
      } else {
        const empty = document.createElement("div");
        empty.className = "cnm-tx-loading";
        empty.innerHTML = '<div class="cnm-tx-spinner"></div><span>' + (window.CreatorI18n?.loading || 'Loading...') + '</span>';
        listEl.appendChild(empty);
      }
      return;
    }

    let visible = items
      .filter((i) => i.tab === activeTab)
      .filter((i) => activeFilters.has(i.cat));
    // Gelesen/Ungelesen nur für Benachrichtigungen – nicht für Aktive Jobs (sonst keine Queue-Einträge)
    if (activeTab === "notifs") {
      visible = visible.filter((i) => (readFilter === "unread" ? !!i.unread : !i.unread));
    }
    visible = visible.filter((i) => matchSearchQuery(i, searchQuery));

    if (activeFilters.size === 0) {
      const empty = document.createElement("div");
      empty.className = "cnm-item";
      empty.innerHTML = `
        <div class="cnm-item__title" style="opacity:.85;">${window.CreatorI18n?.noFilterActive || 'No filter active'}</div>
        <div class="cnm-item__meta">${window.CreatorI18n?.openFilterHint || 'Open filter and activate categories.'}</div>
      `;
      listEl.appendChild(empty);
      return;
    }

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cnm-item";
      // Jobs tab: never show refresh loading — keep stable empty copy until jobs appear (no flicker with "Loading…").
      const loading = activeTab !== "jobs" && _refreshPromise && items.length === 0;
      let titleText;
      let hintText;
      if (activeTab === "jobs" && !loading) {
        if (searchQuery.trim()) {
          titleText = (window.CreatorI18n?.noResultsSearch || 'No results for "%query%"').replace("%query%", escapeHtml(searchQuery.trim()));
          hintText = window.CreatorI18n?.noResultsFilter || "Nothing found for these filters.";
        } else {
          titleText = "No active jobs";
          hintText = "";
        }
      } else {
        titleText = loading
          ? (window.CreatorI18n?.loading || "Loading...")
          : window.CreatorI18n?.noEntries || "No entries";
        hintText = loading
          ? (window.CreatorI18n?.loading || "Loading...")
          : searchQuery.trim()
            ? (window.CreatorI18n?.noResultsSearch || 'No results for "%query%"').replace("%query%", escapeHtml(searchQuery.trim()))
            : window.CreatorI18n?.noResultsFilter || "Nothing found for these filters.";
      }
      empty.innerHTML =
        '<div class="cnm-item__title" style="opacity:.85;">' +
        titleText +
        "</div>" +
        (hintText
          ? '<div class="cnm-item__meta">' + hintText + "</div>"
          : "");
      listEl.appendChild(empty);
      return;
    }

    visible
      .sort(sortByNewest)
      .forEach((i) => {
        const key = (i.cat || "").toLowerCase().replace(/\s+/g, "");
        const categoryDef = window.CreatorNotificationCategories?.[key];

        if (categoryDef && typeof categoryDef.renderItem === "function") {
          try {
            categoryDef.renderItem(i, listEl);
          } catch (error) {
            console.error("[CreatorNotifications] Error rendering custom item:", error);
            renderDefaultItem(i, listEl);
          }
        } else {
          renderDefaultItem(i, listEl);
        }
      });
  }

  function render() {
    renderList();
  }

  function generateItemsFromCategories() {
    const newItems = [];
    if (window.CreatorNotificationCategories) {
      Object.values(window.CreatorNotificationCategories).forEach((categoryDef) => {
        if (typeof categoryDef.filterItems === "function") {
          try {
            const jobs = (categoryDef.id === "generated") ? externalGenerated : externalJobs;
            const categoryItems =
              categoryDef.id === "generated"
                ? categoryDef.filterItems(jobs, externalNotifications, externalJobs)
                : categoryDef.filterItems(jobs, externalNotifications);
            if (Array.isArray(categoryItems)) newItems.push(...categoryItems);
          } catch (error) {
            console.error("[CreatorNotifications] Error generating items for category:", categoryDef.id, error);
          }
        }
      });
    }
    // Dedupliziere Items nach id (verhindert doppelte Jobs)
    const seenIds = new Set();
    const uniqueItems = newItems.filter(item => {
      if (!item.id) return true; // Items ohne id behalten
      if (seenIds.has(item.id)) {
        console.warn("[CreatorNotifications] Duplicate item filtered:", item.id);
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
    uniqueItems.sort(sortByNewest);
    return uniqueItems;
  }

  function updateExternalData(jobs = [], notifications = []) {
    externalJobs = jobs || [];
    externalNotificationsUser = notifications || externalNotificationsUser || [];
    externalNotifications = notifScope === "system" ? externalNotificationsSystem : externalNotificationsUser;
    items = generateItemsFromCategories();
    if (isOpen()) render();
  }

  function applyNotificationScope(nextScope) {
    notifScope = nextScope === "system" ? "system" : "user";
    externalNotifications = notifScope === "system" ? externalNotificationsSystem : externalNotificationsUser;
    if (scopeBtns && scopeBtns.length) {
      scopeBtns.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.cnmScope === notifScope);
      });
    }
    items = generateItemsFromCategories();
    if (isOpen()) render();
  }

  async function open(autoFilter = null) {
    if (!requireCssOrRefuseOpen()) return;

    const forceUseExternalJobs = !!(autoFilter && autoFilter.forceUseExternalJobs);
    if (!forceUseExternalJobs) {
      const jobs = await ensureJobsLoaded();
      if (Array.isArray(jobs)) externalJobs = jobs;
    }

    let initialTab = null;
    if (autoFilter && autoFilter.tab) {
      initialTab = autoFilter.tab;
    } else {
      initialTab = hasActiveRunningJobs(externalJobs) ? "jobs" : "notifs";
    }

    if (initialTab) setTab(initialTab);
    if (autoFilter && (autoFilter.readFilter === "unread" || autoFilter.readFilter === "read")) {
      setReadFilter(autoFilter.readFilter);
    }

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    lockBody(true);

    if (autoFilter && autoFilter.category) applyExclusiveFilter(autoFilter.category);

    const refreshOpts = { reason: "open" };
    if (forceUseExternalJobs) refreshOpts.forceUseExternalJobs = true;
    refresh(refreshOpts)
      .then(() => {
        if (autoFilter && autoFilter.category) applyExclusiveFilter(autoFilter.category);
        render();
      })
      .catch(() => {});

    render();
  }

  function close() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    lockBody(false);
  }

  function toggle() {
    isOpen() ? close() : open();
  }

  async function loadHeroJobsFromAPI() {
    try {
      if (window.activeHeroJobs) {
        externalJobs = externalJobs.concat(
          window.activeHeroJobs.map((job) => ({
            id: job.jobId,
            category: "generate_hero",
            type: "hero-generate",          // Kennzeichne explizit als Hero-Job
            action: "hero-generate",        // sorgt dafür, dass Generate-Queue sie ignoriert
            title: window.CreatorI18n?.generateHero || "Generate Hero",
            meta: `Status: ${job.status || (window.CreatorI18n?.running || "Running")} • ${job.progress || 0}%`,
            unread: true,
            ts: job.startedAt || Date.now(),
            data: job
          }))
        );
      }
    } catch (error) {
      console.error("[CreatorNotifications] Error loading hero jobs:", error);
    }
  }

  async function loadGeneratedFromAPI() {
    try {
      if (!window.EazCreatorCore?.getContext || !window.CreatorWidgetLib?.api?.listGenerated) return;
      const ctx = await window.EazCreatorCore.getContext();
      const miniCtx = { OWNER_ID: ctx.ownerId, API_DISPATCH: ctx.apiBase };
      const raw = await window.CreatorWidgetLib.api.listGenerated(miniCtx, { limit: 200 });
      externalGenerated = Array.isArray(raw) ? raw : [];
    } catch (e) {
      console.warn("[CreatorNotifications] list-generated failed:", e);
      externalGenerated = [];
    }
  }

  async function loadNotificationsFromAPI() {
    try {
      if (!window.EazCreatorCore?.getContext) {
        console.warn("[CreatorNotifications] EazCreatorCore.getContext missing");
        return;
      }

      const ctx = await window.EazCreatorCore.getContext();

      const notifResponse = await fetch(
        `${ctx.apiBase}?op=get-notifications&owner_id=${encodeURIComponent(ctx.ownerId)}`,
        { credentials: "include" }
      );
      const notifData = await notifResponse.json();

      if (!notifData.ok) {
        console.error("[CreatorNotifications] Notifications API error:", notifData.error);
      } else {
        externalNotificationsUser = Array.isArray(notifData.notifications) ? notifData.notifications : [];
        externalNotificationsUser = externalNotificationsUser.map((n) => ({
          ...n,
          category: window.CNM_normalizeKey ? window.CNM_normalizeKey(n.category) : n.category
        }));
      }

      try {
        const [sysCr, sysSh] = await Promise.all([
          fetch(
            `${ctx.apiBase}?op=get-system-notifications&owner_id=${encodeURIComponent(ctx.ownerId)}&audience=creator`,
            { credentials: "include" }
          ).then((r) => r.json()),
          fetch(
            `${ctx.apiBase}?op=get-system-notifications&owner_id=${encodeURIComponent(ctx.ownerId)}&audience=shop`,
            { credentials: "include" }
          ).then((r) => r.json())
        ]);
        const mergeSystem = (a, b) => {
          const map = {};
          function ingest(arr) {
            (arr || []).forEach((n) => {
              const id = String(n.notification_id || n.id || "");
              if (!id) return;
              const cur = map[id];
              const tsa = n.updated_at != null ? Number(n.updated_at) : n.created_at != null ? Number(n.created_at) : 0;
              const tsb = cur && (cur.updated_at != null ? Number(cur.updated_at) : Number(cur.created_at) || 0);
              if (!cur || tsa >= tsb) map[id] = n;
            });
          }
          ingest(a);
          ingest(b);
          return Object.keys(map)
            .map((k) => map[k])
            .sort((x, y) => {
              const tx = Number(x.updated_at || x.created_at || 0);
              const ty = Number(y.updated_at || y.created_at || 0);
              return ty - tx;
            });
        };
        const listCr = sysCr.ok && Array.isArray(sysCr.notifications) ? sysCr.notifications : [];
        const listSh = sysSh.ok && Array.isArray(sysSh.notifications) ? sysSh.notifications : [];
        externalNotificationsSystem = mergeSystem(listCr, listSh);
      } catch (_) {
        externalNotificationsSystem = [];
      }

      await Promise.all([loadGeneratedFromAPI(), loadHeroJobsFromAPI()]);
      externalNotifications = notifScope === "system" ? externalNotificationsSystem : externalNotificationsUser;
      items = generateItemsFromCategories();

      if (window.EazCreatorBadge?.refresh) await window.EazCreatorBadge.refresh();
    } catch (error) {
      console.error("[CreatorNotifications] Failed to load notifications from API:", error);
    }
  }

  /** True, wenn mindestens ein Job gerade läuft (!done). Für Tab „Aktive Jobs“ vs „Benachrichtigungen“. */
  function hasActiveRunningJobs(jobs) {
    return Array.isArray(jobs) && jobs.some((j) => !j.done);
  }

  function findJobsFromAnyWidgetCtx() {
    try {
      if (!window.CreatorWidget) return null;
      const ctxs = Object.values(window.CreatorWidget).filter(Boolean);

      for (const ctx of ctxs) {
        const jobsA = ctx?.__state?.jobs;
        if (Array.isArray(jobsA)) return jobsA;

        const jobsB = ctx?.state?.jobs;
        if (Array.isArray(jobsB)) return jobsB;

        const jobsC = ctx?.store?.state?.jobs;
        if (Array.isArray(jobsC)) return jobsC;
      }
    } catch (e) {}
    return null;
  }

  async function ensureJobsLoaded() {
    const fromCtx = findJobsFromAnyWidgetCtx();
    if (Array.isArray(fromCtx) && fromCtx.length > 0) return fromCtx;

    if (Array.isArray(externalJobs) && externalJobs.length > 0) return externalJobs;

    return fetchJobsFromAPI();
  }

  /** Always fetch list-jobs from API (no widget/cache). Used for save-queue flow. */
  async function fetchJobsFromAPI() {
    const Lib = window.CreatorWidgetLib;
    if (!Lib?.api?.listJobs) return [];

    if (!window.EazCreatorCore?.getContext) return [];

    try {
      const ctxCore = await window.EazCreatorCore.getContext();
      const miniCtx = { OWNER_ID: ctxCore.ownerId, API_DISPATCH: ctxCore.apiBase };

      const raw = await Lib.api.listJobs(miniCtx, { limit: 200 });
      const normalize = Lib.store?.normalizeServerJob;
      const jobs = Array.isArray(raw)
        ? (typeof normalize === "function" ? raw.map(normalize).filter(Boolean) : raw)
        : [];
      return jobs;
    } catch (e) {
      return [];
    }
  }

  /** Refetch list-jobs, set externalJobs, return. For creatorSaveJobStarted. */
  async function refetchJobsForSaveQueue() {
    const jobs = await fetchJobsFromAPI();
    if (Array.isArray(jobs)) externalJobs = jobs;
    return jobs;
  }

  async function refresh(opts = {}) {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      await loadNotificationsFromAPI();

      if (!opts.forceUseExternalJobs) {
        const jobs = await ensureJobsLoaded();
        if (Array.isArray(jobs)) externalJobs = jobs;
      }

      items = generateItemsFromCategories();
      if (isOpen()) render();

      if (hasActiveSaveJobs() && !_saveQueuePollTimer) {
        startSaveQueuePolling();
      }

      try {
        if (window.EazCreatorBadge?.refresh) await window.EazCreatorBadge.refresh();
      } catch (e) {}
    })().finally(() => {
      _refreshPromise = null;
    });

    return _refreshPromise;
  }

  async function ensureNotificationExistsAPI(ctx, payload) {
    try {
      const response = await fetch(`${ctx.apiBase}?op=create-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: ctx.ownerId,
          user_id: ctx.ownerId,
          notification_id: payload.notification_id,
          category: payload.category,
          title: payload.title,
          message: payload.message,
          data: payload.data
        }),
        credentials: "include"
      });

      const data = await response.json();
      return !!data.ok;
    } catch (error) {
      return false;
    }
  }

  function normalizeNotificationId(raw) {
    const s = String(raw || "").trim();
    return s.replace(/^(api-)+/i, "") || s;
  }

  async function markNotificationReadAPI(notificationId) {
    try {
      const ctx = await window.EazCreatorCore.getContext();

      const response = await fetch(`${ctx.apiBase}?op=mark-notification-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: ctx.ownerId,
          user_id: ctx.ownerId,
          notification_id: String(notificationId || "").trim()
        }),
        credentials: "include"
      });

      const data = await response.json();
      return !!data.ok;
    } catch (error) {
      return false;
    }
  }

  async function markAdminNotificationReadAPI(adminNotificationId) {
    try {
      const ctx = await window.EazCreatorCore.getContext();
      const response = await fetch(`${ctx.apiBase}?op=admin-notification-mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(adminNotificationId || 0) }),
        credentials: "include"
      });
      const data = await response.json();
      return !!data.ok;
    } catch (_) {
      return false;
    }
  }

  async function markAllNotificationsReadAPI() {
    try {
      const ctx = await window.EazCreatorCore.getContext();
      if (notifScope === "system") {
        await fetch(`${ctx.apiBase}?op=mark-all-system-notifications-read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: ctx.ownerId, audience: "creator" }),
          credentials: "include"
        });
        await fetch(`${ctx.apiBase}?op=mark-all-system-notifications-read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: ctx.ownerId, audience: "shop" }),
          credentials: "include"
        });
        return true;
      }
      const response = await fetch(`${ctx.apiBase}?op=mark-all-notifications-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: ctx.ownerId }),
        credentials: "include"
      });

      const data = await response.json();
      return !!data.ok;
    } catch (error) {
      return false;
    }
  }

  function _jobIdNorm(v) {
    const s = String(v || "").trim();
    return s.replace(/^job[_-]?/i, "").replace(/[_-]/g, "") || s;
  }

  async function markSystemNotificationReadAPI(notificationIdRaw) {
    try {
      const ctx = await window.EazCreatorCore.getContext();
      const response = await fetch(`${ctx.apiBase}?op=mark-system-notification-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: ctx.ownerId, notification_id: String(notificationIdRaw || "").trim() }),
        credentials: "include"
      });
      const data = await response.json();
      return !!data.ok;
    } catch (_) {
      return false;
    }
  }

  async function markRead(notificationId, meta) {
    let it = items.find((x) => x.id === notificationId);
    const isAdminNotification = !!(it && (it.isAdminNotification || it.data?.admin_notification_id));
    const isSystemNotification = !!(it && (it.isSystemNotification || (it.cat || "") === "System"));

    if (!it && meta?.job) {
      const jid = String(meta.job.job_id || meta.job.id || "").trim();
      if (jid) {
        const jidNorm = _jobIdNorm(jid);
        const cat = (meta?.category || "").toLowerCase();
        const wantCat = cat === "saved" ? "Saved" : cat === "generated" ? "Generated" : null;
        if (wantCat) {
          it = items.find((x) => {
            if ((x.cat || "") !== wantCat || !x.data) return false;
            const d = x.data.job_id || x.data.id;
            const dStr = String(d || "").trim();
            return dStr === jid || _jobIdNorm(d) === jidNorm || dStr.endsWith(jid) || jid.endsWith(dStr);
          }) || null;
        }
      }
    }

    // WICHTIG: Berechne apiNotificationId auch wenn it nicht gefunden wurde (für API-Call)
    const ctx = await window.EazCreatorCore?.getContext?.().catch(() => null);
    if (!ctx) {
      console.warn('[CNM] markRead: Could not get context', { notificationId, hasMeta: !!meta });
      return;
    }

    const jobId = meta?.job ? String(meta.job.job_id || meta.job.id || "").trim() : "";
    const cat = (meta?.category || "").toLowerCase();
    // Bestimme isFromAPI auch ohne it (basierend auf notificationId)
    const isFromAPI = it ? !!it.isFromAPI : (String(notificationId || "").trim().startsWith("api-"));

    let apiNotificationId;
    if (isFromAPI) {
      const raw = String(notificationId || "").trim();
      // Verwende normalizeNotificationId, um ALLE "api-" Prefixe zu entfernen (nicht nur eines)
      apiNotificationId = normalizeNotificationId(raw);
    } else if (jobId) {
      if (cat === "generated") apiNotificationId = "generated-" + jobId;
      else if (cat === "saved") apiNotificationId = "saved-" + jobId;
      else if (cat === "removed_designs") apiNotificationId = "removed_designs-" + jobId;
      else apiNotificationId = normalizeNotificationId(notificationId);
    } else {
      apiNotificationId = normalizeNotificationId(notificationId);
    }

    // UI-Update nur wenn it gefunden wurde
    if (it) {
      it.unread = false;
    }
    updateSingleItemAsRead(notificationId);

    // WICHTIG: API-Call AUSFÜHREN auch wenn it nicht gefunden wurde
    (async () => {
      try {
        if (isSystemNotification) {
          const nid = String(it?.data?.notification_id || it?.data?.notification?.notification_id || "").trim();
          if (nid) await markSystemNotificationReadAPI(nid);
          await refresh({ reason: "markReadSystem" });
          if (window.EazCreatorBadge?.refresh) await window.EazCreatorBadge.refresh();
          return;
        }
        if (isAdminNotification) {
          const adminId = Number(it?.data?.admin_notification_id || 0);
          if (adminId > 0) {
            await markAdminNotificationReadAPI(adminId);
          }
          await refresh({ reason: "markReadAdmin" });
          if (window.EazCreatorBadge?.refresh) {
            await window.EazCreatorBadge.refresh();
          }
          return;
        }
        // Prüfe, ob Notification bereits in der Datenbank existiert, bevor wir ensureNotificationExistsAPI aufrufen
        // Dies verhindert Duplikate beim Klick auf bereits existierende Notifications
        const notificationAlreadyExists = externalNotifications.some(
          n => normalizeNotificationId(n.notification_id) === normalizeNotificationId(apiNotificationId)
        );

        if (meta?.category && !isFromAPI && !notificationAlreadyExists && (cat === "generated" || cat === "saved")) {
          const job = meta.job || {};
          let title = "";
          let message = "";
          let data = {};
          const dateStr = new Date(job.done_at || job.updated_at || Date.now()).toLocaleDateString();
          if (cat === "generated") {
            title = job.prompt || (window.CreatorI18n?.designGenerated || "Design generated");
            message = (window.CreatorI18n?.generatedAt || "Generated on %date%").replace('%date%', dateStr);
            data = { job_id: job.job_id || job.id, design_id: job.design_id || null };
          } else {
            title = job.title || job.design_title || job.design_name || (window.CreatorI18n?.designSaved || "Design saved");
            message = (window.CreatorI18n?.savedAt || "Saved on %date%").replace('%date%', dateStr);
            data = { job_id: job.job_id || job.id, design_id: job.design_id || null };
          }
          await ensureNotificationExistsAPI(ctx, {
            notification_id: apiNotificationId,
            category: meta.category,
            title,
            message,
            data
          });
        }
        
        // Markiere als gelesen (WICHTIG: wird jetzt immer ausgeführt, auch wenn it nicht gefunden wurde)
        await markNotificationReadAPI(apiNotificationId);

        // Refresh: Notifications neu laden, damit updated_at greift und „zuletzt gelesen“ in Gelesen zuerst steht
        try {
          await refresh({ reason: "markRead" });
        } catch (_) {}

        // Badge-Update nach erfolgreichem mark-read
        if (window.EazCreatorBadge?.refresh) {
          await window.EazCreatorBadge.refresh();
        }
      } catch (e) {
        console.error('[CNM] markRead error:', e, { notificationId, apiNotificationId, hasIt: !!it });
        if (it) {
          it.unread = true; // Nur revert wenn it existiert
        }
        if (isOpen()) render();
      }
    })();
  }

  function hasActiveSaveJobs() {
    return Array.isArray(externalJobs) && externalJobs.some(
      (j) => j && (j.saving === true && !j.saved)
    );
  }

  /**
   * Delete a notification from the DB via API (fire-and-forget).
   * Also removes it from local externalNotifications + externalGenerated arrays and re-renders.
   * Handles both generated-* and merged-* notification IDs.
   */
  async function deleteGeneratedNotification(jobId) {
    if (!jobId) return;
    const jid = String(jobId);
    // Both possible notification IDs (generated and merged designs use the same save flow)
    const notifIds = ["generated-" + jid, "merged-" + jid];

    // 1. Sofort aus lokalen Arrays entfernen (UI-Update)
    externalGenerated = externalGenerated.filter(
      (g) => String(g.job_id || g.id || "") !== jid
    );
    externalNotifications = externalNotifications.filter(
      (n) => {
        const nid = n.notification_id || "";
        return !notifIds.includes(nid) && !notifIds.map(x => "api-" + x).includes(nid);
      }
    );
    items = items.filter((it) => {
      if (!it.id) return true;
      const id = String(it.id);
      return !notifIds.includes(id) && !notifIds.map(x => "api-" + x).includes(id);
    });
    if (isOpen()) render();

    // 2. Aus DB löschen (async, fire-and-forget) — delete both generated and merged
    try {
      const ctx = window.EazCreatorCore?.getContext ? await window.EazCreatorCore.getContext() : null;
      if (ctx?.apiBase && ctx?.ownerId) {
        for (const notificationId of notifIds) {
          fetch(`${ctx.apiBase}?op=delete-notification`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              user_id: ctx.ownerId,
              notification_id: notificationId,
            }),
          }).catch((e) => console.warn("[CNM] delete-notification failed:", e));
        }
      }
    } catch (e) {
      console.warn("[CNM] deleteGeneratedNotification API error:", e);
    }

    // 3. Badge aktualisieren
    try {
      if (window.EazCreatorBadge?.refresh) window.EazCreatorBadge.refresh();
    } catch (e) {}
  }

  function stopSaveQueuePolling() {
    if (_saveQueuePollTimer) {
      clearInterval(_saveQueuePollTimer);
      _saveQueuePollTimer = null;
    }
  }

  function startSaveQueuePolling() {
    stopSaveQueuePolling();
    const POLL_MS = 5000;
    const TIMEOUT_MS = 120000;

    _saveQueuePollStarted = Date.now();

    async function poll() {
      if (Date.now() - _saveQueuePollStarted > TIMEOUT_MS) {
        stopSaveQueuePolling();
        refresh().catch(() => {});
        return;
      }

      await refetchJobsForSaveQueue();
      items = generateItemsFromCategories();
      if (isOpen()) render();

      if (!hasActiveSaveJobs()) {
        stopSaveQueuePolling();
        // Kurzer Delay: Backend setzt saved=true im KV, erstellt danach die Notification in D1.
        // Wir warten 2s damit die Notification sicher in der DB ist bevor wir refreshen.
        setTimeout(() => {
          setTab("notifs");
          setReadFilter("unread");
          if (isOpen()) {
            refresh().then(() => render()).catch(() => {});
          }
        }, 2000);
      }
    }

    poll();
    _saveQueuePollTimer = setInterval(poll, POLL_MS);
  }

  function bindAutoRefreshEvents() {
    // Guard: only register global listeners once
    if (window.__creatorNotificationsListenersRegistered) return;
    window.__creatorNotificationsListenersRegistered = true;

    window.addEventListener("creatorJobCompleted", (ev) => {
      const job = ev?.detail?.job;
      const isSaveComplete = !!(job && job.saved === true);
      if (job && job.saving && !job.saved && !_saveQueuePollTimer) {
        startSaveQueuePolling();
      }
      refresh({ reason: "creatorJobCompleted" }).then(() => {
        if (isSaveComplete && isOpen()) {
          setTab("notifs");
          setReadFilter("unread");
          render();
        }
      }).catch(() => {});
    });
    window.addEventListener("creatorJobUpdated", (ev) => {
      const job = ev?.detail?.job;
      if (job && job.saving && !job.saved && !_saveQueuePollTimer) {
        startSaveQueuePolling();
      }
    });
    window.addEventListener("creatorNotificationsRefresh", () => refresh({ reason: "creatorNotificationsRefresh" }).catch(() => {}));
    window.addEventListener("creatorJobsLoaded", () => refresh({ reason: "creatorJobsLoaded" }).catch(() => {}));
    window.addEventListener("creatorPublishProgressUpdated", () => refresh({ reason: "creatorPublishProgressUpdated" }).catch(() => {}));
    let _lastSaveJobStartedAt = 0;
    const SAVE_DEBOUNCE_MS = 3000;
    window.addEventListener("creatorSaveJobStarted", (evt) => {
      const now = Date.now();
      if (now - _lastSaveJobStartedAt < SAVE_DEBOUNCE_MS) return;
      _lastSaveJobStartedAt = now;

      // 1. Generated-Notification sofort löschen (verhindert Doppel-Speichern)
      const jobId = evt?.detail?.jobId;
      if (jobId) {
        deleteGeneratedNotification(jobId);
      }

      // 2. Auf "Aktive Jobs" Tab wechseln
      setTab("jobs");
      if (isOpen()) {
        refresh({ reason: "creatorSaveJobStarted", forceUseExternalJobs: true }).then(() => render()).catch(() => {});
      } else {
        open({ tab: "jobs", forceUseExternalJobs: true });
      }

      // 3. Polling starten um Speicher-Fortschritt zu verfolgen
      startSaveQueuePolling();
      refetchJobsForSaveQueue().then(() => {
        items = generateItemsFromCategories();
        if (isOpen()) render();
      }).catch(() => {});
    });
  }

  function registerSystemNotificationCategory() {
    if (!window.CreatorNotificationCategories) window.CreatorNotificationCategories = {};
    if (window.CreatorNotificationCategories.system) return;
    function safeParse(s) {
      try {
        if (!s) return {};
        if (typeof s === "object") return s;
        return JSON.parse(String(s));
      } catch (e) {
        return {};
      }
    }
    function toTs(n) {
      const v = n.updated_at != null ? Number(n.updated_at) : n.created_at != null ? Number(n.created_at) : 0;
      return Number.isFinite(v) ? v : 0;
    }
    window.CreatorNotificationCategories.system = {
      id: "system",
      name: "System",
      category: "System",
      filterItems: function (allJobs, allNotifications) {
        const items = [];
        const notifs = Array.isArray(allNotifications) ? allNotifications : [];
        notifs
          .filter(function (n) {
            return String(n.category || "").toLowerCase() === "system";
          })
          .forEach(function (notification) {
            const notifData =
              typeof notification.data === "object" && notification.data
                ? notification.data
                : safeParse(notification.data);
            const ts = toTs(notification);
            const isReadVal = notification.is_read === true || notification.is_read === 1 || notification.is_read === "1";
            const nid = String(notification.notification_id || notification.id || "").trim();
            if (!nid) return;
            items.push({
              id: "api-system-" + nid,
              tab: "notifs",
              cat: "System",
              title: notification.title || "System",
              meta: notification.message || "",
              unread: !isReadVal,
              ts: ts || Date.now(),
              data: {
                notification: notification,
                notification_id: nid,
                notifData: notifData,
                design_id: notifData.design_id || null,
                preview_url: notifData.preview_url || null
              },
              isFromAPI: true,
              isSystemNotification: true
            });
          });
        items.sort(function (a, b) {
          return (b.ts || 0) - (a.ts || 0);
        });
        return items;
      },
      renderItem: function (item, container) {
        const d = item.data || {};
        const parsed = d.notifData || {};
        const thumbSrc = parsed.preview_url || parsed.image_url || "";
        const itemDiv = document.createElement("div");
        itemDiv.className = "cnm-item cnm-item--published" + (item.unread ? " is-unread" : "");
        itemDiv.dataset.id = item.id;
        const title = escapeHtml(item.title || "System");
        const meta = escapeHtml(item.meta || "");
        const imgHtml = thumbSrc
          ? '<div class="cnm-saved-preview"><img src="' + escapeHtml(thumbSrc) + '" alt="" loading="lazy" /></div>'
          : '<div class="cnm-saved-preview"><div class="admin-pd-products-card__img-placeholder" style="width:100%;height:100%;min-height:80px"></div></div>';
        itemDiv.innerHTML =
          '<div class="cnm-saved-layout">' +
          imgHtml +
          '<div class="cnm-saved-content">' +
          '<div class="cnm-saved-title">' +
          title +
          "</div>" +
          '<div class="cnm-saved-datetime">' +
          meta +
          "</div>" +
          "</div>" +
          "</div>";
        itemDiv.addEventListener("click", function () {
          if (item.unread && window.CreatorNotificationsModal?.markRead) {
            window.CreatorNotificationsModal.markRead(item.id, { category: "system", job: item.data });
          }
          const sysJid = parsed.job_id != null ? String(parsed.job_id).trim() : "";
          if (sysJid && window.CreatorNotificationCategories?.generated?.openPreviewModal) {
            const previewUrl =
              parsed.preview_url ||
              parsed.image_url ||
              (parsed.result && (parsed.result.preview_url || parsed.result.image_url)) ||
              "";
            const sysJob = {
              job_id: sysJid,
              prompt: parsed.prompt || item.title || "",
              design_prompt: parsed.design_prompt || parsed.final_prompt || null,
              final_prompt: parsed.final_prompt || parsed.design_prompt || null,
              preview_url: previewUrl || null,
              image_url: parsed.image_url || previewUrl || null,
              result:
                parsed.result && (parsed.result.preview_url || parsed.result.image_url)
                  ? parsed.result
                  : previewUrl
                    ? { preview_url: previewUrl, image_url: parsed.image_url || previewUrl }
                    : undefined,
              done: true,
              saved: false
            };
            window.CreatorNotificationCategories.generated
              .openPreviewModal(sysJob, { id: "system-" + sysJid, data: sysJob })
              .catch(function () {});
            return;
          }
          const did = parsed.design_id;
          if (did && window.EazCreatorCore?.getContext) {
            window.EazCreatorCore.getContext().then(function (ctx) {
              if (!ctx?.apiBase) return;
              fetch(
                ctx.apiBase +
                  "?op=get-design&design_id=" +
                  encodeURIComponent(did) +
                  "&owner_id=" +
                  encodeURIComponent(ctx.ownerId),
                { credentials: "include" }
              )
                .then(function (r) {
                  return r.json();
                })
                .then(function (data) {
                  if (data.ok && data.design) {
                    if (window.CreatorDesignModal?.open) window.CreatorDesignModal.open(data.design);
                    else if (window.CreatorDesignPreviewModal?.open) window.CreatorDesignPreviewModal.open(data.design);
                  }
                })
                .catch(function () {});
            });
          }
        });
        container.appendChild(itemDiv);
      }
    };
  }

  async function init() {
    console.log("[CNM] initNotificationsModal called");

    // ✅ wait for bootstrap markup (no more permanent disable on race)
    overlay = await waitForOverlay();
    if (!overlay) {
      setSafeFallback("markup not found (#cnmOverlay missing) after wait");
      return;
    }

    modal = $(".cnm-modal", overlay);
    closeBtn = $("#cnmClose", overlay);
    listEl = $("#cnmList", overlay);
    searchEl = $("#cnmSearch", overlay);
    filterBtnEl = $("#cnmFilterBtn", overlay);
    tabBtns = $$("[data-cnm-tab]", overlay);
    readTabBtns = $$("[data-cnm-read]", overlay);
    scopeBtns = $$("[data-cnm-scope]", overlay);

    if (!modal || !listEl) {
      setSafeFallback("markup incomplete (cnmModal/cnmList missing)");
      return;
    }

    REG = window.CNM_REGISTRY;
    if (!REG) {
      REG = {
        version: 1,
        tabs: {
          jobs: { key: "jobs", label: window.CreatorI18n?.activeJobs || "Active Jobs" },
          notifs: { key: "notifs", label: window.CreatorI18n?.notificationsTab || "Notifications" }
        },
        categories: {
          jobs: [
            { key: "generate", label: window.CreatorI18n?.generateDesign || "Generate Design" },
            { key: "generate_hero", label: window.CreatorI18n?.generateHero || "Generate Hero" },
            { key: "generate_save", label: window.CreatorI18n?.generateAndSave || "Generate & Save" },
            { key: "publish", label: "Publish" }
          ],
          notifs: [
            { key: "success", label: window.CreatorI18n?.categorySuccess || "Success" },
            { key: "error", label: window.CreatorI18n?.categoryError || "Error" },
            { key: "info", label: window.CreatorI18n?.categoryInfo || "Info" }
          ]
        },
        aliases: {}
      };
    }

    registerSystemNotificationCategory();

    TAB_KEYS = Object.keys(REG.tabs);
    CATS = {
      jobs: REG.categories.jobs.map((x) => x.label),
      notifs: REG.categories.notifs.map((x) => x.label),
      transactions: [] // Transactions tab has no category filters
    };

    activeTab = "jobs";
    activeFilters = new Set(CATS[activeTab]);
    applyNotificationScope("user");

    // Initially hide elements for "Aktive Jobs" tab
    setTab(activeTab);

    if (closeBtn) closeBtn.addEventListener("click", close);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) {
        // Don't close notification modal if another modal is open on top (z-index > 9999)
        // All creator modals use role="dialog" aria-modal="true" and toggle aria-hidden.
        // The notification overlay itself has aria-hidden but NOT role="dialog",
        // so this selector only matches OTHER open modals.
        const hasOtherOpenModal = document.querySelector(
          '[role="dialog"][aria-modal="true"][aria-hidden="false"]'
        );
        if (hasOtherOpenModal) return;
        close();
      }
    });

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.cnmTab));
    });

    scopeBtns.forEach((btn) => {
      btn.addEventListener("click", () => applyNotificationScope(btn.dataset.cnmScope));
    });

    readTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => setReadFilter(btn.dataset.cnmRead));
    });

    if (searchEl) {
      searchEl.addEventListener("input", () => {
        if (_searchDebounce) clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => {
          searchQuery = searchEl.value || "";
          render();
          _searchDebounce = null;
        }, 180);
      });
    }

    if (filterBtnEl) {
      filterBtnEl.addEventListener("click", () => {
        if (window.NotificationFilterModal && typeof window.NotificationFilterModal.open === "function") {
          window.NotificationFilterModal.open();
        } else {
          console.warn("[CNM] Filter-Button geklickt, aber NotificationFilterModal.open noch nicht verfügbar.");
        }
      });
    }

    bindAutoRefreshEvents();

    window.CreatorNotificationsModal = {
      open,
      close,
      toggle,
      openWithFilter: (tab, category) => open({ tab, category }),
      setTab,
      markRead,
      getActiveFilters,
      setActiveFilters,
      getActiveTab,
      updateExternalData,
      loadNotificationsFromAPI,
      markAllNotificationsReadAPI,
      refresh,
      isOpen,
      deleteGeneratedNotification,
      __isReal: true
    };

    items = generateItemsFromCategories();
    render();

    console.log("[CNM] CreatorNotificationsModal initialized successfully");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((err) => {
        console.error("[CNM] Initialization failed:", err);
        setSafeFallback("init failed (see error above)");
      });
    });
  } else {
    init().catch((err) => {
      console.error("[CNM] Initialization failed:", err);
      setSafeFallback("init failed (see error above)");
    });
  }
})();