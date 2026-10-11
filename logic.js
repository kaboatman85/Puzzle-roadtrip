/* Puzzle logic: 8 columns x 8 rows, one piece per cell, pieces swap on drop.
   Piece id = its correct cell index. Bonds are derived from adjacency:
   two pieces are joined when they sit side by side exactly as in the finished picture. */
(function (root) {
  var COLS = 8, ROWS = 8, N = COLS * ROWS;

  function sideBonds(grid, i) {
    var id = grid[i], r = Math.floor(i / COLS), c = i % COLS;
    return {
      t: r > 0 && grid[i - COLS] === id - COLS,
      b: r < ROWS - 1 && grid[i + COLS] === id + COLS,
      l: c > 0 && id % COLS > 0 && grid[i - 1] === id - 1,
      r: c < COLS - 1 && id % COLS < COLS - 1 && grid[i + 1] === id + 1
    };
  }

  function bondCount(grid, i) {
    var b = sideBonds(grid, i);
    return (b.t ? 1 : 0) + (b.b ? 1 : 0) + (b.l ? 1 : 0) + (b.r ? 1 : 0);
  }

  function clusterOf(grid, start) {
    var seen = {}, out = [start], q = [start];
    seen[start] = 1;
    while (q.length) {
      var i = q.pop(), b = sideBonds(grid, i), n = [];
      if (b.t) n.push(i - COLS);
      if (b.b) n.push(i + COLS);
      if (b.l) n.push(i - 1);
      if (b.r) n.push(i + 1);
      for (var k = 0; k < n.length; k++) {
        if (!seen[n[k]]) { seen[n[k]] = 1; out.push(n[k]); q.push(n[k]); }
      }
    }
    return out;
  }

  function isSolved(grid) {
    for (var i = 0; i < N; i++) if (grid[i] !== i) return false;
    return true;
  }

  function hasAnyBond(grid) {
    for (var i = 0; i < N; i++) if (bondCount(grid, i) > 0) return true;
    return false;
  }

  function shuffle(rand) {
    for (var tries = 0; tries < 500; tries++) {
      var g = [];
      for (var i = 0; i < N; i++) g.push(i);
      for (var j = N - 1; j > 0; j--) {
        var k = Math.floor(rand() * (j + 1)), t = g[j]; g[j] = g[k]; g[k] = t;
      }
      if (!hasAnyBond(g) && !isSolved(g)) return g;
    }
    // Practically unreachable fallback: rotate the solved grid.
    var f = [];
    for (var m = 0; m < N; m++) f.push((m * 7 + 3) % N);
    return f;
  }

  function clampOffset(cells, dr, dc) {
    var minR = 99, maxR = -1, minC = 99, maxC = -1;
    for (var k = 0; k < cells.length; k++) {
      var r = Math.floor(cells[k] / COLS), c = cells[k] % COLS;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
    }
    return [
      Math.max(0 - minR, Math.min(ROWS - 1 - maxR, dr)) + 0,
      Math.max(0 - minC, Math.min(COLS - 1 - maxC, dc)) + 0
    ];
  }

  function dist(a, b) {
    return Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)) + Math.abs((a % COLS) - (b % COLS));
  }

  function shapeOf(cells) {
    var s = cells.slice().sort(function (a, b) { return a - b; });
    var a = s[0], ar = Math.floor(a / COLS), ac = a % COLS;
    return { cells: s, anchor: [ar, ac],
      sig: s.map(function (i) { return (Math.floor(i / COLS) - ar) + ':' + ((i % COLS) - ac); }).join('|') };
  }

  /* Exact cover: place every unit (a rigid shape) into the free cells by translation only. */
  function pack(units, freeCells) {
    var free = {}, order = freeCells.slice().sort(function (a, b) { return a - b; });
    order.forEach(function (i) { free[i] = 1; });
    var used = {}, usedUnit = {}, placed = new Array(units.length), nodes = 0;
    function rec(idx) {
      while (idx < order.length && used[order[idx]]) idx++;
      if (idx === order.length) return true;
      if (++nodes > 30000) return false;
      var t = order[idx], tr = Math.floor(t / COLS), tc = t % COLS, tried = {};
      for (var u = 0; u < units.length; u++) {
        if (usedUnit[u] || tried[units[u].sig]) continue;
        tried[units[u].sig] = 1;
        var dr = tr - units[u].anchor[0], dc = tc - units[u].anchor[1], ok = true, k, cs = units[u].cells;
        for (k = 0; k < cs.length; k++) {
          var r = Math.floor(cs[k] / COLS) + dr, c = (cs[k] % COLS) + dc;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !free[r * COLS + c] || used[r * COLS + c]) { ok = false; break; }
        }
        if (!ok) continue;
        for (k = 0; k < cs.length; k++) used[(Math.floor(cs[k] / COLS) + dr) * COLS + (cs[k] % COLS) + dc] = 1;
        usedUnit[u] = 1; placed[u] = [dr, dc];
        if (rec(idx + 1)) return true;
        for (k = 0; k < cs.length; k++) delete used[(Math.floor(cs[k] / COLS) + dr) * COLS + (cs[k] % COLS) + dc];
        delete usedUnit[u];
      }
      return false;
    }
    return rec(0) ? placed : null;
  }

  /* Move a cluster by (dr, dc) cells. Whatever it lands on is relocated into the space it
     leaves behind. Locked sets travel whole, so a locked set never splits. If the displaced
     sets cannot be fitted into that space, the move is refused (blocked). */
  function planMove(grid, cells, dr, dc) {
    var o = clampOffset(cells, dr, dc);
    dr = o[0]; dc = o[1];
    if (!dr && !dc) return { dr: 0, dc: 0, newGrid: grid.slice(), blocked: false, changed: false };
    var delta = dr * COLS + dc, oldSet = {}, newSet = {}, newCells = [], k;
    for (k = 0; k < cells.length; k++) { oldSet[cells[k]] = 1; newCells.push(cells[k] + delta); newSet[cells[k] + delta] = 1; }
    var displaced = newCells.filter(function (i) { return !oldSet[i]; });
    var vacated = cells.filter(function (i) { return !newSet[i]; });

    // Whole sets that were touched, each as one rigid unit.
    var seen = {}, units = [];
    displaced.forEach(function (i) {
      if (seen[i]) return;
      var cl = clusterOf(grid, i);
      cl.forEach(function (x) { seen[x] = 1; });
      units.push(shapeOf(cl));
    });
    var free = vacated.slice();
    units.forEach(function (u) { u.cells.forEach(function (x) { if (!newSet[x]) free.push(x); }); });

    var ng = grid.slice();
    for (k = 0; k < cells.length; k++) ng[newCells[k]] = grid[cells[k]];

    var allSingles = units.every(function (u) { return u.cells.length === 1; });
    if (allSingles) {
      // Loose pieces only: send each to the nearest vacated cell (a plain swap for one piece).
      var pairs = [];
      displaced.forEach(function (d) { vacated.forEach(function (v) { pairs.push([dist(d, v), d, v]); }); });
      pairs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; });
      var usedD = {}, usedV = {};
      pairs.forEach(function (p) {
        if (!usedD[p[1]] && !usedV[p[2]]) { usedD[p[1]] = 1; usedV[p[2]] = 1; ng[p[2]] = grid[p[1]]; }
      });
      return { dr: dr, dc: dc, newGrid: ng, blocked: false, changed: true };
    }

    units.sort(function (a, b) { return b.cells.length - a.cells.length; });
    var placed = pack(units, free);
    if (!placed) return { dr: dr, dc: dc, newGrid: grid.slice(), blocked: true, changed: false };
    units.forEach(function (u, idx) {
      var sh = placed[idx][0] * COLS + placed[idx][1];
      u.cells.forEach(function (x) { ng[x + sh] = grid[x]; });
    });
    return { dr: dr, dc: dc, newGrid: ng, blocked: false, changed: true };
  }

  /* How suitable a picture is for a cols x rows puzzle. d is RGBA pixel data (w x h).
     Cells that are flat (blank sky, plain water) make pieces hard to tell apart. */
  function detailScore(d, w, h, cols, rows) {
    var n = w * h, L = new Float32Array(n), sum = 0, sum2 = 0, i, v;
    for (i = 0; i < n; i++) {
      v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      L[i] = v; sum += v; sum2 += v * v;
    }
    var mean = sum / n, gstd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    var cw = Math.floor(w / cols), ch = Math.floor(h / rows), flat = 0, r, c, x, y;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var s = 0, s2 = 0, g = 0, cnt = 0, gc = 0;
      for (y = r * ch; y < (r + 1) * ch; y++) for (x = c * cw; x < (c + 1) * cw; x++) {
        v = L[y * w + x]; s += v; s2 += v * v; cnt++;
        if (x + 1 < (c + 1) * cw) { g += Math.abs(L[y * w + x + 1] - v); gc++; }
        if (y + 1 < (r + 1) * ch) { g += Math.abs(L[(y + 1) * w + x] - v); gc++; }
      }
      var m = s / cnt, sd = Math.sqrt(Math.max(0, s2 / cnt - m * m));
      if (sd < 7 && g / Math.max(1, gc) < 3.5) flat++;
    }
    var flatFrac = flat / (cols * rows), score = Math.round(10 * (1 - flatFrac));
    if (gstd < 28) score = Math.max(0, score - 2);
    return { score: score, flat: flatFrac, std: gstd, rank: (1 - flatFrac) + Math.min(gstd, 80) / 800 };
  }

  var api = {
    COLS: COLS, ROWS: ROWS, N: N,
    sideBonds: sideBonds, bondCount: bondCount, clusterOf: clusterOf,
    isSolved: isSolved, detailScore: detailScore, shuffle: shuffle, clampOffset: clampOffset, planMove: planMove
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PZ = api;
})(typeof window !== 'undefined' ? window : this);
