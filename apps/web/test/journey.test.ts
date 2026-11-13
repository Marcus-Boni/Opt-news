import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChain,
  buildFormations,
  CHAIN_SPACING,
  chainAnchor,
  FORMATIONS,
  ORB_RADIUS,
  STRIDE,
  TONE,
} from "../src/journey/formations.ts";
import { flattenPath, inOutline, normalizedPolygon, outlineOf, sampleOutline } from "../src/journey/svg-path.ts";

// The symbol's inner chevron (official geometry) and a square standing in for the full symbol.
const CHEVRON =
  "M266.61 328.76L266.61 313.65L266.61 298.55C266.61 283.90 257.96 270.63 244.55 264.72L0.00 156.83L0.00 219.56L211.64 305.81L211.72 313.65L211.64 321.50L0.00 407.75L0.00 470.48L244.55 362.59C257.96 356.68 266.61 343.41 266.61 328.76";
const ART = { symbol: ["M0 0L100 0L100 200L0 200Z"], chevron: CHEVRON };
const COUNT = 2000;

const lcg = () => {
  let s = 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

test("path reader: moves, lines, curves and closes become polygons", () => {
  assert.deepEqual(flattenPath("M0 0L10 0L5 10Z"), [
    [
      [0, 0],
      [10, 0],
      [5, 10],
    ],
  ]);
  // Two subpaths, the second without Z; pairs after M are implicit lines.
  assert.equal(flattenPath("M0 0 10 0 10 10ZM20 20L30 20L30 30").length, 2);
  // A curve is cut into chords and ends exactly on its end point.
  const [curve] = flattenPath("M0 0C0 10 10 10 10 0L5 -5Z", 4);
  assert.equal(curve?.length, 6);
  assert.deepEqual(curve?.[4], [10, 0]);
  // Anything else is skipped, never looped on.
  assert.deepEqual(flattenPath("12 34 Q1 2"), []);
});

test("sampling: points land inside the artwork, centred, y up, at the asked height", () => {
  const outline = outlineOf([CHEVRON]);
  assert.equal(inOutline(outline, 240, 313), true);
  assert.equal(inOutline(outline, 100, 313), false);
  const points = sampleOutline(outline, 500, 2, lcg());
  let top = -Infinity;
  let bottom = Infinity;
  for (let i = 0; i < 500; i++) {
    const y = points[i * 2 + 1] ?? 0;
    top = Math.max(top, y);
    bottom = Math.min(bottom, y);
  }
  assert.ok(top <= 1 && top > 0.8, `top ${top}`);
  assert.ok(bottom >= -1 && bottom < -0.8, `bottom ${bottom}`);
  // The chevron points right: its tip is the right-most point, at mid height.
  const polygon = normalizedPolygon(outline, 2);
  const tip = polygon.reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(Math.abs(tip[1]) < 0.2);
  assert.notDeepEqual(polygon[0], polygon.at(-1));
});

test("formations: seven figures, same length, finite, the same for the same seed", () => {
  const a = buildFormations(COUNT, ART);
  const b = buildFormations(COUNT, ART);
  const c = buildFormations(COUNT, ART, false, 8);
  assert.equal(a.sets.length, FORMATIONS);
  assert.equal(a.seeds.length, COUNT * 4);
  for (const [k, figure] of a.sets.entries()) {
    assert.equal(figure.length, COUNT * STRIDE);
    assert.ok(figure.every(Number.isFinite), `figure ${k} has a non-finite value`);
    assert.deepEqual(figure, b.sets[k]);
  }
  assert.notDeepEqual(a.sets[0], c.sets[0]);
  assert.ok(a.seeds.every((v) => v >= 0 && v < 1));
});

test("formations: each act reads as what it says", () => {
  const { sets } = buildFormations(COUNT, ART);
  const at = (k: number, i: number) => {
    const s = sets[k] as Float32Array;
    return [s[i * 4] ?? 0, s[i * 4 + 1] ?? 0, s[i * 4 + 2] ?? 0, s[i * 4 + 3] ?? 0] as const;
  };
  let discarded = 0;
  let aiMarks = 0;
  let decisionMarks = 0;
  for (let i = 0; i < COUNT; i++) {
    // Redação: every point is on or just outside the model's shell.
    const [x, y, z] = at(3, i);
    assert.ok(Math.hypot(x, y, z) > ORB_RADIUS - 0.2);
    // Símbolo: all orange, inside the artwork's box at the sampled height.
    const [sx, sy, , tone] = at(6, i);
    assert.equal(tone, TONE.orange);
    assert.ok(Math.abs(sy) <= 2.2 && Math.abs(sx) <= 1.1);
    if (at(2, i)[3] < 0.2) discarded++;
    if (at(4, i)[3] === TONE.ai) aiMarks++;
    if (Math.abs(at(4, i)[3] - TONE.mark) < 1e-6) decisionMarks++;
  }
  // Duas notas: about half the points fall away; curadoria: a small purple mark, the only purple on the page.
  assert.ok(discarded > COUNT * 0.4 && discarded < COUNT * 0.6, `${discarded} discarded`);
  assert.ok(aiMarks > 0 && aiMarks < COUNT * 0.1, `${aiMarks} AI marks`);
  // The story's frame and source mark are what a decision colours; nothing on it is orange before that.
  assert.ok(decisionMarks > COUNT * 0.1, `${decisionMarks} decision marks`);
  assert.equal(
    (sets[4] as Float32Array).some((v, k) => k % 4 === 3 && v === TONE.orange),
    false,
  );
});

test("chain: a row on wide screens, a column on tall ones, anchors under each step", () => {
  const extent = (figure: Float32Array, axis: 0 | 1) => {
    let max = 0;
    for (let i = 0; i < COUNT; i++)
      if ((figure[i * 4 + 3] ?? 0) > 0.5) max = Math.max(max, Math.abs(figure[i * 4 + axis] ?? 0));
    return max;
  };
  const row = buildChain(COUNT, ART, false);
  const column = buildChain(COUNT, ART, true);
  assert.ok(extent(row, 0) > CHAIN_SPACING * 1.5 && extent(row, 1) <= 1.01);
  assert.ok(extent(column, 1) > CHAIN_SPACING * 1.5 && extent(column, 0) <= 1.01);
  assert.deepEqual(chainAnchor(0, false), [-1.5 * CHAIN_SPACING, 0]);
  assert.deepEqual(chainAnchor(3, true), [0, -1.5 * CHAIN_SPACING]);
});
