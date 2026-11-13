// The Jornada's stage: one continuous shot in three.js. A single body of points takes seven figures (formations.ts)
// while the camera travels the route; under it runs a track of official chevrons, inside it (while the machine
// writes) the model's core. The page owns the scroll and tells the stage where the reader is; the stage owns every
// frame. Quality steps down by itself on a slow device, the loop stops while the tab is hidden, and under reduced
// motion nothing moves: one still frame per act.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  type Artwork,
  buildChain,
  buildFormations,
  CHAIN_STEPS,
  chainAnchor,
  FORMATIONS,
  ORB_RADIUS,
  STRIDE,
} from "./formations.ts";
import {
  BACKDROP_FRAGMENT,
  BACKDROP_VERTEX,
  BODY_FRAGMENT,
  BODY_VERTEX,
  CORE_FRAGMENT,
  CORE_VERTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
  LENS,
  TRACK_FRAGMENT,
  TRACK_VERTEX,
} from "./shaders.ts";
import { normalizedPolygon, outlineOf } from "./svg-path.ts";

/** Where the reader is: the act on screen and how far through it (0..1). The page writes it, the stage reads it. */
export interface Position {
  chapter: number;
  t: number;
}

/** What the page needs back each frame to keep its own layer in step with the shot. */
export interface StageFrame {
  /** How much of each figure the body is right now (sums to 1). */
  weights: Float32Array;
  /** Screen position (CSS px) of the label spot beside each step of the chain: x0, y0, x1, y1… */
  chain: Float32Array;
  /** How many steps of the chain the impulse has reached (0..4). */
  chainLit: number;
  /** The chain is drawn as a column (tall screens). */
  column: boolean;
}

export interface StageOptions {
  position: Position;
  /** Reduced motion: no loop, one still frame per act. */
  still: boolean;
  onFrame?: (frame: StageFrame) => void;
  /** The GPU context went away; the page falls back to its static ground. */
  onLost?: () => void;
}

export interface StageHandle {
  setPaused(paused: boolean): void;
  /** A curator's decision, shown on the body (under reduced motion, without the animation). */
  decide(kind: "publish" | "withdraw"): void;
  /** Draw again (still mode: the act changed). */
  /** Where the caption on screen is (viewport px), so the points make room for it; null when there is none.
   * Returns whether that changed. */
  setVeil(rect: { left: number; top: number; width: number; height: number } | null): boolean;
  invalidate(): void;
  dispose(): void;
}

// Three budgets. The stage starts on the one the device suggests and only ever steps down.
const TIERS = [
  { points: 44000, dpr: 2, pixels: 4.2e6, bloom: true, samples: 4 },
  { points: 28000, dpr: 1.5, pixels: 2.6e6, bloom: true, samples: 0 },
  { points: 16000, dpr: 1.25, pixels: 1.6e6, bloom: false, samples: 0 },
] as const;

interface Shot {
  /** Camera, relative to the body. */
  eye: readonly [number, number, number];
  /** Where the body sits on a wide screen, as a share of the viewport from its centre (x right, y up). */
  frame: readonly [number, number];
  /** The figure's width and height that must stay in view. */
  wide: number;
  tall: number;
  aperture: number;
}

// One shot per act, plus the last push toward the symbol. The body alternates sides so the caption has the other.
const SHOTS: readonly Shot[] = [
  { eye: [0, 7.4, 8.6], frame: [0.07, 0.04], wide: 9, tall: 6.5, aperture: 0.55 },
  { eye: [2.8, 1.5, 9.6], frame: [-0.17, 0], wide: 8.5, tall: 8.5, aperture: 0.5 },
  { eye: [-2.4, 2.3, 9.4], frame: [0.17, 0], wide: 8, tall: 8, aperture: 0.5 },
  { eye: [2, 0.5, 7.4], frame: [-0.19, 0], wide: 5.8, tall: 5.8, aperture: 0.45 },
  { eye: [-2.2, 0.6, 8.6], frame: [0.17, 0], wide: 5.8, tall: 3.8, aperture: 0.3 },
  { eye: [0, 1.4, 12.5], frame: [0, 0.11], wide: 12.4, tall: 2.6, aperture: 0.3 },
  { eye: [0.8, 0.2, 9], frame: [0.19, 0], wide: 3.2, tall: 4.8, aperture: 0.25 },
  { eye: [0, 0, 7.6], frame: [0.19, 0], wide: 3.2, tall: 4.8, aperture: 0.2 },
];

