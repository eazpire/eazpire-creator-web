/**
 * Notification preferences panel (Shop / Creator) — web In-App toggles only.
 */
(function () {
  "use strict";

  if (window.NotificationPreferencesPanel) return;

  var BUCKET_META = {
    cart_reminder: {
      labelKey: "content.notif_prefs.bucket_cart_reminder",
      labelFallback: "Cart reminders",
      infoKey: "content.notif_prefs.info_cart_reminder",
      infoFallback:
        "Reminders when items are left in your cart so you can finish checkout.",
    },
    orders: {
      labelKey: "content.notif_prefs.bucket_orders",
      labelFallback: "Order updates",
      infoKey: "content.notif_prefs.info_orders",
      infoFallback:
        "Updates about your orders, including confirmation, shipping, and delivery status.",
    },
    promotions_new: {
      labelKey: "content.notif_prefs.bucket_promotions_new",
      labelFallback: "New promotions",
      infoKey: "content.notif_prefs.info_promotions_new",
      infoFallback:
        "When a creator publishes a new shop promotion, bundle, or special offer.",
    },
    promotions_ending_soon: {
      labelKey: "content.notif_prefs.bucket_promotions_ending",
      labelFallback: "Promotions ending soon",
      infoKey: "content.notif_prefs.info_promotions_ending",
      infoFallback:
        "When a promotion you follow ends within the next 24 hours.",
    },
    app_promotions: {
      labelKey: "content.notif_prefs.bucket_app_promotions",
      labelFallback: "App bonuses & offers",
      infoKey: "content.notif_prefs.info_app_promotions",
      infoFallback:
        "App download bonuses, special app offers, and similar reward notifications.",
    },
    daily_game: {
      labelKey: "content.notif_prefs.bucket_daily_game",
      labelFallback: "Daily game",
      infoKey: "content.notif_prefs.info_daily_game",
      infoFallback:
        "Daily game reminders, win notifications, and related shop rewards.",
    },
    generations: {
      labelKey: "content.notif_prefs.bucket_generations",
      labelFallback: "Generations & jobs",
      infoKey: "content.notif_prefs.info_generations",
      infoFallback:
        "When image or video generation jobs start, progress, or finish.",
    },
    design_saved: {
      labelKey: "content.notif_prefs.bucket_design_saved",
      labelFallback: "Design saved",
      infoKey: "content.notif_prefs.info_design_saved",
      infoFallback:
        "When a design is saved or uploaded to your creator library.",
    },
    product_published: {
      labelKey: "content.notif_prefs.bucket_product_published",
      labelFallback: "Product published",
      infoKey: "content.notif_prefs.info_product_published",
      infoFallback:
        "When a product is published, updated, or removed from the shop.",
    },
    community: {
      labelKey: "content.notif_prefs.bucket_community",
      labelFallback: "Community & codes",
      infoKey: "content.notif_prefs.info_community",
      infoFallback:
        "Community activity, creator codes, referrals, and mentor messages.",
    },
    other: {
      labelKey: "content.notif_prefs.bucket_other",
      labelFallback: "Other creator updates",
      infoKey: "content.notif_prefs.info_other",
      infoFallback:
        "Other creator alerts that do not fit the categories above.",
    },
  };

  var SHOP_BUCKET_KEYS = [
    "cart_reminder",
    "orders",
    "promotions_new",
    "promotions_ending_soon",
    "app_promotions",
    "daily_game",
  ];

  var CREATOR_BUCKET_KEYS = [
    "generations",
    "design_saved",
    "product_published",
    "community",
    "other",
  ];

  var INFO_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>';

  function t(key, fallback) {
    try {
      if (window.EazTranslationStore && typeof window.EazTranslationStore.t === "function") {
        return window.EazTranslationStore.t(key, fallback);
      }
      if (typeof window.eazT === "function") {
        var v = window.eazT(key, fallback);
        if (v && v !== key) return v;
      }
    } catch (_e) {}
    return fallback != null ? fallback : key;
  }

  function bucketMeta(key) {
    return (
      BUCKET_META[key] || {
        labelKey: key,
        labelFallback: String(key).replace(/_/g, " ").replace(/\b\w/g, function (c) {
          return c.toUpperCase();
        }),
        infoKey: key,
        infoFallback: "",
      }
    );
  }

  function getOwnerId() {
    if (typeof window._resolveEazOwnerId === "function") {
      var r = window._resolveEazOwnerId();
      if (r) return String(r);
    }
    return String(window.__EAZ_OWNER_ID || window.ownerId || "");
  }

  function inAppEnabled(val) {
    if (val === true) return true;
    if (val === false) return false;
    if (val && typeof val === "object") return val.in_app !== false;
    return true;
  }

  function renderToggle(checked, disabled, dataAttrs) {
    var attrs = "";
    Object.keys(dataAttrs || {}).forEach(function (k) {
      attrs += " data-" + k + '="' + String(dataAttrs[k]).replace(/"/g, "&quot;") + '"';
    });
    return (
      '<label class="npp-toggle"' +
      attrs +
      ">" +
      '<input type="checkbox"' +
      (checked ? " checked" : "") +
      (disabled ? " disabled" : "") +
      ">" +
      '<span class="npp-toggle-slider" aria-hidden="true"></span>' +
      "</label>"
    );
  }

  function bucketKeysForScope(scope, catalogBuckets) {
    if (catalogBuckets && catalogBuckets.length) {
      return catalogBuckets.map(function (b) {
        return typeof b === "string" ? b : b.key;
      });
    }
    return scope === "shop" ? SHOP_BUCKET_KEYS.slice() : CREATOR_BUCKET_KEYS.slice();
  }

  function buildPanelHtml(scope, isDark) {
    var masterKey =
      scope === "shop"
        ? "content.notif_prefs.shop_master"
        : "content.notif_prefs.creator_master";
    var masterFallback =
      scope === "shop" ? "All shop notifications" : "All creator notifications";
    return (
      '<div class="npp-root' +
      (isDark ? " npp-root--dark" : "") +
      '" data-npp-scope="' +
      scope +
      '">' +
      '<div class="npp-card">' +
      '<div class="npp-master">' +
      '<span class="npp-master-label" data-t="' +
      masterKey +
      '">' +
      t(masterKey, masterFallback) +
      "</span>" +
      renderToggle(true, false, { npp: "master" }) +
      "</div>" +
      '<div class="npp-list" data-npp-buckets></div>' +
      "</div>" +
      '<p class="npp-status" data-npp-status aria-live="polite"></p>' +
      "</div>"
    );
  }

  function renderBuckets(root, bucketKeys, prefs, masterOn) {
    var list = root.querySelector("[data-npp-buckets]");
    if (!list) return;
    var infoLabel = t("content.notif_prefs.info_btn_label", "More information");
    var html = "";
    bucketKeys.forEach(function (key) {
      var meta = bucketMeta(key);
      var on = inAppEnabled((prefs && prefs[key]) || null);
      var label = t(meta.labelKey, meta.labelFallback);
      var info = t(meta.infoKey, meta.infoFallback);
      html +=
        '<div class="npp-row" data-bucket="' +
        key +
        '">' +
        '<div class="npp-row-main">' +
        '<div class="npp-row-label-wrap">' +
        '<span class="npp-row-label" data-t="' +
        meta.labelKey +
        '">' +
        label +
        "</span>" +
        (info
          ? '<button type="button" class="npp-info-btn" data-npp-info="' +
            key +
            '" aria-label="' +
            infoLabel.replace(/"/g, "&quot;") +
            '" aria-expanded="false" aria-controls="npp-info-' +
            key +
            '">' +
            INFO_ICON +
            "</button>"
          : "") +
        "</div>" +
        renderToggle(on, !masterOn, { npp: "channel", bucket: key }) +
        "</div>" +
        (info
          ? '<p class="npp-row-info" id="npp-info-' +
            key +
            '" data-t="' +
            meta.infoKey +
            '" hidden>' +
            info +
            "</p>"
          : "") +
        "</div>";
    });
    list.innerHTML = html;
  }

  function setStatus(root, text, kind) {
    var el = root.querySelector("[data-npp-status]");
    if (!el) return;
    el.classList.remove("is-error", "is-success");
    if (kind === "error") el.classList.add("is-error");
    if (kind === "success") el.classList.add("is-success");
    el.textContent = text || "";
  }

  function closeAllInfo(root) {
    if (!root) return;
    root.querySelectorAll(".npp-info-btn.is-open").forEach(function (btn) {
      btn.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    });
    root.querySelectorAll(".npp-row-info").forEach(function (el) {
      el.hidden = true;
    });
  }

  function PanelInstance(mountEl, scope, isDark) {
    this.mountEl = mountEl;
    this.scope = scope;
    this.isDark = !!isDark;
    this.state = null;
    this.saving = false;
    this.bound = false;
  }

  PanelInstance.prototype.mount = function () {
    this.mountEl.innerHTML = buildPanelHtml(this.scope, this.isDark);
    this.root = this.mountEl.querySelector(".npp-root");
    if (!this.bound) {
      this.bound = true;
      this.mountEl.addEventListener("change", this.onChange.bind(this));
      this.mountEl.addEventListener("click", this.onClick.bind(this));
    }
  };

  PanelInstance.prototype.onClick = function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-npp-info]") : null;
    if (!btn || !this.root) return;
    e.preventDefault();
    var key = btn.getAttribute("data-npp-info");
    var panel = this.root.querySelector("#npp-info-" + key);
    if (!panel) return;
    var willOpen = panel.hidden;
    closeAllInfo(this.root);
    if (willOpen) {
      panel.hidden = false;
      btn.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }
  };

  PanelInstance.prototype.load = function () {
    var self = this;
    if (!getOwnerId()) {
      this.mountEl.innerHTML =
        '<p class="npp-login-hint" data-t="content.notif_prefs.login_required">' +
        t("content.notif_prefs.login_required", "Please log in to manage notification settings.") +
        "</p>";
      return Promise.resolve();
    }
    this.mountEl.innerHTML =
      '<div class="npp-loading">' + t("content.notif_prefs.loading", "Loading…") + "</div>";
    if (!window.creatorApiFetch) {
      return Promise.resolve();
    }
    return window
      .creatorApiFetch("get-notification-preferences", {})
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "load_failed");
        self.state = data;
        self.mount();
        self.syncUi();
        try {
          window.dispatchEvent(new CustomEvent("eazReapplyUiTranslations"));
        } catch (_tr) {}
      })
      .catch(function (err) {
        self.mount();
        setStatus(
          self.root,
          t("content.notif_prefs.error_load", "Could not load settings.") +
            (err && err.message ? " (" + err.message + ")" : ""),
          "error"
        );
      });
  };

  PanelInstance.prototype.syncUi = function () {
    if (!this.state || !this.root) return;
    var scope = this.scope;
    var master =
      scope === "shop" ? this.state.shop_master !== false : this.state.creator_master !== false;
    var catalogBuckets =
      scope === "shop"
        ? this.state.catalog && this.state.catalog.shop_buckets
        : this.state.catalog && this.state.catalog.creator_buckets;
    var bucketKeys = bucketKeysForScope(scope, catalogBuckets);
    var prefs = scope === "shop" ? this.state.shop : this.state.creator;

    var masterInput = this.root.querySelector('[data-npp="master"] input');
    if (masterInput) masterInput.checked = master;

    renderBuckets(this.root, bucketKeys, prefs, master);
  };

  PanelInstance.prototype.onChange = function (e) {
    var input = e.target;
    if (!input || input.tagName !== "INPUT" || !this.state || this.saving) return;
    var label = input.closest("[data-npp]");
    if (!label) return;

    var self = this;
    var scope = this.scope;
    var body = {};
    var npp = label.getAttribute("data-npp");

    if (npp === "master") {
      if (scope === "shop") body.shop_master = input.checked;
      else body.creator_master = input.checked;
    } else if (npp === "channel") {
      var bucket = label.getAttribute("data-bucket");
      if (!bucket) return;
      if (scope === "shop") body.shop = {};
      else body.creator = {};
      var patch = scope === "shop" ? body.shop : body.creator;
      patch[bucket] = { in_app: input.checked };
    } else {
      return;
    }

    this.saving = true;
    setStatus(this.root, t("content.notif_prefs.saving", "Saving…"), null);

    window
      .creatorApiFetch("save-notification-preferences", {}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "save_failed");
        if (typeof data.shop_master === "boolean") self.state.shop_master = data.shop_master;
        if (typeof data.creator_master === "boolean") self.state.creator_master = data.creator_master;
        if (data.shop) self.state.shop = data.shop;
        if (data.creator) self.state.creator = data.creator;
        self.syncUi();
        setStatus(self.root, t("content.notif_prefs.saved", "Saved"), "success");
        setTimeout(function () {
          setStatus(self.root, "", null);
        }, 2000);
      })
      .catch(function (err) {
        self.syncUi();
        setStatus(
          self.root,
          t("content.notif_prefs.error_save", "Could not save.") +
            (err && err.message ? " (" + err.message + ")" : ""),
          "error"
        );
      })
      .finally(function () {
        self.saving = false;
      });
  };

  var instances = {};

  window.NotificationPreferencesPanel = {
    init: function (mountEl, options) {
      if (!mountEl) return;
      var scope =
        (options && options.scope) ||
        mountEl.getAttribute("data-notification-prefs-scope") ||
        "shop";
      var isDark =
        !!(options && options.dark) ||
        mountEl.getAttribute("data-notification-prefs-dark") === "1";
      var id = mountEl.id || mountEl.className + scope;
      if (!instances[id]) instances[id] = new PanelInstance(mountEl, scope, isDark);
      return instances[id].load();
    },
  };

  document.addEventListener("account-modal-tab-loaded", function (ev) {
    if (!ev || !ev.detail || ev.detail.tab !== "notifications") return;
    var el =
      document.querySelector("#account-modal-notifications-content .account-notification-settings") ||
      document.getElementById("account-modal-notifications-content");
    if (el) window.NotificationPreferencesPanel.init(el, { scope: "shop" });
  });

  document.addEventListener("creator-settings-v2-tab-changed", function (ev) {
    if (!ev || !ev.detail || ev.detail.tab !== "notifications") return;
    var el = document.getElementById("csm-notifications-mount");
    if (el) window.NotificationPreferencesPanel.init(el, { scope: "creator", dark: true });
  });
})();
