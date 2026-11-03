// The signature: Opt News' knowledge chain (news → proposal → meetup → insight) drawn with the Optsolv chevron.
// Each step is a chevron pointing down the chain; on arrival an orange impulse runs along the connector and lights
// the chevrons in order up to the current step. Without motion it renders in its final state.
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type ReactNode, useRef } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { reducedMotion } from "@/motion";

// The inner chevron of the Optsolv symbol (official geometry), cropped to its own box.
const CHEVRON =
  "M266.61 328.76L266.61 313.65L266.61 298.55C266.61 283.90 257.96 270.63 244.55 264.72L0.00 156.83L0.00 219.56L211.64 305.81L211.72 313.65L211.64 321.50L0.00 407.75L0.00 470.48L244.55 362.59C257.96 356.68 266.61 343.41 266.61 328.76";

export function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 156 267 315" aria-hidden="true" className={className} fill="currentColor">
      <path d={CHEVRON} />
    </svg>
  );
}

export interface TrailItem {
  key: string;
  title: string;
  /** What the step is (Notícia, Pauta…) and its state, shown under the title. */
  meta: ReactNode;
  to?: string;
  current?: boolean;
}

export function ChevronTrail({ items, label }: { items: TrailItem[]; label: string }) {
  const root = useRef<HTMLOListElement>(null);
  const lastLit = Math.max(
    items.findIndex((i) => i.current),
    0,
  );

  useGSAP(
    () => {
      if (reducedMotion() || items.length < 2) return;
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from("[data-impulse]", { scaleY: 0, transformOrigin: "top", duration: 0.9, stagger: 0.12 }).from(
        "[data-node]",
        { scale: 0.4, autoAlpha: 0, duration: 0.6, stagger: 0.12, clearProps: "all" },
        0,
      );
    },
    { scope: root, dependencies: [items.length] },
  );

  return (
    <ol ref={root} aria-label={label} className="grid">
      {items.map((it, i) => {
        const lit = i <= lastLit;
        return (
          <li key={it.key} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3.5 pb-5 last:pb-0">
            {i < items.length - 1 && (
              <span aria-hidden="true" className="absolute top-6 bottom-1 left-[7px] w-0.5 rounded-full bg-border">
                {i < lastLit && <span data-impulse className="absolute inset-0 rounded-full bg-brand" />}
              </span>
            )}
            <span data-node aria-hidden="true" className="relative mt-1 grid size-4 place-items-center">
              <Chevron className={cn("h-4 rotate-90", lit ? "text-brand" : "text-muted-foreground/45")} />
            </span>
            <div className="min-w-0">
              {it.to ? (
                <Link
                  to={it.to}
                  className="text-[0.9375rem] leading-snug font-semibold text-foreground transition-colors hover:text-brand-text"
                >
                  {it.title}
                </Link>
              ) : (
                <span className="text-[0.9375rem] leading-snug font-semibold">{it.title}</span>
              )}
              {it.current && <span className="sr-only"> (esta página)</span>}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {it.meta}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
