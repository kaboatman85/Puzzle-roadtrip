/* jsdom smoke tests for themed-photo loading: the real index.html (plus logic.js) is loaded
   into a jsdom window with a stubbed fetch/Image/canvas, so these drive the actual app code --
   not a reimplementation of it -- through clicks and localStorage, the same way a browser
   session would. Covers: a themed Unsplash load, Resume reloading the same photo without an API
   call, the 24-hour search cache, skipping recently used photos, the generated-scene fallback
   (no key, API error, no fetch at all), and older saves still resuming. */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var JSDOM = require('jsdom').JSDOM;

function read(name) { return fs.readFileSync(path.join(__dirname, name), 'utf8'); }
// Strip the page's own <script> tags out of the body we embed in the initial HTML string --
// jsdom would otherwise try to run them immediately during parsing (before logic.js is
// loaded, since external src= scripts aren't fetched without a resources loader configured).
// The real script contents are injected afterward, in the right order, by buildDom() below.
function extractBody(html) {
  return html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
}
function extractInlineScripts(html) { return Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map(function (m) { return m[1]; }); }

var INDEX_HTML = read('index.html');
var BODY = extractBody(INDEX_HTML);
var INLINE_SCRIPTS = extractInlineScripts(INDEX_HTML);
var LOGIC_JS = read('logic.js');
var KEY_LINE = "var UNSPLASH_ACCESS_KEY = '';";
assert.ok(INDEX_HTML.indexOf(KEY_LINE) !== -1, 'index.html should ship with an empty UNSPLASH_ACCESS_KEY');

function fakeCtx2d() {
  var noop = function () {};
  return {
    drawImage: noop, fillRect: noop, clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, closePath: noop, fill: noop, stroke: noop, arc: noop, ellipse: noop, rect: noop,
    createLinearGradient: function () { return { addColorStop: noop }; },
    createRadialGradient: function () { return { addColorStop: noop }; },
    measureText: function () { return { width: 10 }; },
    getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(120) }; },
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, setLineDash: noop
  };
}

