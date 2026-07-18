/**
 * Marketing Screen – skill-tree nav (IDEA-039)
 * Parents: Content Creation | Content Publish | Promotion
 * Children expand below with connector lines; Hero Images opens fullscreen modal.
 */
(function () {
  'use strict';

  var currentSubTab = '';
  var currentContentTab = '';
  var currentParent = '';

  function bumpEazyHeaderUi() {
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }
  }

  function i18nMarketing(key, fallback) {
    try {
      var m = window.CreatorI18n && window.CreatorI18n.marketing;
      if (m && m[key] != null && String(m[key]).indexOf('Translation missing') === -1) {
        return String(m[key]);
      }
    } catch (e) {}
    return fallback;
  }

  function setPanelHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle('creator-marketing-panel--hidden', hidden);
    if (hidden) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  function getRoot() {
    return document.getElementById('creatorMarketing');
  }

  function setParentExpanded(parent, expanded) {
    document.querySelectorAll('.cmkt-card--parent').forEach(function (btn) {
      var isThis = btn.dataset.mktParent === parent;
      btn.classList.toggle('is-active', !!(expanded && isThis));
      btn.setAttribute('aria-expanded', expanded && isThis ? 'true' : 'false');
    });
    document.querySelectorAll('[data-mkt-branch]').forEach(function (branch) {
      var show = expanded && branch.getAttribute('data-mkt-branch') === parent;
      if (show) branch.removeAttribute('hidden');
      else branch.setAttribute('hidden', '');
    });
  }

  function clearChildActive() {
    document.querySelectorAll('.cmkt-card--child').forEach(function (btn) {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function setChildActive(parent, child) {
    clearChildActive();
    document.querySelectorAll('.cmkt-card--child').forEach(function (btn) {
      if (btn.dataset.mktFor === parent && btn.dataset.mktChild === child) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function hideAllContentPanels() {
    setPanelHidden(document.getElementById('creatorMarketingPanelCreation'), true);
    setPanelHidden(document.getElementById('creatorMarketingPanelPublish'), true);
    setPanelHidden(document.getElementById('creatorMarketingPanelPromotions'), true);
    document.querySelectorAll('#creatorMarketing .creator-marketing-panel-content').forEach(function (el) {
      el.classList.remove('is-active');
    });
  }

  function showCreationLeaf(content) {
    var panel = document.getElementById('creatorMarketingPanelCreation');
    setPanelHidden(panel, false);
    setPanelHidden(document.getElementById('creatorMarketingPanelPublish'), true);
    setPanelHidden(document.getElementById('creatorMarketingPanelPromotions'), true);
    if (!panel) return;
    panel.querySelectorAll('.creator-marketing-panel-content').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.content === content);
    });
  }

  function showPublishLeaf(content) {
    var panel = document.getElementById('creatorMarketingPanelPublish');
    setPanelHidden(panel, false);
    setPanelHidden(document.getElementById('creatorMarketingPanelCreation'), true);
    setPanelHidden(document.getElementById('creatorMarketingPanelPromotions'), true);
    if (!panel) return;
    panel.querySelectorAll('.creator-marketing-panel-content').forEach(function (el) {
      el.classList.toggle('is-active', el.dataset.content === content);
    });
  }

  function showPromotionsLeaf() {
    setPanelHidden(document.getElementById('creatorMarketingPanelCreation'), true);
    setPanelHidden(document.getElementById('creatorMarketingPanelPublish'), true);
    setPanelHidden(document.getElementById('creatorMarketingPanelPromotions'), false);
  }

  function updateHeaderTitle() {
    var headerTitle = document.querySelector('.creator-header__title');
    if (!headerTitle) return;
    if (currentSubTab === 'promotions') {
      headerTitle.textContent = i18nMarketing('promotion', 'Promotion');
      return;
    }
    var labels = {
      'hero-images': i18nMarketing('hero_images', 'Hero Images'),
      videos: i18nMarketing('video', 'Video'),
      images: i18nMarketing('images', 'Images')
    };
    if (currentContentTab && labels[currentContentTab]) {
      headerTitle.textContent = labels[currentContentTab];
      return;
    }
    if (currentSubTab === 'content-publish') {
      headerTitle.textContent = i18nMarketing('content_publish', 'Content Publish');
      return;
    }
    if (currentSubTab === 'content-creation') {
      headerTitle.textContent = i18nMarketing('content_creation', 'Content Creation');
      return;
    }
    headerTitle.textContent = i18nMarketing('title', 'Marketing') === 'Marketing Analytics'
      ? 'Marketing'
      : (window.CreatorI18n && window.CreatorI18n.mobile && window.CreatorI18n.mobile.marketing) || 'Marketing';
  }

  function syncRootAttrs() {
    var marketingRoot = getRoot();
    if (!marketingRoot) return;
    marketingRoot.setAttribute('data-marketing-subtab', currentSubTab || '');
    marketingRoot.setAttribute('data-marketing-parent', currentParent || '');
    marketingRoot.setAttribute('data-marketing-content', currentContentTab || '');
  }

  function eazScheduleHeroAutoPickIfRelevant() {
    if (window.ContentCreationHero && typeof window.ContentCreationHero.maybeScheduleAutoPick === 'function') {
      window.ContentCreationHero.maybeScheduleAutoPick();
    } else if (typeof window.eazMaybeScheduleHeroMarketingAutoPick === 'function') {
      window.eazMaybeScheduleHeroMarketingAutoPick();
    }
  }

  function openHeroModal() {
    if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.open === 'function') {
      window.CreatorHeroImagesModal.open();
    }
    eazScheduleHeroAutoPickIfRelevant();
  }

  /**
   * Expand a parent card (or collapse if same parent clicked again).
   */
  function expandParent(parent, opts) {
    opts = opts || {};
    var force = !!opts.force;
    var collapseIfSame = opts.collapseIfSame !== false;

    if (!force && collapseIfSame && currentParent === parent) {
      // Toggle: collapse open parent
      currentParent = '';
      currentSubTab = '';
      currentContentTab = '';
      setParentExpanded('', false);
      hideAllContentPanels();
      clearChildActive();
      if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.close === 'function') {
        window.CreatorHeroImagesModal.close();
      }
      syncRootAttrs();
      updateHeaderTitle();
      bumpEazyHeaderUi();
      return;
    }

    currentParent = parent;
    currentSubTab = parent;
    if (!opts.keepContent) currentContentTab = '';

    setParentExpanded(parent, true);
    if (!opts.keepContent) {
      clearChildActive();
      hideAllContentPanels();
    }

    if (parent === 'promotions') {
      currentContentTab = '';
      showPromotionsLeaf();
      if (window.EazCreatorPromotions && typeof window.EazCreatorPromotions.refresh === 'function') {
        window.EazCreatorPromotions.refresh();
      }
    }

    syncRootAttrs();
    updateHeaderTitle();
    bumpEazyHeaderUi();
  }

  /**
   * Select a child under the active (or given) parent.
   */
  function selectChild(parent, child) {
    if (!parent || !child) return;
    expandParent(parent, { force: true, keepContent: true, collapseIfSame: false });
    currentSubTab = parent;
    currentContentTab = child;
    currentParent = parent;
    setChildActive(parent, child);
    syncRootAttrs();

    if (parent === 'content-creation') {
      if (child === 'hero-images') {
        hideAllContentPanels();
        openHeroModal();
      } else if (child === 'videos' || child === 'images') {
        if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.close === 'function') {
          window.CreatorHeroImagesModal.close();
        }
        showCreationLeaf(child);
      }
    } else if (parent === 'content-publish') {
      if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.close === 'function') {
        window.CreatorHeroImagesModal.close();
      }
      showPublishLeaf(child);
      if (child === 'hero-images' && window.HeroImagesScreen && typeof window.HeroImagesScreen.loadHeroImages === 'function') {
        window.HeroImagesScreen.loadHeroImages();
      }
    }

    updateHeaderTitle();
    bumpEazyHeaderUi();
  }

  /** Legacy API used by desktop dashboard deep-links */
  function switchSubTab(subtab) {
    if (subtab === 'promotions' || subtab === 'content-creation' || subtab === 'content-publish') {
      expandParent(subtab, { force: true, collapseIfSame: false });
    }
  }

  function switchContentTab(content) {
    var parent = currentParent || currentSubTab || 'content-creation';
    if (parent === 'promotions') return;
    selectChild(parent, content);
  }

  function getHeaderTitle() {
    if (currentSubTab === 'promotions') {
      return i18nMarketing('promotion', 'Promotion');
    }
    if (currentSubTab === 'content-publish') {
      var pubLabels = {
        'hero-images': i18nMarketing('hero_images', 'Hero Images'),
        videos: i18nMarketing('videos', 'Videos'),
        images: i18nMarketing('images', 'Images')
      };
      return pubLabels[currentContentTab] || i18nMarketing('content_publish', 'Content Publish');
    }
    var labels = {
      'hero-images': i18nMarketing('hero_images', 'Hero Images'),
      videos: i18nMarketing('video', 'Video'),
      images: i18nMarketing('images', 'Images')
    };
    return labels[currentContentTab] || i18nMarketing('content_creation', 'Content Creation');
  }

  function bind() {
    document.querySelectorAll('.cmkt-card--parent').forEach(function (btn) {
      var parent = btn.dataset.mktParent;
      if (!parent) return;
      btn.addEventListener('click', function () {
        expandParent(parent);
      });
    });

    document.querySelectorAll('.cmkt-card--child').forEach(function (btn) {
      var child = btn.dataset.mktChild;
      var parent = btn.dataset.mktFor;
      if (!child || !parent) return;
      btn.addEventListener('click', function () {
        selectChild(parent, child);
      });
    });

    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport) {
      var observer = new MutationObserver(function () {
        if (viewport.classList.contains('slide-3')) {
          syncRootAttrs();
          updateHeaderTitle();
          bumpEazyHeaderUi();
        }
      });
      observer.observe(viewport, { attributes: true, attributeFilter: ['class'] });
    }

    function applyHash() {
      var h = (window.location.hash || '').replace(/^#/, '');
      if (h === 'promotions' && typeof window.__creatorGoTo === 'function') {
        window.__creatorGoTo(3);
        expandParent('promotions', { force: true, collapseIfSame: false });
      }
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);

    // Deep-link query params (desktop / portal)
    try {
      var params = new URLSearchParams(window.location.search || '');
      var sub = params.get('eaz_marketing_subtab');
      var content = params.get('eaz_marketing_content');
      if (sub) {
        if (content && sub !== 'promotions') selectChild(sub, content);
        else expandParent(sub, { force: true, collapseIfSame: false });
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.MarketingScreen = {
    switchSubTab: switchSubTab,
    switchContentTab: switchContentTab,
    expandParent: expandParent,
    selectChild: selectChild,
    getHeaderTitle: getHeaderTitle,
    getCurrentSubTab: function () { return currentSubTab; },
    getCurrentContentTab: function () { return currentContentTab; },
    getCurrentParent: function () { return currentParent; }
  };
})();
