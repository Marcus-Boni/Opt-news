// The seven figures the body of points takes along the Jornada, one per act. Every figure is `count` points as
// x, y, z, tone, in the body's own space (the stage moves and turns the body). The same point keeps its index across
// figures, so the vertex shader can carry it from one to the next. Deterministic for a seed; no DOM.
import { type Outline, outlineOf, sampleOutline } from "./svg-path.ts";

export const FORMATIONS = 7;
export const STRIDE = 4;

/** How a point reads: 0 a faint leftover, 0.5 full claro quente, 1 laranja vivo, 2 the purple of machine text. */
/** `mark` is what a decision colours on the story (its frame and source mark): warm until someone publishes it. */
export const TONE = { faint: 0.08, warm: 0.5, mark: 0.44, orange: 1, ai: 2 } as const;

/** The chain's four steps sit this far apart, along x on a wide screen or down y on a tall one. */
export const CHAIN_SPACING = 3.1;
export const CHAIN_STEPS = 4;

export interface Artwork {
  /** The official symbol's paths. */
  symbol: readonly string[];
  /** The symbol's inner chevron: the chain's step. */
  chevron: string;
}

export interface Formations {
  count: number;
  sets: Float32Array[];
  /** Four random numbers per point (0..1): stagger, direction, tint, size. */
  seeds: Float32Array;
}

type Random = () => number;

/** Small, fast, seedable generator (mulberry32). */
export function seeded(seed: number): Random {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal deviate (Box-Muller); the floor keeps the logarithm finite. */
function gauss(random: Random): number {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9))) * Math.cos(2 * Math.PI * random());
}

function set(out: Float32Array, i: number, x: number, y: number, z: number, tone: number) {
  const o = i * STRIDE;
  out[o] = x;
  out[o + 1] = y;
  out[o + 2] = z;
  out[o + 3] = tone;
}

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Act 1, ruído: everything the web published today, a slow spiral with a few points already worth a look. */
function noise(count: number, random: Random): Float32Array {
  const out = new Float32Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const tone = random() < 0.07 ? TONE.orange : 0.3 + random() * 0.24;
    const part = random();
    if (part < 0.1) {
      set(out, i, gauss(random) * 0.7, gauss(random) * 0.4, gauss(random) * 0.7, tone);
    } else if (part < 0.74) {
      const arm = Math.floor(random() * 3);
      const r = 0.6 + 6.2 * random() ** 0.8;
      const theta = (arm * TAU) / 3 + r * 0.6 + gauss(random) * (0.14 + 0.45 / (r + 0.6));
      set(out, i, Math.cos(theta) * r, gauss(random) * 0.28 * (1.3 - r / 9), Math.sin(theta) * r, tone);
    } else {
      const r = 1.5 + 7 * random();
      const theta = random() * TAU;
      set(out, i, Math.cos(theta) * r, gauss(random) * 0.9, Math.sin(theta) * r, Math.min(tone, 0.34));
    }
  }
  return out;
}

/** Act 2, coleta: the feeds as nine streams drawn into one throat, mouth toward the viewer. */
function collection(count: number, random: Random): Float32Array {
  const out = new Float32Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const s = random() ** 0.85;
    const radius = (0.2 + 4.4 * (1 - s) ** 2.1) * (1 + gauss(random) * 0.05);
    const loose = random() < 0.12;
    const stream = Math.floor(random() * 9);
    const theta = loose ? random() * TAU : (stream * TAU) / 9 + s * 5.2 + gauss(random) * 0.09;
    const reach = loose ? radius * (1 + random() * 0.6) : radius;
    const picked = random() < smooth(0.35, 0.95, s);
    set(
      out,
      i,
      Math.cos(theta) * reach,
      Math.sin(theta) * reach,
      4.6 - 9.2 * s,
      picked ? TONE.orange : loose ? 0.22 : 0.4 + random() * 0.14,
    );
  }
  return out;
}

/** A point on a ring of the given radius, tilted toward the viewer (`pitch`) and then leaned (`lean`). */
function ring(random: Random, radius: number, pitch: number, lean: number): [number, number, number] {
  const phi = random() * TAU;
  const r = radius + gauss(random) * 0.045;
  const x = Math.cos(phi) * r;
  const y0 = gauss(random) * 0.035;
  const z0 = Math.sin(phi) * r;
  const y1 = y0 * Math.cos(pitch) - z0 * Math.sin(pitch);
  const z1 = y0 * Math.sin(pitch) + z0 * Math.cos(pitch);
  return [x * Math.cos(lean) - y1 * Math.sin(lean), x * Math.sin(lean) + y1 * Math.cos(lean), z1];
}

/** Act 3, filtro e duas notas: half the points fall away, two independent orbits read what is left. */
function scores(count: number, random: Random): Float32Array {
  const out = new Float32Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const part = random();
    if (part < 0.5) {
      const r = 6.5 + 4.5 * random();
      const theta = random() * TAU;
      const y = (random() * 2 - 1) * 0.9;
      const flat = Math.sqrt(1 - y * y);
      set(out, i, Math.cos(theta) * flat * r, y * r * 0.7, Math.sin(theta) * flat * r, 0.03 + random() * 0.1);
    } else if (part < 0.67) {
      set(out, i, ...ring(random, 3.0, 1.3, 0.55), TONE.warm);
    } else if (part < 0.84) {
      set(out, i, ...ring(random, 3.75, 0.7, -0.6), TONE.warm);
    } else {
      set(out, i, gauss(random) * 0.42, gauss(random) * 0.42, gauss(random) * 0.42, TONE.orange);
    }
  }
  return out;
}

export const ORB_RADIUS = 2.3;

