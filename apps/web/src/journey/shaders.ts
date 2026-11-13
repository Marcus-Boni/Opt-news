// GLSL for the Jornada. Written for this page (no third-party shader code): one value noise, one divergence-free
// flow, and five programs: the body of points, the model's core, the chevron track, the backdrop light and the
// final lens pass. three.js adds precision, the built-in attributes and the camera uniforms to each.

/** Value noise in -1..1 with quintic fade, and the trigonometric (ABC) flow the points drift and swirl along. */
const NOISE = /* glsl */ `
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z) * 2.0 - 1.0;
  }
  vec3 flow(vec3 p, float t) {
    return vec3(
      sin(p.z + t) + cos(p.y - t * 0.7),
      sin(p.x + t * 0.8) + cos(p.z + t),
      sin(p.y - t) + cos(p.x + t * 0.6)
    );
  }
  // How far the model's surface swells along direction n. The core mesh and the shell of points share it, so the
  // points ride the surface they surround.
  float swell(vec3 n, float t) {
    return vnoise(n * 1.7 + vec3(0.0, t * 0.25, t * 0.18)) * 0.3 + vnoise(n * 3.9 - vec3(t * 0.2, 0.0, 0.0)) * 0.08;
  }
`;

export const BODY_VERTEX = /* glsl */ `
  uniform float uStage;
  uniform float uTime;
  uniform float uSize;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uDrift;
  uniform float uGain;
  uniform float uReveal;
  uniform float uChainFront;
  uniform float uImpulse;
  uniform float uScatter;
  uniform float uPointerPower;
  uniform float uPublished;
  uniform float uVeilPower;
  uniform vec4 uVeil;
  uniform vec2 uSpin;
  uniform vec2 uChainAxis;
  uniform vec3 uCenter;
  uniform vec3 uPointer;
  uniform mat3 uRot;
  uniform vec3 uWarm;
  uniform vec3 uOrange;
  uniform vec3 uPurple;
  uniform vec3 uLavender;
  // "position" carries three of the point's four random numbers; aRand is the fourth.
  attribute float aRand;
  attribute vec4 aF0;
  attribute vec4 aF1;
  attribute vec4 aF2;
  attribute vec4 aF3;
  attribute vec4 aF4;
  attribute vec4 aF5;
  attribute vec4 aF6;
  varying vec3 vColor;
  varying float vAlpha;
  ${NOISE}

  float eq(float a, float b) {
    return 1.0 - step(0.5, abs(a - b));
  }
  mat2 turn(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
  }
  // Figure k, with the two that never sit still: the spiral turns on its axis, the streams wind into the throat.
  vec4 figure(float k) {
    vec4 f = aF0 * eq(k, 0.0) + aF1 * eq(k, 1.0) + aF2 * eq(k, 2.0) + aF3 * eq(k, 3.0)
      + aF4 * eq(k, 4.0) + aF5 * eq(k, 5.0) + aF6 * eq(k, 6.0);
    f.xz = mix(f.xz, turn(uSpin.x) * f.xz, eq(k, 0.0));
    f.xy = mix(f.xy, turn(uSpin.y) * f.xy, eq(k, 1.0));
    return f;
  }
  vec3 tint(float tone, float seed) {
    vec3 base = mix(uWarm, uOrange, smoothstep(0.55, 1.0, tone));
    return mix(base, mix(uPurple, uLavender, seed), step(1.5, tone));
  }
  float presence(float tone) {
    return mix(0.1, 1.0, smoothstep(0.0, 0.5, min(tone, 1.0)));
  }

  void main() {
    vec4 seed = vec4(position, aRand);
    float s = clamp(uStage, 0.0, 6.0);
    float i = min(floor(s), 5.0);
    float f = s - i;
    // Each point leaves and lands on its own schedule: the figure dissolves and condenses instead of sliding.
    float te = smoothstep(seed.x * 0.4, 0.6 + seed.x * 0.4, f);
    vec4 a = figure(i);
    vec4 b = figure(i + 1.0);
    vec3 p = mix(a.xyz, b.xyz, te);

    // In flight the points follow the flow; at rest they only drift by the figure's own amount.
    float flight = sin(te * 3.14159265);
    p += flow(p * 0.35 + seed.yzw * 6.0, uTime * 0.15 + i) * flight * 0.9;
    p += flow(p * 0.6 + seed.zwy * 9.0, uTime * 0.2) * uDrift;

    float isOrb = eq(i, 3.0) * (1.0 - te) + eq(i + 1.0, 3.0) * te;
    float isChain = eq(i, 5.0) * (1.0 - te) + eq(i + 1.0, 5.0) * te;
    vec3 outward = normalize(p + 1e-4);
    p += outward * swell(outward, uTime) * isOrb;

    // Arrival: the whole field closes in from wider.
    p *= 1.0 + (1.0 - uReveal) * 1.5;

    // The pointer is a hand in the field: nearby points make room and settle back.
    vec3 away = p - uPointer;
    p += normalize(away + 1e-4) * smoothstep(1.7, 0.0, length(away)) * 0.75 * uPointerPower;

    // A curator's decision: publishing sends one ring out through the figure, withdrawing pulls it apart.
    float gap = (length(p.xy) - uImpulse * 7.0) / 0.45;
    float ringWave = exp(-gap * gap) * (1.0 - uImpulse) * step(0.001, uImpulse);
    p.z += ringWave * 0.9;
    p += normalize(seed.yzw - 0.5) * uScatter * (1.0 + seed.x * 3.0);

    // The chain lights step by step as the front passes.
    float along = dot(p.xy, uChainAxis);
    float lit = smoothstep(uChainFront + 0.35, uChainFront - 0.35, along) * isChain;
    float crestGap = (along - uChainFront) / 0.5;
    float crest = exp(-crestGap * crestGap) * isChain;

    vec3 color = mix(tint(a.w, seed.z), tint(b.w, seed.z), te);
    float alpha = mix(presence(a.w), presence(b.w), te);
    color = mix(color, mix(uPurple, uLavender, seed.z), isOrb * 0.94);
    color = mix(color, uOrange, lit);
    // A published story keeps the decision on it: its frame and source mark turn orange and stay that way.
    float isStory = eq(i, 4.0) * (1.0 - te) + eq(i + 1.0, 4.0) * te;
    color = mix(color, uOrange, isStory * uPublished * (1.0 - step(0.011, abs(aF4.w - 0.44))));
    color += uOrange * (ringWave * 1.5 + crest * 0.9);

    vec3 world = uCenter + uRot * p;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    float dist = max(-mv.z, 0.05);
    // A lens: points off the focal plane grow and thin out, so depth reads as blur and not as clutter.
    float coc = clamp(abs(dist - uFocus) / uFocus, 0.0, 1.6) * uAperture;
    float size = uSize * (0.55 + seed.w * 0.9) * (1.0 + ringWave * 1.4 + crest * 0.8) * (1.0 + coc * 5.0) / dist;
    gl_PointSize = min(size, uSize * 1.2);
    vAlpha = alpha * uGain * uReveal * smoothstep(0.4, 2.0, dist) / (1.0 + coc * coc * 22.0);
    vColor = color;
    gl_Position = projectionMatrix * mv;
    // Where a caption sits the points step back, with a soft edge: the text keeps its contrast and no panel has to
    // be drawn behind it. uVeil is the caption's centre and half size on screen (-1..1).
    vec2 screen = gl_Position.xy / gl_Position.w;
    vec2 beyond = (abs(screen - uVeil.xy) - uVeil.zw) / vec2(0.16, 0.22);
    float behind = 1.0 - smoothstep(0.0, 1.0, max(beyond.x, beyond.y));
    vAlpha *= 1.0 - behind * uVeilPower * 0.92;
  }
`;

