// Acontecimento (N-06): every readable coverage of one occurrence, oldest first. Briefing (N-07): the day's selection
// by section, with the machine-written overview marked as such and withdrawn when a story it covered is no longer shown.
import type { Briefing } from "@optnews/contracts";
import { TriangleAlert } from "lucide-react";
import { useParams } from "react-router";
import { Link } from "@/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useApi } from "../api.ts";
import { formatDateTime, formatDay, plural } from "../format.ts";
import { StoryRow, useTopics } from "../story-card.tsx";
import { AiTag, Async, Page, Section } from "../ui.tsx";

export function EventPage() {
  const { id = "" } = useParams();
  const { label } = useTopics();
  const event = useApi("getEvent", { params: { id } });
  return (
    <Async q={event} what="o acontecimento" lines={6} shape="article">
      {(ev) => (
        <Page
          title={ev.title}
          crumbs={[{ to: "/explorar", label: "Explorar" }]}
          subtitle={`Acontecimento · ${plural(ev.stories.length, "cobertura", "coberturas")} · atualizado em ${formatDateTime(ev.lastUpdatedAt)}`}
        >
          <p data-reveal className="mb-8 max-w-[68ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
            Notícias de fontes diferentes sobre a mesma ocorrência ou seus desdobramentos diretos, agrupadas pela
            curadoria automática. Cada uma mantém sua própria fonte, data e discussão.
          </p>
          <Section title="Linha do tempo" className="max-w-3xl">
            <ol className="flex flex-col">
              {ev.stories.map((s, i) => (
                <li key={s.id} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-4">
                  {/* The rail: the first coverage (where the occurrence surfaced) carries the brand dot. */}
                  <span aria-hidden="true" className="relative flex justify-center">
                    {i < ev.stories.length - 1 && <span className="absolute top-3 -bottom-1 w-px bg-border" />}
                    <span
                      className={cn(
                        "relative mt-1 size-2.5 rounded-full ring-4 ring-background",
                        i === 0 ? "bg-brand" : "bg-muted-foreground/50",
                      )}
                    />
                  </span>
                  <div className="min-w-0 pb-7">
                    <StoryRow story={s} topicLabel={label} inEvent />
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </Page>
      )}
    </Async>
  );
}

/** The overview block shared by the home panel and the briefing page. */
export function BriefingOverview({ briefing }: { briefing: Briefing }) {
  if (briefing.overview) {
    return (
      <div className="flex flex-col gap-2">
        <AiTag>Panorama gerado por IA a partir das notícias listadas</AiTag>
        <p className="max-w-[68ch] text-lg leading-relaxed text-foreground">{briefing.overview}</p>
      </div>
    );
  }
  if (briefing.overviewWithdrawn) {
    return (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertDescription className="text-current">
          O panorama deste briefing foi retirado porque uma das notícias que ele resumia saiu do ar. A lista abaixo está
          atualizada.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function BriefingPage() {
  const { date = "latest" } = useParams();
  const { label } = useTopics();
  const briefing = useApi("getBriefing", { params: { date } });
  const history = useApi("listBriefings");
  return (
    <Async q={briefing} what="o briefing" lines={6} shape="rows">
      {(b) => (
        <Page
          title={`Briefing de ${formatDay(`${b.date}T12:00:00-03:00`)}`}
          crumbs={[{ to: "/", label: "Início" }]}
          subtitle={`Gerado em ${formatDateTime(b.generatedAt)} · uma notícia por acontecimento, ordenadas por relevância editorial`}
          rail={
            <Section title="Edições anteriores">
              <Async q={history} what="as edições" lines={4}>
                {(list) => (
                  <ul className="-mx-2 flex flex-col gap-0.5">
                    {list.map((h) => {
                      const current = h.date === b.date;
                      return (
                        <li key={h.date}>
                          <Link
                            to={`/briefings/${h.date}`}
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              "flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                              current && "bg-brand-soft font-semibold text-brand-text hover:bg-brand-soft",
                            )}
                          >
                            <span className="min-w-0 truncate">{formatDay(`${h.date}T12:00:00-03:00`)}</span>
                            <span className="tabular shrink-0 text-xs font-normal text-muted-foreground">
                              {plural(h.items, "notícia", "notícias")}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Async>
            </Section>
          }
        >
          <div data-reveal className="mb-10">
            <BriefingOverview briefing={b} />
          </div>
          <div className="flex max-w-3xl flex-col gap-10">
            {b.sections.map((s) => (
              <Section
                key={s.label}
                title={s.label}
                action={
                  <span className="tabular text-xs text-muted-foreground">
                    {plural(s.stories.length, "notícia", "notícias")}
                  </span>
                }
              >
                <div className="flex flex-col">
                  {s.stories.map((story) => (
                    <StoryRow key={story.id} story={story} topicLabel={label} />
                  ))}
                </div>
              </Section>
            ))}
          </div>
        </Page>
      )}
    </Async>
  );
}