/** Act 4, redação: a shell around the model while it writes; the stage tints it purple. */
function writing(count: number, random: Random): Float32Array {
  const out = new Float32Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const x = gauss(random);
    const y = gauss(random);
    const z = gauss(random);
    const k = 1 / Math.max(Math.hypot(x, y, z), 1e-6);
    const haze = random() < 0.3;
    const r = ORB_RADIUS + (haze ? Math.abs(gauss(random)) * 0.5 : gauss(random) * 0.015);
    set(out, i, x * k * r, y * k * r, z * k * r, haze ? 0.3 : 0.8);
  }
  return out;
}

/** Act 5, curadoria: the story as it reaches a curator. Frame, source, headline, summary lines, the AI mark. */
function story(count: number, random: Random): Float32Array {
  const out = new Float32Array(count * STRIDE);
  const W = 5.2;
  const H = 3.4;
  const left = -2.2;
  const span = (a: number, b: number) => a + (b - a) * random();
  const lines = [4.1, 4.3, 3.8, 4.2, 2.6];
  for (let i = 0; i < count; i++) {
    const part = random();
    if (part < 0.13) {
      const along = random() * (W + H) * 2;
      const j = () => gauss(random) * 0.012;
      if (along < W) set(out, i, along - W / 2, H / 2 + j(), 0, TONE.mark);
      else if (along < W + H) set(out, i, W / 2 + j(), along - W - H / 2, 0, TONE.mark);
      else if (along < 2 * W + H) set(out, i, along - W - H - W / 2, -H / 2 + j(), 0, TONE.mark);
      else set(out, i, -W / 2 + j(), along - 2 * W - H - H / 2, 0, TONE.mark);
    } else if (part < 0.3) {
      if (random() < 0.58) set(out, i, span(left, 1.5), span(0.78, 1.06), 0.22, 0.6);
      else set(out, i, span(left, 0.5), span(0.36, 0.64), 0.22, 0.6);
    } else if (part < 0.35) {
      set(out, i, span(left, -1.3), span(1.3, 1.44), 0.3, TONE.mark);
    } else if (part < 0.75) {
      const row = Math.floor(random() * lines.length);
      set(out, i, span(left, left + (lines[row] ?? 4)), -0.02 - row * 0.3 + span(-0.04, 0.04), 0.1, 0.38);
    } else if (part < 0.8) {
      set(out, i, span(left, -1.55), span(-1.5, -1.36), 0.3, TONE.ai);
    } else {
      set(out, i, span(-W / 2, W / 2), span(-H / 2, H / 2), -0.12 + gauss(random) * 0.02, 0.12);
    }
  }
  return out;
}

/** Where step `k` of the chain sits: along x in a row, down y in a column. */
export function chainAnchor(k: number, column: boolean): [number, number] {
  const along = (k - (CHAIN_STEPS - 1) / 2) * CHAIN_SPACING;
  return column ? [0, -along] : [along, 0];
}

/** Act 6, cadeia: notícia, pauta, meetup, insight. Four official chevrons and the links between them. */
function chain(count: number, random: Random, chevron: Outline, column: boolean): Float32Array {
  const out = new Float32Array(count * STRIDE);
  const shape = sampleOutline(chevron, count, 2, random);
  for (let i = 0; i < count; i++) {
    const part = random();
    let x: number;
    let y: number;
    let z = gauss(random) * 0.05;
    let tone = 0.55;
    if (part < 0.8) {
      const k = Math.floor(random() * CHAIN_STEPS);
      x = (k - (CHAIN_STEPS - 1) / 2) * CHAIN_SPACING + (shape[i * 2] ?? 0);
      y = shape[i * 2 + 1] ?? 0;
    } else if (part < 0.92) {
      const k = Math.floor(random() * (CHAIN_STEPS - 1));
      x = (k - (CHAIN_STEPS - 1) / 2) * CHAIN_SPACING + 1.05 + random() * (CHAIN_SPACING - 2.1);
      y = gauss(random) * 0.02;
      tone = 0.45;
    } else {
      x = (random() * 2 - 1) * 7;
      y = (random() * 2 - 1) * 2.5;
      z = (random() * 2 - 1) * 2;
      tone = 0.1;
    }
    // A column is the row turned a quarter: the chevrons point down the chain.
    if (column) set(out, i, y, -x, z, tone);
    else set(out, i, x, y, z, tone);
  }
  return out;
}

/** Act 7: the official Optsolv symbol, sampled (never redrawn). */
function symbol(count: number, random: Random, outline: Outline): Float32Array {
  const out = new Float32Array(count * STRIDE);
  const shape = sampleOutline(outline, count, 4.4, random);
  for (let i = 0; i < count; i++)
    set(out, i, shape[i * 2] ?? 0, shape[i * 2 + 1] ?? 0, gauss(random) * 0.05, TONE.orange);
  return out;
}

/** Only the chain depends on the screen's shape; the stage rebuilds it when the screen turns. */
export function buildChain(count: number, art: Artwork, column: boolean, seed = 7): Float32Array {
  return chain(count, seeded(seed + 5), outlineOf([art.chevron]), column);
}

export function buildFormations(count: number, art: Artwork, column = false, seed = 7): Formations {
  const seeds = new Float32Array(count * 4);
  const random = seeded(seed + 100);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  return {
    count,
    seeds,
    sets: [
      noise(count, seeded(seed)),
      collection(count, seeded(seed + 1)),
      scores(count, seeded(seed + 2)),
      writing(count, seeded(seed + 3)),
      story(count, seeded(seed + 4)),
      buildChain(count, art, column, seed),
      symbol(count, seeded(seed + 6), outlineOf(art.symbol)),
    ],
  };
}
