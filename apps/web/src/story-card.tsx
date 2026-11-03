// A story in a list: source facts first (topic, source, time), the headline, the AI summary marked as such, then what
// the team did with it. The editorial score is the one orange datum on the row.
import type { StoryCard as Story } from "@optnews/contracts";
import { ArrowUpRight, CalendarDays, Layers, Lightbulb, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useApi } from "./api.ts";
import { plural } from "./format.ts";
import { AiTag, Dot, Hint, Time } from "./ui.tsx";

/** The taxonomy and a slug → label lookup (falls back to the slug while loading). */
export function useTopics() {
  const topics = useApi("topics");
  const labels = new Map(topics.data?.map((t) => [t.slug, t.label]));
  return { topics, label: (slug: string) => labels.get(slug) ?? slug };
}

export function StatusPill({ status }: { status: Story["status"] }) {
  if (status === "under_review") return <Badge variant="warning">Em revisão editorial</Badge>;
  if (status === "retracted") return <Badge variant="destructive">Retirada</Badge>;
  return null;
}

/** Editorial score as a quiet datum: the number in brand text, the meaning in its tooltip. */
export function ScoreMark({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <Hint label="Pontuação editorial automática (0–100): prioridade de leitura, não certeza dos fatos">
      <span className="relative z-10 inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft px-1.5 font-mono text-xs font-medium text-brand-text">
        {Math.round(score)}
        <span className="sr-only"> de 100 de pontuação editorial</span>
      </span>
    </Hint>
  );
}

export function StoryRow({
  story,
  topicLabel,
  lead = false,
  inEvent = false,
}: {
  story: Story;
  topicLabel: (slug: string) => string;
  lead?: boolean;
  /** Inside the event page the coverage link would point at the page itself. */
  inEvent?: boolean;
}) {
  const { counts } = story;
  const coverage = !inEvent && story.event && story.event.coverage > 1 ? story.event : null;
  const activity = [
    { n: counts.comments, icon: MessageSquare, one: "comentário", many: "comentários" },
    { n: counts.proposals, icon: CalendarDays, one: "pauta", many: "pautas" },
    { n: counts.insights, icon: Lightbulb, one: "insight", many: "insights" },
  ].filter((a) => a.n > 0);
  const Heading = lead ? "h2" : "h3";
  return (
    // Rows rise in as they scroll into view (once); MotionConfig drops the movement under reduced motion.
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -48px 0px" }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group/row relative rounded-xl transition-colors",
        lead ? "pb-2" : "-mx-3 border-b border-border/70 px-3 py-5 last:border-b-0 hover:bg-muted/50",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {story.topics[0] && <span className="font-semibold text-brand-text">{topicLabel(story.topics[0])}</span>}
          {story.topics[0] && <Dot />}
          <span className="font-medium text-foreground/80">{story.source.name}</span>
          <Dot />
          <Time iso={story.originalPublishedAt ?? story.firstSeenAt} />
          <StatusPill status={story.status} />
        </p>
        <ScoreMark score={story.editorialScore} />
      </div>
      <Heading
        className={cn(
          "mt-2 font-bold tracking-[-0.025em] text-balance text-foreground",
          lead ? "text-[1.75rem] leading-[1.15] sm:text-[2.25rem]" : "text-[1.1875rem] leading-snug",
        )}
      >
        <Link
          to={`/noticias/${story.id}`}
          className="decoration-brand decoration-2 underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:underline"
        >
          {story.headline}
        </Link>
        {!lead && (
          <ArrowUpRight
            aria-hidden="true"
            className="ml-1 inline size-4 -translate-x-1 translate-y-[-1px] text-brand opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover/row:translate-x-0 group-hover/row:opacity-100"
          />
        )}
      </Heading>
      {story.summary ? (
        <div className="mt-2.5 flex flex-col items-start gap-1.5">
          {story.aiGenerated && <AiTag>Resumo</AiTag>}
          <p
            className={cn(
              "max-w-[68ch] text-muted-foreground",
              lead ? "text-[1.0625rem] leading-relaxed" : "line-clamp-2 text-[0.9375rem] leading-relaxed",
            )}
          >
            {story.summary}
          </p>
        </div>
      ) : story.status === "retracted" ? (
        <p className="mt-2 text-sm text-muted-foreground">Resumo retirado junto com a notícia.</p>
      ) : null}
      {(activity.length > 0 || coverage) && (
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {coverage && (
            <Link
              to={`/acontecimentos/${coverage.id}`}
              className="inline-flex items-center gap-1.5 font-medium text-brand-text hover:underline"
            >
              <Layers className="size-3.5" aria-hidden="true" />
              {plural(coverage.coverage, "cobertura", "coberturas")} deste acontecimento
            </Link>
          )}
          {activity.map((a) => (
            <span key={a.one} className="tabular inline-flex items-center gap-1.5">
              <a.icon className="size-3.5" aria-hidden="true" />
              {plural(a.n, a.one, a.many)}
            </span>
          ))}
        </div>
      )}
    </motion.article>
  );
}
