// Motion layer. One grammar for the whole app: content is always rendered visible first; motion only adds the
// arrival (expo-out, 16px rise, 60ms stagger) and the signature impulse along the Optsolv chevrons. Everything
// below is skipped under prefers-reduced-motion.
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { type RefObject, useEffect } from "react";
import { useLocation } from "react-router";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smooth wheel scrolling on the document for long reads; overlays, menus and scroll areas keep native scroll. */
export function useSmoothScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.14,
      // In-page links ("Como funciona", "Discussão") glide to their target instead of jumping; the URL hash stays as is.
      anchors: { offset: -24, duration: 1.2 },
      prevent: (node) =>
        node.closest("[data-lenis-prevent],[role=dialog],[role=menu],[role=listbox],[data-slot=sidebar-content]") !==
        null,
    });
    window.__lenis = lenis;
    return () => {
      lenis.destroy();
      window.__lenis = undefined;
    };
  }, []);
  useEffect(() => {
    void pathname;
    window.__lenis?.scrollTo(0, { immediate: true });
  }, [pathname]);
}

/** Staggered arrival of every `[data-reveal]` inside the scope, once per mount. */
export function useReveal(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const items = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      if (items.length === 0) return;
      gsap.from(items, { y: 16, autoAlpha: 0, duration: 0.7, ease: "expo.out", stagger: 0.06, clearProps: "all" });
    },
    { scope, dependencies: deps },
  );
}

/** Long pages: every `[data-reveal]` in the scope arrives as it scrolls into view, once; what is on screen arrives now. */
export function useScrollReveal(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      if (reducedMotion()) return;
      ScrollTrigger.batch(gsap.utils.toArray<HTMLElement>("[data-reveal]"), {
        start: "top 88%",
        once: true,
        onEnter: (batch) =>
          gsap.from(batch, { y: 24, autoAlpha: 0, duration: 0.8, ease: "expo.out", stagger: 0.08, clearProps: "all" }),
      });
    },
    { scope },
  );
}

/** Calls to action: a `[data-magnetic]` wrapper leans toward a fine pointer over it and eases back when it leaves. */
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