// Builds a fresh jsdom window with the real app scripts loaded in the same order the page
// uses them (logic.js, then index.html's inline blocks). `key` replaces the empty
// UNSPLASH_ACCESS_KEY ('' keeps it empty). `beforeMain` runs before the inline scripts, so a test
// can pre-seed localStorage -- exactly like a returning visitor would have an existing save.
function buildDom(opts) {
  opts = opts || {};
  var key = opts.key == null ? 'test-key' : opts.key;
  var dom = new JSDOM('<!doctype html><html><head></head><body>' + BODY + '</body></html>', {
    url: 'https://puzzle-road-trip.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  var window = dom.window;
  window.__imageSrcs = [];

  function FakeImage() {
    this.onload = null; this.onerror = null;
    this.naturalWidth = 1280; this.naturalHeight = 1600;
  }
  Object.defineProperty(FakeImage.prototype, 'src', {
    get: function () { return this._src; },
    set: function (v) {
      this._src = v;
      window.__imageSrcs.push(v);
      var self = this;
      setTimeout(function () {
        var fail = window.__imageShouldFail && window.__imageShouldFail(v);
        if (fail) { if (self.onerror) self.onerror(); }
        else { if (self.onload) self.onload(); }
      }, 0);
    }
  });
  window.Image = FakeImage;
  window.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx2d(); };
  window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,'; };
  window.scrollTo = function () {};
  window.matchMedia = function () { return { matches: false, addListener: function () {}, removeListener: function () {} }; };
  window.fetch = opts.fetchImpl || function () { return Promise.reject(new Error('no fetch stub configured')); };
  window.__imageShouldFail = opts.imageShouldFail || function () { return false; };

  function run(src) {
    var el = window.document.createElement('script');
    el.textContent = src;
    window.document.body.appendChild(el);
  }
  run(LOGIC_JS);
  if (opts.beforeMain) opts.beforeMain(window);
  INLINE_SCRIPTS.forEach(function (src) { run(src.replace(KEY_LINE, "var UNSPLASH_ACCESS_KEY = '" + key + "';")); });
  return dom;
}

function waitFor(fn, timeoutMs) {
  var start = Date.now();
  return new Promise(function (resolve, reject) {
    (function poll() {
      var v;
      try { v = fn(); } catch (e) { v = false; }
      if (v) return resolve(v);
      if (Date.now() - start > (timeoutMs || 4000)) return reject(new Error('waitFor timed out: ' + fn));
      setTimeout(poll, 10);
    })();
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// --- Canned Unsplash API responses -------------------------------------------------------

function apiPhoto(id) {
  return {
    id: 'ph' + id, width: 3000, height: 4000,
    urls: { raw: 'https://images.unsplash.com/photo-' + id + '?ixid=abc&ixlib=rb-4.0.3', regular: 'unused' },
    links: { html: 'https://unsplash.com/photos/ph' + id, download_location: 'https://api.unsplash.com/photos/ph' + id + '/download?ixid=abc' },
    user: { name: 'Jane Photographer', username: 'jane', links: { html: 'https://unsplash.com/@jane' } },
    alt_description: 'A landmark'
  };
}
function jsonResponse(obj, status) {
  status = status || 200;
  return Promise.resolve({ ok: status < 400, status: status, json: function () { return Promise.resolve(obj); } });
}
// Every search returns 30 photos for whatever page was asked for, offset by page.
function unsplashFetchOk(url) {
  var u = new URL(String(url)), page = +u.searchParams.get('page'), results = [];
  for (var i = 1; i <= 30; i++) results.push(apiPhoto(page * 1000 + i));
  return jsonResponse({ total: 600, total_pages: 20, results: results });
}
function isSearchApi(url) { return String(url).indexOf('https://api.unsplash.com/search/photos') === 0; }
function isDownloadPing(url) { return /^https:\/\/api\.unsplash\.com\/photos\/[^/]+\/download/.test(String(url)); }
function grid() { return Array.from({ length: 64 }, function (_, i) { return i; }); }
function savedPhoto(id) { return { id: 'ph' + id, src: 'https://images.unsplash.com/photo-' + id + '?ixid=abc', by: 'Sam Shooter', byUrl: 'https://unsplash.com/@sam', dl: '' }; }
var SEA_KEY_QUERIES = ['famous buildings', 'monument', 'landmark', 'architecture'];
function seedCache(window, photosFor) {
  SEA_KEY_QUERIES.forEach(function (q) {
    for (var p = 1; p <= 5; p++) {
      window.localStorage.setItem('puzzleRoad.unsplash.search:' + q + '|' + p, JSON.stringify({ at: Date.now(), photos: photosFor(q, p) }));
    }
  });
}
function cachedPhoto(id) { return { id: id, src: 'https://images.unsplash.com/photo-' + id + '?ixid=abc', by: 'Cache Person', byUrl: 'https://unsplash.com/@cache', dl: '' }; }

async function startAndWait(document) {
  var startBtn = await waitFor(function () { return document.getElementById('startBtn'); });
  startBtn.click();
  await waitFor(function () { return !document.getElementById('gameView').hidden; }, 6000);
}
function saved(window) { return JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1')); }

// --- Tests -------------------------------------------------------------------------------

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test('themed load: searches Unsplash with the right params, credits the photographer, saves the photo', async function () {
  var calls = [];
  var dom = buildDom({
    fetchImpl: function (url, init) {
      calls.push({ url: String(url), init: init });
      if (isSearchApi(url)) return unsplashFetchOk(url);
      if (isDownloadPing(url)) return jsonResponse({ url: 'unused' });
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    var searches = calls.filter(function (c) { return isSearchApi(c.url); });
    assert.strictEqual(searches.length, 1, 'one search per new puzzle');
    var u = new URL(searches[0].url);
    assert.ok(SEA_KEY_QUERIES.indexOf(u.searchParams.get('query')) !== -1, 'query should come from the trip theme: ' + u.searchParams.get('query'));
    assert.strictEqual(u.searchParams.get('orientation'), 'portrait');
    assert.strictEqual(u.searchParams.get('content_filter'), 'high');
    assert.strictEqual(u.searchParams.get('per_page'), '30');
    var page = +u.searchParams.get('page');
    assert.ok(page >= 1 && page <= 5, 'page should be 1-5, got ' + page);
    assert.strictEqual(searches[0].init.headers.Authorization, 'Client-ID test-key', 'key goes in the Authorization header');

    var caption = document.getElementById('caption').innerHTML;
    assert.ok(/Famous buildings and monuments/.test(caption), 'caption should show the theme: ' + caption);
    assert.ok(/Photo by <a href="https:\/\/unsplash\.com\/@jane\?utm_source=puzzle_road_trip&amp;utm_medium=referral"[^>]*>Jane Photographer<\/a> on <a href="https:\/\/unsplash\.com\/\?utm_source=puzzle_road_trip&amp;utm_medium=referral"[^>]*>Unsplash<\/a>/.test(caption),
      'caption should credit the photographer and link Unsplash with referral tags: ' + caption);

    var s = saved(window);
    assert.strictEqual(s.kind, 'unsplash');
    assert.ok(s.photo && /^https:\/\/images\.unsplash\.com\//.test(s.photo.src), 'save should hold the photo record');
    assert.strictEqual(s.grid.length, 64);
    assert.ok(window.__imageSrcs.every(function (src) { return /\?ixid=abc&ixlib=rb-4\.0\.3&w=1280&h=1600&fit=crop&crop=entropy&auto=format&q=80$/.test(src); }),
      'images should load at the board size: ' + window.__imageSrcs.join(', '));
    assert.strictEqual(new Set(window.__imageSrcs).size, 3, 'three candidates should be tried');

    var recent = JSON.parse(window.localStorage.getItem('puzzleRoad.unsplash.recent.v1'));
    assert.deepStrictEqual(recent['sea-key'], [s.photo.id], 'the chosen photo should be remembered');
    var cacheKey = 'puzzleRoad.unsplash.search:' + u.searchParams.get('query') + '|' + page;
    var cached = JSON.parse(window.localStorage.getItem(cacheKey));
    assert.ok(cached && cached.photos.length === 30, 'the search should be cached');
    var pings = calls.filter(function (c) { return isDownloadPing(c.url); });
    assert.strictEqual(pings.length, 1, 'the chosen photo should be reported to the download endpoint once');
    assert.strictEqual(pings[0].url, s.photo.dl);
    assert.strictEqual(pings[0].init.headers.Authorization, 'Client-ID test-key');
  } finally { dom.window.close(); }
});

test('round trip: Map then Resume reloads the same photo with no extra API call', async function () {
  var apiCalls = 0;
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isSearchApi(url)) { apiCalls++; return unsplashFetchOk(url); }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    var captionBefore = document.getElementById('caption').innerHTML;
    var photoBefore = saved(window).photo;
    document.getElementById('backBtn').click();
    await sleep(50);
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    assert.strictEqual(apiCalls, 1, 'resume should not search again');
    assert.strictEqual(saved(window).kind, 'unsplash', 'should resume the real photo, not fall back to a scene');
    assert.deepStrictEqual(saved(window).photo, photoBefore);
    assert.strictEqual(document.getElementById('caption').innerHTML, captionBefore, 'resumed caption should match exactly');
  } finally { dom.window.close(); }
});

test('resume loads the exact saved photo and keeps moves', async function () {
  var photo = savedPhoto(4242);
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('resume should not fetch: ' + url)); },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify({ solved: 1, current: 'sea-key', trips: { 'sea-key': { miles: 100, done: false } } }));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({ kind: 'unsplash', seed: 777, grid: grid(), moves: 2, elapsed: 1000, photo: photo }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    assert.ok(window.__imageSrcs[0].indexOf(photo.src + '&w=1280') === 0, 'should load the saved photo: ' + window.__imageSrcs[0]);
    assert.ok(/Sam Shooter/.test(document.getElementById('caption').innerHTML));
    assert.strictEqual(saved(window).moves, 2);
    assert.deepStrictEqual(saved(window).photo, photo);
  } finally { dom.window.close(); }
});

test('resume survives a transient failure (fails once, then succeeds on retry)', async function () {
  var loads = 0;
  var dom = buildDom({
    // Both the CORS and the plain attempt fail the first time round, then the retry works.
    imageShouldFail: function () { return ++loads <= 2; },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify({ solved: 1, current: 'sea-key', trips: { 'sea-key': { miles: 100, done: false } } }));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({ kind: 'unsplash', seed: 5, grid: grid(), moves: 4, elapsed: 500, photo: savedPhoto(55) }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 6000);
    assert.strictEqual(saved(window).kind, 'unsplash', 'should recover the real photo, not fall back to a scene');
    assert.ok(loads > 2, 'should have actually retried');
  } finally { dom.window.close(); }
});

test('a fresh cached search is used instead of calling the API; empty pages fall back to page 1', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('should use the cache, not fetch: ' + url)); },
    beforeMain: function (window) {
      // Only page 1 has results, so whichever page is drawn, the photo must come from page 1.
      seedCache(window, function (q, p) { return p === 1 ? [cachedPhoto(9001), cachedPhoto(9002)] : []; });
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(saved(window).kind, 'unsplash');
    assert.ok([9001, 9002].indexOf(saved(window).photo.id) !== -1);
  } finally { dom.window.close(); }
});

