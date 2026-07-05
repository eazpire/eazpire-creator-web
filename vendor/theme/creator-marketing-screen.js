/**
 * Marketing Screen – Content Creation | Content Publish | Promotions
 * Sub-tabs + Unter-tabs (Hero Images, Videos, Images) for creation/publish
 */
(function () {
  'use strict';

  var currentSubTab = 'content-creation';
  var currentContentTab = 'hero-images';

  function bumpEazyHeaderUi() {
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }
  }

  function switchSubTab(subtab) {
    currentSubTab = subtab;
    var headerTitle = document.querySelector('.creator-header__title');
    var labels = { 'hero-images': 'Hero Images', 'videos': 'Videos', 'images': 'Images' };

    document.querySelectorAll('.creator-marketing-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.subtab === subtab);
    });

    var panelCreation = document.getElementById('creatorMarketingPanelCreation');
    var panelPublish = document.getElementById('creatorMarketingPanelPublish');
    var panelPromotions = document.getElementById('creatorMarketingPanelPromotions');

    function setMarketingPanelHidden(el, hidden) {
      if (!el) return;
      el.classList.toggle('creator-marketing-panel--hidden', hidden);
      if (hidden) el.setAttribute('hidden', '');
      else el.removeAttribute('hidden');
    }

    setMarketingPanelHidden(panelCreation, subtab !== 'content-creation');
    setMarketingPanelHidden(panelPublish, subtab !== 'content-publish');
    setMarketingPanelHidden(panelPromotions, subtab !== 'promotions');

    var marketingRoot = document.getElementById('creatorMarketing');
    if (marketingRoot) marketingRoot.setAttribute('data-marketing-subtab', subtab);

    var activePanel = subtab === 'content-creation' ? panelCreation : (subtab === 'content-publish' ? panelPublish : null);
    if (activePanel) {
      activePanel.querySelectorAll('.creator-marketing-panel-content').forEach(function (el) {
        el.classList.toggle('is-active', el.dataset.content === currentContentTab);
      });
    }

    if (headerTitle) {
      if (subtab === 'promotions') {
        var promoLabel = (window.CreatorI18n && window.CreatorI18n.promotions && window.CreatorI18n.promotions.tab) || 'Promotions';
        headerTitle.textContent = promoLabel;
      } else {
        headerTitle.textContent = labels[currentContentTab] || (subtab === 'content-creation' ? 'Content Creation' : 'Content Publish');
      }
    }
    bumpEazyHeaderUi();

    if (subtab === 'promotions' && window.EazCreatorPromotions && typeof window.EazCreatorPromotions.refresh === 'function') {
      window.EazCreatorPromotions.refresh();
    }

    if (subtab === 'content-creation' && currentContentTab === 'hero-images') {
      eazScheduleHeroAutoPickIfRelevant();
    }
  }

  function switchContentTab(content) {
    currentContentTab = content;
    var headerTitle = document.querySelector('.creator-header__title');
    var labels = { 'hero-images': 'Hero Images', 'videos': 'Videos', 'images': 'Images' };

    document.querySelectorAll('.creator-marketing-under-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.content === content);
    });

    var activePanel = currentSubTab === 'content-creation'
      ? document.getElementById('creatorMarketingPanelCreation')
      : document.getElementById('creatorMarketingPanelPublish');
    if (activePanel) {
      activePanel.querySelectorAll('.creator-marketing-panel-content').forEach(function (el) {
        el.classList.toggle('is-active', el.dataset.content === content);
      });
    }

    if (headerTitle && currentSubTab !== 'promotions') {
      headerTitle.textContent = currentSubTab === 'content-creation'
        ? (labels[content] || 'Content Creation')
        : (labels[content] || 'Content Publish');
    }
    bumpEazyHeaderUi();

    if (content === 'hero-images' && currentSubTab === 'content-creation') {
      eazScheduleHeroAutoPickIfRelevant();
    }
  }

  function eazScheduleHeroAutoPickIfRelevant() {
    if (window.ContentCreationHero && typeof window.ContentCreationHero.maybeScheduleAutoPick === 'function') {
      window.ContentCreationHero.maybeScheduleAutoPick();
    } else if (typeof window.eazMaybeScheduleHeroMarketingAutoPick === 'function') {
      window.eazMaybeScheduleHeroMarketingAutoPick();
    }
  }

  function getHeaderTitle() {
    if (currentSubTab === 'promotions') {
      return (window.CreatorI18n && window.CreatorI18n.promotions && window.CreatorI18n.promotions.tab) || 'Promotions';
    }
    if (currentSubTab === 'content-publish') return 'Content Publish';
    var labels = { 'hero-images': 'Hero Images', 'videos': 'Videos', 'images': 'Images' };
    return labels[currentContentTab] || 'Content Creation';
  }

  function bind() {
    document.querySelectorAll('.creator-marketing-tab').forEach(function (btn) {
      var subtab = btn.dataset.subtab;
      if (!subtab) return;
      btn.addEventListener('click', function () { switchSubTab(subtab); });
    });

    document.querySelectorAll('.creator-marketing-under-tab').forEach(function (btn) {
      var content = btn.dataset.content;
      if (content) btn.addEventListener('click', function () { switchContentTab(content); });
    });

    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport) {
      var observer = new MutationObserver(function () {
        if (viewport.classList.contains('slide-3')) {
          switchSubTab(currentSubTab);
          if (currentSubTab === 'content-creation') {
            switchContentTab(currentContentTab);
          }
        }
      });
      observer.observe(viewport, { attributes: true, attributeFilter: ['class'] });
    }

    if (viewport && viewport.classList.contains('slide-3')) {
      switchSubTab('content-creation');
      switchContentTab('hero-images');
    }

    function applyHash() {
      var h = (window.location.hash || '').replace(/^#/, '');
      if (h === 'promotions' && typeof window.__creatorGoTo === 'function') {
        window.__creatorGoTo(3);
        switchSubTab('promotions');
      }
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.MarketingScreen = {
    switchSubTab: switchSubTab,
    switchContentTab: switchContentTab,
    getHeaderTitle: getHeaderTitle,
    getCurrentSubTab: function () { return currentSubTab; },
    getCurrentContentTab: function () { return currentContentTab; }
  };
})();
