// Apresentação (/sobre): the public face of Opt News for people who have not signed in yet, told as the journey of
// one news story in one continuous shot. A single body of points is the day's news; scrolling carries the camera
// through seven acts while the body is collected, filtered, scored, written, judged, linked into the chain and, at
// the end, becomes the Optsolv symbol (journey/stage.ts). The page is the film's caption track: real headings and
// text set over the shot, one per act, each held while its figure is at rest and gone while the body travels. Under
// prefers-reduced-motion it is a plain page with one still frame per act; without WebGL it reads the same over a
// static ground.
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ArrowRight, Pause, Play, Sparkles } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { OptsolvSymbol, OptsolvTagline } from "@/components/brand/optsolv";
import { Chevron } from "@/components/chevron-trail";
import { RollingNumber } from "@/components/rolling-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { CHAIN_LABELS, CHAPTERS, type Chapter } from "@/journey/chapters";
import type { Position, StageFrame, StageHandle } from "@/journey/stage";
import { cn } from "@/lib/utils";
import { Link } from "@/link";
import { reducedMotion, useMagnetic, useSmoothScroll } from "@/motion";
import { useSession } from "../session.tsx";
import { Hint, Mark } from "../ui.tsx";

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

// three.js and the stage load only for this page, after the captions are already readable.
const JourneyStage = lazy(() => import("@/journey/stage-view"));

const LAST = CHAPTERS.length - 1;
/** How far down the viewport an act's top must be for the act to count as arrived (and its caption to come in). */
const ARRIVAL = 0.12;
const CURATION = CHAPTERS.findIndex((c) => c.id === "curadoria");
const WRITING = CHAPTERS.findIndex((c) => c.id === "redacao");
const CHAIN = CHAPTERS.findIndex((c) => c.id === "cadeia");

type Verdict = "publish" | "withdraw";
const VERDICTS: Record<Verdict, string> = {
  publish: "Publicada. No app, a decisão fica auditada.",
  withdraw: "Retirada. No app, a retirada pede confirmação e também fica auditada.",
};

const PLACES: Record<Chapter["place"], string> = {
  bottom: "items-end justify-start",
  left: "items-end justify-start lg:items-center",
  right: "items-end justify-start lg:items-center lg:justify-end",
};

/** The chain as the way through the film: seven chevrons along the bottom edge, the current act in orange. */
function Acts({ active, onJump }: { active: number; onJump: (index: number) => void }) {
  return (
    <nav
      aria-label="Atos da jornada"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 hidden items-center justify-center gap-4 bg-linear-to-t from-background/95 via-background/70 to-transparent pt-12 pb-4 lg:flex"
    >
      <p className="font-mono text-xs text-foreground/60" aria-hidden="true">
        <RollingNumber value={active + 1} className="text-foreground" /> / {CHAPTERS.length}
      </p>
      <ol className="pointer-events-auto flex items-center">
        {CHAPTERS.map((c, i) => (
          <li key={c.id}>
            <Hint label={c.label}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-label={`Ato ${i + 1}: ${c.label}`}
                aria-current={i === active ? "step" : undefined}
                className="grid size-9 cursor-pointer place-items-center rounded-md"
              >
                <Chevron
                  className={cn(
                    "h-3.5 transition-[color,scale] duration-500 ease-out-expo",
                    i === active ? "scale-125 text-brand" : i < active ? "text-foreground/75" : "text-foreground/45",
                  )}
                />
              </button>
            </Hint>
          </li>
        ))}
      </ol>
      <p className="w-24 text-xs font-semibold text-foreground/80" aria-hidden="true">
        {CHAPTERS[active]?.label}
      </p>
    </nav>
  );
}

