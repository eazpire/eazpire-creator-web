/**
 * Wardrobe Figure – 6 SVG silhouette variants with clickable zones
 * More anatomically proportioned human silhouettes
 * Variants: male-adult, female-adult, male-child, female-child, baby-male, baby-female
 */
(function () {
  'use strict';

  var ZONE_COLORS = {
    default: '#dde3ed',
    hover: '#a5b4fc',
    filled: '#818cf8',
    filledHover: '#6366f1',
    onePiece: '#e8ecf4',
    onePieceHover: '#c7d2fe'
  };

  // ── Adult Male (taller, broader shoulders, narrower hips) ──
  var maleAdult = buildSVG('male-adult', [
    // Head – oval with slight jaw
    { slot: 'head', d: 'M88 12 C88 4, 112 4, 112 12 L112 32 Q112 44 100 46 Q88 44 88 32 Z' },
    // Neck
    { slot: 'upper_body', d: 'M94 46 L106 46 L106 54 L94 54 Z', isNeck: true },
    // Torso – broad shoulders, slight V-taper
    { slot: 'upper_body', d: 'M60 58 Q70 52 94 54 L106 54 Q130 52 140 58 L140 68 L136 110 Q120 116 100 116 Q80 116 64 110 L60 68 Z' },
    // Layer / Jacket – upper arms
    { slot: 'layer', d: 'M60 58 L52 62 L42 56 L36 62 L38 102 L48 104 L52 100 L60 68 Z M140 58 L148 62 L158 56 L164 62 L162 102 L152 104 L148 100 L140 68 Z' },
    // Pants – legs with slight taper
    { slot: 'pants', d: 'M66 118 Q80 116 100 118 Q120 116 134 118 L130 200 L112 200 L108 160 L100 148 L92 160 L88 200 L70 200 Z' },
    // Socks
    { slot: 'socks', d: 'M70 200 L88 200 L87 214 L69 214 Z M112 200 L130 200 L131 214 L113 214 Z' },
    // Feet / shoes
    { slot: 'feet', d: 'M62 214 L87 214 L88 230 Q88 238 80 238 L58 238 Q52 238 52 232 L54 220 Z M113 214 L138 214 L146 220 L148 232 Q148 238 142 238 L120 238 Q112 238 112 230 Z' },
    // Accessory 1 – left hand area
    { slot: 'accessory_1', d: 'M34 102 L48 104 L46 118 L32 116 Z' },
    // Accessory 2 – right hand area
    { slot: 'accessory_2', d: 'M152 104 L166 102 L168 116 L154 118 Z' },
    // One-piece (full body overlay)
    { slot: 'one_piece', d: 'M60 58 Q70 52 94 54 L106 54 Q130 52 140 58 L140 68 L136 110 L134 118 L130 200 L112 200 L108 160 L100 148 L92 160 L88 200 L70 200 L66 118 L64 110 L60 68 Z', isOnePiece: true }
  ], 200, 248);

  // ── Adult Female (narrower shoulders, defined waist, wider hips) ──
  var femaleAdult = buildSVG('female-adult', [
    // Head – rounder with softer jaw, slightly longer hair silhouette
    { slot: 'head', d: 'M86 10 Q86 2 100 2 Q114 2 114 10 L114 33 Q114 45 100 47 Q86 45 86 33 Z' },
    // Neck
    { slot: 'upper_body', d: 'M95 47 L105 47 L105 55 L95 55 Z', isNeck: true },
    // Torso – narrower shoulders, cinched waist, wider hips
    { slot: 'upper_body', d: 'M66 60 Q76 53 95 55 L105 55 Q124 53 134 60 L132 72 L126 96 Q118 104 100 106 Q82 104 74 96 L68 72 Z' },
    // Layer – upper arms (slimmer)
    { slot: 'layer', d: 'M66 60 L56 64 L48 58 L42 64 L44 100 L52 102 L56 96 L66 72 Z M134 60 L144 64 L152 58 L158 64 L156 100 L148 102 L144 96 L134 72 Z' },
    // Pants/skirt area – wider hips tapering to legs
    { slot: 'pants', d: 'M72 108 Q82 104 100 108 Q118 104 128 108 L132 120 L128 200 L110 200 L106 162 L100 150 L94 162 L90 200 L72 200 L68 120 Z' },
    // Socks
    { slot: 'socks', d: 'M72 200 L90 200 L89 214 L71 214 Z M110 200 L128 200 L129 214 L111 214 Z' },
    // Feet / shoes
    { slot: 'feet', d: 'M64 214 L89 214 L90 230 Q90 238 82 238 L60 238 Q54 238 54 232 L56 220 Z M111 214 L136 214 L144 220 L146 232 Q146 238 140 238 L118 238 Q110 238 110 230 Z' },
    // Accessory 1
    { slot: 'accessory_1', d: 'M40 100 L52 102 L50 116 L38 114 Z' },
    // Accessory 2
    { slot: 'accessory_2', d: 'M148 102 L160 100 L162 114 L150 116 Z' },
    // One-piece
    { slot: 'one_piece', d: 'M66 60 Q76 53 95 55 L105 55 Q124 53 134 60 L132 72 L128 108 L132 120 L128 200 L110 200 L106 162 L100 150 L94 162 L90 200 L72 200 L68 120 L72 108 L68 72 Z', isOnePiece: true }
  ], 200, 248);

  // ── Child Male (shorter, bigger head proportion, chubbier) ──
  var maleChild = buildSVG('male-child', [
    { slot: 'head', d: 'M82 14 C82 4, 118 4, 118 14 L118 40 Q118 54 100 56 Q82 54 82 40 Z' },
    { slot: 'upper_body', d: 'M94 56 L106 56 L106 62 L94 62 Z', isNeck: true },
    { slot: 'upper_body', d: 'M64 66 Q74 60 94 62 L106 62 Q126 60 136 66 L134 108 Q120 114 100 114 Q80 114 66 108 Z' },
    { slot: 'layer', d: 'M64 66 L54 70 L46 64 L40 70 L42 104 L50 106 L54 100 L64 78 Z M136 66 L146 70 L154 64 L160 70 L158 104 L150 106 L146 100 L136 78 Z' },
    { slot: 'pants', d: 'M68 116 Q80 114 100 116 Q120 114 132 116 L128 182 L112 182 L108 152 L100 142 L92 152 L88 182 L72 182 Z' },
    { slot: 'socks', d: 'M72 182 L88 182 L87 194 L71 194 Z M112 182 L128 182 L129 194 L113 194 Z' },
    { slot: 'feet', d: 'M64 194 L87 194 L88 208 Q88 214 80 214 L60 214 Q54 214 54 208 Z M113 194 L136 194 L146 208 Q146 214 140 214 L120 214 Q112 214 112 208 Z' },
    { slot: 'accessory_1', d: 'M38 104 L50 106 L48 118 L36 116 Z' },
    { slot: 'accessory_2', d: 'M150 106 L162 104 L164 116 L152 118 Z' },
    { slot: 'one_piece', d: 'M64 66 Q74 60 94 62 L106 62 Q126 60 136 66 L134 108 L132 116 L128 182 L112 182 L108 152 L100 142 L92 152 L88 182 L72 182 L68 116 L66 108 Z', isOnePiece: true }
  ], 200, 224);

  // ── Child Female (shorter, rounder, slight waist) ──
  var femaleChild = buildSVG('female-child', [
    { slot: 'head', d: 'M82 12 C82 2, 118 2, 118 12 L118 38 Q118 52 100 54 Q82 52 82 38 Z' },
    { slot: 'upper_body', d: 'M94 54 L106 54 L106 60 L94 60 Z', isNeck: true },
    { slot: 'upper_body', d: 'M66 64 Q76 58 94 60 L106 60 Q124 58 134 64 L132 104 Q118 112 100 112 Q82 112 68 104 Z' },
    { slot: 'layer', d: 'M66 64 L56 68 L48 62 L42 68 L44 100 L52 102 L56 96 L66 74 Z M134 64 L144 68 L152 62 L158 68 L156 100 L148 102 L144 96 L134 74 Z' },
    { slot: 'pants', d: 'M70 114 Q82 112 100 114 Q118 112 130 114 L132 124 L128 180 L112 180 L108 150 L100 140 L92 150 L88 180 L72 180 L68 124 Z' },
    { slot: 'socks', d: 'M72 180 L88 180 L87 192 L71 192 Z M112 180 L128 180 L129 192 L113 192 Z' },
    { slot: 'feet', d: 'M64 192 L87 192 L88 206 Q88 212 80 212 L60 212 Q54 212 54 206 Z M113 192 L136 192 L146 206 Q146 212 140 212 L120 212 Q112 212 112 206 Z' },
    { slot: 'accessory_1', d: 'M40 100 L52 102 L50 114 L38 112 Z' },
    { slot: 'accessory_2', d: 'M148 102 L160 100 L162 112 L150 114 Z' },
    { slot: 'one_piece', d: 'M66 64 Q76 58 94 60 L106 60 Q124 58 134 64 L132 104 L132 124 L128 180 L112 180 L108 150 L100 140 L92 150 L88 180 L72 180 L68 124 L68 104 Z', isOnePiece: true }
  ], 200, 222);

  // ── Baby Male (very round, large head, stubby limbs) ──
  var babyMale = buildSVG('baby-male', [
    { slot: 'head', d: 'M74 16 C74 2, 126 2, 126 16 L126 50 Q126 66 100 68 Q74 66 74 50 Z' },
    { slot: 'upper_body', d: 'M92 68 L108 68 L108 74 L92 74 Z', isNeck: true },
    { slot: 'upper_body', d: 'M62 78 Q72 72 92 74 L108 74 Q128 72 138 78 L136 118 Q122 126 100 126 Q78 126 64 118 Z' },
    { slot: 'layer', d: 'M62 78 L52 82 L46 76 L40 82 L42 112 L50 114 L54 108 L62 90 Z M138 78 L148 82 L154 76 L160 82 L158 112 L150 114 L146 108 L138 90 Z' },
    { slot: 'pants', d: 'M66 128 Q78 126 100 128 Q122 126 134 128 L130 162 L114 162 L108 148 L100 140 L92 148 L86 162 L70 162 Z' },
    { slot: 'socks', d: 'M70 162 L86 162 L85 172 L69 172 Z M114 162 L130 162 L131 172 L115 172 Z' },
    { slot: 'feet', d: 'M62 172 L85 172 L86 184 Q86 190 78 190 L58 190 Q52 190 52 184 Z M115 172 L138 172 L146 184 Q146 190 140 190 L122 190 Q114 190 114 184 Z' },
    { slot: 'accessory_1', d: 'M38 112 L50 114 L48 126 L36 124 Z' },
    { slot: 'accessory_2', d: 'M150 114 L162 112 L164 124 L152 126 Z' },
    { slot: 'one_piece', d: 'M62 78 Q72 72 92 74 L108 74 Q128 72 138 78 L136 118 L134 128 L130 162 L114 162 L108 148 L100 140 L92 148 L86 162 L70 162 L66 128 L64 118 Z', isOnePiece: true }
  ], 200, 200);

  // ── Baby Female (very round, large head, stubby limbs) ──
  var babyFemale = buildSVG('baby-female', [
    { slot: 'head', d: 'M74 14 C74 0, 126 0, 126 14 L126 48 Q126 64 100 66 Q74 64 74 48 Z' },
    { slot: 'upper_body', d: 'M92 66 L108 66 L108 72 L92 72 Z', isNeck: true },
    { slot: 'upper_body', d: 'M64 76 Q74 70 92 72 L108 72 Q126 70 136 76 L134 116 Q120 124 100 124 Q80 124 66 116 Z' },
    { slot: 'layer', d: 'M64 76 L54 80 L48 74 L42 80 L44 110 L52 112 L56 106 L64 88 Z M136 76 L146 80 L152 74 L158 80 L156 110 L148 112 L144 106 L136 88 Z' },
    { slot: 'pants', d: 'M68 126 Q80 124 100 126 Q120 124 132 126 L130 160 L114 160 L108 146 L100 138 L92 146 L86 160 L70 160 Z' },
    { slot: 'socks', d: 'M70 160 L86 160 L85 170 L69 170 Z M114 160 L130 160 L131 170 L115 170 Z' },
    { slot: 'feet', d: 'M62 170 L85 170 L86 182 Q86 188 78 188 L58 188 Q52 188 52 182 Z M115 170 L138 170 L146 182 Q146 188 140 188 L122 188 Q114 188 114 182 Z' },
    { slot: 'accessory_1', d: 'M40 110 L52 112 L50 124 L38 122 Z' },
    { slot: 'accessory_2', d: 'M148 112 L160 110 L162 122 L150 124 Z' },
    { slot: 'one_piece', d: 'M64 76 Q74 70 92 72 L108 72 Q126 70 136 76 L134 116 L132 126 L130 160 L114 160 L108 146 L100 138 L92 146 L86 160 L70 160 L68 126 L66 116 Z', isOnePiece: true }
  ], 200, 198);

  // ── Variant Map ────────────────────────────────────────
  var FIGURES = {
    'male-adult':   maleAdult,
    'female-adult': femaleAdult,
    'male-child':   maleChild,
    'female-child': femaleChild,
    'male-baby':    babyMale,
    'female-baby':  babyFemale
  };

  // ── Build SVG String ───────────────────────────────────
  function buildSVG(id, zones, width, height) {
    // Build a body outline first for a cohesive silhouette background
    // Note: one_piece overlay is NOT rendered on the figure to avoid blocking clicks
    // on upper_body/pants zones. One-piece is accessible via the context menu + grid slot.
    var bodyParts = '';

    zones.forEach(function (z) {
      if (z.isNeck) return; // neck is just a connector, drawn as body
      if (z.isOnePiece) return; // one-piece handled via context menu, not as SVG overlay
      bodyParts += '<path class="wrdrb-zone" data-slot="' + z.slot + '" d="' + z.d + '" ' +
        'fill="' + ZONE_COLORS.default + '" opacity="0.55" ' +
        'stroke="rgba(255,255,255,0.6)" stroke-width="1.2" ' +
        'style="pointer-events:all;cursor:pointer;" />';
    });

    return '<svg class="wrdrb__figure-svg" viewBox="0 0 ' + width + ' ' + height +
      '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><filter id="fig-shadow-' + id + '" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.08"/></filter></defs>' +
      '<g filter="url(#fig-shadow-' + id + ')">' + bodyParts + '</g></svg>';
  }

  // ── Render ─────────────────────────────────────────────
  function render(container, gender, ageGroup, slots) {
    var key = (gender || 'male') + '-' + (ageGroup || 'adult');
    var svgHtml = FIGURES[key] || FIGURES['male-adult'];

    container.innerHTML = svgHtml;

    // Update zone fill based on slot data
    var zones = container.querySelectorAll('.wrdrb-zone');
    zones.forEach(function (zone) {
      var slotKey = zone.dataset.slot;
      var isFilled = slots && slots[slotKey] && slots[slotKey].product_id;
      var isOnePiece = zone.classList.contains('wrdrb-zone--onepiece');

      if (isFilled) {
        zone.classList.add('is-filled');
        zone.style.fill = ZONE_COLORS.filled;
        zone.style.opacity = '0.75';
      }

      // Click handler – context menu for upper_body/pants/layer, direct open for others
      zone.addEventListener('click', function (e) {
        var contextMenuSlots = ['upper_body', 'pants'];
        if (contextMenuSlots.indexOf(slotKey) >= 0 && window.Wardrobe && typeof window.Wardrobe.showZoneMenu === 'function') {
          e.stopPropagation();
          window.Wardrobe.showZoneMenu(slotKey, e.clientX, e.clientY);
        } else if (window.Wardrobe && typeof window.Wardrobe.openSlot === 'function') {
          window.Wardrobe.openSlot(slotKey);
        }
      });

      // Hover effects
      zone.addEventListener('mouseenter', function () {
        if (isFilled) {
          zone.style.fill = ZONE_COLORS.filledHover;
          zone.style.opacity = '0.9';
        } else {
          zone.style.fill = ZONE_COLORS.hover;
          zone.style.opacity = '0.8';
        }
      });

      zone.addEventListener('mouseleave', function () {
        if (isFilled) {
          zone.style.fill = ZONE_COLORS.filled;
          zone.style.opacity = '0.75';
        } else {
          zone.style.fill = ZONE_COLORS.default;
          zone.style.opacity = '0.55';
        }
      });
    });
  }

  // ── Expose ─────────────────────────────────────────────
  window.WardrobeFigure = {
    render: render
  };
})();
