/* Checks every category in themes.js against the live Wikimedia Commons API: does it exist,
   and how many usable (JPEG) files does it hold. Run after editing themes.js.
   Usage: node verify-categories.js */
var Commons = require('./commons.js');
var THEMES = require('./themes.js');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function checkCategory(name) {
  try {
    var titles = await Commons.listCategoryFiles(name, { maxFiles: 300 }, fetch);
    return { name: name, exists: true, count: titles.length };
  } catch (e) {
    return { name: name, exists: false, count: 0, error: e.message };
  }
}

(async function () {
  var totalCats = 0, totalMissing = 0, totalThin = 0;
  for (var id in THEMES) {
    var theme = THEMES[id];
    console.log('\n=== ' + id + ' — ' + theme.emoji + ' ' + theme.name + ' ===');
    var sum = 0;
    for (var i = 0; i < theme.categories.length; i++) {
      var cat = theme.categories[i];
      var r = await checkCategory(cat);
      totalCats++;
      if (!r.exists) { totalMissing++; console.log('  MISSING  ' + cat); continue; }
      if (r.count === 0) { totalThin++; }
      sum += r.count;
      console.log('  ' + String(r.count).padStart(4) + '  ' + cat);
      await sleep(120);
    }
    console.log('  -> theme pool: ' + sum + ' usable JPEGs across ' + theme.categories.length + ' categories');
  }
  console.log('\n' + totalCats + ' categories checked, ' + totalMissing + ' missing, ' + totalThin + ' empty.');
  if (totalMissing > 0) process.exitCode = 1;
})();
