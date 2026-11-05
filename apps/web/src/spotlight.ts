// The pointer's light on interactive surfaces: one listener for the whole app. Any `[data-spotlight]` under a fine
// pointer gets --mx/--my (its own coordinates), which index.css turns into a pool of light and a lit edge. Set on
// the hovered element only, so no other element recalculates styles. Touch and coarse pointers never install it.
export function installSpotlight() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  let frame = 0;
  let last: PointerEvent | null = null;
  const paint = () => {
    frame = 0;
    const el = last && (last.target as Element | null)?.closest?.<HTMLElement>("[data-spotlight]");
    if (!el || !last) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${last.clientX - r.left}px`);
    el.style.setProperty("--my", `${last.clientY - r.top}px`);
  };
  document.addEventListener(
    "pointermove",
    (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
}
