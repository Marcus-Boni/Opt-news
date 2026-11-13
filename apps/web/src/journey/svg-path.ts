// The official Optsolv artwork as geometry. A reader for the absolute M, L, C and Z commands its paths use, flattened
// to polygons that the Jornada samples points from and extrudes into solids. Pure (no DOM), so it runs under
// node:test and gives the same points for the same seed.

export type Point = readonly [x: number, y: number];
export type Polygon = readonly Point[];

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Closed shapes ready to be sampled: each polygon with its own box (a cheap first rejection) and the box of all. */
export interface Outline {
  polygons: Polygon[];
  boxes: Box[];
  box: Box;
}

const TOKEN = /[MLCZ]|-?(?:\d+\.?\d*|\.\d+)/gi;
const COMMAND = /^[MLCZ]$/i;

/** Flattens a path of absolute M, L, C and Z commands into closed polygons; each curve is cut into `steps` chords. */
export function flattenPath(d: string, steps = 8): Polygon[] {
  const tokens = d.match(TOKEN) ?? [];
  const polygons: Polygon[] = [];
  let current: Point[] = [];
  let command = "";
  let i = 0;
  const next = () => Number(tokens[i++]);
  const close = () => {
    if (current.length > 2) polygons.push(current);
    current = [];
  };
  while (i < tokens.length) {
    const token = tokens[i] ?? "";
    if (COMMAND.test(token)) {
      command = token.toUpperCase();
      i++;
      if (command !== "Z") continue;
    }
    if (command === "Z") {
      close();
      command = "";
    } else if (command === "M") {
      close();
      current = [[next(), next()]];
      // Pairs after a move are implicit lines.
      command = "L";
    } else if (command === "L") {
      current.push([next(), next()]);
    } else if (command === "C") {
      const [x0, y0] = current.at(-1) ?? [0, 0];
      const x1 = next();
      const y1 = next();
      const x2 = next();
      const y2 = next();
      const x3 = next();
      const y3 = next();
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        current.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
    } else {
      // A number with no command before it: not a path this reader knows, skip it rather than loop forever.
      i++;
    }
  }
  close();
  return polygons;
}

function boxOf(points: Polygon): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of points) {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  }
  return box;
}

/** The shapes of one or more paths, with their boxes. */
export function outlineOf(paths: readonly string[], steps = 8): Outline {
  const polygons = paths.flatMap((d) => flattenPath(d, steps));
  const boxes = polygons.map(boxOf);
  return { polygons, boxes, box: boxOf(polygons.flat()) };
}

/** Even-odd test: is (x, y) inside the polygon? */
export function inPolygon(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i] as Point;
    const [bx, by] = polygon[j] as Point;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function inOutline(outline: Outline, x: number, y: number): boolean {
  for (let k = 0; k < outline.polygons.length; k++) {
    const b = outline.boxes[k] as Box;
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
    if (inPolygon(outline.polygons[k] as Polygon, x, y)) return true;
  }
  return false;
}

/**
 * `count` points inside the outline, uniform by area, as x,y pairs centred on the outline's box and scaled so the
 * box is `height` tall, with y pointing up (SVG's points down). Rejection sampling; the bound on tries keeps a
 * degenerate outline from spinning forever, and whatever it could not place stays at the centre.
 */
export function sampleOutline(outline: Outline, count: number, height: number, random: () => number): Float32Array {
  const out = new Float32Array(count * 2);
  const { minX, minY, maxX, maxY } = outline.box;
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0 && h > 0)) return out;
  const scale = height / h;
  let n = 0;
  for (let tries = 0; n < count && tries < count * 60; tries++) {
    const x = minX + random() * w;
    const y = minY + random() * h;
    if (!inOutline(outline, x, y)) continue;
    out[n * 2] = (x - minX - w / 2) * scale;
    out[n * 2 + 1] = (minY + h / 2 - y) * scale;
    n++;
  }
  return out;
}

/** The first polygon of an outline, centred and scaled like `sampleOutline`, without a repeated closing point. */
export function normalizedPolygon(outline: Outline, height: number): Point[] {
  const polygon = outline.polygons[0] ?? [];
  const { minX, minY, maxX, maxY } = outline.box;
  const scale = height / (maxY - minY || 1);
  const points = polygon.map(([x, y]): Point => [(x - (minX + maxX) / 2) * scale, ((minY + maxY) / 2 - y) * scale]);
  const first = points[0];
  const last = points.at(-1);
  if (first && last && points.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) points.pop();
  return points;
}
