/**
 * Creator music party — beat-synced title pulse, dots wave, Eazy groove, free EAZ every 10s.
 */
(function () {
  'use strict';

  var REWARD_MS = 10000;
  var BEAT_MIN_MS = 120;
  var BEAT_RISE_MIN = 0.008;
  var BEAT_LEVEL_MIN = 0.04;
  var SOFT_BEAT_MS = 360;
  var TILT_MIN_MS = 220;
  var STRONG_BASS_MIN = 0.16;

  var rewardTimer = null;
  var rewardCapReached = false;
  var rafId = null;

  var smoothBass = 0;
  var prevBass = 0;
  var beatPulse = 0;
  var lastBeatMs = 0;
  var lastTiltMs = 0;
  var strongRotateDir = 1;
  var eazyTilt = 0;
  var eazyTiltTarget = 0;
  var dotEnergies = [];
  var activeDotIndex = 0;
  var dotWalkDir = 1;

  function headers() {
    return Array.prototype.slice.call(document.querySelectorAll('.creator-header, .creator-desktop-header'));
  }

  function titles() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '.creator-header__title, .creator-desktop-header__screen-title, #creatorDesktopScreenTitle'
    ));
  }

  function dots() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '.creator-header__dots .creator-dot, .creator-desktop-header__screen-dot'
    ));
  }

  function mascotInners() {
    return Array.prototype.slice.call(document.querySelectorAll(
      '#eazy-mascot .eazy-mascot__inner, .eazy-mascot--music-party .eazy-mascot__inner'
    ));
  }

  function mascots() {
    return Array.prototype.slice.call(document.querySelectorAll('#eazy-mascot, .eazy-mascot'));
  }

  function ensureDotEnergies(count) {
    while (dotEnergies.length < count) dotEnergies.push(0);
    if (dotEnergies.length > count) dotEnergies.length = count;
  }

  function setPartyActive(active) {
    headers().forEach(function (h) {
      h.classList.toggle('creator-header--music-party', active);
    });
    mascots().forEach(function (m) {
      m.classList.toggle('eazy-mascot--music-party', active);
    });
    if (!active) resetVisualState();
  }

  function resetVisualState() {
    smoothBass = 0;
    prevBass = 0;
    beatPulse = 0;
    eazyTilt = 0;
    eazyTiltTarget = 0;
    dotEnergies = [];
    activeDotIndex = 0;
    dotWalkDir = 1;
    titles().forEach(function (el) {
      el.style.removeProperty('--music-title-scale');
    });
    dots().forEach(function (el) {
      el.style.transform = '';
    });
    mascotInners().forEach(function (el) {
      el.style.removeProperty('--eazy-music-scale');
      el.style.removeProperty('--eazy-music-rotate');
    });
    headers().forEach(function (h) {
      h.style.removeProperty('--music-bass');
    });
  }

  function advanceDotWalker(count) {
    if (count <= 1) return;
    var next = activeDotIndex + dotWalkDir;
    if (next >= count) {
      next = count - 2;
      dotWalkDir = -1;
    } else if (next < 0) {
      next = 1;
      dotWalkDir = 1;
    }
    activeDotIndex = Math.max(0, Math.min(count - 1, next));
  }

  function triggerBeatTilt(bass, now) {
    if (now - lastTiltMs < TILT_MIN_MS) return;
    lastTiltMs = now;
    strongRotateDir *= -1;
    var baseTilt = 5 + Math.min(1, bass / 0.28) * 11;
    var extra = bass >= STRONG_BASS_MIN
      ? Math.min(1, (bass - STRONG_BASS_MIN) / 0.35) * 14
      : 0;
    eazyTiltTarget = (baseTilt + extra) * strongRotateDir;
  }

  function triggerBeat(bass, now) {
    lastBeatMs = now;
    beatPulse = 0.28 + Math.min(1, bass) * 0.72;
    var dotList = dots();
    var count = dotList.length;
    ensureDotEnergies(count);
    for (var i = 0; i < count; i++) dotEnergies[i] = 0;
    if (count > 0) {
      dotEnergies[activeDotIndex] = 1;
      advanceDotWalker(count);
    }
    triggerBeatTilt(bass, now);
  }

  function processBeat(bass) {
    var now = performance.now();
    smoothBass = smoothBass * 0.8 + bass * 0.2;
    var rise = bass - prevBass;
    prevBass = bass;

    var beatHit = rise >= BEAT_RISE_MIN &&
      bass >= BEAT_LEVEL_MIN &&
      (bass >= smoothBass * 1.003 || rise >= BEAT_RISE_MIN * 2) &&
      now - lastBeatMs >= BEAT_MIN_MS;

    var softBeat = !beatHit &&
      smoothBass > 0.03 &&
      now - lastBeatMs >= SOFT_BEAT_MS;

    if (beatHit) {
      triggerBeat(bass, now);
    } else if (softBeat) {
      triggerBeat(Math.max(bass, smoothBass, 0.07), now);
    }

    beatPulse *= 0.9;

    if (Math.abs(eazyTiltTarget) > 0.01) {
      eazyTilt += (eazyTiltTarget - eazyTilt) * 0.24;
      if (Math.abs(eazyTilt - eazyTiltTarget) < 0.35) {
        eazyTiltTarget = 0;
      }
    } else {
      eazyTilt *= 0.8;
    }

    var dotList = dots();
    ensureDotEnergies(dotList.length);
    for (var i = 0; i < dotEnergies.length; i++) {
      dotEnergies[i] *= 0.86;
      if (dotEnergies[i] < 0.02) dotEnergies[i] = 0;
    }

    var livePulse = Math.max(beatPulse, smoothBass * 0.62);
    return { bass: bass, smooth: smoothBass, pulse: livePulse };
  }

  function applyBeatVisuals(metrics) {
    var smooth = metrics.smooth;
    var pulse = metrics.pulse;
    var intensity = Math.min(1, Math.max(smooth * 0.38, pulse * 0.72 + smooth * 0.62));

    headers().forEach(function (h) {
      h.style.setProperty('--music-bass', smooth.toFixed(3));
    });

    var titleScale = 1 + intensity * 0.1;
    titles().forEach(function (el) {
      el.style.setProperty('--music-title-scale', titleScale.toFixed(4));
    });

    var dotList = dots();
    ensureDotEnergies(dotList.length);
    var dotTravel = 3 + intensity * 7;
    var dotScaleBoost = intensity * 0.2;
    dotList.forEach(function (dot, i) {
      var energy = dotEnergies[i] || 0;
      var sign = i % 2 === 0 ? -1 : 1;
      var active = energy * pulse + smooth * 0.18 * (i === activeDotIndex ? 1 : 0);
      var y = active * dotTravel * sign;
      var scale = 1 + active * dotScaleBoost;
      dot.style.transform = 'translateY(' + y.toFixed(2) + 'px) scale(' + scale.toFixed(3) + ')';
    });

    var eazyScale = 1 + intensity * 0.09;
    var eazyRotate = eazyTilt + pulse * (1.8 + smooth * 4.5) + smooth * 3.5;
    mascotInners().forEach(function (inner) {
      inner.style.setProperty('--eazy-music-scale', eazyScale.toFixed(4));
      inner.style.setProperty('--eazy-music-rotate', eazyRotate.toFixed(2) + 'deg');
    });
  }

  function applyEazBalance(balance) {
    if (balance == null || !Number.isFinite(Number(balance))) return;
    var text = Number(balance).toFixed(2);
    ['creator-footer-eaz-value', 'global-eaz-balance-value', 'creator-desktop-eaz-value'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    });
    document.querySelectorAll('[data-eaz-balance-value]').forEach(function (el) {
      el.textContent = text;
    });
    if (window.__eazBalanceCache) {
      window.__eazBalanceCache.value = Number(balance);
      window.__eazBalanceCache.timestamp = Date.now();
    }
  }

  function creditMusicReward() {
    if (rewardCapReached || !window.CreatorAudioPlaying) return;
    var ownerId = typeof window._resolveEazOwnerId === 'function'
      ? window._resolveEazOwnerId()
      : window.__EAZ_OWNER_ID;
    if (!ownerId) return;

    var cfg = window.CREATOR_API_CONFIG || {};
    var base = (cfg.BASE_URL || 'https://creator-engine.eazpire.workers.dev').replace(/\/$/, '');
    var url = new URL(base + '/apps/creator-dispatch');
    url.searchParams.set('op', 'creator-music-reward');
    url.searchParams.set('owner_id', ownerId);
    url.searchParams.set('logged_in_customer_id', ownerId);

    fetch(url.toString(), { method: 'POST', credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (!res) return;
        if (res.capped || res.error === 'free_eaz_cap_reached') {
          rewardCapReached = true;
          stopRewardLoop();
          return;
        }
        if (!res.ok || res.already_credited) return;
        if (res.balance_after != null) applyEazBalance(res.balance_after);
        if (typeof window.loadCreatorBalance === 'function') window.loadCreatorBalance();
      })
      .catch(function () {});
  }

  function startRewardLoop() {
    if (rewardTimer || rewardCapReached) return;
    rewardTimer = setInterval(creditMusicReward, REWARD_MS);
    setTimeout(creditMusicReward, REWARD_MS);
  }

  function stopRewardLoop() {
    if (rewardTimer) {
      clearInterval(rewardTimer);
      rewardTimer = null;
    }
  }

  function bassLoop() {
    if (!window.CreatorAudioPlaying) {
      rafId = null;
      resetVisualState();
      return;
    }
    var level = 0;
    if (window.CreatorAudioHooks && typeof window.CreatorAudioHooks.getBassLevel === 'function') {
      level = window.CreatorAudioHooks.getBassLevel();
    }
    var metrics = processBeat(level);
    applyBeatVisuals(metrics);
    rafId = requestAnimationFrame(bassLoop);
  }

  function onPlayState(playing) {
    setPartyActive(!!playing);
    if (playing) {
      rewardCapReached = false;
      startRewardLoop();
      if (!rafId) rafId = requestAnimationFrame(bassLoop);
    } else {
      stopRewardLoop();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      resetVisualState();
    }
  }

  window.addEventListener('creator-audio-play-state', function (e) {
    onPlayState(e && e.detail && e.detail.playing);
  });

  if (window.CreatorAudioPlaying) onPlayState(true);

  window.CreatorMusicParty = { onPlayState: onPlayState };
})();
