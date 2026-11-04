// Motion layer. One grammar, one job per tool, and content is always rendered visible first:
// - CSS (index.css): page arrival (`data-reveal`), list rows rising with the scroll (`data-row-in`), state transitions.
// - Web Animations (`el.animate`): one-shot feedback on a control (vote, new comment, empty state).
// - motion: layout and springs (navigation indicator, tabs, CountUp, charts, reading progress).
// - GSAP: scroll choreography (presentation pages, panorama watermark, SplitText, chevron impulse).
// - Lenis: smooth document scroll, driven by GSAP's ticker so ScrollTrigger and Lenis share one frame.
// Independent `translate`/`scale` properties are used by CSS and WAAPI so they never fight GSAP's `transform`.
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { type RefObject, useEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The house curve (expo-out): confident arrival, no bounce. Same as `--ease-out-expo` in CSS. */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Smooth wheel scrolling on the document for long reads; overlays, menus and scroll areas keep native scroll. */
export function useSmoothScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.14,
      // In-page links ("Como funciona", "Discussão") glide to their target instead of jumping; the URL hash stays as is.
      anchors: { offset: -24, duration: 1.2 },
      prevent: (node) =>
        node.closest("[data-lenis-prevent],[role=dialog],[role=menu],[role=listbox],[data-slot=sidebar-content]") !==
        null,
    });
    // One frame loop: Lenis advances on GSAP's ticker and tells ScrollTrigger right away (no one-frame lag on pins).
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis.on("scroll", ScrollTrigger.update);
    // A modal (Radix marks the body while it locks scroll) must freeze the page behind it, wheel included.
    const lock = new MutationObserver(() =>
      document.body.hasAttribute("data-scroll-locked") ? lenis.stop() : lenis.start(),
    );
    lock.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    window.__lenis = lenis;
    return () => {
      lock.disconnect();
      gsap.ticker.remove(tick);
      lenis.destroy();
      window.__lenis = undefined;
    };
  }, []);
  // ScrollRestoration has already placed the page (top for a new page, the saved spot on back/forward): adopt it
  // instead of finishing a glide that belonged to the previous page.
  useEffect(() => {
    void pathname;
    window.__lenis?.scrollTo(window.scrollY, { immediate: true, force: true });
  }, [pathname]);
}

/** Where each history entry was scrolled to, keyed by location key; written by `rememberScroll`. */
const spots = new Map<string, number>();
let shownKey: string | undefined;

/** Router subscriber (main.tsx): runs before React draws the next page, so `scrollY` still belongs to the old one. */
export function rememberScroll(state: { location: { key: string } }) {
  if (state.location.key === shownKey) return;
  if (shownKey !== undefined) spots.set(shownKey, window.scrollY);
  shownKey = state.location.key;
}

/**
 * Back/forward: ScrollRestoration puts the page back while its data is still loading, the page is short and the
 * browser clamps the saved spot to the top. Re-apply it as the page grows, until the reader scrolls or 3s pass.
 * shortcut: re-applies after the fact; route loaders that fetch before render would make this unnecessary.
 */
export function useSettleRestoredScroll() {
  const { key } = useLocation();
  const action = useNavigationType();
  useEffect(() => {
    const target = action === "POP" ? spots.get(key) : undefined;
    if (!target) return;
    const place = () => {
      if (window.scrollY >= target || document.documentElement.scrollHeight - window.innerHeight < target) return;
      window.scrollTo(0, target);
      // Lenis caches the page size and would clamp to the short page: measure again, then adopt the spot.
      window.__lenis?.resize();
      window.__lenis?.scrollTo(target, { immediate: true, force: true });
    };
    const grow = new ResizeObserver(place);
    grow.observe(document.body);
    const stop = () => {
      grow.disconnect();
      clearTimeout(timer);
      for (const e of USER_SCROLL) window.removeEventListener(e, stop);
    };
    const timer = setTimeout(stop, 3000);
    for (const e of USER_SCROLL) window.addEventListener(e, stop, { passive: true });
    return stop;
  }, [key, action]);
}
const USER_SCROLL = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/** Presentation pages: every `[data-inview]` in the scope arrives as it scrolls into view, once; what is on screen
 * arrives now. (App pages use the CSS arrival on `[data-reveal]` instead.) */
export function useScrollReveal(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      if (reducedMotion()) return;
      ScrollTrigger.batch(gsap.utils.toArray<HTMLElement>("[data-inview]"), {
        start: "top 88%",
        once: true,
        onEnter: (batch) =>
          gsap.from(batch, { y: 24, autoAlpha: 0, duration: 0.8, ease: "expo.out", stagger: 0.08, clearProps: "all" }),
      });
    },
    { scope },
  );
}

/** Calls to action: a `[data-magnetic]` wrapper leans toward a fine pointer over it and eases back when it leaves.
 * Keep it off elements another animation moves (wrap instead), or the two fight over `transform`. */
export function useMagnetic(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      if (reducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const offs = gsap.utils.toArray<HTMLElement>("[data-magnetic]").map((el) => {
        const x = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3" });
        const y = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3" });
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          x((e.clientX - r.left - r.width / 2) * 0.35);
          y((e.clientY - r.top - r.height / 2) * 0.35);
        };
        const onLeave = () => {
          x(0);
          y(0);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        return () => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", onLeave);
        };
      });
      return () => {
        for (const off of offs) off();
      };
    },
    { scope },
  );
}

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}
