const PZ = require('./logic.js');
const assert = require('assert');
const { N, COLS, ROWS } = PZ;
assert.strictEqual(COLS, 8); assert.strictEqual(ROWS, 8); assert.strictEqual(N, 64);
let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const sorted = g => g.slice().sort((a, b) => a - b).join(',');
const identity = Array.from({ length: N }, (_, i) => i);

for (let t = 0; t < 200; t++) {
  const g = PZ.shuffle(rand);
  assert.strictEqual(sorted(g), sorted(identity));
  for (let i = 0; i < N; i++) assert.strictEqual(PZ.bondCount(g, i), 0);
  assert(!PZ.isSolved(g));
}
assert(PZ.isSolved(identity));
assert.strictEqual(PZ.clusterOf(identity, 0).length, N);
assert.strictEqual(PZ.bondCount(identity, 0), 2);
assert.strictEqual(PZ.bondCount(identity, COLS + 1), 4);
assert.strictEqual(PZ.bondCount(identity, N - 1), 2);

// row wrap must not bond
const g1 = identity.slice();
[g1[COLS - 1], g1[2 * COLS - 1]] = [g1[2 * COLS - 1], g1[COLS - 1]];
[g1[COLS], g1[2 * COLS]] = [g1[2 * COLS], g1[COLS]];
assert.strictEqual(PZ.sideBonds(g1, 2 * COLS - 1).r, false);

// single-piece move is a swap
let g = PZ.shuffle(rand);
let p = PZ.planMove(g, [10], 0, 2);
assert.strictEqual(p.newGrid[12], g[10]); assert.strictEqual(p.newGrid[10], g[12]);
assert.strictEqual(sorted(p.newGrid), sorted(identity));

// clamping
assert.deepStrictEqual(PZ.clampOffset([0], -3, -3), [0, 0]);
assert.deepStrictEqual(PZ.clampOffset([N - 1], 5, 5), [0, 0]);
assert.deepStrictEqual(PZ.clampOffset([0, 1], 0, 99), [0, COLS - 2]);

function place(g, id, cell) { const at = g.indexOf(id); [g[at], g[cell]] = [g[cell], g[at]]; }
function build(spec) { const g = PZ.shuffle(rand); Object.keys(spec).forEach(id => place(g, +id, spec[id])); return g; }

// locked pair (ids 10,11) at cells 0,1; loose piece 20 at cell 2
let gp = build({ 10: 0, 11: 1, 20: 2 });
assert.strictEqual(PZ.clusterOf(gp, 0).length, 2);
let mp = PZ.planMove(gp, [2], 0, -2);
assert.strictEqual(mp.blocked, false);
assert.strictEqual(mp.newGrid[0], 20); assert.strictEqual(mp.newGrid[1], 10); assert.strictEqual(mp.newGrid[2], 11);
mp = PZ.planMove(gp, [2], 0, -1);
assert.strictEqual(mp.blocked, true); assert.strictEqual(mp.changed, false);
assert.deepStrictEqual(mp.newGrid, gp);

// dropping on the fully locked picture is refused
const full = PZ.planMove(identity, [0], 0, 1);
assert.strictEqual(full.blocked, true); assert.deepStrictEqual(full.newGrid, identity);

// two locked half-pictures swapped whole
const sw = identity.slice();
const leftBlock = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < 4; c++) { const a = r * COLS + c, b = a + 4; [sw[a], sw[b]] = [sw[b], sw[a]]; leftBlock.push(a); }
assert.strictEqual(PZ.clusterOf(sw, 0).length, ROWS * 4);
const sp = PZ.planMove(sw, leftBlock, 0, 4);
assert.strictEqual(sp.blocked, false); assert(PZ.isSolved(sp.newGrid));

// random play keeps a permutation and never breaks a bond
function bondKeys(gr) {
  const s = new Set();
  for (let i = 0; i < N; i++) { const b = PZ.sideBonds(gr, i); if (b.r) s.add(gr[i] + '-' + gr[i + 1]); if (b.b) s.add(gr[i] + '-' + gr[i + COLS]); }
  return s;
}
for (let t = 0; t < 300; t++) {
  let gr = PZ.shuffle(rand);
  for (let s = 0; s < 400; s++) {
    const cl = PZ.clusterOf(gr, Math.floor(rand() * N));
    const pl = PZ.planMove(gr, cl, Math.floor(rand() * 7) - 3, Math.floor(rand() * 7) - 3);
    assert.strictEqual(sorted(pl.newGrid), sorted(identity));
    const before = bondKeys(gr), after = bondKeys(pl.newGrid);
    before.forEach(k => assert(after.has(k), 'bond broken'));
    gr = pl.newGrid;
  }
}

// a cluster-aware solver always finishes
let stuck = 0;
for (let t = 0; t < 300; t++) {
  let gr = PZ.shuffle(rand), guard = 0, progress = true;
  while (!PZ.isSolved(gr) && progress && guard++ < 400) {
    progress = false; const seenC = {};
    for (let cell = 0; cell < N && !progress; cell++) {
      if (seenC[cell]) continue;
      const cl = PZ.clusterOf(gr, cell); cl.forEach(x => seenC[x] = 1);
      const id = gr[cell], dr = Math.floor(id / COLS) - Math.floor(cell / COLS), dc = (id % COLS) - (cell % COLS);
      if (!dr && !dc) continue;
      const pl = PZ.planMove(gr, cl, dr, dc);
      if (pl.changed) { gr = pl.newGrid; progress = true; }
    }
  }
  if (!PZ.isSolved(gr)) stuck++;
}
assert.strictEqual(stuck, 0);
console.log('logic tests passed (8x8), solver stuck:', stuck);
