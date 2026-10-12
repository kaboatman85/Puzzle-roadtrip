/* Wikimedia Commons theming: pure data layer, no DOM. Given a list of category names and a
   seeded random function, picks a handful of candidate files (one per category, with backups
   in case a file is too small or too wide to crop to 4:5) and returns their metadata
   (size, thumbnail URL, author, license). Network access and caching are injected by the
   caller (fns.listFiles / fns.getImageInfo) so this file stays testable without a DOM or
   real network, the same way logic.js stays testable without a DOM. */
(function (root) {
  'use strict';

  var API = 'https://commons.wikimedia.org/w/api.php';
  var UA = 'PuzzleRoadTrip/1.0 (https://github.com/kaboatman85/Puzzle-roadtrip)';
  var MIN_SHORT_SIDE = 1000;
  var MAX_LANDSCAPE_ASPECT = 1.6; // wider than this (landscape) crops away too much to fill a 4:5 portrait

  function isJpegFile(title) { return /\.(jpe?g)$/i.test(title); }

  function displayTitle(title) { return String(title).replace(/^File:/, '').replace(/_/g, ' '); }

  function filePageUrl(title) { return 'https://commons.wikimedia.org/wiki/' + String(title).replace(/ /g, '_'); }

  // Commons metadata fields (Artist, LicenseShortName, ...) are wiki HTML from user edits:
  // strip tags before this text ever reaches innerHTML anywhere.
  function plainText(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function apiUrl(params, browser) {
    var u = API + '?format=json&formatversion=2';
    Object.keys(params).forEach(function (k) { u += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); });
    if (browser) u += '&origin=*'; // Commons' documented CORS opt-in for browser-side requests
    return u;
  }

  function apiGet(params, fetchFn, browser) {
    var url = apiUrl(params, browser);
    var init = browser ? {} : { headers: { 'User-Agent': UA } };
    return fetchFn(url, init).then(function (r) {
      if (!r.ok) throw new Error('Commons API HTTP ' + r.status);
      return r.json();
    });
  }

  // List up to opts.maxFiles JPEG file titles in a category, paginating via cmcontinue.
  function listCategoryFiles(category, opts, fetchFn) {
    opts = opts || {};
    var maxFiles = opts.maxFiles || 300;
    var browser = !!opts.browser;
    var titles = [];
    function page(cont) {
      var params = { action: 'query', list: 'categorymembers', cmtitle: 'Category:' + category, cmtype: 'file', cmlimit: '100' };
      if (cont) params.cmcontinue = cont;
      return apiGet(params, fetchFn, browser).then(function (res) {
        var members = (res.query && res.query.categorymembers) || [];
        members.forEach(function (m) { if (isJpegFile(m.title)) titles.push(m.title); });
        var next = res.continue && res.continue.cmcontinue;
        if (next && titles.length < maxFiles) return page(next);
        return titles;
      });
    }
    return page(null);
  }

  // Fetch imageinfo (size, thumbnail URL, author, license) for up to 50 titles in one call.
  function batchImageInfo(titles, opts, fetchFn) {
    opts = opts || {};
    if (!titles || !titles.length) return Promise.resolve({});
    var params = {
      action: 'query', titles: titles.slice(0, 50).join('|'), prop: 'imageinfo',
      iiprop: 'url|size|extmetadata', iiurlwidth: String(opts.thumbWidth || 1280)
    };
    return apiGet(params, fetchFn, !!opts.browser).then(function (res) {
      var out = {};
      var pages = (res.query && res.query.pages) || [];
      pages.forEach(function (p) {
        var info = p.imageinfo && p.imageinfo[0];
        if (!info || p.missing) return;
        var ext = info.extmetadata || {};
        out[p.title] = {
          title: p.title,
          displayTitle: displayTitle(p.title),
          pageUrl: filePageUrl(p.title),
          width: info.width, height: info.height,
          url: info.url,
          thumbUrl: info.thumburl || info.url,
          author: plainText(ext.Artist && ext.Artist.value) || 'Unknown',
          license: (ext.LicenseShortName && plainText(ext.LicenseShortName.value)) || 'See file page',
          licenseUrl: (ext.LicenseUrl && ext.LicenseUrl.value) || ''
        };
      });
      return out;
    });
  }

  function isUsableSize(info) {
    if (!info || !info.width || !info.height) return false;
    var shortSide = Math.min(info.width, info.height);
    if (shortSide < MIN_SHORT_SIDE) return false;
    if (info.width > info.height && (info.width / info.height) > MAX_LANDSCAPE_ASPECT) return false;
    return true;
  }

  // Deterministic Fisher-Yates using a caller-supplied seeded rand() (same pattern as logic.js's shuffle).
  function shuffledOrder(arr, rand) {
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1)), t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  function pickDistinct(arr, rand, n) {
    return shuffledOrder(arr, rand).slice(0, Math.min(n, arr.length));
  }

  /* Pick up to opts.slots candidate files (default 3), one per a distinct random category,
     each with opts.backups (default 4) fallback titles in case the first pick is too small
     or too landscape. fns.listFiles(category) and fns.getImageInfo(titles) are injected so
     this works against a cache, a stub, or the real API identically. Returns a promise of
     an array of usable image-info objects (one per slot that found a usable file). */
  function chooseCandidates(categories, rand, opts, fns) {
    opts = opts || {};
    var slots = Math.min(opts.slots || 3, categories.length);
    var backups = opts.backups || 4;
    var chosenCats = pickDistinct(categories, rand, slots);
    return Promise.all(chosenCats.map(function (cat) {
      return fns.listFiles(cat).then(function (titles) {
        return { category: cat, backups: shuffledOrder(titles || [], rand).slice(0, backups) };
      });
    })).then(function (slotList) {
      var allTitles = [];
      slotList.forEach(function (s) { s.backups.forEach(function (t) { allTitles.push(t); }); });
      return fns.getImageInfo(allTitles).then(function (infoByTitle) {
        var results = [];
        slotList.forEach(function (s) {
          for (var i = 0; i < s.backups.length; i++) {
            var info = infoByTitle[s.backups[i]];
            if (info && isUsableSize(info)) { results.push(info); break; }
          }
        });
        return results;
      });
    });
  }

  var api = {
    isJpegFile: isJpegFile, displayTitle: displayTitle, filePageUrl: filePageUrl, plainText: plainText,
    apiUrl: apiUrl, apiGet: apiGet,
    listCategoryFiles: listCategoryFiles, batchImageInfo: batchImageInfo,
    isUsableSize: isUsableSize, shuffledOrder: shuffledOrder, pickDistinct: pickDistinct,
    chooseCandidates: chooseCandidates,
    MIN_SHORT_SIDE: MIN_SHORT_SIDE, MAX_LANDSCAPE_ASPECT: MAX_LANDSCAPE_ASPECT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Commons = api;
})(typeof window !== 'undefined' ? window : this);