test('a cached search older than 24 hours is fetched again', async function () {
  var apiCalls = 0;
  var dom = buildDom({
    fetchImpl: function (url) { if (isSearchApi(url)) { apiCalls++; return unsplashFetchOk(url); } return Promise.reject(new Error('unexpected fetch: ' + url)); },
    beforeMain: function (window) {
      SEA_KEY_QUERIES.forEach(function (q) {
        for (var p = 1; p <= 5; p++) {
          window.localStorage.setItem('puzzleRoad.unsplash.search:' + q + '|' + p, JSON.stringify({ at: Date.now() - 25 * 3600 * 1000, photos: [cachedPhoto(1)] }));
        }
      });
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(apiCalls, 1, 'stale cache should trigger a real search');
    assert.notStrictEqual(saved(window).photo.id, 1);
  } finally { dom.window.close(); }
});

test('recently used photos are skipped', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('unexpected fetch: ' + url)); },
    beforeMain: function (window) {
      seedCache(window, function () { return [cachedPhoto(1), cachedPhoto(2), cachedPhoto(3), cachedPhoto(4)]; });
      window.localStorage.setItem('puzzleRoad.unsplash.recent.v1', JSON.stringify({ 'sea-key': [1, 2, 3] }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(saved(window).photo.id, 4, 'the only photo not used recently should be picked');
    assert.strictEqual(new Set(window.__imageSrcs).size, 1, 'recent photos should not even be loaded');
    var recent = JSON.parse(window.localStorage.getItem('puzzleRoad.unsplash.recent.v1'));
    assert.deepStrictEqual(recent['sea-key'], [1, 2, 3, 4]);
  } finally { dom.window.close(); }
});

test('the recent list keeps only the last 50 ids per trip', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('unexpected fetch: ' + url)); },
    beforeMain: function (window) {
      seedCache(window, function () { return [cachedPhoto(999)]; });
      window.localStorage.setItem('puzzleRoad.unsplash.recent.v1', JSON.stringify({ 'sea-key': Array.from({ length: 50 }, function (_, i) { return i; }), 'route66': [7] }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    var recent = JSON.parse(window.localStorage.getItem('puzzleRoad.unsplash.recent.v1'));
    assert.strictEqual(recent['sea-key'].length, 50);
    assert.strictEqual(recent['sea-key'][49], 999);
    assert.strictEqual(recent['sea-key'][0], 1, 'the oldest id should drop off');
    assert.deepStrictEqual(recent['route66'], [7], 'other trips are untouched');
  } finally { dom.window.close(); }
});

