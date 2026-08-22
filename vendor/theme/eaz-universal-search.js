/**
 * Shared shop + creator search client (IDEA-080).
 * Worker FTS first; Shopify / local match only as fallback.
 */
(function (global) {
  'use strict';

  var MIN_LEN = 2;
  var inflight = {};

  function dispatchUrl() {
    try {
      if (global.CREATOR_API_CONFIG && typeof global.CREATOR_API_CONFIG.getDispatchUrl === 'function') {
        var via = global.CREATOR_API_CONFIG.getDispatchUrl();
        if (via) return String(via).replace(/\/+$/, '');
      }
    } catch (_e) {}
    var host = '';
    try { host = String(global.location && global.location.hostname || ''); } catch (_h) {}
    if (host.indexOf('eazpire.com') !== -1 || host.indexOf('localhost') !== -1) {
      try {
        return String(global.location.origin || '').replace(/\/+$/, '') + '/__eaz/creator-dispatch';
      } catch (_o) {}
    }
    if (global.CREATOR_API_CONFIG && global.CREATOR_API_CONFIG.BASE_URL) {
      return String(global.CREATOR_API_CONFIG.BASE_URL).replace(/\/+$/, '') + '/apps/creator-dispatch';
    }
    return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function normalize(s) {
    if (s == null || s === '') return '';
    try {
      return String(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
    } catch (_e) {
      return String(s).toLowerCase().trim();
    }
  }

  function matchLocal(blob, query) {
    var q = normalize(query);
    if (!q) return true;
    var hay = normalize(blob);
    if (hay.indexOf(q) !== -1) return true;
    var parts = q.split(/[\s,.;!?/\\|_+-]+/).filter(function (t) { return t.length > 0; });
    if (!parts.length) return true;
    return parts.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function emptyResult() {
    return { ok: true, engine: 'empty', queries: [], products: [], designs: [], fallback: false };
  }

  function query(opts) {
    opts = opts || {};
    var q = String(opts.q || '').trim();
    if (q.length < MIN_LEN) return Promise.resolve(emptyResult());
    var mode = opts.mode || 'products';
    var phase = opts.phase || 'results';
    var limit = opts.limit || (phase === 'suggest' ? 8 : 24);
    var url = new URL(dispatchUrl(), global.location && global.location.origin ? global.location.origin : 'https://www.eazpire.com');
    url.searchParams.set('op', 'universal-search');
    url.searchParams.set('q', q);
    url.searchParams.set('mode', mode);
    url.searchParams.set('phase', phase);
    url.searchParams.set('limit', String(limit));
    if (opts.ownerId) url.searchParams.set('owner_id', opts.ownerId);
    if (opts.collection) url.searchParams.set('collection', opts.collection);
    if (opts.country) url.searchParams.set('country', opts.country);
    if (opts.handles && opts.handles.length) url.searchParams.set('handles', opts.handles.join(','));
    var key = url.toString();
    if (inflight[key]) return inflight[key];
    var ctrl = opts.signal ? null : new AbortController();
    var signal = opts.signal || (ctrl && ctrl.signal);
    var p = fetch(url.toString(), { credentials: 'include', signal: signal })
      .then(function (res) {
        if (!res.ok) throw new Error('search_http_' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error(data && data.error ? data.error : 'search_failed');
        return {
          ok: true,
          engine: data.engine || 'fts',
          vector_mode: data.vector_mode || 'off',
          queries: data.queries || [],
          products: data.products || [],
          designs: data.designs || [],
          fallback: false
        };
      })
      .finally(function () {
        delete inflight[key];
      });
    inflight[key] = p;
    return p;
  }

  function queryOrNull(opts) {
    return query(opts).catch(function () { return null; });
  }

  global.EazUniversalSearch = {
    minLength: MIN_LEN,
    normalize: normalize,
    matchLocal: matchLocal,
    query: query,
    queryOrNull: queryOrNull,
    dispatchUrl: dispatchUrl
  };
})(typeof window !== 'undefined' ? window : this);
