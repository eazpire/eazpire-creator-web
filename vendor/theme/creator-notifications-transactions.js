/* theme/assets/creator-notifications-transactions.js
 * EAZ Transactions tab for the Creator Notifications Modal.
 * Fetches billing_ledger entries via op=get-transactions and renders
 * a clean list view with color-coded credit/debit rows.
 *
 * Exposes: window.CNM_Transactions = { render, refresh }
 */
(function () {
  "use strict";

  if (window.__cnmTransactionsInit) return;
  window.__cnmTransactionsInit = true;

  const PAGE_SIZE = 50;

  let _transactions = [];
  let _offset = 0;
  let _hasMore = true;
  let _loading = false;
  let _loaded = false;
  let _currentContainer = null;

  // ── i18n helpers ──
  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  // ── Reason label mapping ──
  const REASON_MAP = {
    "design_generate": "Design Generate",
    "design_upload": "Design Upload",
    "hero_generate": "Hero Generate",
    "hero_impression": "Hero Impression",
    "bg_remove": "Background Remove",
    "creator_image": "Creator Image",
    "daily_level_reward": "Daily Level Reward",
    "admin:": "Admin Credit"
  };

  function humanReason(reason) {
    if (!reason) return t("txUnknown", "Transaction");
    // Check known prefixes/keys
    const lower = reason.toLowerCase();
    if (lower.startsWith("consumed for ")) {
      const feature = lower.replace("consumed for ", "").trim();
      return REASON_MAP[feature] || feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (lower.startsWith("daily level reward")) return t("txDailyReward", "Daily Level Reward");
    if (lower.startsWith("admin:")) return t("txAdminCredit", "Admin Credit");
    if (lower.startsWith("balance cap")) return t("txBalanceCap", "Balance Cap Adjustment");
    // Fallback: prettify
    return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function typeLabel(type) {
    switch (type) {
      case "credit": return t("txCredit", "Credit");
      case "debit": return t("txDebit", "Debit");
      case "refund": return t("txRefund", "Refund");
      case "adjustment": return t("txAdjustment", "Adjustment");
      default: return type || "";
    }
  }

  function isCredit(type) {
    return type === "credit" || type === "refund";
  }

  function formatDate(tsMs) {
    if (!tsMs) return "";
    try {
      const d = new Date(typeof tsMs === "number" && tsMs < 1e12 ? tsMs * 1000 : tsMs);
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return "";
    }
  }

  function formatTime(tsMs) {
    if (!tsMs) return "";
    try {
      const d = new Date(typeof tsMs === "number" && tsMs < 1e12 ? tsMs * 1000 : tsMs);
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function formatEaz(amount, type) {
    const val = (Math.round(Number(amount) * 100) / 100).toFixed(2);
    return isCredit(type) ? ("+" + val) : ("-" + val);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── API ──
  async function fetchTransactions(offset) {
    if (!window.EazCreatorCore?.getContext) {
      console.warn("[CNM-TX] EazCreatorCore.getContext missing");
      return { transactions: [], count: 0 };
    }

    const ctx = await window.EazCreatorCore.getContext();
    const url = `${ctx.apiBase}?op=get-transactions&owner_id=${encodeURIComponent(ctx.ownerId)}&limit=${PAGE_SIZE}&offset=${offset}`;

    const resp = await fetch(url, { credentials: "include" });
    const data = await resp.json();

    if (!data.ok) {
      console.error("[CNM-TX] API error:", data.error);
      return { transactions: [], count: 0 };
    }

    return data;
  }

  async function loadInitial() {
    if (_loaded && _transactions.length > 0) return;
    _loading = true;
    _offset = 0;
    _transactions = [];
    _hasMore = true;

    try {
      const data = await fetchTransactions(0);
      _transactions = data.transactions || [];
      _offset = _transactions.length;
      _hasMore = _transactions.length >= PAGE_SIZE;
      _loaded = true;
    } catch (e) {
      console.error("[CNM-TX] Load failed:", e);
      _transactions = [];
      _hasMore = false;
    } finally {
      _loading = false;
    }
  }

  async function loadMore() {
    if (_loading || !_hasMore) return;
    _loading = true;

    try {
      const data = await fetchTransactions(_offset);
      const newTx = data.transactions || [];
      _transactions = _transactions.concat(newTx);
      _offset += newTx.length;
      _hasMore = newTx.length >= PAGE_SIZE;
    } catch (e) {
      console.error("[CNM-TX] Load more failed:", e);
    } finally {
      _loading = false;
    }
  }

  // ── Rendering ──
  function renderItem(tx) {
    const type = tx.type || "debit";
    const cls = isCredit(type) ? "credit" : (type === "refund" ? "refund" : (type === "adjustment" ? "adjustment" : "debit"));

    const row = document.createElement("div");
    row.className = "cnm-tx cnm-tx--" + cls;

    row.innerHTML =
      '<div class="cnm-tx__reason">' + escapeHtml(humanReason(tx.reason)) + '</div>' +
      '<div class="cnm-tx__amount cnm-tx__amount--' + cls + '">' + escapeHtml(formatEaz(tx.amount_eaz, type)) + ' EAZ</div>' +
      '<div class="cnm-tx__meta">' +
        '<span>' + escapeHtml(formatDate(tx.created_at)) + ' ' + escapeHtml(formatTime(tx.created_at)) + '</span>' +
        '<span class="cnm-tx__badge cnm-tx__badge--' + cls + '">' + escapeHtml(typeLabel(type)) + '</span>' +
      '</div>';

    return row;
  }

  function renderEmpty(container) {
    const empty = document.createElement("div");
    empty.className = "cnm-empty";
    empty.innerHTML =
      '<div class="cnm-empty-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<line x1="12" y1="1" x2="12" y2="23"/>' +
          '<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' +
        '</svg>' +
      '</div>' +
      '<div class="cnm-empty-title">' + escapeHtml(t("txEmptyTitle", "No Transactions")) + '</div>' +
      '<div class="cnm-empty-text">' + escapeHtml(t("txEmptyText", "Your EAZ transactions will appear here.")) + '</div>';
    container.appendChild(empty);
  }

  function renderLoading(container) {
    const el = document.createElement("div");
    el.className = "cnm-tx-loading";
    el.innerHTML = '<div class="cnm-tx-spinner"></div><span>' + escapeHtml(t("loading", "Loading...")) + '</span>';
    container.appendChild(el);
  }

  function renderLoadMore(container) {
    if (!_hasMore) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cnm-tx-load-more";
    btn.textContent = t("txLoadMore", "Load more");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = t("loading", "Loading...");
      await loadMore();
      renderInto(_currentContainer);
    });
    container.appendChild(btn);
  }

  function renderInto(container) {
    if (!container) return;
    container.innerHTML = "";
    _currentContainer = container;

    if (_loading && _transactions.length === 0) {
      renderLoading(container);
      return;
    }

    if (_transactions.length === 0) {
      renderEmpty(container);
      return;
    }

    _transactions.forEach((tx) => {
      container.appendChild(renderItem(tx));
    });

    renderLoadMore(container);
  }

  // ── Public API ──
  async function render(container) {
    _currentContainer = container;

    if (!_loaded) {
      renderLoading(container);
      await loadInitial();
    }

    renderInto(container);
  }

  async function refresh() {
    _loaded = false;
    _transactions = [];
    _offset = 0;
    _hasMore = true;
    await loadInitial();
    if (_currentContainer) renderInto(_currentContainer);
  }

  window.CNM_Transactions = {
    render: render,
    refresh: refresh
  };

  // Auto-refresh when tab is switched to transactions
  window.addEventListener("cnmTabChanged", function (e) {
    if (e.detail && e.detail.tab === "transactions" && _currentContainer) {
      render(_currentContainer);
    }
  });
})();
