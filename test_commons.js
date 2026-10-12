/* jsdom smoke tests for themed-photo loading: the real index.html (plus logic.js, themes.js,
   commons.js) is loaded into a jsdom window with a stubbed fetch/Image/canvas, so these drive
   the actual app code -- not a reimplementation of it -- through clicks and localStorage, the
   same way a browser session would. Covers: a themed load, Resume loading the same file,
   Commons failing over to Picsum then to the generated scene, and old saves still resuming. */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var JSDOM = require('jsdom').JSDOM;

function read(name) { return fs.readFileSync(path.join(__dirname, name), 'utf8'); }
// Strip the page's own <script> tags out of the body we embed in the initial HTML string --
// jsdom would otherwise try to run them immediately during parsing (before logic.js etc. are
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
var THEMES_JS = read('themes.js');
var COMMONS_JS = read('commons.js');

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
// uses them (logic.js, themes.js, commons.js, then index.html's two inline blocks).
// `beforeMain` runs after the libraries load but before the main script, so a test can
// pre-seed localStorage -- exactly like a returning visitor would have an existing save.
function buildDom(opts) {
  opts = opts || {};
  var dom = new JSDOM('<!doctype html><html><head></head><body>' + BODY + '</body></html>', {
    url: 'https://puzzle-road-trip.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  var window = dom.window;

  function FakeImage() {
    this.onload = null; this.onerror = null;
    this.naturalWidth = 1600; this.naturalHeight = 2000;
  }
  Object.defineProperty(FakeImage.prototype, 'src', {
    get: function () { return this._src; },
    set: function (v) {
      this._src = v;
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
  window.scrollTo = function () {};
  window.matchMedia = function () { return { matches: false, addListener: function () {}, removeListener: function () {} }; };
  window.fetch = opts.fetchImpl || function () { return Promise.reject(new Error('no fetch stub configured')); };
  window.__imageShouldFail = opts.imageShouldFail || function () { return false; };

  function run(src) {
    var el = window.document.createElement('script');
    el.textContent = src;
    window.document.body.appendChild(el);
  }
  [LOGIC_JS, THEMES_JS, COMMONS_JS].forEach(run);
  if (opts.beforeMain) opts.beforeMain(window);
  INLINE_SCRIPTS.forEach(run);
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

// --- Canned Commons / Picsum API responses ---------------------------------------------

var CATEGORY_FILES = {
  'Lincoln Memorial': ['File:LincolnMemorial1.jpg', 'File:LincolnMemorial2.jpg', 'File:LincolnMemorial3.jpg', 'File:LincolnMemorial4.jpg'],
  'Washington Monument': ['File:WashMonument1.jpg', 'File:WashMonument2.jpg', 'File:WashMonument3.jpg', 'File:WashMonument4.jpg'],
  'Featured pictures of buildings in the United States': ['File:Building1.jpg', 'File:Building2.jpg', 'File:Building3.jpg', 'File:Building4.jpg'],
  'Quality images of buildings in the United States': ['File:QBuilding1.jpg'],
  'Monuments and memorials in the United States': ['File:Monument1.jpg'],
  'Skyscrapers in the United States': ['File:Skyscraper1.jpg'],
  'City halls in the United States': ['File:CityHall1.jpg'],
  'State capitols in the United States': ['File:Capitol1.jpg'],
  'Mount Rushmore National Memorial': ['File:Rushmore1.jpg']
};

function jsonResponse(obj) {
  return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } });
}

function imageInfoPage(title) {
  return {
    title: title,
    imageinfo: [{
      width: 2000, height: 2500, url: 'https://upload.example/' + title, thumburl: 'https://upload.example/thumb/' + title,
      extmetadata: {
        Artist: { value: 'Jane Photographer' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }
      }
    }]
  };
}

function commonsFetchOk(url) {
  var u = new URL(String(url));
  if (u.searchParams.get('list') === 'categorymembers') {
    var cat = u.searchParams.get('cmtitle').replace(/^Category:/, '');
    var files = CATEGORY_FILES[cat] || [];
    return jsonResponse({ query: { categorymembers: files.map(function (t) { return { title: t }; }) } });
  }
  if (u.searchParams.get('prop') === 'imageinfo') {
    var titles = u.searchParams.get('titles').split('|');
    return jsonResponse({ query: { pages: titles.map(imageInfoPage) } });
  }
  return jsonResponse({ query: {} });
}

function picsumFetchOk(url) {
  if (String(url).indexOf('/info') !== -1) return jsonResponse({ author: 'Picsum Author' });
  return Promise.reject(new Error('unexpected picsum fetch: ' + url));
}

function isCommonsUrl(url) { return String(url).indexOf('commons.wikimedia.org') !== -1; }
function isPicsumUrl(url) { return String(url).indexOf('picsum.photos') !== -1; }

// --- Tests -------------------------------------------------------------------------------

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

test('themed load: solving the flow produces a commons-kind save with title/author/license', async function () {
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isCommonsUrl(url)) return commonsFetchOk(url);
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var startBtn = await waitFor(function () { return document.getElementById('startBtn'); });
    startBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    var caption = document.getElementById('caption').innerHTML;
    assert.ok(/Famous buildings and monuments|🏛️/.test(caption), 'caption should show the theme: ' + caption);
    assert.ok(/Jane Photographer/.test(caption), 'caption should show the author: ' + caption);
    assert.ok(/CC BY-SA/.test(caption), 'caption should show the license: ' + caption);
    assert.ok(/href="https:\/\/commons\.wikimedia\.org\/wiki\//.test(caption), 'caption should link to the Commons file page: ' + caption);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'commons');
    assert.ok(typeof saved.title === 'string' && saved.title.length > 0, 'save should include the exact file title');
    assert.strictEqual(saved.grid.length, 64);
  } finally { dom.window.close(); }
});

test('resume loads the exact same file that was saved', async function () {
  var savedTitle = 'File:LincolnMemorial3.jpg';
  var journey = { solved: 1, current: 'sea-key', trips: { 'sea-key': { miles: 100, done: false } } };
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isCommonsUrl(url)) return commonsFetchOk(url);
      return Promise.reject(new Error('unexpected fetch: ' + url));
    },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify(journey));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({
        kind: 'commons', seed: 777, grid: Array.from({ length: 64 }, function (_, i) { return i; }),
        moves: 2, elapsed: 1000, title: savedTitle
      }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    var caption = document.getElementById('caption').innerHTML;
    assert.ok(caption.indexOf('LincolnMemorial3') !== -1, 'resumed caption should name the saved file: ' + caption);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.title, savedTitle, 'resaved record should keep the same title');
    assert.strictEqual(saved.moves, 2, 'resumed move count should be preserved');
  } finally { dom.window.close(); }
});

