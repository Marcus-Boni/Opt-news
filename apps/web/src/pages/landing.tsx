// Apresentação (/sobre): the public face of Opt News for people who have not signed in yet. One protagonist graphic
// (the point field of the Optsolv symbol), then the four pillars as the signature chain, the curation pipeline as a
// pinned strip the reader scrolls through, and the rule that keeps fact, estimate and AI apart. Every number here is
// a property of the system, not a result. Motion: the headline arrives line by line, every block arrives as it
// scrolls in, the field scatters again as the hero leaves, the calls to action lean toward the pointer, a slim bar
// keeps the way in at hand; all of it off under prefers-reduced-motion, where the page simply reads top to bottom.
import { useGSAP } from "@gsap/react";
import { animate, type JSAnimation } from "animejs";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ArrowDown, ArrowRight } from "lucide-react";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Link } from "react-router";
import { OptsolvSymbol, OptsolvTagline } from "@/components/brand/optsolv";
import { Chevron } from "@/components/chevron-trail";
import CountUp from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reducedMotion, useMagnetic, useScrollReveal, useSmoothScroll } from "@/motion";
import { useSession } from "../session.tsx";
import { Mark, Wordmark } from "../ui.tsx";

gsap.registerPlugin(ScrollTrigger, SplitText);

// three.js only loads for this surface, and only once the page is on screen.
const ChevronField = lazy(() => import("@/components/chevron-field").then((m) => ({ default: m.ChevronField })));

type Enter = { to: string; label: string };

const PILLARS = [
  {
    title: "Notícias",
    text: "Fontes oficiais e de imprensa, coletadas e resumidas em português. Cada notícia leva o link do original.",
  },
  {
    title: "Comunidade",
    text: "A discussão fica junto da notícia: quem leu comenta, propõe uma pauta e vota no que merece um encontro.",
  },
  {
    title: "Meetups",
    text: "As pautas mais votadas viram encontros do time, com data, apresentação e material guardados.",
  },
  {
    title: "Conhecimento",
    text: "O que o encontro ensinou vira um insight ligado à notícia que o originou, pronto para virar experimento.",
  },
];

const PIPELINE = [
  {
    n: "01",
    title: "Coleta",
    text: "Feeds RSS e páginas de listagem, lidos por um coletor que recusa redes internas.",
  },
  { n: "02", title: "Pré-filtro", text: "Ofertas, eventos e ruído saem antes de custar uma avaliação." },
  {
    n: "03",
    title: "Duas notas",
    text: "Dois critérios independentes dão nota à mesma notícia. Se divergem muito, um curador decide.",
  },
  {
    n: "04",
    title: "Corte por fonte",
    text: "Fonte oficial, conta oficial e imprensa têm cortes diferentes, ajustados ao modelo em uso.",
  },
  { n: "05", title: "Redação", text: "Título e resumo em português, escritos pela IA e marcados como tal." },
  { n: "06", title: "Curadoria", text: "Pessoas publicam, retiram e corrigem. Toda decisão fica auditada." },
];