// Per figure: how much the points drift at rest, how bright one point is (dense figures need less), point size.
const DRIFT = [0.22, 0.09, 0.09, 0.035, 0.012, 0.012, 0.01];
const GAIN = [0.8, 0.6, 0.62, 0.4, 0.5, 0.55, 0.5];
const SIZE = [1, 0.9, 0.9, 0.85, 0.85, 0.9, 0.95];

const LAST = FORMATIONS - 1;
const FOV = 40;
/** Share of an act the figure holds before it starts turning into the next. */
const HOLD = 0.55;
const TRACK_COUNT = 62;
const TRACK_FROM = -0.45;
const TRACK_TO = 7.7;
const DUST = 2600;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const blend = (values: readonly number[], weights: Float32Array) =>
  values.reduce((sum, v, k) => sum + v * (weights[k] ?? 0), 0);

/** The route: the body's centre for a place `u` along the journey (one unit per act), heading into the screen. */
const routeAt = (u: number, out: THREE.Vector3) =>
  out.set(Math.sin(u * 0.8) * 2.2, Math.sin(u * 0.5 + 1) * 0.6, -u * 16);

function pickTier(): number {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse || small) return cores >= 8 ? 1 : 2;
  return cores <= 4 ? 1 : 0;
}

/** Builds the stage inside `host` and starts it. Throws when WebGL is not available. */
export function createStage(host: HTMLElement, art: Artwork, options: StageOptions): StageHandle {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  try {
    return buildStage(renderer, host, art, options);
  } catch (error) {
    // Whatever fails once the context exists has to give it back, or every attempt would leak one.
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  }
}