test('resume survives a transient failure (fails once, then succeeds on retry)', async function () {
  var savedTitle = 'File:LincolnMemorial2.jpg';
  var journey = { solved: 1, current: 'sea-key', trips: { 'sea-key': { miles: 100, done: false } } };
  var commonsCalls = 0;
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isCommonsUrl(url)) {
        commonsCalls++;
        if (commonsCalls === 1) return Promise.reject(new Error('transient network hiccup'));
        return commonsFetchOk(url);
      }
      return Promise.reject(new Error('unexpected fetch: ' + url));
    },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify(journey));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({
        kind: 'commons', seed: 555, grid: Array.from({ length: 64 }, function (_, i) { return i; }),
        moves: 4, elapsed: 500, title: savedTitle
      }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 6000);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'commons', 'should recover the real photo, not fall back to a scene');
    assert.strictEqual(saved.title, savedTitle);
    assert(commonsCalls > 1, 'should have actually retried after the first failure');
  } finally { dom.window.close(); }
});

test('Commons failure falls back to Picsum', async function () {
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isCommonsUrl(url)) return Promise.reject(new Error('Commons is down'));
      if (isPicsumUrl(url)) return picsumFetchOk(url);
      return Promise.reject(new Error('unexpected fetch: ' + url));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var startBtn = await waitFor(function () { return document.getElementById('startBtn'); });
    startBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 6000);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'picsum', 'should fall back to a Picsum photo when Commons fails');
  } finally { dom.window.close(); }
});

