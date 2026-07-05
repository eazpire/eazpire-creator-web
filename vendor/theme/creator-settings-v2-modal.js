/**
 * Creator Settings v2 Modal Controller
 * Handles modal open/close and tab switching
 */
(function(){
  'use strict';

  const overlay = document.getElementById('csmOverlay');
  const modal = document.querySelector('.csm-modal');
  const closeBtn = document.getElementById('csmClose');
  const sidebar = document.getElementById('csmSidebar');
  const content = document.getElementById('csmContent');
  const mobileMenuBtn = document.getElementById('csmMobileMenuBtn');
  const mobileDrawerOverlay = document.getElementById('csmMobileDrawerOverlay');

  let currentTab = 'profile'; // Default tab
  let isMobileSidebarOpen = false;
  let closeTimer = null;

  var CSM_MOBILE_MAX = 767;

  /** Creator Wear tab: web mobile only (not desktop web; native Android has its own settings UI). */
  function isWearTabAvailable() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: ' + CSM_MOBILE_MAX + 'px)').matches;
  }

  function ensureWearTabNotActiveOnDesktop() {
    if (!isWearTabAvailable() && currentTab === 'creator-wear') {
      setTab('profile', false);
    }
  }

  // Initialize
  function init(){
    if (!overlay || !modal) return;

    // Event listeners
    setupEventListeners();
    ensureWearTabNotActiveOnDesktop();
    window.addEventListener('resize', ensureWearTabNotActiveOnDesktop);

    // Set initial tab
    setTab(currentTab, false);
  }

  function setupEventListeners(){
    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    // Mobile menu button
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', toggleMobileSidebar);
    }

    // Mobile drawer overlay click to close
    if (mobileDrawerOverlay) {
      mobileDrawerOverlay.addEventListener('click', closeMobileSidebar);
    }

    // Overlay click to close
    if (overlay) {
      overlay.addEventListener('click', function(e){
        if (e.target === overlay) {
          close();
        }
      });
    }

    // Navigation items
    const navItems = sidebar ? sidebar.querySelectorAll('.csm-nav-item') : [];
    navItems.forEach(item => {
      item.addEventListener('click', function(){
        const tab = this.getAttribute('data-csm-nav');
        if (tab) {
          setTab(tab);
          // Close mobile sidebar after selecting a tab
          if (window.innerWidth <= 767) {
            closeMobileSidebar();
          }
        }
      });
    });

    // Profile Panel Login Button
    const profileLoginBtn = document.getElementById('csmProfileLoginBtn');
    if (profileLoginBtn) {
      profileLoginBtn.addEventListener('click', function(){
        // Zur normalen Shopify Login-Seite weiterleiten
        var currentUrl = encodeURIComponent(window.location.href);
        var loginUrl = '/account/login?redirect=' + currentUrl;
        window.location.href = loginUrl;
      });
    }

    // ESC key
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') {
        if (isMobileSidebarOpen) {
          closeMobileSidebar();
        } else if (isOpen()) {
          close();
        }
      }
    });
  }

  function open(opts){
    opts = opts || {};
    if (!overlay) return;

    // Close mobile sidebar if open
    if (isMobileSidebarOpen) {
      closeMobileSidebar();
    }

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    overlay.style.display = 'flex';
    requestAnimationFrame(function(){
      overlay.classList.add('is-open');
    });
    overlay.setAttribute('aria-hidden', 'false');

    // Focus management
    if (closeBtn) {
      closeBtn.focus();
    }

    // Navigation-Items basierend auf Login-Status aktivieren/deaktivieren
    ensureWearTabNotActiveOnDesktop();
    updateNavigationState();

    const requested = opts.tab || 'profile';
    const tabToShow = isTabAllowed(requested) ? requested : 'profile';
    setTab(tabToShow, true, opts.eazSub);

    if (tabToShow === 'profile') {
      setTimeout(updateProfilePanel, 10);
    }

    // Dispatch event
    window.dispatchEvent(new CustomEvent('creator-settings-v2-opened'));
  }

  function close(){
    if (!overlay) return;

    var creatorRoot =
      window.CustomerProfileSettings &&
      typeof window.CustomerProfileSettings.getCreatorRoot === 'function'
        ? window.CustomerProfileSettings.getCreatorRoot()
        : null;
    if (
      currentTab === 'profile' &&
      creatorRoot &&
      window.CustomerProfileSettings.isDirty(creatorRoot)
    ) {
      window.CustomerProfileSettings.promptUnsaved(creatorRoot, doClose);
      return;
    }
    doClose();
  }

  function doClose(){
    if (!overlay) return;

    // Close mobile sidebar if open
    if (isMobileSidebarOpen) {
      closeMobileSidebar();
    }

    if (closeBtn && document.activeElement && overlay.contains(document.activeElement)) {
      closeBtn.blur();
    }

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function(){
      overlay.style.display = 'none';
      closeTimer = null;
    }, 280);

    // Dispatch event
    window.dispatchEvent(new CustomEvent('creator-settings-v2-closed'));
  }

  function isOpen(){
    return overlay && overlay.classList.contains('is-open');
  }

  function setTab(tabName, dispatchEvent = true, eazSub = null){
    if (!sidebar || !content) return;

    if (tabName === 'creator-wear' && !isWearTabAvailable()) {
      tabName = 'profile';
    }

    // Prüfen ob der Tab erlaubt ist
    if (!isTabAllowed(tabName)) {
      return; // Tab nicht erlauben
    }

    if (tabName !== currentTab && currentTab === 'profile') {
      var creatorRoot =
        window.CustomerProfileSettings &&
        typeof window.CustomerProfileSettings.getCreatorRoot === 'function'
          ? window.CustomerProfileSettings.getCreatorRoot()
          : null;
      if (creatorRoot && window.CustomerProfileSettings.isDirty(creatorRoot)) {
        window.CustomerProfileSettings.promptUnsaved(creatorRoot, function () {
          applySetTab(tabName, dispatchEvent, eazSub);
        });
        return;
      }
    }

    applySetTab(tabName, dispatchEvent, eazSub);
  }

  function applySetTab(tabName, dispatchEvent, eazSub){
    if (!sidebar || !content) return;

    currentTab = tabName;

    // Update navigation
    const navItems = sidebar.querySelectorAll('.csm-nav-item');
    navItems.forEach(item => {
      const itemTab = item.getAttribute('data-csm-nav');
      if (itemTab === tabName) {
        item.classList.add('is-active');
      } else {
        item.classList.remove('is-active');
      }
    });

    // Update panels
    const panels = content.querySelectorAll('.csm-panel');
    panels.forEach(panel => {
      const panelTab = panel.getAttribute('data-csm-panel');
      if (panelTab === tabName) {
        panel.classList.add('is-active');

        // Spezielle Behandlung für Profile Panel
        if (panelTab === 'profile') {
          updateProfilePanel();
        }
        if (panelTab === 'notifications' && window.NotificationPreferencesPanel) {
          var notifMount = document.getElementById('csm-notifications-mount');
          if (notifMount) {
            window.NotificationPreferencesPanel.init(notifMount, { scope: 'creator', dark: true });
          }
        }
      } else {
        panel.classList.remove('is-active');
      }
    });

    // Dispatch tab change event
    if (dispatchEvent) {
      window.dispatchEvent(new CustomEvent('creator-settings-v2-tab-changed', {
        detail: { tab: tabName, eazSub: eazSub || null }
      }));
    }
  }

  function isTabAllowed(tabName) {
    if (tabName === 'creator-wear' && !isWearTabAvailable()) {
      return false;
    }

    // Wenn eingeloggt, alle Tabs erlauben
    if (window.__creatorSettingsUserLoggedIn) {
      return true;
    }

    // Wenn nicht eingeloggt, nur Profile-Tab erlauben
    return tabName === 'profile';
  }

  function toggleMobileSidebar(){
    if (isMobileSidebarOpen) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  }

  function openMobileSidebar(){
    if (!sidebar || !mobileDrawerOverlay) return;

    isMobileSidebarOpen = true;
    sidebar.classList.add('is-open');
    mobileDrawerOverlay.classList.add('is-open');
    mobileDrawerOverlay.setAttribute('aria-hidden', 'false');

    // Focus trap for accessibility
    sidebar.focus();
  }

  function closeMobileSidebar(){
    if (!sidebar || !mobileDrawerOverlay) return;

    isMobileSidebarOpen = false;
    sidebar.classList.remove('is-open');
    mobileDrawerOverlay.classList.remove('is-open');
    mobileDrawerOverlay.setAttribute('aria-hidden', 'true');
  }

  function getCurrentTab(){
    return currentTab;
  }

  function updateProfilePanel(){
    const loginRequiredEl = document.getElementById('csmProfileLoginRequired');
    const profileFormEl = document.getElementById('csmProfileForm');

    if (!loginRequiredEl || !profileFormEl) return;

    // Prüfen ob User im Shopify Shop eingeloggt ist (aus globaler Variable)
    const isLoggedIn = window.__creatorSettingsUserLoggedIn;

    if (isLoggedIn) {
      // Eingeloggt - Profilform zeigen und E-Mail aus Overlay füllen
      loginRequiredEl.style.display = 'none';
      profileFormEl.style.display = 'block';
      const emailInput = document.getElementById('csmProfileEmail');
      const overlay = document.getElementById('csmOverlay');
      if (emailInput && overlay && overlay.dataset.customerEmail) {
        emailInput.value = overlay.dataset.customerEmail || '';
      }
    } else {
      // Nicht eingeloggt - Login Required zeigen
      loginRequiredEl.style.display = 'flex';
      profileFormEl.style.display = 'none';
    }
  }

  function updateNavigationState(){
    if (!sidebar) return;

    const navItems = sidebar.querySelectorAll('.csm-nav-item');
    const isLoggedIn = window.__creatorSettingsUserLoggedIn;

    navItems.forEach(item => {
      const tabName = item.getAttribute('data-csm-nav');

      if (tabName === 'creator-wear' && !isWearTabAvailable()) {
        item.classList.add('is-disabled');
        return;
      }

      if (isLoggedIn || tabName === 'profile') {
        // Aktiviert: entferne disabled state
        item.classList.remove('is-disabled');
        item.style.opacity = '';
        item.style.cursor = '';
        item.style.pointerEvents = '';
        if (tabName === 'creator-wear') {
          item.style.display = '';
        }
      } else {
        // Deaktiviert: füge disabled state hinzu
        item.classList.add('is-disabled');
        item.style.opacity = '0.4';
        item.style.cursor = 'not-allowed';
        item.style.pointerEvents = 'none';
      }
    });
  }

  // Global API
  window.CreatorSettingsV2Modal = {
    open,
    close,
    isOpen,
    setTab,
    getCurrentTab,
    toggleMobileSidebar,
    openMobileSidebar,
    closeMobileSidebar,
    isMobileSidebarOpen: () => isMobileSidebarOpen
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();