test('no API key: generated scene, no network', async function () {
  var calls = 0;
  var dom = buildDom({ key: '', fetchImpl: function () { calls++; return Promise.reject(new Error('should not fetch')); } });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(saved(window).kind, 'scene');
    assert.strictEqual(calls, 0);
    assert.ok(/UNSPLASH_ACCESS_KEY/.test(document.getElementById('toast').textContent), 'toast should say the key is missing');
  } finally { dom.window.close(); }
});

test('an API error falls back to a generated scene', async function () {
  var dom = buildDom({ fetchImpl: function () { return jsonResponse({ error: 'Unauthorized' }, 401); } });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(saved(window).kind, 'scene');
  } finally { dom.window.close(); }
});

test('photos that all fail to load fall back to a generated scene', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return isSearchApi(url) ? unsplashFetchOk(url) : Promise.reject(new Error('unexpected')); },
    imageShouldFail: function () { return true; }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(saved(window).kind, 'scene');
  } finally { dom.window.close(); }
});

test('fetch entirely unavailable (Claude-artifact sandbox) still falls back to a generated scene', async function () {
  // window.fetch undefined: any code path that calls fetch() throws synchronously rather than
  // returning a rejected promise -- outside fetches are blocked outright in that sandbox.
  var dom = buildDom({ imageShouldFail: function () { return true; } });
  try {
    dom.window.fetch = undefined;
    var window = dom.window, document = window.document;
    await startAndWait(document);
    assert.strictEqual(saved(window).kind, 'scene');
  } finally { dom.window.close(); }
});

