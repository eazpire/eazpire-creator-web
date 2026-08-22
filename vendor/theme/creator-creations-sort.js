/**
 * Creations sort helpers (Designs + Products).
 * Mirrors src/features/creations/creationsSort.js for the storefront / creator portal.
 */
(function (global) {
  'use strict';

  var KEYS = [
    { id: 'updated', tabs: ['designs', 'products'] },
    { id: 'name', tabs: ['designs', 'products'] },
    { id: 'favorites', tabs: ['designs', 'products'] },
    { id: 'remixes', tabs: ['designs', 'products'] },
    { id: 'published_products', tabs: ['designs'] },
    { id: 'sales', tabs: ['designs', 'products'] },
    { id: 'clicks', tabs: ['designs', 'products'] },
    { id: 'add_to_cart', tabs: ['designs', 'products'] },
    { id: 'impressions', tabs: ['designs', 'products'] },
    { id: 'revenue', tabs: ['designs', 'products'] },
    { id: 'last_sale', tabs: ['designs', 'products'] }
  ];

  var DEFAULT_STATE = { key: 'updated', dir: 'desc' };

  function defaultAvailability(extra) {
    var out = {
      updated: true,
      name: true,
      favorites: false,
      remixes: false,
      published_products: true,
      sales: false,
      clicks: false,
      add_to_cart: false,
      impressions: false,
      revenue: false,
      last_sale: false
    };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(out, k)) out[k] = !!extra[k];
      });
    }
    return out;
  }

  function isAvailable(availability, key, tab) {
    var def = null;
    for (var i = 0; i < KEYS.length; i++) {
      if (KEYS[i].id === key) {
        def = KEYS[i];
        break;
      }
    }
    if (!def) return false;
    if (tab && def.tabs.indexOf(tab) < 0) return false;
    if (availability && Object.prototype.hasOwnProperty.call(availability, key)) return !!availability[key];
    return key === 'updated' || key === 'name' || key === 'published_products';
  }

  function parseTs(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && isFinite(value)) {
      if (value <= 0) return 0;
      return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
    }
    var raw = String(value).trim();
    if (!raw) return 0;
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      var asNum = Number(raw);
      if (!isFinite(asNum) || asNum <= 0) return 0;
      return asNum < 1e12 ? Math.round(asNum * 1000) : Math.round(asNum);
    }
    var parsed = Date.parse(raw);
    return isFinite(parsed) ? parsed : 0;
  }

  function metricValue(item, key) {
    if (!item) return 0;
    switch (key) {
      case 'updated':
        return parseTs(
          item.updated_at != null ? item.updated_at :
            item.last_updated_at != null ? item.last_updated_at :
              item.sort_ts != null ? item.sort_ts :
                item.published_at != null ? item.published_at :
                  item.last_published_at != null ? item.last_published_at :
                    item.created_at
        );
      case 'name':
        return String(item.title || item.product_name || item.product_key || '').trim().toLowerCase();
      case 'favorites':
        return Number(item.favorite_count) || 0;
      case 'remixes':
        return Number(item.remix_count) || 0;
      case 'published_products':
        return Number(item.products_count != null ? item.products_count : item.published_count) || 0;
      default:
        return 0;
    }
  }

  function nextState(current, nextKey) {
    var prev = current && typeof current === 'object' ? current : DEFAULT_STATE;
    var key = String(nextKey || '').trim() || DEFAULT_STATE.key;
    if (prev.key === key) return { key: key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
    if (key === 'name') return { key: key, dir: 'asc' };
    return { key: key, dir: 'desc' };
  }

  function compare(a, b, key, dir) {
    var metric = String(key || DEFAULT_STATE.key);
    var direction = dir === 'asc' ? 'asc' : 'desc';
    var va = metricValue(a, metric);
    var vb = metricValue(b, metric);
    var cmp = 0;
    if (metric === 'name') {
      cmp = String(va).localeCompare(String(vb));
    } else {
      var na = Number(va) || 0;
      var nb = Number(vb) || 0;
      if (na !== nb) cmp = na < nb ? -1 : 1;
    }
    if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
    var idA = String((a && (a.id || a.shopify_product_id || a.product_key)) || '');
    var idB = String((b && (b.id || b.shopify_product_id || b.product_key)) || '');
    return idB.localeCompare(idA);
  }

  function sortItems(items, key, dir) {
    if (!items || !items.length) return items || [];
    items.sort(function (a, b) { return compare(a, b, key, dir); });
    return items;
  }

  global.CreatorCreationsSort = {
    KEYS: KEYS,
    DEFAULT_STATE: DEFAULT_STATE,
    defaultAvailability: defaultAvailability,
    isAvailable: isAvailable,
    nextState: nextState,
    sortItems: sortItems,
    compare: compare
  };
})(typeof window !== 'undefined' ? window : this);
