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
    return (window.__EAZ_CHAT_LAZY_SCRIPTS || []).filter(function (src) {
      return src && isScriptUrl(src);
    });
  }

  function openChatIfClosed() {
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

  function scheduleIdleWarmup() {
    try {
      if (localStorage.getItem('eazy_docked') === 'true') {
        loadChatBundle().catch(function () {});
        return;
      }
    } catch (_e) {}
    var run = function () {
      loadChatBundle().catch(function () {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 15000 });
    } else {
      setTimeout(run, 10000);
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
