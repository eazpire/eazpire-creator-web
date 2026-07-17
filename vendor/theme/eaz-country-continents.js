/**
 * ISO 3166-1 alpha-2 → continent bucket (AF, AS, EU, NA, SA, OC, AN, OTHER).
 * Data derived from restcountries.com v3.1 (territories follow parent continent conventions).
 */
(function (global) {
  'use strict';
  var MAP = {"AI":"NA","GT":"NA","GM":"AF","MX":"NA","MW":"AF","PN":"OC","AR":"SA","GU":"OC","BG":"EU","DM":"NA","GB":"EU","FM":"OC","PS":"AS","CW":"NA","RW":"AF","HK":"AS","UZ":"AS","CN":"AS","CY":"EU","AW":"NA","RE":"AF","KR":"AS","AQ":"AN","SO":"AF","LB":"AS","GN":"AF","TJ":"AS","MY":"AS","KP":"AS","SL":"AF","BJ":"AF","IT":"EU","TT":"NA","SA":"AS","CR":"NA","RS":"EU","TK":"OC","MN":"AS","BN":"AS","HU":"EU","MZ":"AF","KI":"OC","HT":"NA","KH":"AS","EG":"AF","TM":"AS","OM":"AS","JM":"NA","AZ":"EU","SK":"EU","BY":"EU","VN":"AS","VI":"NA","GI":"EU","SX":"NA","AX":"EU","SY":"AS","MQ":"NA","GL":"NA","HN":"NA","TN":"AF","KM":"AF","SI":"EU","CH":"EU","GG":"EU","MM":"AS","PY":"SA","BQ":"NA","BB":"NA","MO":"AS","JO":"AS","LA":"AS","TG":"AF","MA":"AF","PR":"NA","GF":"SA","PM":"NA","MF":"NA","EE":"EU","ID":"AS","SC":"AF","ML":"AF","TL":"OC","BR":"SA","GH":"AF","KE":"AF","IS":"EU","MG":"AF","BD":"AS","CD":"AF","ZW":"AF","PF":"OC","TR":"EU","CV":"AF","DO":"NA","BS":"NA","DE":"EU","SR":"SA","TO":"OC","IO":"AS","LC":"NA","IE":"EU","VA":"EU","CO":"SA","PT":"EU","FO":"EU","ST":"AF","MP":"OC","JE":"EU","YT":"AF","YE":"AS","NG":"AF","AF":"AS","BW":"AF","IM":"EU","SV":"NA","UG":"AF","AD":"EU","TC":"NA","TD":"AF","FI":"EU","RU":"EU","KZ":"AS","SJ":"EU","VE":"SA","MC":"EU","SN":"AF","NP":"AS","AE":"AS","TW":"AS","NC":"OC","BO":"SA","CL":"SA","CI":"AF","LY":"AF","PE":"SA","CA":"NA","FR":"EU","DJ":"AF","BI":"AF","XK":"EU","DK":"EU","GR":"EU","CZ":"EU","ER":"AF","NA":"AF","VG":"NA","IR":"AS","GQ":"AF","MR":"AF","BH":"AS","CC":"AS","ET":"AF","ZM":"AF","BA":"EU","FK":"SA","GD":"NA","TH":"AS","RO":"EU","VC":"NA","LR":"AF","US":"NA","SS":"AF","BV":"AN","AM":"AS","JP":"AS","PK":"AS","SZ":"AF","LI":"EU","IL":"AS","AS":"OC","LK":"AS","GS":"AN","AL":"EU","DZ":"AF","UA":"EU","SH":"AF","HM":"AN","SM":"EU","CU":"NA","NR":"OC","ES":"EU","KW":"AS","MS":"NA","MU":"AF","SE":"EU","AU":"OC","CM":"AF","EC":"SA","QA":"AS","MH":"OC","PL":"EU","KY":"NA","ZA":"AF","WF":"OC","WS":"OC","NL":"EU","EH":"AF","ME":"EU","BT":"AS","MT":"EU","VU":"OC","TZ":"AF","NZ":"OC","PW":"OC","PA":"NA","TV":"OC","FJ":"OC","NI":"NA","KG":"AS","TF":"AN","LV":"EU","GE":"AS","LU":"EU","AT":"EU","MK":"EU","BL":"NA","CX":"AS","SB":"OC","AG":"NA","IQ":"AS","MD":"EU","NF":"OC","CG":"AF","NU":"OC","LT":"EU","NE":"AF","GY":"SA","BM":"NA","GA":"AF","CK":"OC","AO":"AF","NO":"EU","GP":"NA","MV":"AS","BE":"EU","HR":"EU","BZ":"NA","KN":"NA","SG":"AS","LS":"AF","UY":"SA","BF":"AF","IN":"AS","PH":"AS","CF":"AF","SD":"AF","GW":"AF","PG":"OC","UM":"OC"};

  var DEF = {
    AF: 'Africa',
    AS: 'Asia',
    EU: 'Europe',
    NA: 'North America',
    SA: 'South America',
    OC: 'Oceania',
    AN: 'Antarctica',
    OTHER: 'Other regions'
  };

  function eazGetCountryContinent(iso) {
    var c = String(iso || '').toUpperCase();
    return MAP[c] || 'OTHER';
  }

  function eazAllCountryCodes() {
    return Object.keys(MAP).sort();
  }

  function eazContinentLabels() {
    return Object.assign({}, DEF, global.__EAZ_CONTINENT_LABELS || {});
  }

  /**
   * @param {Array<{code:string,label?:string}>} rows
   * @param {string} [selectedCode] — pin this ISO to top within its continent
   * @param {Record<string,string>} [labelMap]
   * @param {Record<string,boolean>|Set<string>|string[]} [priorityCodes] — included / priority ISOs at top
   */
  function eazGroupCountryRowsByContinent(rows, selectedCode, labelMap, priorityCodes) {
    var sel = String(selectedCode || '').toUpperCase();
    var lm = labelMap || eazContinentLabels();
    var priority = Object.create(null);
    if (priorityCodes) {
      if (typeof priorityCodes.has === 'function') {
        priorityCodes.forEach(function (c) {
          priority[String(c || '').toUpperCase()] = true;
        });
      } else if (Array.isArray(priorityCodes)) {
        priorityCodes.forEach(function (c) {
          priority[String(c || '').toUpperCase()] = true;
        });
      } else {
        Object.keys(priorityCodes).forEach(function (c) {
          if (priorityCodes[c]) priority[String(c || '').toUpperCase()] = true;
        });
      }
    }
    if (sel) priority[sel] = true;
    var byCont = {};
    rows.forEach(function (row) {
      var cc = String(row.code || '').toUpperCase();
      var cont = eazGetCountryContinent(cc);
      if (!byCont[cont]) byCont[cont] = [];
      byCont[cont].push(row);
    });
    Object.keys(byCont).forEach(function (cont) {
      byCont[cont].sort(function (a, b) {
        var aCode = String(a.code || '').toUpperCase();
        var bCode = String(b.code || '').toUpperCase();
        var aPri = !!priority[aCode];
        var bPri = !!priority[bCode];
        if (aPri !== bPri) return aPri ? -1 : 1;
        var aSel = aCode === sel;
        var bSel = bCode === sel;
        if (aSel !== bSel) return aSel ? -1 : 1;
        return String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' });
      });
    });
    return Object.keys(byCont).sort(function (a, b) {
      return String(lm[a] || a).localeCompare(String(lm[b] || b), undefined, { sensitivity: 'base' });
    }).map(function (k) {
      return { continent: k, items: byCont[k] };
    });
  }

  global.eazGetCountryContinent = eazGetCountryContinent;
  global.eazAllCountryCodes = eazAllCountryCodes;
  global.eazContinentLabels = eazContinentLabels;
  global.eazGroupCountryRowsByContinent = eazGroupCountryRowsByContinent;
})(typeof window !== 'undefined' ? window : this);