function buildStage(
  renderer: THREE.WebGLRenderer,
  host: HTMLElement,
  art: Artwork,
  options: StageOptions,
): StageHandle {
  const { still, position } = options;
  const tier = pickTier();
  const budget = () => TIERS[tier] ?? TIERS[2];

  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.appendChild(canvas);

  const ground = new THREE.Color("#141010");
  const warm = new THREE.Color("#f1f1e3");
  const orange = new THREE.Color("#ff4800");
  const purple = new THREE.Color("#743dff");
  const lavender = new THREE.Color("#a588ff");
  const depth = new THREE.Color("#271284");
  const graphite = new THREE.Color("#353030");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);

  // --- Backdrop -----------------------------------------------------------------------------------------------
  const backdropUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uTravel: { value: 0 },
    uAi: { value: 0 },
    uGround: { value: ground },
    uOrange: { value: orange },
    uPurple: { value: purple },
  };
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERTEX,
      fragmentShader: BACKDROP_FRAGMENT,
      uniforms: backdropUniforms,
      depthTest: false,
      depthWrite: false,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  // --- The body of points -------------------------------------------------------------------------------------
  const count = budget().points;
  let column = host.clientWidth / Math.max(host.clientHeight, 1) < 0.9;
  const formations = buildFormations(count, art, column);
  const bodyGeometry = new THREE.BufferGeometry();
  const seeds3 = new Float32Array(count * 3);
  const seeds1 = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seeds3[i * 3] = formations.seeds[i * 4] ?? 0;
    seeds3[i * 3 + 1] = formations.seeds[i * 4 + 1] ?? 0;
    seeds3[i * 3 + 2] = formations.seeds[i * 4 + 2] ?? 0;
    seeds1[i] = formations.seeds[i * 4 + 3] ?? 0;
  }
  bodyGeometry.setAttribute("position", new THREE.BufferAttribute(seeds3, 3));
  bodyGeometry.setAttribute("aRand", new THREE.BufferAttribute(seeds1, 1));
  formations.sets.forEach((figure, k) => {
    bodyGeometry.setAttribute(`aF${k}`, new THREE.BufferAttribute(figure, STRIDE));
  });
  const bodyUniforms = {
    uStage: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: 20 },
    uFocus: { value: 10 },
    uAperture: { value: 0.5 },
    uDrift: { value: 0.2 },
    uGain: { value: 0.5 },
    uReveal: { value: still ? 1 : 0 },
    uChainFront: { value: -9 },
    uImpulse: { value: 0 },
    uScatter: { value: 0 },
    uPublished: { value: 0 },
    uVeil: { value: new THREE.Vector4() },
    uVeilPower: { value: 0 },
    uPointerPower: { value: 0 },
    uSpin: { value: new THREE.Vector2() },
    uChainAxis: { value: new THREE.Vector2(1, 0) },
    uCenter: { value: new THREE.Vector3() },
    uPointer: { value: new THREE.Vector3(0, 0, 99) },
    uRot: { value: new THREE.Matrix3() },
    uWarm: { value: warm },
    uOrange: { value: orange },
    uPurple: { value: purple },
    uLavender: { value: lavender },
  };
  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: bodyUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const body = new THREE.Points(bodyGeometry, bodyMaterial);
  // The shader places every point; the geometry's own bounds mean nothing.
  body.frustumCulled = false;
  body.renderOrder = 2;
  scene.add(body);

  // --- Dust along the route -----------------------------------------------------------------------------------
  const dustPositions = new Float32Array(DUST * 3);
  const dustSeeds = new Float32Array(DUST);
  const at = new THREE.Vector3();
  for (let i = 0; i < DUST; i++) {
    routeAt(TRACK_FROM + Math.random() * (TRACK_TO - TRACK_FROM), at);
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 14;
    dustPositions[i * 3] = at.x + Math.cos(angle) * radius;
    dustPositions[i * 3 + 1] = at.y + Math.sin(angle) * radius * 0.6;
    dustPositions[i * 3 + 2] = at.z + (Math.random() - 0.5) * 6;
    dustSeeds[i] = Math.random();
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("aRand", new THREE.BufferAttribute(dustSeeds, 1));
  const dustUniforms = { uSize: { value: 20 }, uTime: { value: 0 }, uWarm: { value: warm } };
  const dustMaterial = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: dustUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  dust.renderOrder = 1;
  scene.add(dust);

  // --- The model's core (act 4) -------------------------------------------------------------------------------
  const coreUniforms = {
    uTime: { value: 0 },
    uScale: { value: 0 },
    uRadius: { value: ORB_RADIUS - 0.55 },
    uCenter: bodyUniforms.uCenter,
    uRot: bodyUniforms.uRot,
    uDepth: { value: depth },
    uPurple: { value: purple },
    uLavender: { value: lavender },
  };
  const coreGeometry = new THREE.IcosahedronGeometry(1, tier === 0 ? 28 : 18);
  const coreMaterial = new THREE.ShaderMaterial({
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
    uniforms: coreUniforms,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.frustumCulled = false;
  core.visible = false;
  scene.add(core);

  // --- The track: official chevrons laid along the route, pointing the way -------------------------------------
  const chevron = normalizedPolygon(outlineOf([art.chevron], 6), 2);
  const trackGeometry = new THREE.ExtrudeGeometry(new THREE.Shape(chevron.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 1,
  });
  trackGeometry.translate(0, 0, -0.05);
  const along = new Float32Array(TRACK_COUNT);
  const trackUniforms = {
    uBody: { value: 0 },
    uHeat: { value: 0 },
    uAi: { value: 0 },
    uSink: { value: 0 },
    uGround: { value: ground },
    uGraphite: { value: graphite },
    uWarm: { value: warm },
    uOrange: { value: orange },
  };
  const trackMaterial = new THREE.ShaderMaterial({
    vertexShader: TRACK_VERTEX,
    fragmentShader: TRACK_FRAGMENT,
    uniforms: trackUniforms,
    transparent: true,
  });
  const track = new THREE.InstancedMesh(trackGeometry, trackMaterial, TRACK_COUNT);
  {
    const up = new THREE.Vector3(0, 1, 0);
    const ahead = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const side = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    for (let j = 0; j < TRACK_COUNT; j++) {
      const u = lerp(TRACK_FROM, TRACK_TO, j / (TRACK_COUNT - 1));
      along[j] = u;
      routeAt(u, at);
      routeAt(u + 0.01, ahead);
      forward.subVectors(ahead, at).normalize();
      side.crossVectors(up, forward).normalize();
      normal.crossVectors(forward, side);
      // The chevron's tip (its +x) points down the route; it lies flat under the body.
      basis.makeBasis(forward, side, normal);
      basis.setPosition(at.x, at.y - 4.7, at.z);
      track.setMatrixAt(j, basis);
    }
  }
  trackGeometry.setAttribute("aAlong", new THREE.InstancedBufferAttribute(along, 1));
  track.instanceMatrix.needsUpdate = true;
  track.frustumCulled = false;
  scene.add(track);

  // --- Lens ---------------------------------------------------------------------------------------------------
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: budget().samples });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.7, 0.62);
  bloom.enabled = budget().bloom;
  composer.addPass(bloom);
  const lensUniforms = {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };
  const lens = new ShaderPass({ ...LENS, uniforms: lensUniforms });
  composer.addPass(lens);
  const output = new OutputPass();
  composer.addPass(output);

  // --- Size ---------------------------------------------------------------------------------------------------
  let width = 1;
  let height = 1;
  let scale = 1; // adaptive: multiplies the pixel ratio, only ever goes down
  const fit = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === 0 || h === 0) return;
    width = w;
    height = h;
    const b = budget();
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, b.dpr, Math.sqrt(b.pixels / (w * h))) * scale);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    backdropUniforms.uAspect.value = camera.aspect;
    lens.uniforms.uResolution?.value.set(w * dpr, h * dpr);
    const turned = camera.aspect < 0.9;
    if (turned !== column) {
      column = turned;
      const attribute = bodyGeometry.getAttribute("aF5") as THREE.BufferAttribute;
      attribute.copyArray(buildChain(count, art, column));
      attribute.needsUpdate = true;
    }
    bodyUniforms.uChainAxis.value.set(column ? 0 : 1, column ? -1 : 0);
    pixelSize = h * dpr * 0.026;
  };
  let pixelSize = 20;

  // --- Pointer ------------------------------------------------------------------------------------------------
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let pointerX = 0;
  let pointerY = 0;
  let pointerAt = -1e9;
  // Smoothed, in -1..1 from the centre of the viewport.
  let lookX = 0;
  let lookY = 0;
  const onPointer = (e: PointerEvent) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    pointerAt = performance.now();
  };
  if (fine && !still) window.addEventListener("pointermove", onPointer, { passive: true });

  // --- Frame --------------------------------------------------------------------------------------------------
  const timer = new THREE.Timer();
  const weights = new Float32Array(FORMATIONS);
  const chainSpots = new Float32Array(CHAIN_STEPS * 2);
  const frameOut: StageFrame = { weights, chain: chainSpots, chainLit: 0, column };
  const center = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const euler = new THREE.Euler();
  const rot4 = new THREE.Matrix4();
  const rotInverse = new THREE.Matrix3();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const facing = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

  let clock = still ? 12 : 0; // ambient time; a fixed, pleasant instant under reduced motion
  let paused = false;
  let stage = 0; // which figure, 0..6, fractional while one turns into the next
  let travel = 0; // where along the route, 0..7
  let lastTravel = 0;
  let speed = 0;
  let reveal = still ? 1 : 0;
  let first = true;
  let published = 0; // the story carries a decision (1) or not (0)
  let veiled = false; // a caption is on screen
  const veil = { left: 0, top: 0, width: 0, height: 0 };
  let visible: number = count; // points actually drawn
  let publishedAt = -1;
  let withdrawnAt = -1;
  let raf = 0;
  let disposed = false;
  // Adaptive quality: average frame time over a window, measured once the first second has passed.
  let sampleTime = 0;
  let sampleFrames = 0;
  let warmup = 1;
  let rateBefore = 0; // frame rate measured just before the last step down
  let settled = false; // no further step down would help

  /** `dt` advances the ambient clock (capped, so a stall never jumps it); `real` is the true gap between frames, so
   * the shot still catches up with the reader when frames are rare. */
  const draw = (dt: number, real: number) => {
    if (!paused) clock += dt;
    const targetStage = position.chapter >= LAST ? LAST : position.chapter + smooth((position.t - HOLD) / (1 - HOLD));
    const targetTravel = still ? position.chapter + 0.3 : Math.min(position.chapter + position.t, SHOTS.length - 1);
    if (still || first) {
      stage = still ? Math.min(position.chapter, LAST) : targetStage;
      travel = targetTravel;
      lastTravel = travel;
      first = false;
    } else {
      const k = 1 - Math.exp(-real * 6);
      stage += (targetStage - stage) * k;
      travel += (targetTravel - travel) * k;
    }
    speed += (Math.min(Math.abs(travel - lastTravel) / Math.max(real, 1e-3), 2.5) - speed) * (1 - Math.exp(-real * 8));
    lastTravel = travel;
    if (!still) reveal = Math.min(1, reveal + dt / 2.8);
    for (let k = 0; k < FORMATIONS; k++) weights[k] = Math.max(0, 1 - Math.abs(stage - k));

    // The shot: where the camera is around the body and where the body sits in the frame.
    const index = Math.min(Math.floor(travel), SHOTS.length - 2);
    const mix = smooth((travel - index - 0.35) / 0.65);
    const from = SHOTS[index] as Shot;
    const to = SHOTS[index + 1] as Shot;
    const landscape = smooth((camera.aspect - 0.8) / 0.4);
    const frameX = lerp(from.frame[0], to.frame[0], mix) * landscape;
    // On a tall screen the caption takes the lower half, so the body sits high and small enough to clear it.
    const frameY = lerp(0.21, lerp(from.frame[1], to.frame[1], mix), landscape);
    let wide = lerp(from.wide, to.wide, mix);
    let tall = lerp(from.tall, to.tall, mix);
    if (column) {
      const chained = weights[5] ?? 0;
      wide = lerp(wide, 4.4, chained);
      tall = lerp(tall, 11.6, chained);
    }
    routeAt(travel, center);
    eye.set(lerp(from.eye[0], to.eye[0], mix), lerp(from.eye[1], to.eye[1], mix), lerp(from.eye[2], to.eye[2], mix));
    // Pull back as far as the figure needs to fit the part of the screen the caption leaves free; the points grow a
    // little with that distance (below), so a far figure still reads as a figure.
    const roomX = Math.max(0.4, 1 - 2 * Math.abs(frameX) - 0.08);
    const roomY = lerp(0.4, 0.8, landscape);
    const drawn = eye.length();
    const need = Math.max(drawn, wide / 2 / (tanHalf * camera.aspect) / roomX, tall / 2 / tanHalf / roomY);
    eye.setLength(need);

    // The pointer leans the shot a little and, on the story, turns it in the curator's hand.
    const live = fine && !still && !paused && performance.now() - pointerAt < 2600;
    const k = 1 - Math.exp(-real * 5);
    lookX += ((live ? (pointerX / width) * 2 - 1 : 0) - lookX) * k;
    lookY += ((live ? 1 - (pointerY / height) * 2 : 0) - lookY) * k;
    bodyUniforms.uPointerPower.value += ((live ? 1 : 0) - bodyUniforms.uPointerPower.value) * k;

    camera.position.copy(center).add(eye);
    camera.position.x += lookX * 0.4;
    camera.position.y += lookY * 0.25;
    camera.lookAt(center);
    camera.setViewOffset(width, height, -frameX * width, frameY * height, width, height);
    camera.updateMatrixWorld();

    const tilt = 0.07 + 0.3 * (weights[4] ?? 0);
    euler.set(-lookY * tilt * 0.6 + Math.sin(clock * 0.17) * 0.03, Math.sin(clock * 0.21) * 0.07 + lookX * tilt, 0);
    rot4.makeRotationFromEuler(euler);
    bodyUniforms.uRot.value.setFromMatrix4(rot4);
    bodyUniforms.uCenter.value.copy(center);

    // The pointer in the body's own space, on the plane through its centre that faces the camera.
    if (live) {
      ndc.set((pointerX / width) * 2 - 1, 1 - (pointerY / height) * 2);
      ray.setFromCamera(ndc, camera);
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(facing), center);
      if (ray.ray.intersectPlane(plane, hit)) {
        rotInverse.copy(bodyUniforms.uRot.value).transpose();
        bodyUniforms.uPointer.value.copy(hit.sub(center).applyMatrix3(rotInverse));
      }
    }

    // The chain lights step by step while the reader moves through its act.
    const reach = column ? 6 : 6.6;
    const chainT = still ? 1 : smooth((travel - 5) / 0.5);
    bodyUniforms.uChainFront.value = lerp(-reach, reach, chainT);
    frameOut.chainLit = Math.round(chainT * CHAIN_STEPS);
    frameOut.column = column;

    // A decision plays once: 1.5 s for the ring, 1.7 s for the body to come apart and back.
    const now = performance.now();
    const ringT = publishedAt < 0 ? 1 : (now - publishedAt) / 1500;
    bodyUniforms.uImpulse.value = ringT >= 1 ? 0 : 1 - (1 - ringT) ** 3;
    const apartT = withdrawnAt < 0 ? 1 : (now - withdrawnAt) / 1700;
    bodyUniforms.uScatter.value = apartT >= 1 ? 0 : Math.sin(Math.PI * apartT) ** 2 * 1.1;

    if (veiled)
      bodyUniforms.uVeil.value.set(
        ((veil.left + veil.width / 2) / width) * 2 - 1,
        1 - ((veil.top + veil.height / 2) / height) * 2,
        veil.width / width,
        veil.height / height,
      );
    const veilTo = veiled ? 1 : 0;
    bodyUniforms.uVeilPower.value = still
      ? veilTo
      : bodyUniforms.uVeilPower.value + (veilTo - bodyUniforms.uVeilPower.value) * (1 - Math.exp(-real * 7));
    bodyUniforms.uStage.value = stage;
    bodyUniforms.uTime.value = clock;
    bodyUniforms.uSize.value = pixelSize * blend(SIZE, weights) * (need / drawn) ** 0.6;
    bodyUniforms.uFocus.value = camera.position.distanceTo(center);
    bodyUniforms.uAperture.value = lerp(from.aperture, to.aperture, mix);
    bodyUniforms.uDrift.value = blend(DRIFT, weights);
    // Fewer points each carry a little more light, so every budget reads at the same brightness.
    bodyUniforms.uGain.value = blend(GAIN, weights) * (44000 / visible) ** 0.6;
    bodyUniforms.uPublished.value = still
      ? published
      : bodyUniforms.uPublished.value + (published - bodyUniforms.uPublished.value) * (1 - Math.exp(-real * 4));
    bodyUniforms.uReveal.value = 1 - (1 - reveal) ** 4;
    bodyUniforms.uSpin.value.set(clock * 0.035, clock * 0.09);

    const writing = weights[3] ?? 0;
    core.visible = writing > 0.01;
    coreUniforms.uScale.value = smooth(writing);
    coreUniforms.uTime.value = clock;
    trackUniforms.uBody.value = travel;
    trackUniforms.uHeat.value = Math.min(1, speed * 1.6);
    // The chain as a column reaches lower than the track: the track makes room.
    trackUniforms.uSink.value = column ? 2.6 * (weights[5] ?? 0) : 0;
    dustUniforms.uSize.value = pixelSize;
    dustUniforms.uTime.value = clock;
    backdropUniforms.uTime.value = clock;
    backdropUniforms.uTravel.value = travel;
    backdropUniforms.uAi.value = writing;
    trackUniforms.uAi.value = writing;
    if (lens.uniforms.uTime) lens.uniforms.uTime.value = paused || still ? 0 : clock;
    if (lens.uniforms.uSpeed) lens.uniforms.uSpeed.value = speed;

    composer.render(dt);

    if (options.onFrame) {
      for (let step = 0; step < CHAIN_STEPS; step++) {
        const [ax, ay] = chainAnchor(step, column);
        // The label goes under the step in a row, beside it in a column.
        spot.set(column ? ax + 1.35 : ax, column ? ay : ay - 1.5, 0).applyMatrix3(bodyUniforms.uRot.value);
        spot.add(center).project(camera);
        chainSpots[step * 2] = (spot.x * 0.5 + 0.5) * width;
        chainSpots[step * 2 + 1] = (0.5 - spot.y * 0.5) * height;
      }
      options.onFrame(frameOut);
    }
  };

  /** One step down in cost; returns false when there is nothing left to give up. */
  const degrade = () => {
    if (scale > 0.8) scale = 0.75;
    else if (scale > 0.6) {
      scale = 0.58;
      visible = Math.round(count * 0.65);
      bodyGeometry.setDrawRange(0, visible);
    } else if (bloom.enabled) bloom.enabled = false;
    else return false;
    fit();
    return true;
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    timer.update(now);
    const raw = timer.getDelta();
    draw(Math.min(raw, 0.05), Math.min(raw, 1));
    if (warmup > 0) warmup -= raw;
    else if (raw > 0.2) {
      // A gap this long is the browser holding frames back (window covered, tab waking up), not this device's speed.
      sampleTime = 0;
      sampleFrames = 0;
    } else {
      sampleTime += raw;
      sampleFrames++;
      if (sampleTime >= 2) {
        // Under ~27 frames a second for two seconds: spend less (a browser capped at 30 is left alone). If the step
        // before bought nothing, the limit is not this page's cost and giving up more would be for nothing. It never
        // climbs back, so it cannot oscillate.
        const rate = sampleFrames / sampleTime;
        if (!settled && rate < 27) {
          if (rateBefore > 0 && rate < rateBefore + 3) settled = true;
          else {
            rateBefore = rate;
            settled = !degrade();
          }
        }
        sampleTime = 0;
        sampleFrames = 0;
      }
    }
  };
  const start = () => {
    if (still || disposed || raf) return;
    timer.reset();
    sampleTime = 0;
    sampleFrames = 0;
    warmup = 1;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  let pending = 0;
  const invalidate = () => {
    if (!still || disposed || pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      draw(0, 0);
    });
  };

  const resize = new ResizeObserver(() => {
    fit();
    invalidate();
  });
  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    options.onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  document.addEventListener("visibilitychange", onVisibility);
  fit();
  resize.observe(host);
  if (still) invalidate();
  else if (!document.hidden) start();

  return {
    setPaused(next) {
      paused = next;
    },
    decide(kind) {
      published = kind === "publish" ? 1 : 0;
      // Under reduced motion the decision still shows, as a new still frame.
      if (still) invalidate();
      else if (kind === "publish") publishedAt = performance.now();
      else withdrawnAt = performance.now();
    },
    setVeil(rect) {
      const on = rect !== null && rect.width > 0;
      const far = (a: number, b: number) => Math.abs(a - b) > 0.5;
      const moved =
        on !== veiled ||
        (rect !== null &&
          (far(rect.left, veil.left) ||
            far(rect.top, veil.top) ||
            far(rect.width, veil.width) ||
            far(rect.height, veil.height)));
      veiled = on;
      if (rect) Object.assign(veil, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      return moved;
    },
    invalidate,
    dispose() {
      disposed = true;
      stop();
      cancelAnimationFrame(pending);
      resize.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      timer.dispose();
      for (const geometry of [bodyGeometry, dustGeometry, coreGeometry, trackGeometry, backdrop.geometry])
        geometry.dispose();
      for (const material of [bodyMaterial, dustMaterial, coreMaterial, trackMaterial, backdrop.material])
        material.dispose();
      track.dispose();
      bloom.dispose();
      lens.dispose();
      output.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
      // Give the context back now: a single-page app that comes and goes would otherwise pile them up.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