test('a full localStorage drops the search cache rather than losing the game save', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('unexpected fetch: ' + url)); },
    beforeMain: function (window) {
      seedCache(window, function () { return [cachedPhoto(31)]; });
      // Simulate a full quota: refuse any write while cached searches are still present.
      var proto = Object.getPrototypeOf(window.localStorage), realSet = proto.setItem;
      proto.setItem = function (k, v) {
        if (k.indexOf('puzzleRoad.unsplash.search:') !== 0) {
          for (var i = 0; i < this.length; i++) if (this.key(i).indexOf('puzzleRoad.unsplash.search:') === 0) throw new Error('QuotaExceededError');
        }
        return realSet.call(this, k, v);
      };
    }
  });
  try {
    var window = dom.window, document = window.document;
    await startAndWait(document);
    var s = saved(window);
    assert.ok(s && s.kind === 'unsplash', 'the game should still be saved');
  } finally { dom.window.close(); }
});

test('an old Commons save still resumes (as a generated scene) and keeps its moves', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('should not fetch: ' + url)); },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify({ solved: 3, current: 'sea-key', trips: { 'sea-key': { miles: 300, done: false } } }));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({ kind: 'commons', seed: 42, grid: grid(), moves: 7, elapsed: 2000, title: 'File:Old.jpg' }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    document.getElementById('backBtn').click();
    await sleep(20);
    assert.strictEqual(saved(window).kind, 'scene');
    assert.strictEqual(saved(window).moves, 7);
  } finally { dom.window.close(); }
});

test('an old scene-kind save still resumes with no network at all', async function () {
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('should not fetch for a scene resume: ' + url)); },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify({ solved: 0, current: 'sea-key', trips: { 'sea-key': { miles: 0, done: false } } }));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({ kind: 'scene', seed: 9, grid: grid(), moves: 1, elapsed: 500 }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    assert.strictEqual(saved(window).kind, 'scene');
  } finally { dom.window.close(); }
});

async function main() {
  var pass = 0, fail = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      await t.fn();
      console.log('ok   - ' + t.name);
      pass++;
    } catch (e) {
      console.log('FAIL - ' + t.name);
      console.log('       ' + (e && e.stack ? e.stack.split('\n').join('\n       ') : e));
      fail++;
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) process.exitCode = 1;
}

main();
