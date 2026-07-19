/**
 * Creator Lazy Modals – lädt Modal-Skripte erst beim Öffnen
 * Spart initiale Ladezeit, da Modals nicht beim Seitenstart geladen werden.
 */
(function () {
  'use strict';

  var loadPromises = {};
  var creationsBundlePromise = null;
  var designPreviewPromise = null;

  function withPortalAssetV(url) {
    if (!url) return url;
    var s = String(url);
    if (s.indexOf('?v=') !== -1 || s.indexOf('&v=') !== -1) return s;
    var v = window.__CREATOR_PORTAL_ASSET_V;
    if (!v) return s;
    return s + '?v=' + v;
  }

  function loadScript(url) {
    url = withPortalAssetV(url);
    if (!url) return Promise.reject(new Error('Missing script URL'));
    if (loadPromises[url]) return loadPromises[url];
    loadPromises[url] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(script);
    });
    return loadPromises[url];
  }

  function loadScriptsSequential(urls) {
    var list = (urls || []).filter(Boolean);
    return list.reduce(function (chain, url) {
      return chain.then(function () { return loadScript(url); });
    }, Promise.resolve());
  }

  function registerLazyModal(scriptUrl, fnNames, syncFallbacks) {
    if (!scriptUrl) return;
    var queues = {};
    var loading = false;
    var loaded = false;
    syncFallbacks = syncFallbacks || {};

    fnNames.forEach(function (name) {
      queues[name] = [];
      window[name] = function () {
        var args = Array.prototype.slice.call(arguments);
        if (loaded) {
          var fn = window[name];
          if (typeof fn === 'function') return fn.apply(null, args);
        }
        if (syncFallbacks[name] !== undefined) {
          return typeof syncFallbacks[name] === 'function' ? syncFallbacks[name].apply(null, args) : syncFallbacks[name];
        }
        queues[name].push(args);
        if (loading) return;
        loading = true;
        loadScript(scriptUrl).then(function () {
          loaded = true;
          loading = false;
          fnNames.forEach(function (n) {
            var fn = window[n];
            if (typeof fn === 'function') {
              queues[n].forEach(function (a) { fn.apply(null, a); });
              queues[n].length = 0;
            }
          });
          window.dispatchEvent(new CustomEvent('creator-filter-modal-ready'));
        }).catch(function () {
          loading = false;
          Object.keys(queues).forEach(function (k) { queues[k].length = 0; });
        });
      };
    });
  }

  function getDesignPreviewUrl() {
    var urls = window.__CREATOR_LAZY_MODAL_URLS || {};
    return urls['creator-design-preview-modal.js'] || '';
  }

  function ensureDesignPreviewModal() {
    var url = getDesignPreviewUrl();
    if (!url) return Promise.resolve();
    if (window.__creatorDesignPreviewScriptLoaded) return Promise.resolve();
    if (!designPreviewPromise) {
      designPreviewPromise = loadScript(url).then(function () {
        window.__creatorDesignPreviewScriptLoaded = true;
      }).catch(function (err) {
        designPreviewPromise = null;
        throw err;
      });
    }
    return designPreviewPromise;
  }

  function ensureStudioModal() {
    if (window.CreatorDesignStudioModal && typeof window.CreatorDesignStudioModal.open === 'function') {
      return Promise.resolve();
    }
    var url = window.__CREATOR_STUDIO_MODAL_JS;
    if (!url) {
      var bundle = window.__CREATOR_LAZY_CREATIONS_BUNDLE || [];
      for (var i = 0; i < bundle.length; i++) {
        if (String(bundle[i] || '').indexOf('creator-design-studio-modal.js') !== -1) {
          url = bundle[i];
          break;
        }
      }
    }
    if (!url) return Promise.resolve();
    return loadScript(url);
  }

  function ensureCreationsBundle() {
    var bundle = window.__CREATOR_LAZY_CREATIONS_BUNDLE;
    if (!bundle || !bundle.length) return Promise.resolve();
    if (window.__creatorCreationsBundleLoaded) return Promise.resolve();
    if (!creationsBundlePromise) {
      creationsBundlePromise = loadScriptsSequential(bundle).then(function () {
        window.__creatorCreationsBundleLoaded = true;
        window.__creatorDesignPreviewScriptLoaded = true;
        window.dispatchEvent(new CustomEvent('creator-creations-bundle-ready'));
      }).catch(function (err) {
        creationsBundlePromise = null;
        throw err;
      });
    }
    return creationsBundlePromise;
  }

  function installDesignPreviewStub() {
    var url = getDesignPreviewUrl();
    if (!url || window.__EAZ_LAZY_DESIGN_PREVIEW_STUB) return;
    window.__EAZ_LAZY_DESIGN_PREVIEW_STUB = true;
    window.CreatorDesignPreviewModal = window.CreatorDesignPreviewModal || {};

    function wrapLazy(methodName) {
      var existing = window.CreatorDesignPreviewModal[methodName];
      if (existing && existing.__eazLazyStub) return;

      window.CreatorDesignPreviewModal[methodName] = function () {
        var args = arguments;
        var self = this;
        if (window.__creatorDesignPreviewScriptLoaded) {
          var fn = window.CreatorDesignPreviewModal[methodName];
          if (fn && !fn.__eazLazyStub && typeof fn === 'function') {
            return fn.apply(self, args);
          }
        }
        return ensureDesignPreviewModal().then(function () {
          var fn = window.CreatorDesignPreviewModal[methodName];
          if (typeof fn === 'function' && !fn.__eazLazyStub) {
            return fn.apply(window.CreatorDesignPreviewModal, args);
          }
        });
      };
      window.CreatorDesignPreviewModal[methodName].__eazLazyStub = true;
    }

    wrapLazy('open');
    wrapLazy('loadDesignForRemix');
  }

  var urls = window.__CREATOR_LAZY_MODAL_URLS || {};
  var filterUrl = urls['creator-mobile-filter-modal.js'] || '';

  if (filterUrl) {
    registerLazyModal(filterUrl, [
      'openFilterModal',
      'closeFilterModal',
      'matchesDesignFilter',
      'matchesProductFilter',
      'getFilterState'
    ], {
      getFilterState: function () { return { design: {}, product: {} }; },
      matchesDesignFilter: function () { return true; },
      matchesProductFilter: function () { return true; }
    });
  }

  installDesignPreviewStub();

  window.__CreatorLazyModals = {
    loadScript: loadScript,
    loadScriptsSequential: loadScriptsSequential,
    ensureDesignPreviewModal: ensureDesignPreviewModal,
    ensureStudioModal: ensureStudioModal,
    ensureCreationsBundle: ensureCreationsBundle,
    installDesignPreviewStub: installDesignPreviewStub
  };
})();
