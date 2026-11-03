// The presentation surfaces' one protagonist graphic: the official Optsolv symbol, drawn as a field of orange points
// (three.js). The points start scattered, assemble into the symbol on arrival and drift as a loose cloud that the
// pointer pushes apart. The geometry is the official artwork sampled, never a new symbol (Brand System §7). Under
// prefers-reduced-motion the field renders assembled and still; without WebGL the parent shows the SVG symbol.
import { type RefObject, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { reducedMotion } from "@/motion";
import { SYMBOL, SYMBOL_VIEWBOX } from "./brand/optsolv";

/** Points sampled from the symbol: enough to read as solid at 2.5px each, cheap enough for any laptop. */
const COUNT = 7000;

/** Positions inside the symbol, centred and scaled to a height of 2 units, by rejection sampling on a 2D canvas. */
function samplePoints(): Float32Array | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const [w, h] = SYMBOL_VIEWBOX;
  const paths = SYMBOL.map((d) => new Path2D(d));
  const out = new Float32Array(COUNT * 3);
  const scale = 2 / h;
  let n = 0;
  // ~18% of the box is ink; the loop bound keeps a broken canvas from spinning forever.
  for (let tries = 0; n < COUNT && tries < COUNT * 40; tries++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    if (!paths.some((p) => ctx.isPointInPath(p, x, y))) continue;
    out[n * 3] = (x - w / 2) * scale;
    out[n * 3 + 1] = (h / 2 - y) * scale;
    out[n * 3 + 2] = (Math.random() - 0.5) * 0.12;
    n++;
  }
  return n === COUNT ? out : null;
}

const VERTEX = /* glsl */ `
  uniform float uAssembled;
  uniform float uTime;
  uniform vec3 uPointer;
  uniform float uSize;
  attribute vec3 aScatter;
  attribute float aSeed;
  varying float vDepth;
  void main() {
    // Each point assembles on its own schedule, so the symbol condenses instead of snapping.
    float t = smoothstep(0.0, 1.0, clamp(uAssembled * 1.35 - aSeed * 0.35, 0.0, 1.0));
    vec3 p = mix(aScatter, position, t);
    // A slow breath once assembled: the symbol is alive, not frozen.
    float breath = sin(uTime * 0.6 + aSeed * 6.2831) * 0.012;
    p += normalize(p + 0.001) * breath * t;
    // The pointer pushes nearby points apart, and they settle back on their own.
    vec3 away = p - uPointer;
    float d = length(away.xy);
    p += normalize(away + 0.0001) * smoothstep(0.55, 0.0, d) * 0.35 * uPointer.z;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = clamp(1.0 - abs(p.z) * 4.0, 0.35, 1.0);
    gl_PointSize = uSize * (0.75 + aSeed * 0.5) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vDepth;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float edge = 1.0 - smoothstep(0.3, 0.5, r);
    gl_FragColor = vec4(uColor, edge * vDepth);
  }
`;

export function ChevronField({
  className,
  interactive = true,
  scatter,
}: {
  className?: string;
  interactive?: boolean;
  /** 0..1, read every frame: how far the assembled symbol is pulled apart again (the landing ties it to scrolling). */
  scatter?: RefObject<number>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scatter is a ref, read every frame.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const target = samplePoints();
    if (!target) {
      setFailed(true);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
    } catch {
      setFailed(true);
      return;
    }
    const still = reducedMotion();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    camera.position.z = 4.2;

    const cloud = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      // A wide, shallow cloud the symbol condenses out of.
      cloud[i * 3] = (Math.random() - 0.5) * 7;
      cloud[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
      cloud[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
      seed[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(target, 3));
    geometry.setAttribute("aScatter", new THREE.BufferAttribute(cloud, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAssembled: { value: still ? 1 : 0 },
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector3(0, 0, 0) },
        uSize: { value: 9 * Math.min(window.devicePixelRatio, 2) },
        uColor: { value: new THREE.Color(0xff4800) },
      },
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Keep the whole symbol in view on narrow screens too.
      camera.position.z = Math.max(4.2, 3 / camera.aspect);
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(() => {
      fit();
      if (still) renderer.render(scene, camera);
    });
    ro.observe(el);

    if (still) {
      renderer.render(scene, camera);
      return () => {
        ro.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    // Pointer in scene units on the z = 0 plane; the third component fades the push in and out.
    const pointer = material.uniforms.uPointer?.value as THREE.Vector3;
    // World-space hit on the symbol's plane, plus whether the pointer is over the host at all.
    const hit = new THREE.Vector3();
    let over = false;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const local = new THREE.Vector3();
    // The text sits above the canvas, so the window sees the pointer; the host's box decides whether it counts.
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!over) return;
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      ray.setFromCamera(ndc, camera);
      ray.ray.intersectPlane(plane, hit);
    };
    const onLeave = () => {
      over = false;
    };
    if (interactive) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("blur", onLeave);
      document.addEventListener("pointerleave", onLeave);
    }

    const timer = new THREE.Timer();
    let frame = 0;
    let assembled = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      // Expo-out assembly over ~2.4 s, then the field only breathes and answers the pointer.
      assembled = Math.min(1, assembled + dt / 2.4);
      const eased = 1 - 2 ** (-10 * assembled);
      const u = material.uniforms;
      if (u.uAssembled) u.uAssembled.value = (assembled >= 1 ? 1 : eased) * (1 - (scatter?.current ?? 0));
      if (u.uTime) u.uTime.value = timer.getElapsed();
      points.rotation.y = Math.sin(timer.getElapsed() * 0.15) * 0.12;
      // The shader works in the object's space, which rotates: convert the hit each frame.
      points.updateMatrixWorld();
      local.copy(hit);
      points.worldToLocal(local);
      pointer.x += (local.x - pointer.x) * 0.18;
      pointer.y += (local.y - pointer.y) * 0.18;
      pointer.z += ((over ? 1 : 0) - pointer.z) * 0.12;
      renderer.render(scene, camera);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else {
        timer.reset();
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    tick();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [interactive]);

  if (failed) return null;
  return <div ref={host} aria-hidden="true" className={className} />;
}
