// Início: the day at a glance. The strongest story leads (a fact with its source, not machine text). Then the
// deep-purple field (brand purple = AI and data) with the panorama the curation model wrote from the listed stories
// (marked as AI): full when it is today's, a compact line that says its age when it is not. Then the latest stories,
// and in the rail what the team is doing with the news.
import type { Briefing, StoryCard } from "@optnews/contracts";
import { ArrowRight, Sparkles } from "lucide-react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { lazy, Suspense, useRef } from "react";
import { Link } from "@/link";
import { OptsolvSymbol } from "@/components/brand/optsolv";
import SplitText from "@/components/SplitText";
import { Button } from "@/components/ui/button";
import { reducedMotion } from "@/motion";
import { useApi } from "../api.ts";
import { DiscussionLine } from "../discussion.tsx";
import { formatDay, plural, relativeTime, TZ } from "../format.ts";
import { ProposalLine } from "../proposal.tsx";
import { StoryRow, useTopics } from "../story-card.tsx";
import { Async, Page, Section } from "../ui.tsx";
import { SessionLine } from "../session-line.tsx";

/** The lead is the best-scored published story among the latest ones, not simply the newest. */
function splitLead(items: StoryCard[]): [StoryCard | undefined, StoryCard[]] {
  const published = items.filter((s) => s.status === "published");
  const lead = published.reduce<StoryCard | undefined>(
    (best, s) => ((s.editorialScore ?? -1) > (best?.editorialScore ?? -1) ? s : best),
    undefined,
  );
  return [lead, items.filter((s) => s !== lead)];
}

gsap.registerPlugin(ScrollTrigger);

// The brand's one protagonist graphic (three.js, loaded only here and on the presentation pages), beside the lead.
const ChevronField = lazy(() => import("@/components/chevron-field").then((m) => ({ default: m.ChevronField })));

/** The cover: the day's strongest story at display size, the symbol's point field beside it (never under the text). */
function Cover({ story, topicLabel }: { story: StoryCard; topicLabel: (slug: string) => string }) {
  return (
    <section
      aria-label="Destaque"
      data-reveal
      className="surface relative isolate mb-10 grid overflow-hidden rounded-3xl lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
    >
      <div className="min-w-0 p-6 sm:p-10">
        <StoryRow story={story} topicLabel={topicLabel} lead />
      </div>
      <div
        aria-hidden="true"
        className="relative hidden min-h-72 overflow-hidden border-l border-border/60 bg-[radial-gradient(70%_60%_at_50%_45%,color-mix(in_oklab,var(--brand)_14%,transparent),transparent_75%)] lg:block"
      >
        <Suspense fallback={null}>
          <ChevronField className="absolute inset-0" />
        </Suspense>
      </div>
    </section>
  );
}

/** Today's date in São Paulo, in the briefing's YYYY-MM-DD form. */
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** An older panorama does not get the hero treatment: one line that says how old it is, and the way to it. */
function StalePanorama({ briefing }: { briefing: Briefing }) {
  return (
    <section
      aria-labelledby="panorama-titulo"
      data-reveal
      className="relative isolate mb-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 overflow-hidden rounded-2xl bg-depth px-6 py-5 text-depth-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]"
    >
      <span aria-hidden="true" className="aurora opacity-60" />
      <div className="min-w-0">
        <h2 id="panorama-titulo" className="text-sm font-semibold">
          Ainda não há panorama de hoje
        </h2>
        <p className="mt-1 text-sm text-depth-foreground/85">
          O último é de {formatDay(`${briefing.date}T12:00:00-03:00`)}, gerado {relativeTime(briefing.generatedAt)}.
        </p>
      </div>
      <Button asChild variant="secondary" size="sm">
        <Link to={`/briefings/${briefing.date}`}>
          Ler o último briefing
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </section>
  );
}