export const BODY_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, r) * vAlpha;
    if (a < 0.002) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** Still dust along the whole route: what the camera's travel is measured against. */
export const DUST_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uTime;
  attribute float aRand;
  varying float vAlpha;
  void main() {
    vec4 mv = viewMatrix * vec4(position, 1.0);
    float dist = max(-mv.z, 0.05);
    gl_PointSize = uSize * (0.35 + aRand * 0.8) / dist;
    vAlpha = (0.16 + 0.12 * sin(uTime * 0.5 + aRand * 40.0)) * smoothstep(46.0, 14.0, dist) * smoothstep(0.6, 3.0, dist);
    gl_Position = projectionMatrix * mv;
  }
`;

export const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uWarm;
  varying float vAlpha;
  void main() {
    float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)) * vAlpha;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uWarm, a);
  }
`;

/** The model while it writes: a dark body that swells slowly, lit only at its rim, with faint lines of text. */
export const CORE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uRadius;
  uniform vec3 uCenter;
  uniform mat3 uRot;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  ${NOISE}
  vec3 surface(vec3 n) {
    return n * (uRadius + swell(n, uTime));
  }
  void main() {
    vec3 n = normalize(position);
    vec3 p = surface(n);
    // The swollen surface's own normal, from two neighbours.
    vec3 t1 = normalize(cross(n, vec3(0.31, 1.0, 0.17)));
    vec3 t2 = cross(n, t1);
    vec3 e1 = surface(normalize(n + t1 * 0.04)) - p;
    vec3 e2 = surface(normalize(n + t2 * 0.04)) - p;
    vec3 normal2 = normalize(cross(e1, e2));
    normal2 *= sign(dot(normal2, n));
    vLocal = p;
    vNormal = uRot * normal2;
    vWorld = uCenter + uRot * (p * uScale);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const CORE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDepth;
  uniform vec3 uPurple;
  uniform vec3 uLavender;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
    // Lines of text being set, top to bottom.
    float row = abs(fract(vLocal.y * 4.5 - uTime * 0.1) - 0.5);
    float text = smoothstep(0.08, 0.02, row) * (1.0 - rim) * step(0.35, fract(vLocal.x * 1.3 + floor(vLocal.y * 4.5) * 0.37));
    float lit = max(dot(n, normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
    vec3 color = uDepth * (0.16 + lit * 0.3) + uPurple * rim * 1.15 + uLavender * pow(rim, 4.0) * 0.6;
    color += uPurple * text * 0.26;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The track under the route: official chevrons laid flat, lit as the body passes over them. */
export const TRACK_VERTEX = /* glsl */ `
  uniform float uSink;
  attribute float aAlong;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vAlong;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    world.y -= uSink;
    vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vWorld = world.xyz;
    vAlong = aAlong;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const TRACK_FRAGMENT = /* glsl */ `
  uniform float uBody;
  uniform float uHeat;
  uniform float uAi;
  uniform vec3 uGround;
  uniform vec3 uGraphite;
  uniform vec3 uWarm;
  uniform vec3 uOrange;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vAlong;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(cameraPosition - vWorld);
    float key = max(dot(n, normalize(vec3(0.25, 1.0, 0.45))), 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float gap = (vAlong - uBody) / 0.1;
    float under = exp(-gap * gap);
    float passed = smoothstep(uBody + 0.02, uBody - 0.3, vAlong);
    // Dark metal, always a shade above the ground (never a black cut-out). At rest it barely shows; while the reader
    // travels, the stretch under the body heats to orange, edges first, and what is behind keeps an ember. None of
    // that under the machine: its act is purple alone.
    vec3 color = uGround + uGraphite * (0.2 + key * 0.5) + uWarm * rim * 0.04;
    float ember = 1.0 - uAi * 0.9;
    color += uOrange * under * (0.05 + rim * 0.4 + uHeat * (0.35 + rim * 1.6)) * ember;
    color += uOrange * passed * rim * 0.3 * (0.3 + uHeat) * ember;
    // Distance dissolves the track into whatever light is behind it (not into a flat ground colour), and under the
    // machine it all but leaves.
    float fog = smoothstep(32.0, 8.0, length(cameraPosition - vWorld));
    gl_FragColor = vec4(color, fog * (1.0 - uAi * 0.85));
  }
`;

/** The ground and its light: orange from the lower left (action) and a neutral glow opposite. Purple belongs to
 * machine-written text, so it only comes up while the model writes. */
export const BACKDROP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

export const BACKDROP_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uAspect;
  uniform float uTravel;
  uniform float uAi;
  uniform vec3 uGround;
  uniform vec3 uOrange;
  uniform vec3 uPurple;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;
    float n = vnoise(vec3(p * 1.3, uTime * 0.03 + uTravel * 0.35)) * 0.5 + 0.5;
    float low = smoothstep(1.25, 0.0, length(p - vec2(-0.55 * uAspect, -0.48)));
    float high = smoothstep(1.3, 0.0, length(p - vec2(0.55 * uAspect, 0.5)));
    vec3 color = uGround;
    color += uOrange * low * low * (0.035 + n * 0.03) * (1.0 - uAi * 0.7);
    color += vec3(0.9, 0.82, 0.78) * high * high * (0.008 + n * 0.012) * (1.0 - uAi);
    color += uPurple * high * high * (0.05 + n * 0.04 + 0.08) * uAi;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** The lens: colour fringes that open with speed, a vignette, and grain that keeps the dark from banding. */
export const LENS = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSpeed;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float edge = dot(c, c);
      vec2 fringe = c * edge * (0.006 + uSpeed * 0.05);
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + fringe).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - fringe).b
      );
      color *= mix(1.0, smoothstep(0.62, 0.08, edge), 0.5);
      vec2 cell = floor(vUv * uResolution);
      float grain = fract(sin(dot(cell + fract(uTime) * 71.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      color += grain * 0.012;
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};