/** Once the hero scrolls away, a slim bar keeps the mark and the way in at hand; until then it is off screen and inert. */
function TopBar({ enter }: { enter: Enter }) {
  const bar = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const el = bar.current;
      if (!el || reducedMotion()) return;
      const show = (on: boolean) => {
        el.inert = !on;
        gsap.to(el, { yPercent: on ? 0 : -100, duration: 0.5, ease: on ? "expo.out" : "power2.in", overwrite: true });
      };
      // Looked up by id: the hero is in the DOM already, but its React ref is only attached after this effect runs,
      // and a selector string here would be scoped to the bar.
      ScrollTrigger.create({
        trigger: document.getElementById("inicio"),
        start: "bottom 64px",
        onEnter: () => show(true),
        onLeaveBack: () => show(false),
      });
    },
    { scope: bar },
  );
  return (
    <div
      ref={bar}
      inert
      className="fixed inset-x-0 top-0 z-20 border-b bg-background"
      style={{ transform: "translateY(-100%)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3 sm:px-10">
        <Wordmark />
        <Button asChild size="sm">
          <Link to={enter.to}>{enter.label}</Link>
        </Button>
      </div>
    </div>
  );
}

/** The hero: the headline rises line by line from behind a mask, then the rest; scrolling away lifts the copy and
 * pulls the point field apart again. */
function Hero({ enter }: { enter: Enter }) {
  const root = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  // 0..1, how far the field is scattered; ChevronField reads it every frame.
  const scatter = useRef(0);
  useGSAP(
    () => {
      if (reducedMotion()) return;
      // autoSplit re-splits (and replays) when the fonts land or the width changes, so lines always match the layout.
      const split = SplitText.create("h1", {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: "expo.out", stagger: 0.09 }),
      });
      gsap.from("[data-hero]", {
        y: 16,
        autoAlpha: 0,
        duration: 0.7,
        ease: "expo.out",
        stagger: 0.08,
        delay: 0.5,
        clearProps: "all",
      });
      gsap.to(copy.current, {
        y: -64,
        autoAlpha: 0,
        ease: "power1.in",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
      ScrollTrigger.create({
        trigger: field.current,
        start: "top 15%",
        end: "bottom -30%",
        onUpdate: (self) => {
          scatter.current = self.progress;
        },
      });
      return () => split.revert();
    },
    { scope: root },
  );
  return (
    // Always on warm graphite, whatever the theme: the logo's dark ground.
    <section
      ref={root}
      id="inicio"
      className="dark relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="inline-flex items-center gap-2.5" translate="no">
          <Mark className="h-6 w-auto" />
          <span className="text-[1.0625rem] font-bold tracking-[-0.03em]">Opt News</span>
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to={enter.to}>{enter.label}</Link>
        </Button>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 pb-16 sm:px-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div ref={copy} className="flex max-w-xl flex-col gap-6">
          <h1 className="max-w-[16ch] text-[2.25rem] leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-[2.875rem] lg:text-[3.5rem]">
            Notícias de tecnologia com fonte, debate do time e conhecimento aplicável.
          </h1>
          <p data-hero className="max-w-[44ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
            O Opt News coleta fontes oficiais e de imprensa, resume em português com IA marcada como IA e liga cada
            notícia à pauta, ao meetup e ao insight que ela gerou na Optsolv.
          </p>
          <div data-hero className="flex flex-wrap items-center gap-3">
            <span data-magnetic className="inline-block">
              <Button asChild size="lg">
                <Link to={enter.to}>
                  {enter.label}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </span>
            <Button asChild variant="ghost" size="lg">
              <a href="#pilares">
                Como funciona
                <ArrowDown data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </div>
        <div
          ref={field}
          className="relative aspect-square w-full max-w-[18rem] justify-self-center sm:max-w-md lg:max-w-none"
        >
          <Suspense fallback={<OptsolvSymbol className="absolute inset-[18%] text-brand/70" />}>
            <ChevronField className="absolute inset-0" scatter={scatter} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

/** The four pillars as one horizontal chain: an orange impulse runs the connector as the section scrolls in, and a
 * pillar under the pointer gives its chevron the same push forward. */
function Pillars() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap
        .timeline({
          scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
          defaults: { ease: "expo.out" },
        })
        .from("[data-impulse]", { scaleX: 0, transformOrigin: "left", duration: 1.2, stagger: 0.18 })
        .from("[data-node]", { scale: 0.4, autoAlpha: 0, duration: 0.6, stagger: 0.18, clearProps: "all" }, 0.1)
        .from("[data-pillar]", { y: 20, autoAlpha: 0, duration: 0.8, stagger: 0.18, clearProps: "all" }, 0.2);
    },
    { scope: root },
  );
  useEffect(() => {
    const el = root.current;
    if (!el || reducedMotion() || !window.matchMedia("(hover: hover)").matches) return;
    const offs = [...el.querySelectorAll<HTMLElement>("li")].map((li) => {
      // The node (an HTML span), not the SVG inside it: on an SVG anime.js would animate the `x` attribute.
      const node = li.querySelector("[data-node]");
      let anim: JSAnimation | undefined;
      const push = () => {
        anim?.revert();
        if (node)
          anim = animate(node, {
            translateX: [
              { to: 6, duration: 160, ease: "outQuad" },
              { to: 0, duration: 640, ease: "outElastic(1, .55)" },
            ],
          });
      };
      li.addEventListener("pointerenter", push);
      return () => {
        li.removeEventListener("pointerenter", push);
        anim?.revert();
      };
    });
    return () => {
      for (const off of offs) off();
    };
  }, []);
  return (
    <div ref={root}>
      <ol aria-label="Os quatro pilares" className="grid gap-10 md:grid-cols-4 md:gap-6">
        {PILLARS.map((p, i) => (
          <li key={p.title} className="relative">
            <div className="relative mb-5 flex items-center" aria-hidden="true">
              <span data-node className="grid size-9 place-items-center rounded-full bg-brand-soft">
                <Chevron className="h-4 text-brand" />
              </span>
              {i < PILLARS.length - 1 && (
                <span className="absolute top-1/2 left-9 hidden h-0.5 w-[calc(100%-2.25rem)] -translate-y-1/2 rounded-full bg-border md:block">
                  <span data-impulse className="absolute inset-0 rounded-full bg-brand" />
                </span>
              )}
            </div>
            <div data-pillar>
              <h3 className="text-xl font-bold tracking-[-0.02em]">{p.title}</h3>
              <p className="mt-2 max-w-[32ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The pipeline: on wide screens the section pins and the steps slide past as the reader scrolls, with a rail and a
 * counter that say how far along they are; otherwise a column. Under reduced motion it is always the column, so
 * every step stays reachable. */
function Pipeline() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const still = reducedMotion();
  useGSAP(
    () => {
      if (still) return;
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        const t = track.current;
        const r = root.current;
        if (!t || !r) return;
        const distance = () => t.scrollWidth - r.clientWidth;
        gsap
          .timeline({
            scrollTrigger: {
              trigger: r,
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 0.6,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                if (counter.current)
                  counter.current.textContent = String(1 + Math.round(self.progress * (PIPELINE.length - 1))).padStart(
                    2,
                    "0",
                  );
              },
            },
          })
          .to(t, { x: () => -distance(), ease: "none" }, 0)
          .to(rail.current, { scaleX: 1, transformOrigin: "left center", ease: "none" }, 0);
      });
      mm.add("(max-width: 1023px)", () => {
        gsap.from("[data-step]", {
          y: 20,
          autoAlpha: 0,
          duration: 0.7,
          ease: "expo.out",
          stagger: 0.1,
          clearProps: "all",
          scrollTrigger: { trigger: track.current, start: "top 75%", once: true },
        });
      });
    },
    { scope: root },
  );
  return (
    <div
      ref={root}
      className={cn("overflow-hidden py-20", !still && "lg:flex lg:min-h-dvh lg:flex-col lg:justify-center lg:py-0")}
    >
      <div className="mx-auto w-full max-w-6xl px-6">
        <h2
          data-reveal
          className="max-w-[20ch] text-[2rem] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[2.5rem]"
        >
          Como uma notícia chega à sua tela
        </h2>
        <p data-reveal className="mt-4 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
          Seis etapas, todas registradas. A IA avalia e escreve; pessoas decidem.
        </p>
        {!still && (
          <div aria-hidden="true" className="mt-8 hidden items-center gap-4 lg:flex">
            <span className="font-mono text-sm text-muted-foreground">
              <span ref={counter} className="text-brand-text">
                01
              </span>{" "}
              / {String(PIPELINE.length).padStart(2, "0")}
            </span>
            <span className="relative h-px flex-1 bg-border">
              <span ref={rail} className="absolute inset-0 bg-brand" style={{ transform: "scaleX(0)" }} />
            </span>
          </div>
        )}
      </div>
      <ol
        ref={track}
        aria-label="Etapas da curadoria"
        className={cn(
          "mt-12 flex flex-col gap-4 px-6",
          !still && "lg:w-max lg:flex-row lg:gap-6 lg:px-[max(1.5rem,calc(50vw-36rem))]",
        )}
      >
        {PIPELINE.map((s) => (
          <li
            key={s.n}
            data-step
            className={cn("flex flex-col gap-5 rounded-xl border bg-card p-6", !still && "lg:w-80 lg:shrink-0 lg:p-7")}
          >
            <span className="font-mono text-sm text-brand-text">{s.n}</span>
            <div>
              <h3 className="text-xl font-bold tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const FACTS: { value: number; unit: string; text: string }[] = [
  { value: 2, unit: "notas", text: "independentes por notícia, antes de qualquer publicação" },
  { value: 72, unit: "horas", text: "de janela: o que é mais antigo na primeira coleta é arquivado sem custo" },
  { value: 1, unit: "fonte", text: "ligada a cada notícia, sempre a página original" },
];

/** Three properties of the system; their rules draw in from the left as the list scrolls in, then the numbers count. */
function Facts() {
  const root = useRef<HTMLDListElement>(null);
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.from("[data-rule]", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 1.1,
        ease: "expo.out",
        stagger: 0.14,
        scrollTrigger: { trigger: root.current, start: "top 78%", once: true },
      });
    },
    { scope: root },
  );
  return (
    <dl ref={root} className="grid gap-8 sm:grid-cols-3 lg:grid-cols-1">
      {FACTS.map((f) => (
        <div key={f.unit} data-reveal>
          <dt className="sr-only">{f.unit}</dt>
          <dd className="relative flex items-baseline gap-2 pt-5">
            <span data-rule aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-depth-foreground/20" />
            <span className="tabular text-5xl font-bold tracking-[-0.03em]">
              <CountUp to={f.value} duration={1.2} />
            </span>
            <span className="text-lg font-semibold">{f.unit}</span>
          </dd>
          <dd className="mt-2 max-w-[32ch] text-[0.9375rem] leading-relaxed opacity-85">{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Landing() {
  const { me } = useSession();
  const scope = useRef<HTMLDivElement>(null);
  useSmoothScroll();
  useScrollReveal(scope);
  useMagnetic(scope);
  // Lenis drives the document scroll; ScrollTrigger reads it from the same loop.
  useEffect(() => {
    const lenis = window.__lenis;
    if (!lenis) return;
    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.off("scroll", ScrollTrigger.update);
  }, []);
  const enter = me ? { to: "/", label: "Abrir o Opt News" } : { to: "/entrar", label: "Entrar" };

  return (
    <div ref={scope} className="overflow-x-clip bg-background text-foreground">
      <title>Opt News · inteligência tecnológica da Optsolv</title>
      <TopBar enter={enter} />
      <Hero enter={enter} />

      <section id="pilares" className="scroll-mt-10 py-24 sm:py-32">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-10">
          <h2
            data-reveal
            className="max-w-[18ch] text-[2rem] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[2.5rem]"
          >
            Quatro pilares, uma cadeia.
          </h2>
          <p data-reveal className="mt-4 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
            Uma notícia só vale o que o time faz com ela. Por isso cada passo aponta para o seguinte, e o caminho de
            volta fica registrado.
          </p>
          <div className="mt-14">
            <Pillars />
          </div>
        </div>
      </section>

      <section className="border-y bg-card/60">
        <Pipeline />
      </section>

      {/* Machine-written content lives on the brand's purple depth, as in the app. */}
      <section className="bg-depth py-24 text-depth-foreground sm:py-32">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <div>
            <h2
              data-reveal
              className="max-w-[16ch] text-[2rem] leading-[1.1] font-bold tracking-[-0.03em] sm:text-[2.5rem]"
            >
              Fato, estimativa e texto de IA nunca se misturam.
            </h2>
            <p data-reveal className="mt-4 max-w-[48ch] text-[1.0625rem] leading-relaxed opacity-85">
              Tudo que a IA escreve leva a marca de IA. A pontuação diz prioridade de leitura, não certeza. E a fonte
              está sempre a um clique, para confirmar antes de citar.
            </p>
          </div>
          <Facts />
        </div>
      </section>

      {/* The footer is on warm graphite too. */}
      <footer className="dark bg-background px-6 py-16 text-foreground sm:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
          <div data-reveal className="flex flex-col gap-5">
            <OptsolvTagline className="h-auto w-60 text-warm-light" />
            <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
              Opt News é a plataforma interna de inteligência tecnológica e conhecimento colaborativo da Optsolv.
            </p>
          </div>
          <span data-reveal data-magnetic className="inline-block self-start sm:self-auto">
            <Button asChild size="lg">
              <Link to={enter.to}>
                {enter.label}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </span>
        </div>
      </footer>
    </div>
  );
}
