/**
 * Eazy Tips – Intelligent idle messages & function tips
 * Shows contextual messages in two contexts:
 *   - Page (modal closed): Speech bubble near Eazy icon (reuses eazy-thought)
 *   - Chat modal (open): Floating tip bubble above input
 * Passive idle: 1s after modal opens, then every 5s of inactivity
 * Click tips: When send button clicked with empty input
 * Also shows periodic messages on the page when modal is closed
 * Depends on: eazy-bot.js (window.EazyBot) – optional for context
 */
(function () {
  "use strict";

  var MODAL_FIRST_MS  = 2000;
  var MODAL_INTERVAL  = 10000;
  var PAGE_INTERVAL   = 90000;
  var MODAL_DISPLAY   = 4000;
  var PAGE_DISPLAY    = 6000;

  function _S(key) { return window.EazySettings ? window.EazySettings.isMessageTypeEnabled(key) : true; }
  function _Freq(key) { return window.EazySettings ? window.EazySettings.getFrequencyMultiplier(key) : 1; }

  /* ═══════════════════════════════════════════════════════════════
   *  MESSAGE POOLS
   * ═══════════════════════════════════════════════════════════════ */

  var IDLE = {
    morning: [
      { id: "ti_mo1", text: "Good morning! Ready for something new?" },
      { id: "ti_mo2", text: "Up early? The best ideas come in the morning." },
      { id: "ti_mo3", text: "Coffee + Eazpire = a great start." },
      { id: "ti_mo4", text: "Creativity is strongest in the morning." },
      { id: "ti_mo5", text: "Rise and shine! Already seen the latest drops?" },
      { id: "ti_mo6", text: "Good morning! New day, new possibilities." }
    ],
    midday: [
      { id: "ti_mi1", text: "Lunch break? Browsing is relaxing too." },
      { id: "ti_mi2", text: "Afternoon = perfect inspiration time." },
      { id: "ti_mi3", text: "Half-time! What have you discovered today?" },
      { id: "ti_mi4", text: "Most designs are created in the afternoon." },
      { id: "ti_mi5", text: "A great afternoon for a new design." }
    ],
    evening: [
      { id: "ti_ev1", text: "After-work mode. Go with the flow." },
      { id: "ti_ev2", text: "Shopping at night? Fewer distractions, more style." },
      { id: "ti_ev3", text: "The evening is yours. Treat yourself." },
      { id: "ti_ev4", text: "Evening tip: save your favorite designs." },
      { id: "ti_ev5", text: "Relaxed evening browsing - great plan." }
    ],
    night: [
      { id: "ti_ni1", text: "Night owl? Me too." },
      { id: "ti_ni2", text: "The best ideas come at night..." },
      { id: "ti_ni3", text: "Late-night shopping - no judgment." },
      { id: "ti_ni4", text: "The night is young. So are we." },
      { id: "ti_ni5", text: "Sleepless? Then let's get creative." }
    ],
    fun: [
      { id: "ti_f1", text: "Silence... too quiet. Everything okay?" },
      { id: "ti_f2", text: "Fun fact: I never take coffee breaks." },
      { id: "ti_f3", text: "If you do not ask anything, I will talk to myself." },
      { id: "ti_f4", text: "Plot twist: I am not just cute, I am useful too." },
      { id: "ti_f5", text: "Just noticed: we are a great team." },
      { id: "ti_f6", text: "I am waiting... patiently... like a pro." },
      { id: "ti_f7", text: "Did you know? I can create designs in chat." },
      { id: "ti_f8", text: "Bored? Ask me anything!" },
      { id: "ti_f9", text: "I am always here. Literally." },
      { id: "ti_f10", text: "I have no humor - but I still try." }
    ],
    wisdom: [
      { id: "ti_w1", text: "Doing is like wanting - just stronger." },
      { id: "ti_w2", text: "The first step is always the most important." },
      { id: "ti_w3", text: "Creativity does not require perfection." },
      { id: "ti_w4", text: "Done is better than perfect." },
      { id: "ti_w5", text: "Small steps, big impact." },
      { id: "ti_w6", text: "Inspiration does not come from waiting." },
      { id: "ti_w7", text: "Just do it. Or simply start." },
      { id: "ti_w8", text: "Every day is a good day to start something new." },
      { id: "ti_w9", text: "Perfection is the enemy of done." },
      { id: "ti_w10", text: "You do not need to know everything - just where to ask." }
    ]
  };

  var TIPS = {
    shop: [
      { id: "tp_s1", text: "Use the search bar for quick results." },
      { id: "tp_s2", text: "In the shop you will find current drops and bestsellers." },
      { id: "tp_s3", text: "Favorite products and find them again later." },
      { id: "tp_s4", text: "Check new arrivals regularly." },
      { id: "tp_s5", text: "With an account you can save your cart." },
      { id: "tp_s6", text: "Click a product for details and variants." }
    ],
    creator: [
      { id: "tp_c1", text: "Use Creator to place your own designs on products." },
      { id: "tp_c2", text: "Try different styles for unique results." },
      { id: "tp_c3", text: "Upload an image and use it as a design base." },
      { id: "tp_c4", text: "Your designs are saved automatically." },
      { id: "tp_c5", text: "After creating: publish and sell." },
      { id: "tp_c6", text: "Use AI generation for creative designs." }
    ],
    general: [
      { id: "tp_g1", text: "Create designs directly in chat. Open the top menu." },
      { id: "tp_g2", text: "Need help? Just type your question." },
      { id: "tp_g3", text: "You can use multiple chats at the same time." },
      { id: "tp_g4", text: "Chat history is saved and available across devices." },
      { id: "tp_g5", text: "Click + to start a new chat." },
      { id: "tp_g6", text: "Type 'Support' to talk to a human." },
      { id: "tp_g7", text: "Check the sidebar for notifications and active jobs." },
      { id: "tp_g8", text: "Open chat history to view older conversations." }
    ]
  };

  /* ═══════════════════════════════════════════════════════════════
   *  STATE
   * ═══════════════════════════════════════════════════════════════ */

  var FUNCTION_TIPS = {
    "interests": [
      { id: "ft_int1", text: "Choose interests that match you to get better suggestions." },
      { id: "ft_int2", text: "You can select up to 10 interests." },
      { id: "ft_int3", text: "New interest? Type it and I will suggest matching terms." },
    ],
    "community": [
      { id: "ft_com1", text: "Share your referral link to grow your network." },
      { id: "ft_com2", text: "Your network has 10 levels and each level earns commission." },
      { id: "ft_com3", text: "Nutze Promo-Codes um neue Partner zu gewinnen." },
    ],
    "generate-design": [
      { id: "ft_gen1", text: "The more detailed your prompt, the better the result." },
      { id: "ft_gen2", text: "You can upload your own image as a reference." },
      { id: "ft_gen3", text: "Try different styles for unique designs." },
      { id: "ft_gen4", text: "After generation, you can publish the design directly." },
    ],
    "my-creations": [
      { id: "ft_mc1", text: "Click a design to see more options." },
      { id: "ft_mc2", text: "You can filter designs by date or type." },
      { id: "ft_mc3", text: "Unsaved designs are deleted after 30 days." },
    ],
    "publish": [
      { id: "ft_pub1", text: "Select a design first, then choose products." },
      { id: "ft_pub2", text: "You can publish to multiple products at once." },
      { id: "ft_pub3", text: "After publishing, you can find the product in the shop." },
    ],
    "my-orders": [
      { id: "ft_ord1", text: "Click an order for details and tracking." },
      { id: "ft_ord2", text: "If there is an issue with an order, report it." },
      { id: "ft_ord3", text: "You can see your last 10 orders here." },
    ],
    "product-search": [
      { id: "ft_ps1", text: "Enter a search term or choose a category." },
      { id: "ft_ps2", text: "You can add products directly to your cart." },
      { id: "ft_ps3", text: "Mark favorites with the heart icon for later." },
    ],
    "browse-shop": [
      { id: "ft_bs1", text: "Discover new products and trends." },
      { id: "ft_bs2", text: "Recommendations are based on your interests." },
      { id: "ft_bs3", text: "You can search for something specific anytime." },
    ],
    "size-ai": [
      { id: "ft_sa1", text: "Enter your measurements and I will suggest the best size." },
      { id: "ft_sa2", text: "Referenzgr\u00f6\u00dfen helfen f\u00fcr noch genauere Empfehlungen." },
      { id: "ft_sa3", text: "Die Empfehlung gilt f\u00fcr alle Produkttypen." },
    ],
    "wardrobe": [
      { id: "ft_wd1", text: "Kombiniere bis zu 9 Teile pro Outfit." },
      { id: "ft_wd2", text: "Lass dir ein AI-Bild von deinem Outfit generieren!" },
      { id: "ft_wd3", text: "You can save up to 20 outfits." },
    ],
    "my-mockups": [
      { id: "ft_mk1", text: "Upload a photo and I will generate mockups for different products." },
      { id: "ft_mk2", text: "W\u00e4hle den passenden Person-Typ f\u00fcr realistischere Ergebnisse." },
      { id: "ft_mk3", text: "Mockups eignen sich perfekt als Produktvorschau." },
    ],
    "hero-images": [
      { id: "ft_hi1", text: "Hero Images kosten 0.5 EAZ \u2013 sie werden als Titelbilder im Shop angezeigt." },
      { id: "ft_hi2", text: "Choose up to 5 products for one hero image." },
      { id: "ft_hi3", text: "Ver\u00f6ffentlichte Hero Images rotieren zuf\u00e4llig auf deiner Shop-Seite." },
    ],
    "creator-image": [
      { id: "ft_ci1", text: "Your avatar is optimized to 512x512 and your cover to 800x300." },
      { id: "ft_ci2", text: "You can upload images or generate them with AI." },
      { id: "ft_ci3", text: "Your creator image appears on your profile and products." },
    ],
    "creator-settings": [
      { id: "ft_cs1", text: "You can create up to 5 creator names." },
      { id: "ft_cs2", text: "The active creator defines the name you publish under." },
      { id: "ft_cs3", text: "Filter settings decide which products you see." },
    ],
    "balance": [
      { id: "ft_bl1", text: "EAZ is your currency for premium features like hero images." },
      { id: "ft_bl2", text: "You earn EAZ by creating designs, sales, and daily login." },
      { id: "ft_bl3", text: "Your max balance increases with your level." },
    ],
    "level": [
      { id: "ft_lv1", text: "Your level determines your maximum EAZ balance." },
      { id: "ft_lv2", text: "You gain XP through activities like creating designs and publishing products." },
      { id: "ft_lv3", text: "There are 10 levels and each unlocks new benefits." },
    ],
  };

  var _activeFunction   = null;
  var _shownFnTips      = [];
  var _modalFirstTimer  = null;
  var _modalLoopTimer   = null;
  var _pageTimer        = null;
  var _isModalOpen      = false;
  var _lastActivity     = Date.now();
  var _shownIdle        = [];
  var _shownTips        = [];
  var _tipBubbleEl      = null;
  var _tipHideTimer     = null;

  /* ═══════════════════════════════════════════════════════════════
   *  HELPERS
   * ═══════════════════════════════════════════════════════════════ */

  function getTimeSlot() {
    var h = new Date().getHours();
    if (h >= 6 && h < 12) return "morning";
    if (h >= 12 && h < 17) return "midday";
    if (h >= 17 && h < 22) return "evening";
    return "night";
  }

  function pickFrom(pool, seen) {
    if (!pool || !pool.length) return null;
    var unseen = pool.filter(function (m) { return seen.indexOf(m.id) === -1; });
    if (!unseen.length) { seen.length = 0; unseen = pool; }
    var msg = unseen[Math.floor(Math.random() * unseen.length)];
    seen.push(msg.id);
    return msg;
  }

  function pickIdle() {
    var slot = getTimeSlot();
    var timeMsgs  = IDLE[slot] || [];
    var funMsgs   = IDLE.fun || [];
    var wisdomMsgs = IDLE.wisdom || [];

    var r = Math.random();
    var pool;
    if (r < 0.3 && timeMsgs.length)       pool = timeMsgs;
    else if (r < 0.65 && funMsgs.length)   pool = funMsgs;
    else                                    pool = wisdomMsgs;

    return pickFrom(pool, _shownIdle);
  }

  function pickTip() {
    if (_activeFunction && FUNCTION_TIPS[_activeFunction]) {
      var fnPool = FUNCTION_TIPS[_activeFunction];
      var fnTip = pickFrom(fnPool, _shownFnTips);
      if (fnTip) return fnTip;
    }
    var bot = window.EazyBot;
    var location = bot ? bot.getLocation() : "shop";
    var locTips = TIPS[location] || [];
    var genTips = TIPS.general || [];
    var pool = Math.random() < 0.5 && locTips.length ? locTips : genTips;
    return pickFrom(pool, _shownTips);
  }

  function setActiveFunction(fnId) {
    _activeFunction = fnId || null;
    _shownFnTips = [];
    if (fnId && FUNCTION_TIPS[fnId] && _isModalOpen) {
      showModalTip("Click me for more details about this function!");
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  MODAL TIP BUBBLE (floating above input)
   * ═══════════════════════════════════════════════════════════════ */

  function ensureTipBubble() {
    if (_tipBubbleEl) return _tipBubbleEl;
    var inputWrap = document.querySelector("#creator-chat-view-chat .creator-chat__input-wrap");
    if (!inputWrap) return null;
    var el = document.createElement("div");
    el.className = "creator-chat__tip-bubble";
    el.id = "creator-chat-tip-bubble";
    el.setAttribute("aria-live", "polite");
    inputWrap.parentElement.insertBefore(el, inputWrap);
    _tipBubbleEl = el;
    return el;
  }

  function showModalTip(text) {
    if (window.__eaz_mode_active || window.__eaz_guide_active) return;
    var el = ensureTipBubble();
    if (!el) return;
    if (_tipHideTimer) clearTimeout(_tipHideTimer);
    el.textContent = text;
    requestAnimationFrame(function () {
      el.classList.add("is-visible");
    });
    _tipHideTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, MODAL_DISPLAY);
  }

  function hideModalTip() {
    if (_tipBubbleEl) _tipBubbleEl.classList.remove("is-visible");
    if (_tipHideTimer) { clearTimeout(_tipHideTimer); _tipHideTimer = null; }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  PAGE BUBBLE (reuse existing eazy-thought element)
   * ═══════════════════════════════════════════════════════════════ */

  function isPageBubbleActive() {
    var el = document.getElementById("eazy-thought");
    return el && el.classList.contains("show");
  }

  function showPageBubble(text) {
    if (isPageBubbleActive()) return;
    var el = document.getElementById("eazy-thought");
    if (!el) return;
    var textEl = el.querySelector(".eazy-thought-text");
    if (textEl) textEl.textContent = text;
    el.classList.remove("eazy-thought--dream");
    el.classList.add("show");
    setTimeout(function () { el.classList.remove("show"); }, PAGE_DISPLAY);
  }

  /* ═══════════════════════════════════════════════════════════════
   *  DISPLAY LOGIC
   * ═══════════════════════════════════════════════════════════════ */

  function showIdle() {
    if (window.__eaz_mode_active || window.__eaz_guide_active) return;
    var typeKey = _isModalOpen ? "messages_idle_tips_chat" : "messages_idle_tips_page";
    if (!_S(typeKey)) return;
    var msg = pickIdle();
    if (!msg) return;
    if (_isModalOpen) {
      showModalTip(msg.text);
    } else {
      showPageBubble(msg.text);
    }
    if (window.playEazyVoice) window.playEazyVoice(msg.id);
    if (window.EazyBot) {
      window.EazyBot.logMessageShown("tip_idle", msg.id, window.EazyBot.getContext());
    }
  }

  function showTip() {
    if (window.__eaz_mode_active || window.__eaz_guide_active) return;
    if (_activeFunction && !_S("messages_function_tips")) return;
    if (!_activeFunction) {
      var typeKey = _isModalOpen ? "messages_idle_tips_chat" : "messages_idle_tips_page";
      if (!_S(typeKey)) return;
    }
    var msg = pickTip();
    if (!msg) return;
    if (_isModalOpen) {
      showModalTip(msg.text);
    } else {
      showPageBubble(msg.text);
    }
    if (window.playEazyVoice) window.playEazyVoice(msg.id);
    if (window.EazyBot) {
      window.EazyBot.logMessageShown("tip_click", msg.id, window.EazyBot.getContext());
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  MODAL IDLE TIMER
   * ═══════════════════════════════════════════════════════════════ */

  function startModalIdle() {
    stopModalIdle();
    _lastActivity = Date.now();
    var interval = Math.round(MODAL_INTERVAL * _Freq("frequency_idle_tips_chat"));
    _modalFirstTimer = setTimeout(function () {
      showIdle();
      _modalLoopTimer = setInterval(function () {
        if (Date.now() - _lastActivity >= interval - 500) {
          showIdle();
        }
      }, interval);
    }, MODAL_FIRST_MS);
  }

  function stopModalIdle() {
    if (_modalFirstTimer)  { clearTimeout(_modalFirstTimer);  _modalFirstTimer = null; }
    if (_modalLoopTimer)   { clearInterval(_modalLoopTimer);  _modalLoopTimer = null; }
    hideModalTip();
  }

  function resetActivity() {
    _lastActivity = Date.now();
    hideModalTip();
  }

  /* ═══════════════════════════════════════════════════════════════
   *  PAGE IDLE TIMER
   * ═══════════════════════════════════════════════════════════════ */

  function startPageIdle() {
    stopPageIdle();
    var interval = Math.round(PAGE_INTERVAL * _Freq("frequency_idle_tips_page"));
    _pageTimer = setInterval(function () {
      if (_isModalOpen) return;
      var bot = window.EazyBot;
      if (bot && bot.isSleepTime()) return;
      showIdle();
    }, interval);
  }

  function stopPageIdle() {
    if (_pageTimer) { clearInterval(_pageTimer); _pageTimer = null; }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  PUBLIC EVENT HANDLERS
   * ═══════════════════════════════════════════════════════════════ */

  function onModalOpen() {
    _isModalOpen = true;
    stopPageIdle();
    startModalIdle();
  }

  function onModalClose() {
    _isModalOpen = false;
    stopModalIdle();
    startPageIdle();
  }

  function onEmptySendClick() {
    resetActivity();
    showTip();
  }

  function onUserActivity() {
    resetActivity();
  }

  /* ═══════════════════════════════════════════════════════════════
   *  INIT
   * ═══════════════════════════════════════════════════════════════ */

  function init() {
    document.body.addEventListener("creator-chat-open", onModalOpen);
    document.body.addEventListener("creator-chat-close", onModalClose);

    var input = document.getElementById("creator-chat-input");
    if (input) {
      input.addEventListener("input", onUserActivity);
      input.addEventListener("focus", onUserActivity);
    }

    var msgArea = document.getElementById("creator-chat-messages");
    if (msgArea) {
      msgArea.addEventListener("scroll", onUserActivity, { passive: true });
      msgArea.addEventListener("click", onUserActivity);
    }

    startPageIdle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.EazyTips = {
    init: init,
    onModalOpen: onModalOpen,
    onModalClose: onModalClose,
    onEmptySendClick: onEmptySendClick,
    onUserActivity: onUserActivity,
    showTip: showTip,
    showIdle: showIdle,
    setActiveFunction: setActiveFunction,
    getActiveFunction: function () { return _activeFunction; }
  };

  function toEnglishTipText(text) {
    if (!text || typeof text !== "string") return text;
    var out = text;
    var replacements = [
      [/Guten Morgen/g, "Good morning"],
      [/Bereit für was Neues\?/g, "Ready for something new?"],
      [/Früh dran\?/g, "Early start?"],
      [/Die besten Ideen kommen morgens\./g, "The best ideas come in the morning."],
      [/Mittagspause\?/g, "Lunch break?"],
      [/Abends shoppen\?/g, "Shopping in the evening?"],
      [/Nachts kommen die besten Ideen/g, "The best ideas come at night"],
      [/Nachteule\?/g, "Night owl?"],
      [/Nutze die Suchleiste für schnelle Ergebnisse\./g, "Use the search bar for quick results."],
      [/Produkte favorisieren und später wiederfinden!/g, "Save products to favorites and find them later!"],
      [/Mit Account kannst du deinen Warenkorb speichern\./g, "With an account you can save your cart."],
      [/Klick auf ein Produkt für Details und Varianten\./g, "Click a product for details and variants."],
      [/Brauchst du Hilfe\?/g, "Need help?"],
      [/Schreib einfach deine Frage!/g, "Just type your question!"],
      [/Du kannst mehrere Chats gleichzeitig nutzen\./g, "You can use multiple chats at the same time."],
      [/Chat-Verläufe sind gespeichert und geräteübergreifend verfügbar\./g, "Chat history is saved and available across devices."],
      [/Wähle Interessen aus, die zu dir passen/g, "Choose interests that fit you"],
      [/Du kannst bis zu 10 Interessen auswählen\./g, "You can select up to 10 interests."],
      [/Je detaillierter dein Prompt, desto besser das Ergebnis\./g, "The more detailed your prompt, the better the result."],
      [/Produkte kannst du direkt in den Warenkorb legen\./g, "You can add products directly to the cart."],
      [/Klicke auf eine Bestellung für Details und Tracking\./g, "Click an order for details and tracking."],
      [/EAZ ist deine Währung/g, "EAZ is your currency"],
      [/Dein Level bestimmt dein maximales EAZ-Guthaben\./g, "Your level defines your maximum EAZ balance."]
    ];
    for (var i = 0; i < replacements.length; i++) out = out.replace(replacements[i][0], replacements[i][1]);
    return out;
  }

  function translateTipsNode(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) translateTipsNode(node[i]);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.text === "string") node.text = toEnglishTipText(node.text);
      var keys = Object.keys(node);
      for (var j = 0; j < keys.length; j++) translateTipsNode(node[keys[j]]);
    }
  }

  translateTipsNode(IDLE);
  translateTipsNode(TIPS);
  translateTipsNode(FUNCTION_TIPS);
})();