test('fetch entirely unavailable (Claude-artifact sandbox) still falls back to a generated scene', async function () {
  // No fetchImpl at all: window.fetch stays undefined, so any code path that calls fetch()
  // throws synchronously rather than returning a rejected promise. This is the scenario the
  // spec calls out explicitly -- outside fetches are blocked outright in that sandbox.
  var dom = buildDom({
    fetchImpl: undefined,
    imageShouldFail: function () { return true; }
  });
  try {
    dom.window.fetch = undefined;
    var window = dom.window, document = window.document;
    var startBtn = await waitFor(function () { return document.getElementById('startBtn'); });
    startBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 6000);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'scene', 'should still reach the generated scene when fetch is missing entirely');
  } finally { dom.window.close(); }
});

test('Commons and Picsum both failing falls back to a generated scene', async function () {
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isCommonsUrl(url)) return Promise.reject(new Error('Commons is down'));
      if (isPicsumUrl(url)) return Promise.reject(new Error('Picsum is down too'));
      return Promise.reject(new Error('unexpected fetch: ' + url));
    },
    // Picsum's actual photo load is an <img src>, not fetch -- fail those too so Picsum
    // truly has nothing to offer, forcing the scene fallback.
    imageShouldFail: function () { return true; }
  });
  try {
    var window = dom.window, document = window.document;
    var startBtn = await waitFor(function () { return document.getElementById('startBtn'); });
    startBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 6000);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'scene', 'should fall back to a generated scene when everything else fails');
  } finally { dom.window.close(); }
});

test('an old picsum-kind save (no title field) still resumes', async function () {
  var journey = { solved: 3, current: 'sea-key', trips: { 'sea-key': { miles: 300, done: false } } };
  var dom = buildDom({
    fetchImpl: function (url) {
      if (isPicsumUrl(url)) return picsumFetchOk(url);
      return Promise.reject(new Error('unexpected fetch: ' + url));
    },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify(journey));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({
        kind: 'picsum', seed: 42, grid: Array.from({ length: 64 }, function (_, i) { return i; }), moves: 7, elapsed: 2000
      }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'picsum');
    assert.strictEqual(saved.moves, 7);
  } finally { dom.window.close(); }
});

test('an old scene-kind save still resumes with no network at all', async function () {
  var journey = { solved: 0, current: 'sea-key', trips: { 'sea-key': { miles: 0, done: false } } };
  var dom = buildDom({
    fetchImpl: function (url) { return Promise.reject(new Error('should not fetch for a scene resume: ' + url)); },
    beforeMain: function (window) {
      window.localStorage.setItem('puzzleRoad.journey.v1', JSON.stringify(journey));
      window.localStorage.setItem('puzzleRoad.game.v1', JSON.stringify({
        kind: 'scene', seed: 9, grid: Array.from({ length: 64 }, function (_, i) { return i; }), moves: 1, elapsed: 500
      }));
    }
  });
  try {
    var window = dom.window, document = window.document;
    var resumeBtn = await waitFor(function () { return document.getElementById('resumeBtn'); });
    resumeBtn.click();
    await waitFor(function () { return !document.getElementById('gameView').hidden; }, 4000);
    var saved = JSON.parse(window.localStorage.getItem('puzzleRoad.game.v1'));
    assert.strictEqual(saved.kind, 'scene');
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
