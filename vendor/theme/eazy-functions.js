(function () {
  "use strict";

  var STORAGE_KEY = "eazy_fn_visibility";

  var CATEGORIES = [
    {
      id: "shared",
      label: "Gemeinsam",
      features: [
        { id: "interests", label: "Interessen", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z"/></svg>' },
        { id: "community", label: "Community", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
        { id: "generate-design", label: "Design Generieren", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="M11 6.2L9.8 5"/><path d="M11 11.8L9.8 13"/><path d="M3 21l9-9"/></svg>' },
        { id: "my-creations", label: "Meine Creationen", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' },
        { id: "publish", label: "Produkte Ver\u00f6ffentlichen", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>' },
        { id: "my-products", label: "Meine Produkte", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
        { id: "active-jobs", label: "Aktive Jobs", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' }
      ]
    },
    {
      id: "shop",
      label: "Shop",
      features: [
        { id: "favorites", label: "Favoriten", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>' },
        { id: "gift-cards", label: "Geschenkkarten", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>' },
        { id: "promo-codes", label: "Promo-Codes", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 013 3 3 3 0 01-3 3v4a2 2 0 002 2h16a2 2 0 002-2v-4a3 3 0 01-3-3 3 3 0 013-3V5a2 2 0 00-2-2H4a2 2 0 00-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>' },
        { id: "size-ai", label: "Size AI", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3H3v7h18V3z"/><path d="M21 14H3v7h18v-7z"/><path d="M12 3v7"/><path d="M12 14v7"/><path d="M3 10l4-3.5L3 3"/><path d="M21 10l-4-3.5L21 3"/></svg>' },
        { id: "my-orders", label: "Meine Bestellungen", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' },
        { id: "product-search", label: "Produkt Suche", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' },
        { id: "browse-shop", label: "Shop durchst\u00f6bern", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
        { id: "wardrobe", label: "Wardrobe", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
        { id: "artifacts", label: "Artifacts", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>' },
        { id: "my-mockups", label: "My Mockups", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>' }
      ]
    },
    {
      id: "creator",
      label: "Creator",
      features: [
        { id: "hero-images", label: "Hero Images", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M2 10h2"/><path d="M20 10h2"/></svg>' },
        { id: "creator-image", label: "Creator Bild", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>' },
        { id: "creator-settings", label: "Creator Einstellungen", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' },
        { id: "balance", label: "Balance", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
        { id: "level", label: "Level", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
        { id: "mentor-support", label: "Creator unterst\u00fctzen", svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/><path d="M12 5.67V12"/><path d="M8 10h8"/></svg>' }
      ]
    }
  ];

  var CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  var EYE_OPEN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_CLOSED_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/></svg>';

  var EAZY_INFO_MSG = "Hier findest du alle Funktionen! Mit dem Auge bestimmst du, welche in der Chat-Leiste sichtbar sind.";
  var EAZY_TIP_MSG = "Auge auf = Funktion erscheint im Karussell \u00fcber dem Chat. Auge zu = nur hier im Tab sichtbar. Zeige nur, was du oft brauchst \u2014 so bleibt alles \u00fcbersichtlich!";

  /* ══ Visibility persistence ══ */

  var _visibility = {};

  function loadVisibility() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _visibility = JSON.parse(raw);
    } catch (e) {}
  }

  function saveVisibility() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_visibility)); } catch (e) {}
  }

  function isVisible(featId) {
    return _visibility[featId] !== false;
  }

  function toggleVisibility(featId) {
    _visibility[featId] = !isVisible(featId);
    saveVisibility();
    refreshCarousel();
    return isVisible(featId);
  }

  function getAllFeatures() {
    var all = [];
    for (var c = 0; c < CATEGORIES.length; c++) {
      for (var f = 0; f < CATEGORIES[c].features.length; f++) {
        all.push(CATEGORIES[c].features[f]);
      }
    }
    return all;
  }

  function getVisibleFeatures() {
    var all = getAllFeatures();
    return all.filter(function (f) { return isVisible(f.id); });
  }

  /* ══ Functions Tab (grid view) ══ */

  var CAT_COLORS = {
    shared:  { tint: "rgba(249,115,22,0.06)", accent: "#f97316" },
    shop:    { tint: "rgba(59,130,246,0.06)",  accent: "#3b82f6" },
    creator: { tint: "rgba(139,92,246,0.06)",  accent: "#8b5cf6" }
  };

  function isCatAllVisible(cat) {
    for (var f = 0; f < cat.features.length; f++) {
      if (!isVisible(cat.features[f].id)) return false;
    }
    return true;
  }

  function updateCatEye(catEl, cat) {
    var allVis = isCatAllVisible(cat);
    var btn = catEl.querySelector(".eazy-fn__cat-eye");
    if (!btn) return;
    btn.innerHTML = allVis ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
    btn.title = allVis ? "Alle ausblenden" : "Alle einblenden";
  }

  function renderGrid(container) {
    var html = "";
    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var col = CAT_COLORS[cat.id] || CAT_COLORS.shared;
      var allVis = isCatAllVisible(cat);
      html += '<div class="eazy-fn__category is-open" data-cat="' + cat.id + '" style="--cat-tint:' + col.tint + ';--cat-accent:' + col.accent + '">';
      html += '<div class="eazy-fn__category-header-row">';
      html += '<button type="button" class="eazy-fn__cat-eye" data-cat-eye="' + cat.id + '" title="' + (allVis ? "Alle ausblenden" : "Alle einblenden") + '">';
      html += allVis ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
      html += '</button>';
      html += '<button type="button" class="eazy-fn__category-header">';
      html += '<span class="eazy-fn__category-title">' + cat.label + '</span>';
      html += '<span class="eazy-fn__category-count">' + cat.features.length + '</span>';
      html += '<span class="eazy-fn__category-chevron">' + CHEVRON_SVG + '</span>';
      html += '</button>';
      html += '</div>';
      html += '<div class="eazy-fn__category-grid">';
      for (var f = 0; f < cat.features.length; f++) {
        var feat = cat.features[f];
        var vis = isVisible(feat.id);
        html += '<div class="eazy-fn__item-wrap' + (vis ? '' : ' is-hidden') + '">';
        html += '<button type="button" class="eazy-fn__item" data-fn="' + feat.id + '" data-eazy-guide="' + feat.id + '" title="' + feat.label + '">';
        html += '<span class="eazy-fn__item-icon">' + feat.svg + '</span>';
        html += '<span class="eazy-fn__item-label">' + feat.label + '</span>';
        html += '</button>';
        html += '<button type="button" class="eazy-fn__eye-toggle" data-fn-eye="' + feat.id + '" title="' + (vis ? "In Chat-Leiste ausblenden" : "In Chat-Leiste einblenden") + '">';
        html += vis ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
        html += '</button>';
        html += '</div>';
      }
      html += '</div></div>';
      if (c < CATEGORIES.length - 1) html += '<div class="eazy-fn__category-divider"></div>';
    }
    container.innerHTML = html;

    container.querySelectorAll(".eazy-fn__category-header").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cat = btn.closest(".eazy-fn__category");
        if (cat) cat.classList.toggle("is-open");
      });
    });

    container.addEventListener("click", function (e) {
      var catEyeBtn = e.target.closest(".eazy-fn__cat-eye");
      if (catEyeBtn) {
        e.stopPropagation();
        var catId = catEyeBtn.getAttribute("data-cat-eye");
        var cat = null;
        for (var i = 0; i < CATEGORIES.length; i++) {
          if (CATEGORIES[i].id === catId) { cat = CATEGORIES[i]; break; }
        }
        if (!cat) return;
        var allVis = isCatAllVisible(cat);
        var targetState = !allVis;
        for (var f = 0; f < cat.features.length; f++) {
          _visibility[cat.features[f].id] = targetState;
        }
        saveVisibility();
        refreshCarousel();
        var catEl = catEyeBtn.closest(".eazy-fn__category");
        if (catEl) {
          catEl.querySelectorAll(".eazy-fn__item-wrap").forEach(function (wrap) {
            var eyeBtn = wrap.querySelector(".eazy-fn__eye-toggle");
            if (targetState) {
              wrap.classList.remove("is-hidden");
              if (eyeBtn) { eyeBtn.innerHTML = EYE_OPEN_SVG; eyeBtn.title = "In Chat-Leiste ausblenden"; }
            } else {
              wrap.classList.add("is-hidden");
              if (eyeBtn) { eyeBtn.innerHTML = EYE_CLOSED_SVG; eyeBtn.title = "In Chat-Leiste einblenden"; }
            }
          });
          updateCatEye(catEl, cat);
        }
        return;
      }

      var eyeBtn = e.target.closest(".eazy-fn__eye-toggle");
      if (eyeBtn) {
        var featId = eyeBtn.getAttribute("data-fn-eye");
        if (!featId) return;
        var nowVisible = toggleVisibility(featId);
        var wrap = eyeBtn.closest(".eazy-fn__item-wrap");
        if (wrap) {
          if (nowVisible) wrap.classList.remove("is-hidden");
          else wrap.classList.add("is-hidden");
        }
        eyeBtn.innerHTML = nowVisible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
        eyeBtn.title = nowVisible ? "In Chat-Leiste ausblenden" : "In Chat-Leiste einblenden";
        var catEl = eyeBtn.closest(".eazy-fn__category");
        if (catEl) {
          var catId = catEl.getAttribute("data-cat");
          for (var i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i].id === catId) { updateCatEye(catEl, CATEGORIES[i]); break; }
          }
        }
        return;
      }

      var fnItem = e.target.closest(".eazy-fn__item");
      if (fnItem) {
        var fnWrap = fnItem.closest(".eazy-fn__item-wrap");
        var fnId = fnWrap ? fnWrap.querySelector(".eazy-fn__eye-toggle[data-fn-eye]") : null;
        var funcId = fnId ? fnId.getAttribute("data-fn-eye") : null;
        if (funcId && window.CreatorChat && window.CreatorChat.startChatFunction) {
          window.CreatorChat.startChatFunction(funcId);
        }
      }
    });
  }

  /* ══ Eazy Info Bubble ══ */

  function initEazyInfo() {
    var infoBtn = document.getElementById("eazy-fn-info-btn");
    var bubble = document.getElementById("eazy-fn-info-bubble");
    if (!bubble) return;

    bubble.textContent = EAZY_INFO_MSG;
    bubble.classList.add("is-visible");
    setTimeout(function () { bubble.classList.remove("is-visible"); }, 6000);

    if (infoBtn) {
      infoBtn.addEventListener("click", function () {
        bubble.textContent = bubble.classList.contains("is-visible") ? EAZY_TIP_MSG : EAZY_INFO_MSG;
        bubble.classList.toggle("is-visible");
      });
    }
  }

  /* ══ Carousel (drawer bar) - infinite loop ══ */

  function buildItemHtml(feat) {
    return '<button type="button" class="eazy-fn-carousel__item" data-fn="' + feat.id + '" title="' + feat.label + '">'
      + '<span class="eazy-fn-carousel__item-icon">' + feat.svg + '</span>'
      + '<span class="eazy-fn-carousel__item-label">' + feat.label + '</span>'
      + '</button>';
  }

  var _carouselTrack = null;
  var _carouselWrapper = null;
  var _setWidth = 0;

  function measureSetWidth() {
    var features = getVisibleFeatures();
    var count = features.length;
    if (!count || !_carouselTrack) return 0;
    var items = _carouselTrack.querySelectorAll(".eazy-fn-carousel__item");
    if (items.length < count) return 0;
    var first = items[0];
    var last = items[count - 1];
    var gap = parseFloat(getComputedStyle(_carouselTrack).gap) || 2;
    return last.offsetLeft + last.offsetWidth - first.offsetLeft + gap;
  }

  function refreshCarousel() {
    if (!_carouselTrack || !_carouselWrapper) return;
    var features = getVisibleFeatures();
    if (features.length === 0) {
      _carouselTrack.innerHTML = '<span class="eazy-fn-carousel__empty">Keine Funktionen sichtbar</span>';
      _setWidth = 0;
      return;
    }
    var singleSetHtml = "";
    for (var i = 0; i < features.length; i++) {
      singleSetHtml += buildItemHtml(features[i]);
    }
    _carouselTrack.innerHTML = singleSetHtml + singleSetHtml + singleSetHtml;
    _setWidth = measureSetWidth();
    if (_setWidth > 0) {
      _carouselWrapper.scrollLeft = _setWidth;
    }
  }

  function initCarousel() {
    _carouselTrack = document.getElementById("eazy-fn-carousel-track");
    var leftBtn = document.getElementById("eazy-fn-carousel-left");
    var rightBtn = document.getElementById("eazy-fn-carousel-right");
    if (!_carouselTrack) return;

    _carouselWrapper = _carouselTrack.parentElement;
    if (!_carouselWrapper) return;

    refreshCarousel();

    var _pointerDown = false;
    var _btnScrolling = false;
    var _idleTimer = null;
    var _repositioning = false;

    function reposition() {
      if (_pointerDown || _btnScrolling || _repositioning) return;
      if (!_setWidth) return;
      var sl = _carouselWrapper.scrollLeft;

      if (sl < _setWidth * 0.5) {
        _repositioning = true;
        _carouselWrapper.scrollLeft = sl + _setWidth;
        _repositioning = false;
      } else if (sl >= _setWidth * 1.5) {
        _repositioning = true;
        _carouselWrapper.scrollLeft = sl - _setWidth;
        _repositioning = false;
      }
    }

    function onScrollIdle() {
      if (_idleTimer) clearTimeout(_idleTimer);
      if (_repositioning) return;
      _idleTimer = setTimeout(function () {
        if (!_pointerDown && !_btnScrolling) reposition();
      }, 150);
    }

    _carouselWrapper.addEventListener("scroll", onScrollIdle);

    var scrollAmount = 200;

    if (leftBtn) leftBtn.addEventListener("click", function () {
      _btnScrolling = true;
      _carouselWrapper.scrollBy({ left: -scrollAmount, behavior: "smooth" });
      setTimeout(function () { _btnScrolling = false; reposition(); }, 400);
    });
    if (rightBtn) rightBtn.addEventListener("click", function () {
      _btnScrolling = true;
      _carouselWrapper.scrollBy({ left: scrollAmount, behavior: "smooth" });
      setTimeout(function () { _btnScrolling = false; reposition(); }, 400);
    });

    /* ── Touch drag ── */
    var startX = 0, startScroll = 0;

    _carouselWrapper.addEventListener("touchstart", function (e) {
      if (!e.touches.length) return;
      _pointerDown = true;
      startX = e.touches[0].clientX;
      startScroll = _carouselWrapper.scrollLeft;
    }, { passive: true });

    _carouselWrapper.addEventListener("touchmove", function (e) {
      if (!_pointerDown || !e.touches.length) return;
      _carouselWrapper.scrollLeft = startScroll + (startX - e.touches[0].clientX);
    }, { passive: true });

    _carouselWrapper.addEventListener("touchend", function () {
      _pointerDown = false;
    }, { passive: true });

    /* ── Mouse drag ── */
    _carouselWrapper.addEventListener("mousedown", function (e) {
      _pointerDown = true;
      startX = e.clientX;
      startScroll = _carouselWrapper.scrollLeft;
      _carouselWrapper.style.cursor = "grabbing";
      e.preventDefault();
    });

    window.addEventListener("mousemove", function (e) {
      if (!_pointerDown) return;
      _carouselWrapper.scrollLeft = startScroll + (startX - e.clientX);
    });

    window.addEventListener("mouseup", function () {
      if (!_pointerDown) return;
      _pointerDown = false;
      _carouselWrapper.style.cursor = "";
    });

    window.addEventListener("resize", function () {
      _setWidth = measureSetWidth();
    });
  }

  /* ══ Init ══ */

  function init() {
    loadVisibility();
    var gridContainer = document.getElementById("eazy-functions-grid");
    if (gridContainer) renderGrid(gridContainer);
    initCarousel();
    initEazyInfo();
  }

  window.EazyFunctions = { init: init };
})();