export function Journey() {
  const { me } = useSession();
  const [still] = useState(reducedMotion);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const scope = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLOListElement>(null);
  const position = useRef<Position>({ chapter: 0, t: 0 });
  const stage = useRef<StageHandle | null>(null);
  /** The caption on screen right now: the stage keeps the points clear of it. */
  const shownCaption = useRef<HTMLElement | null>(null);
  const enter = me ? { to: "/", label: "Abrir o Opt News" } : { to: "/entrar", label: "Entrar" };

  useSmoothScroll();
  useMagnetic(scope);

  // Where the reader is: the act whose stretch of the page holds a line just under the top of the viewport (the same
  // line its caption arrives on, so a jump to an act's anchor lands inside that act), and how far through it.
  // (Under reduced motion acts are one screen tall, so the middle of the viewport decides, and the frame is still.)
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const sections = [...root.querySelectorAll<HTMLElement>("[data-chapter]")];
    let tops: number[] = [];
    let heights: number[] = [];
    let shown = -1;
    const read = () => {
      const probe = window.scrollY + window.innerHeight * (still ? 0.5 : ARRIVAL);
      let chapter = 0;
      for (let i = 0; i < tops.length; i++) if (probe >= (tops[i] ?? 0)) chapter = i;
      // The last act ends where the page ends: its stretch is what can still be scrolled, so the shot reaches its end.
      const stretch = (heights[chapter] ?? 0) - (chapter === LAST ? window.innerHeight * (1 - ARRIVAL) : 0);
      const t = still ? 0 : (probe - (tops[chapter] ?? 0)) / (stretch || 1);
      position.current.chapter = chapter;
      position.current.t = Math.min(1, Math.max(0, t));
      if (chapter === shown) return;
      shown = chapter;
      setActive(chapter);
      stage.current?.invalidate();
    };
    const measure = () => {
      tops = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
      heights = sections.map((s) => s.offsetHeight);
      read();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener("scroll", read, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", read);
    };
  }, [still]);

  // The caption track. A caption arrives once its figure has settled (heading line by line from behind a mask, the
  // rest in cascade) and leaves before the body starts to travel; the machine's own heading is typed in instead.
  // Captions stay in the accessibility tree the whole time: only opacity and position change.
  useGSAP(
    () => {
      if (still) return;
      const undo: (() => void)[] = [];
      gsap.utils.toArray<HTMLElement>("[data-chapter]").forEach((section, i) => {
        const caption = section.querySelector<HTMLElement>("[data-caption]");
        const heading = caption?.querySelector<HTMLElement>("h1, h2");
        if (!caption || !heading) return;
        const parts = caption.querySelectorAll<HTMLElement>("[data-part]");
        const typed = i === WRITING;
        let lines: Element[] = [];
        let shown = false;
        if (!typed) {
          const split = SplitText.create(heading, {
            type: "lines",
            mask: "lines",
            autoSplit: true,
            onSplit: (self) => {
              lines = self.lines;
              if (!shown) gsap.set(lines, { yPercent: 110 });
            },
          });
          undo.push(() => split.revert());
        }
        gsap.set(caption, { opacity: 0, pointerEvents: "none" });
        const show = () => {
          if (shown) return;
          shown = true;
          shownCaption.current = caption;
          gsap.to(caption, { opacity: 1, y: 0, duration: 0.25, ease: "power1.out", overwrite: true });
          gsap.set(caption, { pointerEvents: "auto" });
          if (typed)
            gsap.to(heading, {
              duration: 1.3,
              ease: "none",
              overwrite: true,
              scrambleText: { text: heading.dataset.text ?? "", chars: "lowerCase", speed: 0.5 },
            });
          else
            gsap.fromTo(
              lines,
              { yPercent: 110 },
              { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.09, overwrite: true },
            );
          gsap.fromTo(
            parts,
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.8, ease: "expo.out", stagger: 0.08, delay: 0.25, overwrite: true },
          );
        };
        const hide = () => {
          if (!shown) return;
          shown = false;
          if (shownCaption.current === caption) shownCaption.current = null;
          gsap.set(caption, { pointerEvents: "none" });
          gsap.to(caption, { opacity: 0, y: -14, duration: 0.28, ease: "power2.in", overwrite: true });
        };
        const trigger = ScrollTrigger.create({
          trigger: section,
          start: `top ${ARRIVAL * 100}%`,
          // Gone before the sticky frame lets go (and before the figure turns); the last caption stays.
          end: i === LAST ? "bottom -20%" : "bottom 115%",
          onToggle: (self) => (self.isActive ? show() : hide()),
        });
        if (trigger.isActive) show();
      });
      return () => {
        for (const fn of undo) fn();
      };
    },
    { scope, dependencies: [still] },
  );

  // The chain's four names follow their chevrons in the shot, and light as the impulse reaches each step.
  const onFrame = useCallback(
    (frame: StageFrame) => {
      // The points make room for the caption on screen (under reduced motion every caption is visible, so it is the
      // current act's, and a change asks for one more still frame).
      const caption = still
        ? (scope.current?.querySelector<HTMLElement>(`[data-chapter="${position.current.chapter}"] [data-caption]`) ??
          null)
        : shownCaption.current;
      const moved = stage.current?.setVeil(caption ? caption.getBoundingClientRect() : null);
      if (still && moved) stage.current?.invalidate();
      const list = labels.current;
      if (!list) return;
      const strength = Math.max(0, ((frame.weights[CHAIN] ?? 0) - 0.6) / 0.4);
      list.style.opacity = String(strength);
      if (strength === 0) return;
      for (let k = 0; k < list.children.length; k++) {
        const item = list.children[k] as HTMLElement;
        const x = frame.chain[k * 2] ?? 0;
        const y = frame.chain[k * 2 + 1] ?? 0;
        item.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${frame.column ? "0, -50%" : "-50%, 0"})`;
        item.dataset.lit = String(k < frame.chainLit);
      }
    },
    [still],
  );
  const onFail = useCallback(() => setFailed(true), []);

  // The rail goes to an act: just inside it, so its figure is whole and its caption arrives. Focus gets there at
  // once, so it is not left on something unseen while a glide plays.
  const jump = useCallback((index: number, instant = false) => {
    const section = scope.current?.querySelector<HTMLElement>(`[data-chapter="${index}"]`);
    if (!section) return;
    const y = section.getBoundingClientRect().top + window.scrollY + 2;
    if (window.__lenis) window.__lenis.scrollTo(y, instant ? { immediate: true, force: true } : { duration: 1.4 });
    else window.scrollTo(0, y);
  }, []);

  // Keyboard focus that lands on a control of an act that is not on screen (its caption is there for assistive
  // technology, but transparent) brings that act in, so focus is never on something the reader cannot see.
  useEffect(() => {
    const root = scope.current;
    if (!root || still) return;
    const onFocusIn = (e: FocusEvent) => {
      const caption = (e.target as Element | null)?.closest<HTMLElement>("[data-caption]");
      const section = caption?.closest<HTMLElement>("[data-chapter]");
      if (!caption || !section || Number(getComputedStyle(caption).opacity) >= 0.5) return;
      jump(Number(section.dataset.chapter), true);
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, [still, jump]);

  const decide = useCallback((kind: Verdict) => {
    setVerdict(kind);
    stage.current?.decide(kind);
  }, []);

  // The curation queue's own keys (P publishes, R withdraws) work while its act is on screen.
  useEffect(() => {
    if (active !== CURATION) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      // Only while the act's caption (and its buttons) is actually on screen, not while the body is in flight.
      const caption = scope.current?.querySelector(`[data-chapter="${CURATION}"] [data-caption]`);
      if (!caption || Number(getComputedStyle(caption).opacity) < 0.5) return;
      const key = e.key.toLowerCase();
      if (key === "p") decide("publish");
      else if (key === "r") decide("withdraw");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, decide]);

  useEffect(() => stage.current?.setPaused(paused), [paused]);

  return (
    <div
      ref={scope}
      data-paused={paused || undefined}
      className="dark relative isolate overflow-x-clip bg-background text-foreground"
    >
      <title>Opt News · inteligência tecnológica da Optsolv</title>
      <a href="#fim" className="skip-link">
        Pular para o fim da jornada
      </a>

      {/* The shot. Decorative: everything it shows is also said in the captions. */}
      <div aria-hidden="true" className="fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden">
        <div className="journey-ground absolute inset-0" />
        {failed ? (
          <OptsolvSymbol className="absolute top-1/2 right-[8%] h-[58vh] w-auto -translate-y-1/2 text-brand/15" />
        ) : (
          <Suspense fallback={null}>
            <JourneyStage position={position} still={still} handle={stage} onFrame={onFrame} onFail={onFail} />
          </Suspense>
        )}
      </div>
      {!failed && (
        <ol
          ref={labels}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 text-sm font-semibold opacity-0"
        >
          {CHAIN_LABELS.map((label) => (
            <li
              key={label}
              className="absolute top-0 left-0 text-foreground/60 transition-colors duration-500 data-[lit=true]:text-foreground"
            >
              {label}
            </li>
          ))}
        </ol>
      )}

      <div data-reading-progress aria-hidden="true" className="fixed inset-x-0 top-0 z-40 h-0.5 bg-brand" />
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-linear-to-b from-background/85 to-transparent px-5 pt-4 pb-8 sm:px-8">
        <span className="inline-flex items-center gap-2.5" translate="no">
          <Mark className="h-6 w-auto" />
          <span className="text-[1.0625rem] font-bold tracking-[-0.03em]">Opt News</span>
        </span>
        <div className="flex items-center gap-2">
          <p className="mr-1 font-mono text-xs text-foreground/60 lg:hidden">
            <span className="sr-only">Ato </span>
            <RollingNumber value={active + 1} className="text-foreground" /> / {CHAPTERS.length}
          </p>
          {!still && !failed && (
            <Hint label={paused ? "Retomar o movimento" : "Pausar o movimento"} side="bottom">
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={paused}
                aria-label="Pausar o movimento do fundo"
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
            </Hint>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to={enter.to}>{enter.label}</Link>
          </Button>
        </div>
      </header>
      <Acts active={active} onJump={jump} />

      <main>
        {CHAPTERS.map((c, i) => {
          const Heading = i === 0 ? "h1" : "h2";
          return (
            <section
              key={c.id}
              id={c.id}
              data-chapter={i}
              aria-labelledby={`${c.id}-titulo`}
              className={cn(
                "relative scroll-mt-0",
                still ? "min-h-svh" : i === 0 ? "h-[190lvh]" : i === LAST ? "h-[200lvh]" : "h-[240lvh]",
              )}
            >
              <div
                className={cn(
                  "flex min-h-svh w-full px-6 pt-24 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-10 lg:px-16 lg:pb-24",
                  !still && "sticky top-0 h-svh",
                  PLACES[c.place],
                )}
              >
                <div data-caption className={cn("journey-caption", i === 0 ? "max-w-[46rem]" : "max-w-[33rem]")}>
                  <Heading
                    id={`${c.id}-titulo`}
                    data-text={c.title}
                    aria-label={i === WRITING ? c.title : undefined}
                    className={cn(
                      "font-bold text-balance",
                      i === 0
                        ? "text-[clamp(2.75rem,6.4vw,5.25rem)] leading-[0.98] tracking-[-0.035em]"
                        : "text-[clamp(2rem,4vw,3.25rem)] leading-[1.04] tracking-[-0.03em]",
                    )}
                  >
                    {c.title}
                  </Heading>
                  <p
                    data-part
                    className={cn(
                      "mt-5 max-w-[46ch] leading-relaxed text-foreground/80",
                      i === 0 ? "text-lg" : "text-[1.0625rem]",
                    )}
                  >
                    {c.text}
                  </p>

                  {i === 0 && (
                    <p data-part className="mt-8 inline-flex items-center gap-2.5 text-sm text-foreground/70">
                      {still ? "Role para ler" : "Role para acompanhar"}
                      <Chevron className="journey-cue h-3 rotate-90 text-brand" />
                    </p>
                  )}

                  {i === WRITING && (
                    <div data-part className="mt-5">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-foreground/75">
                        No app, o que a máquina escreve leva esta marca:
                        <Badge variant="ai" className="gap-1 px-1.5 font-semibold">
                          <Sparkles data-icon="inline-start" />
                          IA
                        </Badge>
                      </p>
                    </div>
                  )}

                  {i === CURATION && (
                    <>
                      <div data-part className="mt-6 flex flex-wrap items-center gap-2">
                        <Button onClick={() => decide("publish")}>
                          Publicar
                          <Kbd className="bg-black/30 text-primary-foreground">P</Kbd>
                        </Button>
                        <Button variant="outline" onClick={() => decide("withdraw")}>
                          Retirar
                          <Kbd>R</Kbd>
                        </Button>
                      </div>
                      <p data-part role="status" className="mt-3 min-h-10 max-w-[44ch] text-sm text-foreground/70">
                        {verdict ? VERDICTS[verdict] : "Decida você. É uma demonstração: nada é gravado."}
                      </p>
                    </>
                  )}

                  {i === CHAIN && failed && (
                    <ol
                      data-part
                      aria-label="A cadeia"
                      className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold"
                    >
                      {CHAIN_LABELS.map((label, k) => (
                        <li key={label} className="inline-flex items-center gap-3">
                          {k > 0 && <Chevron className="h-3 text-brand" />}
                          {label}
                        </li>
                      ))}
                    </ol>
                  )}

                  {i === LAST && (
                    <>
                      <div id="fim" data-part className="mt-7">
                        <span data-magnetic className="inline-block">
                          <Button asChild size="lg">
                            <Link to={enter.to}>
                              {enter.label}
                              <ArrowRight data-icon="inline-end" />
                            </Link>
                          </Button>
                        </span>
                      </div>
                      <div data-part className="mt-12">
                        <OptsolvTagline className="h-auto w-60 text-warm-light" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
