/**
 * Farbauswahl Modal – Design & Background
 * Sub-tabs: Design | Background
 * Design: 5 Farben wählbar
 * Background: Switch Farbe/Transparent; bei Farbe 5 Farben wählbar
 */
(function () {
  'use strict';

  var MAX_COLORS = 5;

  function normalizeHex(h) {
    if (!h) return '';
    h = (h + '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toLowerCase();
    return '';
  }

  function addColor(selected, hex) {
    hex = normalizeHex(hex);
    if (!hex || selected.indexOf(hex) >= 0) return;
    if (selected.length >= MAX_COLORS) return;
    selected.push(hex);
  }

  function renderDots(container, selected, onRemove) {
    if (!container) return;
    container.innerHTML = '';
    selected.forEach(function (hex, i) {
      var dot = document.createElement('div');
      dot.className = 'gen-color-dot';
      dot.style.background = hex;
      dot.setAttribute('data-hex', hex);
      var rm = document.createElement('button');
      rm.className = 'gen-color-dot-remove';
      rm.type = 'button';
      rm.textContent = 'x';
      rm.setAttribute('aria-label', 'Remove');
      rm.onclick = function () {
        selected.splice(i, 1);
        onRemove();
      };
      dot.appendChild(rm);
      container.appendChild(dot);
    });
  }

  function bindColorPanel(panel, selected, pickerId, hexId, addId, dotsId, presetClass) {
    var picker = panel.querySelector('#' + pickerId);
    var hexInput = panel.querySelector('#' + hexId);
    var addBtn = panel.querySelector('#' + addId);
    var dotsCont = panel.querySelector('#' + dotsId);

    function rerender() {
      renderDots(dotsCont, selected, rerender);
    }

    function syncPickerHex() {
      if (picker && hexInput) hexInput.value = picker.value;
    }

    panel.querySelectorAll('.' + presetClass).forEach(function (btn) {
      btn.onclick = function () {
        addColor(selected, btn.getAttribute('data-hex'));
        rerender();
      };
    });

    if (picker) {
      picker.value = selected[0] || '#f59e0b';
      picker.oninput = syncPickerHex;
    }
    if (hexInput) {
      hexInput.value = selected[0] || '#f59e0b';
      hexInput.oninput = function () {
        var h = normalizeHex(hexInput.value);
        if (h && picker) picker.value = h;
      };
    }
    if (addBtn) {
      addBtn.onclick = function () {
        addColor(selected, hexInput ? hexInput.value : picker ? picker.value : '');
        rerender();
      };
    }

    rerender();
  }

  window.GenColorModal = {
    open: function (opts) {
      opts = opts || {};
      var overlay = document.getElementById('genColorOverlay');
      if (!overlay) return;

      var designColors = Array.isArray(opts.designColors) ? opts.designColors.slice() : [];
      var backgroundColors = Array.isArray(opts.backgroundColors) ? opts.backgroundColors.slice() : [];
      var backgroundTransparent = opts.backgroundTransparent !== false;
      var onApply = opts.onApply || function () {};
      var summaryEl = opts.summaryEl || null;

      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');

      var tabDesign = document.getElementById('genColorTabDesign');
      var tabBg = document.getElementById('genColorTabBackground');
      var panelDesign = document.getElementById('genColorPanelDesign');
      var panelBg = document.getElementById('genColorPanelBackground');
      var bgSwitch = document.getElementById('genColorBgTransparent');
      var bgLabel = document.getElementById('genColorBgLabel');
      var bgColorBlock = document.getElementById('genColorBgColorBlock');

      function switchTab(tab) {
        var isDesign = tab === 'design';
        tabDesign.classList.toggle('is-active', isDesign);
        tabBg.classList.toggle('is-active', !isDesign);
        if (panelDesign) panelDesign.style.display = isDesign ? 'block' : 'none';
        if (panelBg) panelBg.style.display = isDesign ? 'none' : 'block';
      }

      if (tabDesign) tabDesign.onclick = function () { switchTab('design'); };
      if (tabBg) tabBg.onclick = function () { switchTab('background'); };

      switchTab('design');

      function updateBgSwitchUI() {
        var transparent = bgSwitch ? bgSwitch.checked : true;
        if (bgLabel) bgLabel.textContent = transparent ? 'Transparent' : 'Color';
        if (bgColorBlock) bgColorBlock.style.display = transparent ? 'none' : 'block';
      }

      if (bgSwitch) {
        bgSwitch.checked = backgroundTransparent;
        bgSwitch.onchange = function () {
          backgroundTransparent = bgSwitch.checked;
          updateBgSwitchUI();
        };
      }
      updateBgSwitchUI();

      bindColorPanel(panelDesign, designColors, 'genColorDesignPicker', 'genColorDesignHex', 'genColorDesignAdd', 'genColorDesignDots', 'gen-color-preset');
      var bgPanel = document.getElementById('genColorPanelBackground');
      if (bgPanel) {
        bindColorPanel(bgPanel, backgroundColors, 'genColorBgPicker', 'genColorBgHex', 'genColorBgAdd', 'genColorBgDots', 'gen-color-preset-bg');
      }

      function closeModal() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
      }

      var closeBtn = document.getElementById('genColorClose');
      if (closeBtn) closeBtn.onclick = closeModal;
      overlay.onclick = function (e) { if (e.target === overlay) closeModal(); };

      var applyBtn = document.getElementById('genColorApply');
      if (applyBtn) {
        applyBtn.onclick = function () {
          if (summaryEl) {
            var parts = [];
            parts.push('Design: ' + designColors.length + ' colors');
            if (backgroundTransparent) parts.push('Background: transparent');
            else parts.push('Background: ' + backgroundColors.length + ' colors');
            summaryEl.textContent = parts.join(' · ');
          }
          onApply({
            designColors: designColors,
            backgroundColors: backgroundColors,
            backgroundTransparent: backgroundTransparent
          });
          closeModal();
        };
      }
    }
  };
})();