function Panorama({ briefing }: { briefing: Briefing }) {
  const count = briefing.sections.reduce((n, s) => n + s.stories.length, 0);
  const day = formatDay(`${briefing.date}T12:00:00-03:00`);
  const field = useRef<HTMLElement>(null);
  // The official symbol as a quiet watermark (a use the Brand System allows): it arrives with a forward impulse and
  // drifts slower than the page while the field scrolls by. Transform and opacity only.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.from("[data-watermark]", { x: -48, autoAlpha: 0, duration: 1.4, ease: "expo.out", delay: 0.2 });
      gsap.to("[data-watermark]", {
        yPercent: -14,
        ease: "none",
        scrollTrigger: { trigger: field.current, start: "top bottom", end: "bottom top", scrub: true },
      });
    },
    { scope: field },
  );
  return (
    <section
      ref={field}
      aria-labelledby="panorama-titulo"
      data-reveal
      className="relative isolate mb-10 overflow-hidden rounded-3xl bg-depth px-6 py-7 text-depth-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] sm:px-9 sm:py-10"
    >
      <span aria-hidden="true" className="aurora" />
      <OptsolvSymbol
        data-watermark
        className="pointer-events-none absolute -right-10 -bottom-16 -z-10 h-72 w-auto text-depth-foreground opacity-[0.07] sm:h-80"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="panorama-titulo" className="text-sm font-semibold">
          Panorama de {day}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-depth-foreground/12 px-2.5 py-1 text-xs font-medium">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Escrito por IA a partir das {plural(count, "notícia listada", "notícias listadas")}
        </span>
      </div>
      {briefing.overview && reducedMotion() === false ? (
        <SplitText
          text={briefing.overview}
          tag="p"
          splitType="words"
          effect="rise"
          trigger="load"
          duration={0.9}
          delay={28}
          textAlign="left"
          className="mt-5 max-w-[46ch] text-[1.375rem] leading-[1.35] font-semibold tracking-[-0.02em] sm:text-[1.75rem]"
        />
      ) : (
        <p className="mt-5 max-w-[46ch] text-[1.375rem] leading-[1.35] font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
          {briefing.overview}
        </p>
      )}
      <Button asChild className="mt-7">
        <Link to={`/briefings/${briefing.date}`}>
          Ler o briefing completo
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </section>
  );
}

export function Home() {
  const { label } = useTopics();
  const stories = useApi("listStories", { query: { sort: "recent", limit: 8 } });
  const meetups = useApi("listMeetups", { query: { when: "upcoming" } });
  const proposals = useApi("listProposals", { query: { status: "open" } });
  const discussions = useApi("recentDiscussions");
  const briefing = useApi("getBriefing", { params: { date: "latest" } });
  const today = formatDay(Date.now());
  const [lead, rest] = stories.data ? splitLead(stories.data.items) : [undefined, []];

  const viewAll = (to: string, text: string) => (
    <Button asChild variant="link" size="sm" className="text-xs">
      <Link to={to}>{text}</Link>
    </Button>
  );

  const rail = (
    <>
      <Section title="Pautas em votação" action={viewAll("/meetups", "Ver todas")}>
        <Async
          q={proposals}
          what="as pautas"
          empty={(list) =>
            list.length === 0 && "Nenhuma pauta aberta. Proponha uma a partir de uma notícia que mereça conversa."
          }
        >
          {(list) => (
            <ul className="flex flex-col">
              {list.slice(0, 4).map((p) => (
                <ProposalLine key={p.id} proposal={p} />
              ))}
            </ul>
          )}
        </Async>
      </Section>
      <Section title="Próximos meetups" action={viewAll("/meetups?aba=agenda", "Agenda")}>
        <Async
          q={meetups}
          what="a agenda"
          empty={(list) =>
            list.length === 0 && "Nenhum meetup agendado. As pautas mais votadas viram a próxima sessão."
          }
        >
          {(list) => (
            <ul className="flex flex-col">
              {list.slice(0, 3).map((m) => (
                <SessionLine key={m.id} session={m} compact />
              ))}
            </ul>
          )}
        </Async>
      </Section>
      <Section title="Debates recentes" action={viewAll("/comunidade", "Comunidade")}>
        <Async
          q={discussions}
          what="os debates"
          shape="comments"
          empty={(list) => list.length === 0 && "Nenhum debate ainda. Comente uma notícia para abrir o primeiro."}
        >
          {(list) => (
            <ul className="flex flex-col">
              {list.slice(0, 4).map((d) => (
                <DiscussionLine key={d.comment.id} entry={d} />
              ))}
            </ul>
          )}
        </Async>
      </Section>
    </>
  );

  return (
    <Page
      title="Briefing"
      subtitle={`${today.charAt(0).toUpperCase()}${today.slice(1)} · horário de Brasília`}
      rail={rail}
      hero={lead && <Cover story={lead} topicLabel={label} />}
    >
      <Async
        q={stories}
        what="as notícias"
        lines={6}
        shape="rows"
        empty={(page) =>
          page.items.length === 0 && "Nenhuma notícia curada ainda. Assim que a coleta rodar, o briefing aparece aqui."
        }
      >
        {() => {
          const b = briefing.data;
          return (
            <>
              {/* No briefing yet (404) is normal on a fresh install: the field simply does not show. */}
              {b?.overview && (b.date === todayKey() ? <Panorama briefing={b} /> : <StalePanorama briefing={b} />)}
              <Section title="Mais recentes" action={viewAll("/explorar", "Explorar tudo")}>
                <div className="flex flex-col">
                  {rest.map((s) => (
                    <StoryRow key={s.id} story={s} topicLabel={label} />
                  ))}
                </div>
              </Section>
            </>
          );
        }}
      </Async>
    </Page>
  );
}
