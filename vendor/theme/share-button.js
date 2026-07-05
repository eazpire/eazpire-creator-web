/**
 * Share Button - Native share or modal with Copy + Social icons
 * URL: current page + ?ref={code} when owner has referral code
 * Social: WhatsApp, Facebook, X, Pinterest, LinkedIn, Telegram, E-Mail (no Instagram)
 */
(function () {
  'use strict';

  const API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || 'https://creator-engine.eazpire.workers.dev';
  const REF_LINKS_SETTING_KEY = 'community_ref_links_v1';

  function clearPreferredReferralUrlCache(ownerId) {
    // Kept for compatibility with callers; currently resolved live per click.
    return ownerId;
  }

  function resolveOwnerId() {
    if (window._resolveEazOwnerId) return window._resolveEazOwnerId();
    if (window.__EAZ_OWNER_ID) return window.__EAZ_OWNER_ID;
    if (window.ownerId) return String(window.ownerId);
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId);
    return null;
  }

  function fetchReferralCode(ownerId) {
    return fetch(API_BASE + '/apps/creator-dispatch?op=get-referral-code&owner_id=' + encodeURIComponent(ownerId) + '&_t=' + Date.now(), {
      credentials: 'include',
      cache: 'no-store'
    }).then(function (r) { return r.json(); });
  }

  function fetchCustomerSetting(ownerId, key) {
    return fetch(
      API_BASE + '/apps/creator-dispatch?op=get-customer-setting&owner_id=' + encodeURIComponent(ownerId) + '&key=' + encodeURIComponent(key) + '&_t=' + Date.now(),
      { credentials: 'include', cache: 'no-store' }
    ).then(function (r) { return r.json(); });
  }

  function buildShareUrl(baseUrl, refCode) {
    try {
      var href = baseUrl || window.location.href;
      var u = href.startsWith('http') ? new URL(href) : new URL(href, window.location.origin);
      if (refCode) {
        u.searchParams.set('ref', refCode);
      }
      return u.toString();
    } catch (e) {
      return window.location.href;
    }
  }

  function buildNamedRefUrl(baseUrl, slug) {
    try {
      // Use current page URL if baseUrl is not a full URL or is empty
      var href = baseUrl || window.location.href;
      var u = href.startsWith('http') ? new URL(href) : new URL(href, window.location.origin);
      if (slug) {
        u.pathname = '/' + encodeURIComponent(String(slug).toLowerCase());
        u.search = '';
      }
      return u.toString();
    } catch (_e) {
      return baseUrl || window.location.href;
    }
  }

  function normalizeStoredRefLinks(raw) {
    var fallback = { links: [{ id: 'main', name: 'Main link', slug: '' }], activeId: 'main' };
    if (!raw) return fallback;
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || !Array.isArray(parsed.links) || !parsed.links.length) return fallback;
      var links = parsed.links.map(function(item, idx) {
        return {
          id: String(item && item.id ? item.id : ('id-' + idx)),
          name: String(item && item.name ? item.name : ('Link ' + (idx + 1))),
          slug: String(item && item.slug ? item.slug : '').toLowerCase()
        };
      });
      var activeId = String(parsed.activeId || links[0].id);
      if (!links.some(function (item) { return item.id === activeId; })) activeId = links[0].id;
      return { links: links, activeId: activeId };
    } catch (_e) {
      return fallback;
    }
  }

  function getActiveSlugFromSetting(settingRes) {
    var raw = settingRes && settingRes.ok ? settingRes.value : null;
    var normalized = normalizeStoredRefLinks(raw);
    var active = normalized.links.find(function (item) { return item.id === normalized.activeId; }) || normalized.links[0];
    return active && active.slug ? String(active.slug).toLowerCase() : '';
  }

  function resolveReferralMeta(ownerId, baseUrl) {
    if (!ownerId) {
      return Promise.resolve({
        ownerId: null,
        code: '',
        slug: '',
        selectedUrl: buildShareUrl(baseUrl, null)
      });
    }
    return Promise.all([
      fetchReferralCode(ownerId).catch(function () { return null; }),
      fetchCustomerSetting(ownerId, REF_LINKS_SETTING_KEY).catch(function () { return null; })
    ]).then(function (results) {
      var refRes = results[0];
      var settingRes = results[1];
      var code = (refRes && refRes.ok && refRes.code) ? String(refRes.code) : '';
      var slug = getActiveSlugFromSetting(settingRes);
      
      // If we have a ref code, use join.eazpire.com as base
      if (code) {
        try {
          // Build the join.eazpire.com URL as base
          // If slug is present, use it directly (e.g., https://join.eazpire.com/mimamu)
          // Otherwise use the code directly (e.g., https://join.eazpire.com/BB6FAD7F)
          // The ref code is already contained in the link path, so NO ref parameter needed!
          // The worker will lookup the user via the slug/code in the database
          var joinBaseUrl;
          if (slug) {
            // Use personalized slug (e.g., /mimamu, /blibablub, /ilovecats)
            joinBaseUrl = 'https://join.eazpire.com/' + encodeURIComponent(String(slug).toLowerCase());
          } else {
            // Use code directly if no personalized slug is set
            joinBaseUrl = 'https://join.eazpire.com/' + encodeURIComponent(code);
          }
          
          var joinUrl = new URL(joinBaseUrl);
          
          // Append the current page URL as a parameter so the join link redirects to the correct product/page
          // If no current page URL (baseUrl is empty), the link will redirect to homepage
          var currentPageUrl = baseUrl || window.location.href;
          joinUrl.searchParams.set('url', currentPageUrl);
          
          return {
            ownerId: String(ownerId),
            code: code,
            slug: slug,
            selectedUrl: joinUrl.toString()
          };
        } catch (e) {
          // Fallback to buildShareUrl if URL parsing fails
          return {
            ownerId: String(ownerId),
            code: code,
            slug: slug,
            selectedUrl: buildShareUrl(baseUrl, code)
          };
        }
      }
      
      // No ref code, use current page URL
      return {
        ownerId: String(ownerId),
        code: code,
        slug: slug,
        selectedUrl: buildShareUrl(baseUrl, null)
      };
    }).catch(function () {
      return {
        ownerId: String(ownerId),
        code: '',
        slug: '',
        selectedUrl: buildShareUrl(baseUrl, null)
      };
    });
  }

  function resolvePreferredReferralUrl(ownerId, baseUrl) {
    if (!ownerId) return Promise.resolve(buildShareUrl(baseUrl, null));
    return resolveReferralMeta(ownerId, baseUrl).then(function (meta) {
      return meta && meta.selectedUrl ? meta.selectedUrl : buildShareUrl(baseUrl, null);
    });
  }

  var SOCIAL = [
    { id: 'whatsapp', label: 'WhatsApp', url: 'https://wa.me/?text=' },
    { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/sharer/sharer.php?u=' },
    { id: 'x', label: 'X (Twitter)', url: 'https://twitter.com/intent/tweet?url=' },
    { id: 'pinterest', label: 'Pinterest', url: 'https://pinterest.com/pin/create/button/?url=' },
    { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/sharing/share-offsite/?url=' },
    { id: 'telegram', label: 'Telegram', url: 'https://t.me/share/url?url=' },
    { id: 'email', label: 'E-Mail', url: 'mailto:?subject=&body=' }
  ];

  function openShareModal(shareUrl, productTitle, productUrl) {
    var modal = document.getElementById('share-button-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'share-button-modal';
      modal.className = 'share-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Share');
      var text = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.copy_link) || 'Copy link';
      var hint = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.copied) || 'Copied!';
      modal.innerHTML =
        '<div class="share-modal__backdrop" data-share-close></div>' +
        '<div class="share-modal__content">' +
        '  <div class="share-modal__header">' +
        '    <h3 class="share-modal__title">Share</h3>' +
        '    <button type="button" class="share-modal__close" data-share-close aria-label="Close">×</button>' +
        '  </div>' +
        '  <div class="share-modal__body">' +
        '    <div class="share-modal__copy-row">' +
        '      <input type="text" class="share-modal__input" data-share-input readonly>' +
        '      <button type="button" class="share-modal__copy-btn button button--secondary" data-share-copy>' + text + '</button>' +
        '    </div>' +
        '    <div class="share-modal__social">' +
        SOCIAL.map(function (s) {
          return '<a class="share-modal__social-link" href="#" data-share-social="' + s.id + '" data-url="' + s.url + '" target="_blank" rel="noopener" aria-label="' + s.label + '">' + s.label + '</a>';
        }).join('') +
        '    </div>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(modal);

      var input = modal.querySelector('[data-share-input]');
      var copyBtn = modal.querySelector('[data-share-copy]');
      var socialLinks = modal.querySelectorAll('[data-share-social]');

      function closeModal() {
        modal.classList.remove('share-modal--open');
        var productModalOpen = document.querySelector('.gift-card-products__variant-modal--visible');
        if (!productModalOpen) {
          document.body.style.overflow = '';
        }
      }

      modal.querySelectorAll('[data-share-close]').forEach(function (el) {
        el.addEventListener('click', closeModal);
      });
      modal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
      });

      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          if (input && input.value) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(input.value).then(function () {
                copyBtn.textContent = hint;
                setTimeout(function () { copyBtn.textContent = text; }, 1500);
              });
            } else {
              input.select();
              document.execCommand('copy');
              copyBtn.textContent = hint;
              setTimeout(function () { copyBtn.textContent = text; }, 1500);
            }
          }
        });
      }

      socialLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var base = link.getAttribute('data-url');
          var urlToShare = input ? input.value : shareUrl;
          var enc = encodeURIComponent(urlToShare);
          var finalUrl = base + enc;
          if (link.getAttribute('data-share-social') === 'email') {
            finalUrl = 'mailto:?subject=' + encodeURIComponent(productTitle || '') + '&body=' + enc;
          }
          window.open(finalUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
        });
      });
    }

    var input = modal.querySelector('[data-share-input]');
    if (input) input.value = shareUrl;
    document.body.appendChild(modal);
    modal.style.zIndex = '10050';
    modal.classList.add('share-modal--open');
    document.body.style.overflow = 'hidden';
  }

  function showCopyFeedback(btn, copiedLabel, copyLabel) {
    var label = btn.querySelector('.copy-link-button__label');
    if (label) {
      var orig = label.textContent;
      label.textContent = copiedLabel;
      setTimeout(function () { label.textContent = orig; }, 1500);
    } else {
      btn.setAttribute('aria-label', copiedLabel);
      setTimeout(function () { btn.setAttribute('aria-label', copyLabel); }, 1500);
      var feedback = btn.querySelector('.copy-link-button__feedback');
      if (!feedback) {
        feedback = document.createElement('span');
        feedback.className = 'copy-link-button__feedback';
        feedback.setAttribute('aria-live', 'polite');
        btn.appendChild(feedback);
      }
      feedback.textContent = copiedLabel;
      btn.classList.add('copy-link-button--copied');
      clearTimeout(btn._copyFeedbackTimer);
      btn._copyFeedbackTimer = setTimeout(function () {
        btn.classList.remove('copy-link-button--copied');
        feedback.textContent = '';
      }, 1500);
    }
  }

  function initCopyLinkButtons() {
    var copyLabel = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.copy_link) || 'Copy link';
    var copiedLabel = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.copied) || 'Copied!';
    document.querySelectorAll('[data-copy-link]').forEach(function (btn) {
      if (btn._copyLinkInit) return;
      btn._copyLinkInit = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        // Always use current page URL as base, unless data-copy-url is explicitly set and is a full URL
        // This ensures we copy the page the user is currently on
        var copyUrlAttr = btn.getAttribute('data-copy-url') || '';
        var baseUrl = copyUrlAttr && copyUrlAttr.startsWith('http') ? copyUrlAttr : window.location.href;
        var ownerId = resolveOwnerId();
        function doCopy(url) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              showCopyFeedback(btn, copiedLabel, copyLabel);
            });
          } else {
            var input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            showCopyFeedback(btn, copiedLabel, copyLabel);
          }
        }
        if (ownerId) {
          resolvePreferredReferralUrl(ownerId, baseUrl).then(function (url) {
            doCopy(url);
          }).catch(function () {
            doCopy(buildShareUrl(baseUrl, null));
          });
        } else {
          doCopy(buildShareUrl(baseUrl, null));
        }
      });
    });
  }

  function initShareButtons() {
    initCopyLinkButtons();
    document.querySelectorAll('[data-share-button]').forEach(function (btn) {
      if (btn._shareInit) return;
      btn._shareInit = true;

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var productUrl = btn.getAttribute('data-share-product-url') || '';
        var productTitle = btn.getAttribute('data-share-product-title') || '';
        // Always use current page URL as base, unless productUrl is explicitly set and is a full URL
        // This ensures we share the page the user is currently on, not a different product URL
        var baseUrl = productUrl && productUrl.startsWith('http') ? productUrl : window.location.href;
        var ownerId = resolveOwnerId();

        function doShare(url) {
          // Always use in-page share modal to avoid browser-level
          // "access other apps and services on this device" prompts.
          // Pass the actual URL being shared, not productUrl which might be empty
          openShareModal(url, productTitle, url);
        }

        if (ownerId) {
          resolvePreferredReferralUrl(ownerId, baseUrl).then(function (url) {
            doShare(url);
          }).catch(function () {
            doShare(buildShareUrl(baseUrl, null));
          });
        } else {
          doShare(buildShareUrl(baseUrl, null));
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShareButtons);
  } else {
    initShareButtons();
  }

  document.addEventListener('shopify:section:load', initShareButtons);

  document.addEventListener('share-buttons:reinit', initShareButtons);

  window.ShareButtonInit = initShareButtons;
  window.ShareButtonOpenModal = openShareModal;
  window.ShareButtonBuildUrl = buildShareUrl;
  window.ShareButtonFetchReferralCode = fetchReferralCode;
  window.ShareButtonResolveOwnerId = resolveOwnerId;
  window.ShareButtonResolveShareUrl = function (baseUrl) {
    var ownerId = resolveOwnerId();
    return resolvePreferredReferralUrl(ownerId, baseUrl || window.location.href);
  };
  window.ShareButtonResolveReferralMeta = function (baseUrl) {
    var ownerId = resolveOwnerId();
    return resolveReferralMeta(ownerId, baseUrl || window.location.href);
  };
  window.ShareButtonClearReferralCache = clearPreferredReferralUrlCache;
})();
