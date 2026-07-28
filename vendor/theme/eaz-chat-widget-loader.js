/**
 * Loads Eazy chat scripts on first interaction or after idle (not on initial critical path).
 */
(function () {
  'use strict';

  var loaded = false;
  var loading = null;

  function isScriptUrl(src) {
    return src && !/\.css(\?|$)/i.test(src);
  }

  function scriptUrls() {
    var shell = window.__EAZ_CHAT_SHELL_SCRIPTS || [];
    var lazy = window.__EAZ_CHAT_LAZY_SCRIPTS || [];
    return shell.concat(lazy).filter(function (src) {
      return src && isScriptUrl(src);
    });
  }

  function ensureChatDom() {
    var tpl = document.getElementById('creator-chat-deferred-tpl');
    var root = document.getElementById('creator-chat-root');
    if (!tpl || !root || tpl.getAttribute('data-eaz-mounted') === '1') return;
    try {
      root.appendChild(tpl.content.cloneNode(true));
      tpl.setAttribute('data-eaz-mounted', '1');
    } catch (_e) {}
  }

  window.eazEnsureCreatorChatDom = ensureChatDom;

  function openChatIfClosed() {
    ensureChatDom();
    if (!window.CreatorChat || typeof window.CreatorChat.open !== 'function') return;
    var panel = document.getElementById('creator-chat-panel');
    if (panel && panel.classList.contains('creator-chat__panel--open')) return;
    window.CreatorChat.open();
  }

  function loadOne(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-eaz-chat-lazy][src="' + src + '"]');
      if (existing) {
        if (existing.dataset.eazLoaded === '1') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.setAttribute('data-eaz-chat-lazy', '1');
      s.onload = function () {
        s.dataset.eazLoaded = '1';
        resolve();
      };
      s.onerror = function () {
        reject(new Error('chat_script_failed'));
      };
      document.body.appendChild(s);
    });
  }

  function loadChatBundle() {
    ensureChatDom();
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    var urls = scriptUrls();
    if (!urls.length) return Promise.resolve();
    loading = urls.reduce(function (chain, src) {
      return chain.then(function () {
        return loadOne(src);
      });
    }, Promise.resolve());
    loading = loading
      .then(function () {
        loaded = true;
      })
      .catch(function (err) {
        loading = null;
        throw err;
      });
    return loading;
  }

  window.eazLoadCreatorChatBundle = loadChatBundle;

  function isShopHome() {
    try {
      return document.documentElement.classList.contains('eaz-switched') &&
        (window.location.pathname === '/' || window.location.pathname === '');
    } catch (_e) {
      return false;
    }
  }

  function scheduleIdleWarmup() {
    try {
      if (localStorage.getItem('eazy_docked') === 'true') {
        loadChatBundle().catch(function () {});
        return;
      }
    } catch (_e) {}
    // Shop homepage: do not warm the ~22-script chat bundle during first paint —
    // load only on toggle hover/click so create-from-scratch can use the network.
    if (isShopHome()) return;
    var run = function () {
      loadChatBundle().catch(function () {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 45000 });
    } else {
      setTimeout(run, 30000);
    }
  }

  function bindToggle() {
    var toggle = document.getElementById('creator-chat-toggle');
    if (!toggle || toggle.dataset.eazChatLazyBound === '1') return;
    toggle.dataset.eazChatLazyBound = '1';
    toggle.addEventListener(
      'click',
      function () {
        if (loaded) return;
        loadChatBundle()
          .then(function () {
            openChatIfClosed();
          })
          .catch(function () {});
      },
      true
    );
    toggle.addEventListener(
      'mouseenter',
      function () {
        loadChatBundle().catch(function () {});
      },
      { once: true, passive: true }
    );
    toggle.addEventListener(
      'focus',
      function () {
        loadChatBundle().catch(function () {});
      },
      { once: true }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindToggle();
      scheduleIdleWarmup();
    });
  } else {
    bindToggle();
    scheduleIdleWarmup();
  }
})();
