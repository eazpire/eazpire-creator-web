/**
 * Styles Modal – dev prototype
 * Entspricht theme/assets/style-modal.js
 * Max 5 Auswahl, kategorisiert mit klappbaren Containern, Suche
 */
(function () {
  'use strict';

  var MAX_SELECT = 5;
  var overlay = null;
  var selected = [];
  var onApplyCb = null;
  var summaryEl = null;
  var countBadgeEl = null;

  function runSearch(q) {
    q = (q || '').toLowerCase().trim();
    var categories = document.querySelectorAll('#genStylesCategories .gen-styles-category');
    categories.forEach(function (cat) {
      var chips = cat.querySelectorAll('.gen-styles-chip');
      var visibleCount = 0;
      chips.forEach(function (chip) {
        var text = (chip.textContent || '').toLowerCase();
        var matches = !q || text.indexOf(q) >= 0;
        chip.classList.toggle('is-filtered', !matches);
        if (matches) visibleCount++;
      });
      cat.classList.toggle('is-hidden', visibleCount === 0);
      if (visibleCount > 0 && q) {
        cat.classList.remove('is-collapsed');
        var h = cat.querySelector('.gen-styles-category-header');
        if (h) h.setAttribute('aria-expanded', 'true');
      }
    });
  }

  function updateUI() {
    var chips = document.querySelectorAll('#genStylesCategories .gen-styles-chip');
    chips.forEach(function (chip) {
      var s = chip.getAttribute('data-style');
      chip.classList.toggle('is-selected', selected.indexOf(s) >= 0);
      chip.classList.toggle('is-disabled', selected.length >= MAX_SELECT && selected.indexOf(s) < 0);
    });
    if (summaryEl) {
      summaryEl.textContent = selected.length + ' Styles ausgewaehlt';
    }
    if (countBadgeEl) {
      countBadgeEl.textContent = selected.length + '/' + MAX_SELECT;
    }
  }

  function close() {
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function open(opts) {
    opts = opts || {};
    overlay = document.getElementById('genStylesOverlay');
    if (!overlay) return;

    selected = Array.isArray(opts.selected) ? opts.selected.slice() : [];
    onApplyCb = opts.onApply || function () {};
    summaryEl = opts.summaryEl || null;
    countBadgeEl = document.getElementById('genStylesCountBadge');

    var categories = overlay.querySelectorAll('.gen-styles-category');
    categories.forEach(function (cat) {
      cat.classList.remove('is-collapsed', 'is-hidden');
      var h = cat.querySelector('.gen-styles-category-header');
      if (h) h.setAttribute('aria-expanded', 'true');
    });

    var search = document.getElementById('genStylesSearch');
    if (search) {
      search.value = '';
      search.oninput = function () { runSearch(search.value); };
    }
    runSearch('');

    updateUI();

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function bind() {
    overlay = document.getElementById('genStylesOverlay');
    if (!overlay) return;
    countBadgeEl = document.getElementById('genStylesCountBadge');

    var closeBtn = document.getElementById('genStylesClose');
    var applyBtn = document.getElementById('genStylesApply');

    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        if (onApplyCb) onApplyCb(selected);
        close();
      });
    }

    overlay.querySelectorAll('.gen-styles-category-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var cat = header.closest('.gen-styles-category');
        var expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', !expanded);
        cat.classList.toggle('is-collapsed', expanded);
      });
    });

    overlay.querySelectorAll('.gen-styles-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var s = chip.getAttribute('data-style');
        var idx = selected.indexOf(s);
        if (idx >= 0) selected.splice(idx, 1);
        else if (selected.length < MAX_SELECT) selected.push(s);
        updateUI();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.GenStylesModal = {
    open: open,
    close: close,
    getSelected: function () { return selected.slice(); }
  };
})();
