(function () {
  'use strict';
  var MODAL_ID = 'generator-mode-modal';
  var CLOSE_ID = 'generator-mode-modal-close';

  var LABELS = {
    design: 'Design',
    quick_inspirations: 'Quick Inspirations'
  };

  function bindCloseHandlers(modal) {
    if (!modal) return;
    var closeBtn = document.getElementById(CLOSE_ID);
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
    modal.addEventListener('cancel', function () { modal.close(); });
  }

  var bound = false;
  function ensureBound() {
    if (bound) return;
    bound = true;
    bindCloseHandlers(document.getElementById(MODAL_ID));
  }

  function modeLabel(val) {
    var i18n = window.CreatorI18n || {};
    if (val === 'quick_inspirations') {
      return i18n.generatorModeQuickInspirations || i18n['creator.generator.mode_quick_inspirations'] || LABELS.quick_inspirations;
    }
    return i18n.generatorModeDesign || i18n['creator.generator.mode_design'] || LABELS.design;
  }

  window.GeneratorModeModal = {
    open: function (opts) {
      opts = opts || {};
      var modal = document.getElementById(MODAL_ID);
      if (!modal) return;
      ensureBound();
      var currentValue = String(opts.currentValue || 'design').toLowerCase().replace(/-/g, '_');
      if (currentValue !== 'quick_inspirations') currentValue = 'design';
      var onSelect = opts.onSelect || function () {};
      var summaryEl = opts.summaryEl || null;

      modal.querySelectorAll('.design-type-modal__item').forEach(function (btn) {
        var val = (btn.getAttribute('data-value') || '').toLowerCase().replace(/-/g, '_');
        btn.classList.toggle('is-selected', val === currentValue);
      });

      function select(val) {
        val = String(val || 'design').toLowerCase().replace(/-/g, '_');
        if (val !== 'quick_inspirations') val = 'design';
        if (summaryEl) summaryEl.textContent = modeLabel(val);
        if (opts.inputId) {
          var inputEl = document.getElementById(opts.inputId);
          if (inputEl) inputEl.value = val;
        }
        onSelect(val);
        modal.close();
      }

      modal.querySelectorAll('.design-type-modal__item').forEach(function (btn) {
        btn.onclick = function () {
          select(btn.getAttribute('data-value'));
        };
      });

      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', '');
    },
    labelFor: modeLabel
  };
})();
