(function () {
  "use strict";

  var API_BASE = window.CreatorChatActions
    ? window.CreatorChatActions.API_BASE
    : "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";

  var _state = {
    mascots: [],
    mood: null,
    nextLevels: {},
    lockedMascots: [],
    quests: [],
    config: null,
    loading: false,
    initialized: false,
    happyStreakDays: 0,
    playStreakDays: 0,
    winStreakDays: 0,
    happyClaimAvailable: false,
    eazDiscountPct: 0,
  };

  function getOwnerId() {
    if (window.EazyBot && window.EazyBot.getUserId) return window.EazyBot.getUserId();
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID);
    try { return localStorage.getItem("eazy_user_id") || null; } catch (_) { return null; }
  }

  function api(op, method, body) {
    var ownerId = getOwnerId();
    var url = API_BASE + "?op=" + op + (ownerId ? "&owner_id=" + encodeURIComponent(ownerId) : "");
    var opts = { method: method || "GET", credentials: "include" };
    if (body) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  // ── Helpers ──

  function getActive() {
    for (var i = 0; i < _state.mascots.length; i++) {
      if (_state.mascots[i].is_active) return _state.mascots[i];
    }
    return _state.mascots[0] || null;
  }

  function buildSVG(m, size, animate) {
    var eyes = typeof m.svg_eyes === "string" ? JSON.parse(m.svg_eyes) : m.svg_eyes;
    var dot = typeof m.svg_dot === "string" ? JSON.parse(m.svg_dot) : m.svg_dot;
    if (!eyes || !dot) return '<div style="width:' + size + 'px;height:' + size + 'px"></div>';
    var gid = "mg-" + (m.mascot_type_id || m.id) + "-" + size;
    var s = '<svg viewBox="0 0 128 128" width="' + size + '" height="' + size + '" class="eazy-mascot-svg' + (animate ? " eazy-mascot-svg--animate" : "") + '">';
    s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">';
    s += '<stop offset="0" stop-color="' + (m.color_end || m.colorEnd || m.color) + '"/>';
    s += '<stop offset="1" stop-color="' + m.color + '"/>';
    s += '</linearGradient></defs>';
    s += '<path d="' + (m.svg_body || m.body) + '" fill="url(#' + gid + ')"/>';
    s += '<path d="' + (m.svg_face || m.face) + '" fill="#fff"/>';
    for (var i = 0; i < eyes.length; i++) {
      s += '<circle cx="' + eyes[i].cx + '" cy="' + eyes[i].cy + '" r="' + eyes[i].r + '" fill="' + m.color + '"/>';
    }
    s += '<circle cx="' + dot.cx + '" cy="' + dot.cy + '" r="' + dot.r + '" fill="url(#' + gid + ')"/>';
    if (m.svg_accessory) s += m.svg_accessory;
    s += '</svg>';
    return s;
  }

  var MOOD_MAP = { happy: "\u{1F60A}", excited: "\u{1F929}", chill: "\u{1F60E}", sleepy: "\u{1F634}", focused: "\u{1F9D0}" };
  var MOOD_LABEL = { happy: "Fröhlich", excited: "Aufgeregt", chill: "Entspannt", sleepy: "Müde", focused: "Fokussiert" };
  var TYPE_LABEL = { allrounder: "Allrounder", shop: "Shop", creator: "Creator", community: "Community", visual: "Visuell", creator_shop: "Creator+Shop", creator_visual: "Creator+Visuell", community_shop: "Community+Shop", allrounder_plus: "Allrounder+" };

  // ── Data Loading ──

  async function loadData() {
    _state.loading = true;
    renderLoading();

    try {
      var inv = await api("mascot-inventory", "GET");
      if (!inv.ok && inv.error === "missing_owner_id") {
        renderNoUser();
        return;
      }
      if (!inv.ok || !inv.mascots || inv.mascots.length === 0) {
        var init = await api("mascot-init", "POST");
        if (init.ok) {
          inv = await api("mascot-inventory", "GET");
        }
      }
      if (inv.ok) {
        _state.mascots = inv.mascots || [];
        _state.mood = inv.mood || { mood: "happy" };
        _state.nextLevels = inv.next_levels || {};
        _state.lockedMascots = inv.locked_mascots || [];
        _state.happyStreakDays = inv.happy_streak_days || 0;
        _state.playStreakDays = inv.play_streak_days || 0;
        _state.winStreakDays = inv.win_streak_days || 0;
        _state.happyClaimAvailable = !!inv.happy_claim_available;
        _state.eazDiscountPct = Number(inv.eaz_discount_pct) || 0;
        if (inv.mascot_xp_awarded > 0) {
          setTimeout(function () { showXpPopup(inv.mascot_xp_awarded, 1); }, 120);
        }
      }
    } catch (err) {
      console.error("Mascot load error:", err);
    }

    _state.loading = false;
    render();
  }

  // ── Render ──

  var SEC_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  function wrapCollapsible(id, title, count, tint, accent, body, open) {
    var cls = "eazy-mascot-section" + (open ? " is-open" : "");
    var h = '<div class="' + cls + '" data-section="' + id + '" style="--sec-tint:' + tint + ';--sec-accent:' + accent + '">';
    h += '<button type="button" class="eazy-mascot-section__header">';
    h += '<span class="eazy-mascot-section__title">' + title + '</span>';
    if (count !== null && count !== undefined) h += '<span class="eazy-mascot-section__count">' + count + '</span>';
    h += '<span class="eazy-mascot-section__chevron">' + SEC_CHEVRON + '</span>';
    h += '</button>';
    h += '<div class="eazy-mascot-section__body">' + body + '</div>';
    h += '</div>';
    h += '<div class="eazy-mascot-section__divider"></div>';
    return h;
  }

  function renderLoading() {
    var c = document.getElementById("eazy-mascot-tab");
    if (c) c.innerHTML = '<div class="eazy-mascot-loading"><div class="eazy-mascot-spinner"></div><span>Maskottchen laden\u2026</span></div>';
  }

  function renderNoUser() {
    var c = document.getElementById("eazy-mascot-tab");
    if (c) c.innerHTML = '<div class="eazy-mascot-empty"><p>Bitte melde dich an, um dein Maskottchen zu sehen.</p></div>';
  }

  function render() {
    var c = document.getElementById("eazy-mascot-tab");
    if (!c) return;
    var active = getActive();
    if (!active) { c.innerHTML = '<div class="eazy-mascot-empty"><p>Kein Maskottchen vorhanden.</p></div>'; return; }

    var mood = _state.mood || { mood: "happy" };
    var nxt = _state.nextLevels[active.id] || {};
    var h = "";

    // Preview (always visible, not collapsible)
    h += '<div class="eazy-mascot-preview" id="eazy-mascot-preview">';
    h += '<div class="eazy-mascot-preview__figure" id="eazy-mascot-figure">' + buildSVG(active, 120, true) + '</div>';
    h += '<div class="eazy-mascot-preview__info">';
    h += '<span class="eazy-mascot-preview__name" style="color:' + active.color + '">' + (active.nickname || active.name) + '</span>';
    h += '<span class="eazy-mascot-preview__mood" title="XP-Multiplikator">' + (MOOD_MAP[mood.mood] || "\u{1F60A}") + " " + (MOOD_LABEL[mood.mood] || mood.mood) + '</span>';
    h += '</div>';
    h += '<div class="eazy-mascot-level">';
    h += '<span class="eazy-mascot-level__badge" style="background:' + active.color + '">Lv. ' + active.level + '</span>';
    var pct = nxt.max_level ? 100 : Math.round((nxt.progress || 0) * 100);
    h += '<div class="eazy-mascot-level__bar"><div class="eazy-mascot-level__fill" style="width:' + pct + '%;background:' + active.color + '"></div></div>';
    h += '<span class="eazy-mascot-level__xp">' + (active.xp || 0) + ' XP' + (nxt.next_level_xp ? ' / ' + nxt.next_level_xp : '') + '</span>';
    h += '</div>';
    h += '<div class="eazy-mascot-preview__actions">';
    h += '<button type="button" class="eazy-mascot-interact-btn" data-action="pet" title="Streicheln">&#x1F44B;</button>';
    h += '<button type="button" class="eazy-mascot-interact-btn" data-action="feed" title="F\u00fcttern">&#x1F36A;</button>';
    h += '<button type="button" class="eazy-mascot-interact-btn" data-action="play" title="Spielen">&#x1F3AE;</button>';
    if (window.EazySoundEffects) {
      h += '<button type="button" class="eazy-mascot-interact-btn" data-action="sfx-test" title="' + (window.CreatorI18n?.eazy_sfx_test || 'Furz/Burp testen') + '">&#x1F4A6;</button>';
    }
    h += '</div>';
    h += '</div>';

    // Daily rewards (games + happy streak)
    var rewardsBody = renderDailyRewardsBody();
    if (rewardsBody) {
      h += wrapCollapsible("rewards", "T\u00e4gliche Belohnungen", null, "rgba(249,115,22,0.06)", "#f97316", rewardsBody, true);
    }

    // Abilities
    var abilitiesBody = renderAbilitiesBody(active);
    if (abilitiesBody) {
      var bonusCount = abilitiesBody.count;
      h += wrapCollapsible("abilities", "Aktive Boni", bonusCount + " Boni", "rgba(34,197,94,0.06)", "#22c55e", abilitiesBody.html, false);
    }

    // Owned mascots
    var ownedBody = '<div class="eazy-mascot-grid" id="eazy-mascot-grid">';
    for (var i = 0; i < _state.mascots.length; i++) {
      ownedBody += renderCard(_state.mascots[i]);
    }
    ownedBody += '</div>';
    h += wrapCollapsible("owned", "Deine Maskottchen", _state.mascots.length + " Stk.", "rgba(59,130,246,0.06)", "#3b82f6", ownedBody, true);

    // Locked mascots
    if (_state.lockedMascots.length > 0) {
      var lockedBody = '<div class="eazy-mascot-grid eazy-mascot-grid--locked">';
      for (var j = 0; j < _state.lockedMascots.length; j++) {
        lockedBody += renderLockedCard(_state.lockedMascots[j]);
      }
      lockedBody += '</div>';
      h += wrapCollapsible("locked", "Freischaltbar", _state.lockedMascots.length + " Stk.", "rgba(156,163,175,0.06)", "#9ca3af", lockedBody, false);
    }

    // Merge
    var mergeBody = renderMergeBody();
    if (mergeBody) {
      h += wrapCollapsible("merge", "Fusionieren", null, "rgba(139,92,246,0.06)", "#8b5cf6", mergeBody, false);
    }

    c.innerHTML = h;
    bindEvents();
  }

  function renderCard(m) {
    var isActive = !!m.is_active;
    var nxt = _state.nextLevels[m.id] || {};
    var cls = "eazy-mascot-card" + (isActive ? " is-active" : "");
    var h = '<button type="button" class="' + cls + '" data-mascot-id="' + m.id + '" style="--mascot-color:' + m.color + '">';
    h += '<div class="eazy-mascot-card__icon">' + buildSVG(m, 48, false) + '</div>';
    h += '<div class="eazy-mascot-card__info">';
    h += '<span class="eazy-mascot-card__name">' + (m.nickname || m.name) + '</span>';
    h += '<span class="eazy-mascot-card__type">' + (TYPE_LABEL[m.type_category] || m.type_category) + '</span>';
    h += '</div>';
    h += '<span class="eazy-mascot-card__level" style="background:' + m.color + '">Lv.' + m.level + '</span>';
    if (isActive) h += '<span class="eazy-mascot-card__badge">Aktiv</span>';
    h += '</button>';
    return h;
  }

  function renderLockedCard(m) {
    var h = '<div class="eazy-mascot-card eazy-mascot-card--locked">';
    h += '<div class="eazy-mascot-card__icon eazy-mascot-card__icon--locked"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>';
    h += '<div class="eazy-mascot-card__info">';
    h += '<span class="eazy-mascot-card__name">' + m.name + '</span>';
    h += '<span class="eazy-mascot-card__type">Level ' + m.unlock_level + ' benötigt</span>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  function renderDailyRewardsBody() {
    var happyPct = Math.min(100, Math.round((_state.happyStreakDays / 5) * 100));
    var playPct = Math.min(100, Math.round((_state.playStreakDays / 5) * 100));
    var winPct = Math.min(100, Math.round((_state.winStreakDays / 5) * 100));
    var happyHint = _state.happyClaimAvailable
      ? "Heute verf\u00fcgbar \u2014 streichle Eazy wenn er fr\u00f6hlich ist!"
      : (_state.mood && _state.mood.mood === "happy" ? "Heute bereits abgeholt" : "Eazy muss fr\u00f6hlich sein (Streicheln)");
    var h = '<div class="eazy-mascot-quests">';
    h += '<div class="eazy-mascot-quest"><div class="eazy-mascot-quest__header">';
    h += '<span class="eazy-mascot-quest__title">\u{1F3AE} Daily Games</span><span class="eazy-mascot-quest__xp">+10 XP / +15 bei Sieg</span></div>';
    h += '<p class="eazy-mascot-quest__desc">Spiele t\u00e4glich ein Minigame im Games-Tab.</p>';
    h += '<div class="eazy-mascot-quest__progress"><div class="eazy-mascot-quest__bar"><div class="eazy-mascot-quest__fill" style="width:' + playPct + '%"></div></div>';
    h += '<span class="eazy-mascot-quest__count">Spiel-Streak ' + _state.playStreakDays + '/5</span></div></div>';
    h += '<div class="eazy-mascot-quest"><div class="eazy-mascot-quest__header">';
    h += '<span class="eazy-mascot-quest__title">\u{1F3C6} Gewinn-Streak</span><span class="eazy-mascot-quest__xp">+100 XP bei 5 Tagen</span></div>';
    h += '<p class="eazy-mascot-quest__desc">Gewinne das Daily Game an aufeinanderfolgenden Tagen.</p>';
    h += '<div class="eazy-mascot-quest__progress"><div class="eazy-mascot-quest__bar"><div class="eazy-mascot-quest__fill" style="width:' + winPct + '%"></div></div>';
    h += '<span class="eazy-mascot-quest__count">Sieg-Streak ' + _state.winStreakDays + '/5</span></div></div>';
    h += '<div class="eazy-mascot-quest' + (_state.happyClaimAvailable ? " is-claimable" : "") + '"><div class="eazy-mascot-quest__header">';
    h += '<span class="eazy-mascot-quest__title">\u{1F60A} Happy-Bonus</span><span class="eazy-mascot-quest__xp">+15 XP / Tag</span></div>';
    h += '<p class="eazy-mascot-quest__desc">' + happyHint + '</p>';
    h += '<div class="eazy-mascot-quest__progress"><div class="eazy-mascot-quest__bar"><div class="eazy-mascot-quest__fill" style="width:' + happyPct + '%"></div></div>';
    h += '<span class="eazy-mascot-quest__count">Happy-Streak ' + _state.happyStreakDays + '/5</span></div></div>';
    h += '</div>';
    return h;
  }

  function eazyDiscountPctForLevel(level) {
    var lv = Math.max(1, parseInt(level, 10) || 1);
    if (lv <= 1) return 0;
    return Math.min((lv - 1) * 2, 18);
  }

  function renderAbilitiesBody(m) {
    if (m.mascot_type_id !== "eazy") return null;
    var discount = _state.eazDiscountPct > 0
      ? Math.round(_state.eazDiscountPct * 100)
      : eazyDiscountPctForLevel(m.level);
    if (discount <= 0) return null;
    var pctBar = Math.min(100, Math.round(discount / 18 * 100));
    var shopIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>';
    var h = '<div class="eazy-mascot-stats"><div class="eazy-mascot-stats__grid">';
    h += '<div class="eazy-mascot-stat"><div class="eazy-mascot-stat__header">';
    h += '<span class="eazy-mascot-stat__icon">' + shopIcon + '</span>';
    h += '<span class="eazy-mascot-stat__label">EAZ-Rabatt</span>';
    h += '<span class="eazy-mascot-stat__value">' + discount + '% auf alle EAZ-Kosten</span>';
    h += '</div><div class="eazy-mascot-stat__bar"><div class="eazy-mascot-stat__fill" style="width:' + pctBar + '%;background:' + m.color + '"></div></div></div>';
    h += '<p class="eazy-mascot-stat__skill-hint"><button type="button" class="eazy-mascot-stat__skill-link" data-eaz-economy-open>Activate cost bonuses in the EAZ Skill Tree</button></p>';
    h += '</div></div>';
    return { html: h, count: 1 };
  }

  function renderMergeBody() {
    var eligible = _state.mascots.filter(function (m) { return m.level >= 10 && !m.is_merged; });
    if (eligible.length < 2) return "";

    var h = '<div class="eazy-mascot-merge">';
    h += '<p class="eazy-mascot-merge__desc">W\u00e4hle zwei Level 10 Maskottchen zum Fusionieren. Beide werden verbraucht und ein neues, st\u00e4rkeres Maskottchen entsteht.</p>';

    h += '<div class="eazy-mascot-merge__select">';
    h += '<select id="eazy-merge-a" class="eazy-mascot-merge__dropdown">';
    h += '<option value="">Maskottchen A</option>';
    for (var i = 0; i < eligible.length; i++) {
      h += '<option value="' + eligible[i].id + '">' + eligible[i].name + ' (Lv.' + eligible[i].level + ')</option>';
    }
    h += '</select>';
    h += '<span class="eazy-mascot-merge__plus">+</span>';
    h += '<select id="eazy-merge-b" class="eazy-mascot-merge__dropdown">';
    h += '<option value="">Maskottchen B</option>';
    for (var j = 0; j < eligible.length; j++) {
      h += '<option value="' + eligible[j].id + '">' + eligible[j].name + ' (Lv.' + eligible[j].level + ')</option>';
    }
    h += '</select>';
    h += '</div>';

    h += '<div id="eazy-merge-preview" class="eazy-mascot-merge__preview"></div>';
    h += '<button type="button" id="eazy-merge-btn" class="eazy-mascot-merge__btn" disabled>Fusionieren</button>';
    h += '</div>';
    return h;
  }

  // ── Events ──

  function bindEvents() {
    document.querySelectorAll(".eazy-mascot-section__header").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sec = btn.closest(".eazy-mascot-section");
        if (sec) sec.classList.toggle("is-open");
      });
    });

    var grid = document.getElementById("eazy-mascot-grid");
    if (grid) grid.addEventListener("click", onCardClick);

    document.querySelectorAll(".eazy-mascot-interact-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = btn.getAttribute("data-action");
        if (action === "sfx-test") {
          if (window.EazySoundEffects) window.EazySoundEffects.play();
          return;
        }
        onInteract(action);
      });
    });

    var figure = document.getElementById("eazy-mascot-figure");
    if (figure) figure.addEventListener("click", function () { onInteract("pet"); });

    var mergeA = document.getElementById("eazy-merge-a");
    var mergeB = document.getElementById("eazy-merge-b");
    if (mergeA && mergeB) {
      mergeA.addEventListener("change", onMergeSelectionChange);
      mergeB.addEventListener("change", onMergeSelectionChange);
    }
    var mergeBtn = document.getElementById("eazy-merge-btn");
    if (mergeBtn) mergeBtn.addEventListener("click", onMerge);
  }

  function onCardClick(e) {
    var card = e.target.closest(".eazy-mascot-card");
    if (!card || card.classList.contains("eazy-mascot-card--locked")) return;
    var id = card.getAttribute("data-mascot-id");
    if (!id) return;
    var active = getActive();
    if (active && String(active.id) === id) return;

    api("mascot-select", "POST", { mascot_id: parseInt(id) }).then(function () {
      loadData();
    });
  }

  var _interactCooldown = false;
  function onInteract(action) {
    if (_interactCooldown) return;
    _interactCooldown = true;

    var figure = document.getElementById("eazy-mascot-figure");
    if (figure) {
      figure.classList.remove("eazy-mascot--bounce", "eazy-mascot--wiggle", "eazy-mascot--spin");
      void figure.offsetWidth;
      var anim = { pet: "eazy-mascot--wiggle", feed: "eazy-mascot--bounce", play: "eazy-mascot--spin" };
      figure.classList.add(anim[action] || "eazy-mascot--wiggle");
      spawnParticles(figure, action === "pet" ? "\u2764\uFE0F" : action === "feed" ? "\u{1F36A}" : "\u2B50");
    }

    api("mascot-interact", "POST", { action: action }).then(function (res) {
      if (res.ok) {
        var moodEl = document.querySelector(".eazy-mascot-preview__mood");
        if (moodEl) moodEl.textContent = (MOOD_MAP[res.mood] || "\u{1F60A}") + " " + (MOOD_LABEL[res.mood] || res.mood);

        if (res.xp_awarded) showXpPopup(res.xp_awarded, 1);

        if (res.leveled_up) showLevelUp(res.level);

        if (res.daily_xp_claimed || res.leveled_up) {
          loadData();
        } else {
          _state.mood = { mood: res.mood, streak_days: res.streak_days };
          _state.happyStreakDays = res.happy_streak_days || _state.happyStreakDays;
          _state.happyClaimAvailable = !!res.happy_claim_available;
        }
      }
      if (res.error === "cooldown") {
        setTimeout(function () { _interactCooldown = false; }, (res.cooldown_remaining || 5) * 1000);
      } else {
        setTimeout(function () { _interactCooldown = false; }, 1500);
      }
    }).catch(function () { _interactCooldown = false; });
  }

  function onMergeSelectionChange() {
    var a = document.getElementById("eazy-merge-a");
    var b = document.getElementById("eazy-merge-b");
    var btn = document.getElementById("eazy-merge-btn");
    var preview = document.getElementById("eazy-merge-preview");
    if (!a || !b || !btn || !preview) return;

    var idA = a.value;
    var idB = b.value;
    if (!idA || !idB || idA === idB) {
      btn.disabled = true;
      preview.innerHTML = "";
      return;
    }

    preview.innerHTML = '<div class="eazy-mascot-spinner"></div>';
    fetch(API_BASE + "?op=mascot-merge-preview&owner_id=" + encodeURIComponent(getOwnerId()) + "&mascot_id_a=" + idA + "&mascot_id_b=" + idB, { credentials: "include" }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.ok && res.result_type) {
        btn.disabled = false;
        preview.innerHTML = '<div class="eazy-mascot-merge__result">' + buildSVG(res.result_type, 64, false) + '<span>' + res.result_type.name + '</span></div>';
      } else {
        btn.disabled = true;
        preview.innerHTML = '<span class="eazy-mascot-merge__error">' + (res.error || "Merge nicht möglich") + '</span>';
      }
    });
  }

  function onMerge() {
    var a = document.getElementById("eazy-merge-a");
    var b = document.getElementById("eazy-merge-b");
    if (!a || !b || !a.value || !b.value) return;

    if (!confirm("Beide Maskottchen werden verbraucht! Fortfahren?")) return;

    api("mascot-merge", "POST", { mascot_id_a: parseInt(a.value), mascot_id_b: parseInt(b.value) }).then(function (res) {
      if (res.ok) {
        showMergeSuccess(res.new_mascot);
        loadData();
      }
    });
  }

  // ── Visual effects ──

  function spawnParticles(parent, emoji) {
    for (var i = 0; i < 5; i++) {
      var p = document.createElement("span");
      p.className = "eazy-mascot-particle";
      p.textContent = emoji;
      p.style.left = (20 + Math.random() * 60) + "%";
      p.style.animationDelay = (i * 0.1) + "s";
      parent.appendChild(p);
      setTimeout(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }, 1200, p);
    }
  }

  function showXpPopup(amount, mult) {
    var fig = document.getElementById("eazy-mascot-figure");
    if (!fig) return;
    var el = document.createElement("div");
    el.className = "eazy-mascot-xp-popup";
    el.textContent = "+" + amount + " XP" + (mult > 1 ? " (x" + mult.toFixed(1) + ")" : "");
    fig.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1500);
  }

  function showLevelUp(level) {
    var fig = document.getElementById("eazy-mascot-figure");
    if (!fig) return;
    var el = document.createElement("div");
    el.className = "eazy-mascot-levelup";
    el.textContent = "LEVEL " + level + "!";
    fig.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2500);
  }

  function showMergeSuccess(mascot) {
    var c = document.getElementById("eazy-mascot-tab");
    if (!c) return;
    var el = document.createElement("div");
    el.className = "eazy-mascot-merge-success";
    el.innerHTML = '<div class="eazy-mascot-merge-success__inner">' + buildSVG(mascot, 96, true) + '<h3>Neues Maskottchen!</h3><p>' + mascot.name + '</p></div>';
    c.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
  }

  function updateXpBar(m) {
    var nxt = _state.nextLevels[m.id];
    if (!nxt) return;
    // Recalculate from updated xp
    if (nxt.next_level_xp) {
      var currLvlXp = nxt.next_level_xp - nxt.xp_needed;
      nxt.xp_in_level = m.xp - currLvlXp;
      nxt.progress = nxt.xp_needed > 0 ? Math.min(1, nxt.xp_in_level / nxt.xp_needed) : 1;
    }
    var bar = document.querySelector(".eazy-mascot-level__fill");
    var xpText = document.querySelector(".eazy-mascot-level__xp");
    if (bar) bar.style.width = Math.round((nxt.progress || 0) * 100) + "%";
    if (xpText) xpText.textContent = m.xp + " XP" + (nxt.next_level_xp ? " / " + nxt.next_level_xp : "");
  }

  // ── Init ──

  async function init() {
    if (!_state.config) {
      try {
        var cfg = await api("mascot-config", "GET");
        if (cfg.ok) _state.config = cfg;
      } catch (_) {}
    }
    await loadData();
    _state.initialized = true;
  }

  window.EazyMascotTab = {
    init: init,
    getActiveMascot: getActive,
    getMascots: function () { return _state.mascots; },
    showGameXp: function (amount) {
      if (amount > 0) showXpPopup(amount, 1);
      loadData();
    },
  };
})();
