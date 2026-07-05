/**
 * Interests hub — Themen / Stile / Bilder (Creator + Shop)
 */
(function () {
  'use strict';

  var API_BASE =
    (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) ||
    'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';

  /** Same batch size as creator-inspiration-modal.js (list-public) */
  var LIST_PUBLIC_LIMIT = 100;

  var SEARCH_DEBOUNCE_MS = 300;

  /** Mirror creator-inspiration-modal fetchDesigns() filter → query params */
  function applyInspirationFiltersToUrl(url, filters) {
    filters = filters || {};
    if (filters.design_art && filters.design_art.length > 0) {
      url.searchParams.set('filter_design_art', filters.design_art[0]);
    }
    if (filters.ratio && filters.ratio.length > 0) {
      url.searchParams.set('filter_ratio', filters.ratio[0]);
    }
    if (filters.content_type && filters.content_type.length > 0) {
      url.searchParams.set('filter_content_type', filters.content_type[0]);
    }
    if (filters.design_type && filters.design_type.length > 0) {
      url.searchParams.set('filter_design_type', filters.design_type[0]);
    }
    if (filters.design_language && filters.design_language.length > 0) {
      url.searchParams.set('filter_design_language', filters.design_language[0]);
    }
    if (filters.personalizable !== undefined) {
      url.searchParams.set('filter_personalizable', filters.personalizable ? 'yes' : 'no');
    }
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function attrEsc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function getOwnerId() {
    return window.__EAZ_OWNER_ID || null;
  }

  function categoryOrder() {
    return [
      'profession', 'hobby', 'sport', 'music', 'art', 'food',
      'travel', 'animals', 'technology', 'lifestyle', 'nature',
      'gaming', 'fashion', 'science', 'family', 'other'
    ];
  }

  /** Order of style groups in Interests → Styles (matches D1 category_key). */
  function styleCategoryOrder() {
    return [
      'typography_styles',
      'illustration_styles',
      'character_styles',
      'retro_vintage',
      'modern_trend',
      'layout_composition',
      'texture_surface',
      'color_styles',
      'effects_styles',
      'artistic_direction',
      'streetwear_fashion',
      'pattern_styles',
      'other'
    ];
  }

  function styleTooltipText(it) {
    if (!it) return '';
    var lang = (document.documentElement.lang || 'en').split('-')[0];
    if (lang === 'de' && it.description_de) return it.description_de;
    if (it.description_en) return it.description_en;
    return it.description_de || '';
  }

  function HubState(root) {
    this.root = root;
    this.skin = root.getAttribute('data-ehub-skin') || 'creator';
    this.loggedIn = root.getAttribute('data-logged-in') === 'true';
    this.mainTab = 'themes';
    this.interestSelected = new Set();
    this.interestOriginal = new Set();
    this.styleSelected = new Set();
    this.styleOriginal = new Set();
    this.designSelected = new Set();
    this.designOriginal = new Set();
    this.uploadSelected = new Set();
    this.uploadOriginal = new Set();
    this.panelData = null;
    this.stylesPanelData = null;
    this.searchQuery = '';
    this.styleSearchQuery = '';
    this.designSearch = '';
    this.othersUploadCursor = null;
    this.imageGlobalSearch = '';
    this.refDataSnapshot = null;
    this.catTranslations = {};
    this.styleCatTranslations = {};
    this._debounce = null;
    this._styleDebounce = null;
    this._designDebounce = null;
    this._imageSearchDebounce = null;
    try {
      this.inspirationFilters = window.__creatorInspirationActiveFilters
        ? JSON.parse(JSON.stringify(window.__creatorInspirationActiveFilters))
        : {};
    } catch (e) {
      this.inspirationFilters = {};
    }
  }

  HubState.prototype.t = function (key, fallback) {
    var m = window.CreatorI18n || {};
    return m[key] || fallback || key;
  };

  HubState.prototype.init = function () {
    var self = this;
    this.loadCategoryTranslations();
    var gate = this.root.querySelector('#ehubLoginGate');
    var main = this.root.querySelector('#ehubMain');
    if (!this.loggedIn) {
      if (gate) gate.style.display = 'flex';
      if (main) main.style.display = 'none';
      this.bindChrome();
      return;
    }
    if (gate) gate.style.display = 'none';
    if (main) main.style.display = '';
    this.bindChrome();
    this.bindTabs();
    this.refreshThemesFromServer();
    this.refreshStylesFromServer();
    this.refreshReferencesFromServer();
  };

  HubState.prototype.loadCategoryTranslations = function () {
    var el = document.getElementById('ehubCategoryTranslations');
    if (el) {
      try {
        this.catTranslations = JSON.parse(el.textContent);
      } catch (e) {
        this.catTranslations = {};
      }
    }
    var elSt = document.getElementById('ehubStyleCategoryTranslations');
    if (elSt) {
      try {
        this.styleCatTranslations = JSON.parse(elSt.textContent || '{}');
      } catch (e2) {
        this.styleCatTranslations = {};
      }
    }
  };

  HubState.prototype.bindChrome = function () {
    var self = this;
    var loginBtn = this.root.querySelector('#ehubLoginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        var u = encodeURIComponent(window.location.href);
        window.location.href = '/account/login?redirect=' + u;
      });
    }
    this.root.querySelectorAll('[data-ehub-main-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.setMainTab(btn.getAttribute('data-ehub-main-tab'));
      });
    });
  };

  HubState.prototype.setMainTab = function (tab) {
    this.mainTab = tab;
    this.root.querySelectorAll('[data-ehub-main-tab]').forEach(function (b) {
      var on = b.getAttribute('data-ehub-main-tab') === tab;
      b.classList.toggle('ehub__main-tab--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    this.root.querySelectorAll('[data-ehub-main-pane]').forEach(function (p) {
      p.style.display = p.getAttribute('data-ehub-main-pane') === tab ? '' : 'none';
    });
    if (tab === 'images' && this.loggedIn) {
      this.othersUploadCursor = null;
      try {
        if (window.__creatorInspirationActiveFilters) {
          this.inspirationFilters = JSON.parse(JSON.stringify(window.__creatorInspirationActiveFilters));
        }
      } catch (e) {}
      var isi = this.root.querySelector('#ehubImagesSearchInput');
      if (isi) {
        this.imageGlobalSearch = (isi.value || '').trim();
        this.designSearch = this.imageGlobalSearch;
      }
      this.loadPublicDesigns(true);
      this.loadOthersUploads(true);
      if (this.refDataSnapshot) this.renderImagesTab(this.refDataSnapshot);
    }
  };

  HubState.prototype.bindTabs = function () {
    var self = this;
    var si = this.root.querySelector('#ehubSearchInput');
    if (si) {
      si.addEventListener('input', function (e) {
        self.searchQuery = (e.target.value || '').trim();
        if (self._debounce) clearTimeout(self._debounce);
        self._debounce = setTimeout(function () {
          self.renderThemesTab();
        }, SEARCH_DEBOUNCE_MS);
      });
    }
    var sc = this.root.querySelector('#ehubSearchClear');
    if (sc) {
      sc.addEventListener('click', function () {
        self.searchQuery = '';
        if (si) si.value = '';
        sc.style.display = 'none';
        self.renderThemesTab();
      });
    }
    var ssi = this.root.querySelector('#ehubStyleSearchInput');
    if (ssi) {
      ssi.addEventListener('input', function (e) {
        self.styleSearchQuery = (e.target.value || '').trim();
        if (self._styleDebounce) clearTimeout(self._styleDebounce);
        self._styleDebounce = setTimeout(function () {
          self.renderStylesTab();
        }, SEARCH_DEBOUNCE_MS);
      });
    }
    var ssc = this.root.querySelector('#ehubStyleSearchClear');
    if (ssc) {
      ssc.addEventListener('click', function () {
        self.styleSearchQuery = '';
        if (ssi) ssi.value = '';
        ssc.style.display = 'none';
        self.renderStylesTab();
      });
    }
    this.root.querySelector('#ehubSaveThemes') &&
      this.root.querySelector('#ehubSaveThemes').addEventListener('click', function () {
        self.saveThemes();
      });
    this.root.querySelector('#ehubSaveStyles') &&
      this.root.querySelector('#ehubSaveStyles').addEventListener('click', function () {
        self.saveStyles();
      });
    this.root.querySelector('#ehubSaveRefs') &&
      this.root.querySelector('#ehubSaveRefs').addEventListener('click', function () {
        self.saveReferences();
      });
    this.root.querySelector('#ehubAddThemeBtn') &&
      this.root.querySelector('#ehubAddThemeBtn').addEventListener('click', function () {
        self.addNewInterest();
      });
    this.root.querySelector('#ehubAddStyleBtn') &&
      this.root.querySelector('#ehubAddStyleBtn').addEventListener('click', function () {
        self.addNewStyle();
      });
    var fu = this.root.querySelector('#ehubRefFileInput');
    if (fu) {
      fu.addEventListener('change', function () {
        if (fu.files && fu.files[0]) self.uploadReference(fu.files[0]);
        fu.value = '';
      });
    }
    var iub = this.root.querySelector('#ehubImagesUploadBtn');
    if (iub && fu) {
      iub.addEventListener('click', function () {
        fu.click();
      });
    }
    var pub = this.root.querySelector('#ehubImagesPhoneUploadBtn');
    if (pub) {
      pub.addEventListener('click', function () {
        if (!window.CreatorPhoneUploadModal || typeof window.CreatorPhoneUploadModal.open !== 'function') {
          window.alert(
            self.t('creator.interests.hub.phone_upload_unavailable', 'Phone upload is not available on this page.')
          );
          return;
        }
        try {
          window.__EHUB_PHONE_TARGET = self.root;
        } catch (eT) {}
        self.setMainTab('images');
        window.CreatorPhoneUploadModal.open({ sectionId: null });
      });
    }
    var isi = this.root.querySelector('#ehubImagesSearchInput');
    if (isi) {
      isi.addEventListener('input', function (e) {
        self.imageGlobalSearch = (e.target.value || '').trim();
        self.designSearch = self.imageGlobalSearch;
        if (self._imageSearchDebounce) clearTimeout(self._imageSearchDebounce);
        self._imageSearchDebounce = setTimeout(function () {
          self.othersUploadCursor = null;
          self.loadPublicDesigns(true);
          self.loadOthersUploads(true);
          if (self.refDataSnapshot) self.renderImagesTab(self.refDataSnapshot);
        }, SEARCH_DEBOUNCE_MS);
      });
    }
    var mug = this.root.querySelector('#ehubMyUploadGrid');
    if (mug && !mug.getAttribute('data-ehub-own-bound')) {
      mug.setAttribute('data-ehub-own-bound', '1');
      mug.addEventListener('click', function (ev) {
        self.onOwnUploadGridClick(ev);
      });
      mug.addEventListener(
        'blur',
        function (ev) {
          var t = ev.target;
          if (t && t.classList && t.classList.contains('ehub-own-card__tags-inp')) {
            self.flushTagInput(t);
          }
        },
        true
      );
      mug.addEventListener(
        'keydown',
        function (ev) {
          var t = ev.target;
          if (!t || !t.classList || !t.classList.contains('ehub-own-card__tags-inp')) return;
          if (ev.key === 'Enter') {
            ev.preventDefault();
            self.flushTagInput(t);
          }
        },
        true
      );
    }
  };

  HubState.prototype.refreshThemesFromServer = function () {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    return fetch(API_BASE + '?op=get-interests-panel&owner_id=' + encodeURIComponent(oid))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        self.panelData = data;
        return fetch(API_BASE + '?op=get-user-interests&owner_id=' + encodeURIComponent(oid))
          .then(function (r2) {
            return r2.json();
          })
          .then(function (u) {
            if (u.ok && u.interests) {
              self.interestSelected = new Set(u.interests.map(function (x) {
                return x.id;
              }));
              self.interestOriginal = new Set(self.interestSelected);
            }
            self.renderThemesTab();
            self.updateSaveThemes();
          });
      })
      .catch(function (e) {
        console.error('[ehub] themes', e);
      });
  };

  HubState.prototype.refreshStylesFromServer = function () {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    return fetch(API_BASE + '?op=get-styles-panel&owner_id=' + encodeURIComponent(oid))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        self.stylesPanelData = data;
        return fetch(API_BASE + '?op=get-user-styles&owner_id=' + encodeURIComponent(oid))
          .then(function (r2) {
            return r2.json();
          })
          .then(function (u) {
            if (u.ok && u.styles) {
              self.styleSelected = new Set(u.styles.map(function (x) {
                return x.id;
              }));
              self.styleOriginal = new Set(self.styleSelected);
            }
            self.renderStylesTab();
            self.updateSaveStyles();
          });
      })
      .catch(function (e) {
        console.error('[ehub] styles', e);
      });
  };

  HubState.prototype.refreshReferencesFromServer = function () {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    fetch(API_BASE + '?op=get-user-references&owner_id=' + encodeURIComponent(oid))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        self.refDataSnapshot = data;
        self.designSelected = new Set(
          (data.selected_designs || []).map(function (x) {
            return parseInt(String(x.id), 10);
          })
        );
        self.designOriginal = new Set(self.designSelected);
        self.uploadSelected = new Set(
          (data.selected_uploads || []).map(function (x) {
            return x.id;
          })
        );
        self.uploadOriginal = new Set(self.uploadSelected);
        self.renderImagesTab(data);
        self.loadPublicDesigns(true);
        self.loadOthersUploads(true);
        self.updateSaveRefs();
      })
      .catch(function (e) {
        console.error('[ehub] refs', e);
      });
  };

  HubState.prototype.renderThemesTab = function () {
    if (!this.panelData) return;
    var self = this;
    var q = (this.searchQuery || '').toLowerCase();
    var catEl = this.root.querySelector('#ehubCatalogue');
    var mineEl = this.root.querySelector('#ehubMineThemes');
    var othersEl = this.root.querySelector('#ehubOthersThemes');
    var noRes = this.root.querySelector('#ehubNoResultsThemes');
    var addBtn = this.root.querySelector('#ehubAddThemeBtn');
    var clr = this.root.querySelector('#ehubSearchClear');
    var si = this.root.querySelector('#ehubSearchInput');
    if (clr && si) clr.style.display = si.value ? 'flex' : 'none';

    var cats = this.panelData.catalogue && this.panelData.catalogue.categories ? this.panelData.catalogue.categories : [];
    var htmlCat = '';
    categoryOrder().forEach(function (ck) {
      var block = cats.find(function (c) {
        return c.key === ck;
      });
      if (!block || !block.interests || !block.interests.length) return;
      var filtered = block.interests.filter(function (it) {
        return !q || (it.name && it.name.toLowerCase().indexOf(q) >= 0);
      });
      if (!filtered.length) return;
      var title = self.catTranslations[ck] || ck;
      htmlCat +=
        '<div class="ehub-cat" data-cat="' +
        esc(ck) +
        '"><button type="button" class="ehub-cat__head"><span>' +
        esc(title) +
        ' <span class="ehub-cat__cnt">(' +
        filtered.length +
        ')</span></span><svg class="ehub-cat__chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button><div class="ehub-cat__body">';
      filtered.forEach(function (it) {
        htmlCat += self.chipHtml('interest', it.id, it.name, self.interestSelected.has(it.id));
      });
      htmlCat += '</div></div>';
    });
    if (catEl) catEl.innerHTML = htmlCat;
    this.bindCategoryCollapse(catEl);

    var mine = this.panelData.mine || [];
    if (q) mine = mine.filter(function (m) {
      return m.name && m.name.toLowerCase().indexOf(q) >= 0;
    });
    if (mineEl) {
      mineEl.innerHTML = mine
        .map(function (it) {
          return self.chipHtml('interest', it.id, it.name, self.interestSelected.has(it.id));
        })
        .join('');
    }

    var others = this.panelData.others || [];
    if (q) others = others.filter(function (m) {
      return m.name && m.name.toLowerCase().indexOf(q) >= 0;
    });
    if (othersEl) {
      othersEl.innerHTML = others
        .map(function (it) {
          return self.chipHtml('interest', it.id, it.name, self.interestSelected.has(it.id));
        })
        .join('');
    }

    var hasAny = htmlCat.length > 0 || mine.length > 0 || others.length > 0;
    if (noRes) noRes.style.display = hasAny ? 'none' : 'flex';
    if (addBtn) {
      addBtn.style.display = !hasAny && q.length >= 2 ? 'inline-flex' : 'none';
      if (q) addBtn.textContent = '"' + q + '" — ' + self.t('creator.interests.add_as_new', 'Add as new');
    }

    this.bindInterestChips();
    var cnt = this.root.querySelector('#ehubThemeCount');
    if (cnt) cnt.textContent = String(this.interestSelected.size);
  };

  HubState.prototype.bindCategoryCollapse = function (catEl) {
    if (!catEl) return;
    var self = this;
    catEl.querySelectorAll('.ehub-cat__head').forEach(function (h) {
      h.addEventListener('click', function () {
        h.closest('.ehub-cat').classList.toggle('ehub-cat--collapsed');
      });
    });
  };

  HubState.prototype.chipHtml = function (kind, id, name, selected, title) {
    var titleAttr = title ? ' title="' + attrEsc(title) + '"' : '';
    return (
      '<button type="button" class="ehub-chip' +
      (selected ? ' ehub-chip--on' : '') +
      '"' +
      titleAttr +
      ' data-kind="' +
      esc(kind) +
      '" data-id="' +
      esc(id) +
      '"><svg class="ehub-chip__check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg><span>' +
      esc(name) +
      '</span></button>'
    );
  };

  HubState.prototype.bindInterestChips = function () {
    var self = this;
    this.root.querySelectorAll('[data-kind="interest"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-id'), 10);
        if (self.interestSelected.has(id)) {
          self.interestSelected.delete(id);
          btn.classList.remove('ehub-chip--on');
        } else {
          self.interestSelected.add(id);
          btn.classList.add('ehub-chip--on');
        }
        var cnt = self.root.querySelector('#ehubThemeCount');
        if (cnt) cnt.textContent = String(self.interestSelected.size);
        self.updateSaveThemes();
      });
    });
  };

  HubState.prototype.addNewInterest = function () {
    var q = this.searchQuery;
    if (!q || q.length < 2) return;
    var oid = getOwnerId();
    if (!oid) return;
    var lang = (document.documentElement.lang || 'en').split('-')[0];
    var self = this;
    fetch(API_BASE + '?op=add-interest&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: q, lang: lang, source: 'modal', owner_id: oid }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok || !data.interest) return;
        self.interestSelected.add(data.interest.id);
        self.searchQuery = '';
        var si = self.root.querySelector('#ehubSearchInput');
        if (si) si.value = '';
        var oid = getOwnerId();
        fetch(API_BASE + '?op=get-interests-panel&owner_id=' + encodeURIComponent(oid))
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            if (d.ok) self.panelData = d;
            self.renderThemesTab();
            self.updateSaveThemes();
          });
      })
      .catch(function (e) {
        console.error('[ehub] add interest', e);
      });
  };

  HubState.prototype.saveThemes = function () {
    var oid = getOwnerId();
    if (!oid) return;
    var self = this;
    var btn = this.root.querySelector('#ehubSaveThemes');
    if (btn) btn.disabled = true;
    fetch(API_BASE + '?op=set-user-interests&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interest_ids: Array.from(this.interestSelected) }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.ok) {
          self.interestOriginal = new Set(self.interestSelected);
          self.refreshThemesFromServer();
        }
        self.updateSaveThemes();
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  };

  HubState.prototype.updateSaveThemes = function () {
    var btn = this.root.querySelector('#ehubSaveThemes');
    if (!btn) return;
    var ch = !setsEq(this.interestSelected, this.interestOriginal);
    btn.disabled = !ch;
  };

  function setsEq(a, b) {
    if (a.size !== b.size) return false;
    for (var x of a) if (!b.has(x)) return false;
    return true;
  }

  HubState.prototype.renderStylesTab = function () {
    if (!this.stylesPanelData) return;
    var self = this;
    var q = (this.styleSearchQuery || '').toLowerCase();
    var catEl = this.root.querySelector('#ehubStyleCatalogue');
    var mineEl = this.root.querySelector('#ehubMineStyles');
    var othersEl = this.root.querySelector('#ehubOthersStyles');
    var noRes = this.root.querySelector('#ehubNoResultsStyles');
    var addBtn = this.root.querySelector('#ehubAddStyleBtn');
    var clr = this.root.querySelector('#ehubStyleSearchClear');
    var si = this.root.querySelector('#ehubStyleSearchInput');
    if (clr && si) clr.style.display = si.value ? 'flex' : 'none';

    var cats = this.stylesPanelData.catalogue && this.stylesPanelData.catalogue.categories
      ? this.stylesPanelData.catalogue.categories
      : [];
    var htmlCat = '';
    styleCategoryOrder().forEach(function (ck) {
      var block = cats.find(function (c) {
        return c.key === ck;
      });
      if (!block || !block.interests || !block.interests.length) return;
      var filtered = block.interests.filter(function (it) {
        if (!q) return true;
        var n = it.name && it.name.toLowerCase().indexOf(q) >= 0;
        var de = it.description_de && it.description_de.toLowerCase().indexOf(q) >= 0;
        var en = it.description_en && it.description_en.toLowerCase().indexOf(q) >= 0;
        return n || de || en;
      });
      if (!filtered.length) return;
      var title = self.styleCatTranslations[ck] || ck;
      htmlCat +=
        '<div class="ehub-cat" data-cat="' +
        esc(ck) +
        '"><button type="button" class="ehub-cat__head"><span>' +
        esc(title) +
        '</span><svg class="ehub-cat__chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg></button><div class="ehub-cat__body">';
      filtered.forEach(function (it) {
        htmlCat += self.chipHtml('style', it.id, it.name, self.styleSelected.has(it.id), styleTooltipText(it));
      });
      htmlCat += '</div></div>';
    });
    if (catEl) {
      catEl.innerHTML = htmlCat;
      self.bindCategoryCollapse(catEl);
    }

    var mine = this.stylesPanelData.mine || [];
    if (q) {
      mine = mine.filter(function (m) {
        var n = m.name && m.name.toLowerCase().indexOf(q) >= 0;
        var de = m.description_de && m.description_de.toLowerCase().indexOf(q) >= 0;
        var en = m.description_en && m.description_en.toLowerCase().indexOf(q) >= 0;
        return n || de || en;
      });
    }
    if (mineEl) {
      mineEl.innerHTML = mine
        .map(function (it) {
          return self.chipHtml('style', it.id, it.name, self.styleSelected.has(it.id), styleTooltipText(it));
        })
        .join('');
    }
    var others = this.stylesPanelData.others || [];
    if (q) {
      others = others.filter(function (m) {
        var n = m.name && m.name.toLowerCase().indexOf(q) >= 0;
        var de = m.description_de && m.description_de.toLowerCase().indexOf(q) >= 0;
        var en = m.description_en && m.description_en.toLowerCase().indexOf(q) >= 0;
        return n || de || en;
      });
    }
    if (othersEl) {
      othersEl.innerHTML = others
        .map(function (it) {
          return self.chipHtml('style', it.id, it.name, self.styleSelected.has(it.id), styleTooltipText(it));
        })
        .join('');
    }

    var hasAny = htmlCat.length > 0 || mine.length > 0 || others.length > 0;
    if (noRes) noRes.style.display = hasAny ? 'none' : 'flex';
    if (addBtn) {
      addBtn.style.display = !hasAny && q.length >= 2 ? 'inline-flex' : 'none';
    }

    this.root.querySelectorAll('[data-kind="style"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-id'), 10);
        if (self.styleSelected.has(id)) {
          self.styleSelected.delete(id);
          btn.classList.remove('ehub-chip--on');
        } else {
          self.styleSelected.add(id);
          btn.classList.add('ehub-chip--on');
        }
        var cnt = self.root.querySelector('#ehubStyleCount');
        if (cnt) cnt.textContent = String(self.styleSelected.size);
        self.updateSaveStyles();
      });
    });
    var cnt = this.root.querySelector('#ehubStyleCount');
    if (cnt) cnt.textContent = String(this.styleSelected.size);
  };

  HubState.prototype.addNewStyle = function () {
    var q = this.styleSearchQuery;
    if (!q || q.length < 2) return;
    var oid = getOwnerId();
    if (!oid) return;
    var lang = (document.documentElement.lang || 'en').split('-')[0];
    var self = this;
    fetch(API_BASE + '?op=add-style&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: q, lang: lang, source: 'modal', owner_id: oid }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok || !data.style) return;
        self.styleSelected.add(data.style.id);
        self.styleSearchQuery = '';
        var si = self.root.querySelector('#ehubStyleSearchInput');
        if (si) si.value = '';
        var oid = getOwnerId();
        fetch(API_BASE + '?op=get-styles-panel&owner_id=' + encodeURIComponent(oid))
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            if (d.ok) self.stylesPanelData = d;
            self.renderStylesTab();
            self.updateSaveStyles();
          });
      });
  };

  HubState.prototype.saveStyles = function () {
    var oid = getOwnerId();
    if (!oid) return;
    var self = this;
    var btn = this.root.querySelector('#ehubSaveStyles');
    if (btn) btn.disabled = true;
    fetch(API_BASE + '?op=set-user-styles&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style_ids: Array.from(this.styleSelected) }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.ok) {
          self.styleOriginal = new Set(self.styleSelected);
          self.refreshStylesFromServer();
        }
        self.updateSaveStyles();
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  };

  HubState.prototype.updateSaveStyles = function () {
    var btn = this.root.querySelector('#ehubSaveStyles');
    if (!btn) return;
    btn.disabled = setsEq(this.styleSelected, this.styleOriginal);
  };

  HubState.prototype.loadPublicDesigns = function (reset) {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    var q = (this.imageGlobalSearch || this.designSearch || '').trim();
    var base = API_BASE.indexOf('http') === 0 ? API_BASE : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
    var url;
    try {
      url = new URL(base);
    } catch (e) {
      url = new URL('https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');
    }
    url.searchParams.set('op', 'list-public');
    url.searchParams.set('limit', String(LIST_PUBLIC_LIMIT));
    if (q) url.searchParams.set('search', q);
    applyInspirationFiltersToUrl(url, this.inspirationFilters || {});

    fetch(url.toString(), { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        var box = self.root.querySelector('#ehubDesignGrid');
        if (!box) return;
        var html = '';
        (data.items || []).forEach(function (it) {
          var id = parseInt(String(it.id), 10);
          var on = self.designSelected.has(id);
          html +=
            '<button type="button" class="ehub-tile ehub-tile--contain' +
            (on ? ' ehub-tile--on' : '') +
            '" data-design-id="' +
            id +
            '"><span class="ehub-tile__img-wrap"><img src="' +
            esc(it.preview_url || it.original_url || '') +
            '" alt="" loading="lazy"/></span></button>';
        });
        box.innerHTML = html;
        box.querySelectorAll('[data-design-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-design-id'), 10);
            if (self.designSelected.has(id)) {
              self.designSelected.delete(id);
              btn.classList.remove('ehub-tile--on');
            } else {
              self.designSelected.add(id);
              btn.classList.add('ehub-tile--on');
            }
            self.updateSaveRefs();
          });
        });
      });
  };

  HubState.prototype.loadOthersUploads = function (reset) {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    var sq = this.imageGlobalSearch || '';
    var url =
      API_BASE +
      '?op=list-interest-reference-uploads-others&owner_id=' +
      encodeURIComponent(oid) +
      (sq ? '&search=' + encodeURIComponent(sq) : '') +
      (this.othersUploadCursor ? '&cursor=' + encodeURIComponent(this.othersUploadCursor) : '');
    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) return;
        var box = self.root.querySelector('#ehubOthersUploadGrid');
        if (!box) return;
        var html = reset ? '' : box.innerHTML;
        (data.items || []).forEach(function (it) {
          var on = self.uploadSelected.has(it.id);
          html +=
            '<button type="button" class="ehub-tile ehub-tile--contain' +
            (on ? ' ehub-tile--on' : '') +
            '" data-upload-id="' +
            it.id +
            '"><span class="ehub-tile__img-wrap"><img src="' +
            esc(it.public_url) +
            '" alt="" loading="lazy"/></span></button>';
        });
        box.innerHTML = html;
        self.othersUploadCursor = data.next_cursor || null;
        box.querySelectorAll('[data-upload-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-upload-id'), 10);
            if (self.uploadSelected.has(id)) {
              self.uploadSelected.delete(id);
              btn.classList.remove('ehub-tile--on');
            } else {
              self.uploadSelected.add(id);
              btn.classList.add('ehub-tile--on');
            }
            self.updateSaveRefs();
          });
        });
      });
  };

  HubState.prototype.uploadReference = function (file) {
    var oid = getOwnerId();
    if (!oid) return;
    var self = this;
    var fd = new FormData();
    fd.append('image', file);
    fd.append('owner_id', oid);
    fetch(API_BASE + '?op=upload-interest-reference&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      body: fd,
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok || !data.upload) return;
        self.refreshReferencesFromServer();
      })
      .catch(function (e) {
        console.error('[ehub] upload', e);
      });
  };

  /** After QR phone session — same pipeline as choosing a file locally. */
  HubState.prototype.applyRemoteImageAsUpload = function (imageUrl) {
    var self = this;
    fetch(imageUrl, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('fetch_failed');
        return r.blob();
      })
      .then(function (blob) {
        var ft = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/png';
        var file = new File([blob], 'interest-from-phone.png', { type: ft });
        self.uploadReference(file);
      })
      .catch(function () {
        window.alert(
          (window.CreatorI18n && window.CreatorI18n.chat_genericError) ||
            self.t(
              'creator.interests.hub.phone_fetch_failed',
              'Could not load the image. Try uploading from this device instead.'
            )
        );
      });
  };

  function tagsEnc(arr) {
    try {
      return encodeURIComponent(JSON.stringify(arr || []));
    } catch (e) {
      return '%5B%5D';
    }
  }

  HubState.prototype.getTagsFromCard = function (card) {
    var raw = card.getAttribute('data-tags-enc') || '%5B%5D';
    try {
      var t = JSON.parse(decodeURIComponent(raw));
      return Array.isArray(t) ? t : [];
    } catch (e) {
      return [];
    }
  };

  HubState.prototype.setTagsOnCard = function (card, tags) {
    card.setAttribute('data-tags-enc', tagsEnc(tags));
    this.renderTagChips(card);
  };

  HubState.prototype.renderTagChips = function (card) {
    var chips = card.querySelector('.ehub-own-card__chips');
    if (!chips) return;
    var tags = this.getTagsFromCard(card);
    var uid = card.getAttribute('data-upload-id');
    var rm = this.t('creator.interests.hub.remove_tag', 'Remove tag');
    chips.innerHTML = tags
      .map(function (tag, i) {
        return (
          '<span class="ehub-tag"><span class="ehub-tag__t">' +
          esc(tag) +
          '</span><button type="button" class="ehub-tag__x" data-action="remove-tag" data-tag-idx="' +
          i +
          '" data-upload-id="' +
          esc(uid) +
          '" aria-label="' +
          esc(rm) +
          '">×</button></span>'
        );
      })
      .join('');
  };

  HubState.prototype.flushTagInput = function (inp) {
    var card = inp.closest('.ehub-own-card');
    if (!card) return;
    var extra = this.parseTagsFromString(inp.value || '');
    inp.value = '';
    if (!extra.length) return;
    var tags = this.getTagsFromCard(card);
    extra.forEach(function (t) {
      if (tags.indexOf(t) < 0) tags.push(t);
    });
    this.setTagsOnCard(card, tags);
  };

  HubState.prototype.parseTagsFromString = function (s) {
    if (!s) return [];
    return s
      .split(',')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  };

  HubState.prototype.renderOwnUploadCardHtml = function (u) {
    var self = this;
    var on = self.uploadSelected.has(u.id);
    var tags = u.tags || [];
    var title = u.title || '';
    var phTitle = self.t('creator.interests.hub.ref_title_placeholder', 'Title (optional)');
    var phTags = self.t('creator.interests.hub.ref_tags_placeholder', 'Tags — comma-separated (optional)');
    var saveL = self.t('creator.interests.hub.save_details', 'Save details');
    var delL = self.t('creator.interests.hub.remove_image', 'Remove image');
    return (
      '<div class="ehub-own-card" data-upload-id="' +
      u.id +
      '" data-tags-enc="' +
      tagsEnc(tags) +
      '">' +
      '<div class="ehub-own-card__row">' +
      '<div class="ehub-own-card__media">' +
      '<button type="button" class="ehub-tile ehub-tile--contain' +
      (on ? ' ehub-tile--on' : '') +
      '" data-upload-id="' +
      u.id +
      '" data-action="pick-upload">' +
      '<span class="ehub-tile__img-wrap"><img src="' +
      esc(u.public_url) +
      '" alt="" loading="lazy"/></span></button></div>' +
      '<div class="ehub-own-card__fields">' +
      '<input type="text" class="ehub-own-card__title" data-field="title" placeholder="' +
      esc(phTitle) +
      '" value="' +
      esc(title) +
      '" />' +
      '<input type="text" class="ehub-own-card__tags-inp" data-field="tags-input" placeholder="' +
      esc(phTags) +
      '" autocomplete="off" />' +
      '<div class="ehub-own-card__chips"></div>' +
      '<div class="ehub-own-card__actions">' +
      '<button type="button" class="ehub-own-card__save" data-action="save-meta" data-upload-id="' +
      u.id +
      '">' +
      esc(saveL) +
      '</button>' +
      '<button type="button" class="ehub-own-card__del" data-action="delete-upload" data-upload-id="' +
      u.id +
      '">' +
      esc(delL) +
      '</button></div></div></div></div>'
    );
  };

  HubState.prototype.onOwnUploadGridClick = function (ev) {
    var t = ev.target;
    var self = this;
    var xBtn = t.closest && t.closest('.ehub-tag__x');
    if (xBtn) {
      var card0 = xBtn.closest('.ehub-own-card');
      var idx = parseInt(xBtn.getAttribute('data-tag-idx'), 10);
      if (card0 && !isNaN(idx)) {
        var tags0 = self.getTagsFromCard(card0);
        if (tags0[idx] !== undefined) {
          tags0.splice(idx, 1);
          self.setTagsOnCard(card0, tags0);
        }
      }
      return;
    }
    var pick = t.closest && t.closest('[data-action="pick-upload"]');
    if (pick) {
      var pid = parseInt(pick.getAttribute('data-upload-id'), 10);
      if (self.uploadSelected.has(pid)) {
        self.uploadSelected.delete(pid);
        pick.classList.remove('ehub-tile--on');
      } else {
        self.uploadSelected.add(pid);
        pick.classList.add('ehub-tile--on');
      }
      self.updateSaveRefs();
      return;
    }
    var btn = t.closest && t.closest('[data-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-action');
    var uid = parseInt(btn.getAttribute('data-upload-id') || '0', 10);
    var card = btn.closest('.ehub-own-card');
    if (act === 'save-meta' && card) {
      self.saveOwnUploadMeta(card);
      return;
    }
    if (act === 'delete-upload' && uid) {
      self.deleteOwnUpload(uid);
    }
  };

  HubState.prototype.saveOwnUploadMeta = function (card) {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    var uid = parseInt(card.getAttribute('data-upload-id'), 10);
    var titleInp = card.querySelector('.ehub-own-card__title');
    var title = titleInp ? String(titleInp.value || '').trim() : '';
    var tags = this.getTagsFromCard(card);
    fetch(API_BASE + '?op=update-interest-reference-upload&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uid, title: title || null, tags: tags }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.ok) self.refreshReferencesFromServer();
      });
  };

  HubState.prototype.deleteOwnUpload = function (uploadId) {
    var self = this;
    var oid = getOwnerId();
    if (!oid) return;
    fetch(API_BASE + '?op=delete-interest-reference-upload&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.ok) {
          self.uploadSelected.delete(uploadId);
          self.refreshReferencesFromServer();
        }
      });
  };

  HubState.prototype.renderImagesTab = function (refData) {
    var self = this;
    this.refDataSnapshot = refData;
    var mineBox = this.root.querySelector('#ehubMyUploadGrid');
    if (!mineBox || !refData) return;
    var q = (this.imageGlobalSearch || '').toLowerCase().trim();
    var uploads = refData.my_uploads || [];
    if (q) {
      uploads = uploads.filter(function (u) {
        var title = (u.title || '').toLowerCase();
        var tagStr = (u.tags || []).join(' ').toLowerCase();
        return title.indexOf(q) >= 0 || tagStr.indexOf(q) >= 0;
      });
    }
    mineBox.innerHTML = uploads.map(function (u) {
      return self.renderOwnUploadCardHtml(u);
    }).join('');
    mineBox.querySelectorAll('.ehub-own-card').forEach(function (card) {
      self.renderTagChips(card);
    });
  };

  HubState.prototype.saveReferences = function () {
    var oid = getOwnerId();
    if (!oid) return;
    var self = this;
    var btn = this.root.querySelector('#ehubSaveRefs');
    if (btn) btn.disabled = true;
    fetch(API_BASE + '?op=set-user-references&owner_id=' + encodeURIComponent(oid), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        design_ids: Array.from(this.designSelected),
        upload_ids: Array.from(this.uploadSelected),
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.ok) {
          self.designOriginal = new Set(self.designSelected);
          self.uploadOriginal = new Set(self.uploadSelected);
        }
        self.updateSaveRefs();
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  };

  HubState.prototype.updateSaveRefs = function () {
    var btn = this.root.querySelector('#ehubSaveRefs');
    if (!btn) return;
    var ch =
      !setsEq(this.designSelected, this.designOriginal) || !setsEq(this.uploadSelected, this.uploadOriginal);
    btn.disabled = !ch;
  };

  function mount(root) {
    if (!root || root.getAttribute('data-ehub-mounted') === '1') return;
    root.setAttribute('data-ehub-mounted', '1');
    var st = new HubState(root);
    st.init();
    root._ehub = st;
  }

  function applyPhoneImageFromUrl(imageUrl, rootEl) {
    if (!imageUrl || !rootEl) return false;
    var st = rootEl._ehub;
    if (!st) return false;
    st.setMainTab('images');
    st.applyRemoteImageAsUpload(imageUrl);
    return true;
  }

  window.EazInterestsHub = { mount: mount, applyPhoneImageFromUrl: applyPhoneImageFromUrl };

  if (!window.__EHUB_INSP_FILTERS) {
    window.__EHUB_INSP_FILTERS = true;
    window.addEventListener('inspiration-filter-changed', function (ev) {
      var filters = ev.detail && ev.detail.filters ? ev.detail.filters : {};
      var copy;
      try {
        copy = JSON.parse(JSON.stringify(filters));
      } catch (e) {
        copy = {};
      }
      document.querySelectorAll('.ehub[id^="eazInterestsHub"]').forEach(function (root) {
        if (root._ehub) {
          root._ehub.inspirationFilters = copy;
          if (root._ehub.mainTab === 'images' && root._ehub.loggedIn) {
            root._ehub.loadPublicDesigns(true);
          }
        }
      });
    });
  }

  if (!window.__EHUB_LISTENERS) {
    window.__EHUB_LISTENERS = true;
    window.addEventListener('creator-settings-v2-tab-changed', function (e) {
      if (e.detail && e.detail.tab === 'interests') {
        var r = document.getElementById('eazInterestsHubCreator');
        if (r) mount(r);
      }
    });
    window.addEventListener('creator-settings-v2-opened', function () {
      if (window.CreatorSettingsV2Modal && window.CreatorSettingsV2Modal.getCurrentTab() === 'interests') {
        var r = document.getElementById('eazInterestsHubCreator');
        if (r) mount(r);
      }
    });
    window.addEventListener('account-modal-tab-loaded', function (e) {
      if (e.detail && e.detail.tab === 'interests') {
        var r = document.getElementById('eazInterestsHubShop');
        if (r) mount(r);
      }
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        var r = document.getElementById('eazInterestsHubCreator');
        if (r && window.CreatorSettingsV2Modal && window.CreatorSettingsV2Modal.getCurrentTab() === 'interests') {
          mount(r);
        }
      });
    }
  }
})();
