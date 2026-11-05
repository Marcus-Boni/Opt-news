// Operations data drawn at the size of the data: a source's last 7 days of collection as a strip of bars, and the
// team's last 12 weeks as a calendar map (one square per day, darker orange = more happened). Numbers live in the
// hints and in a screen-reader summary; the drawing never stands alone.
import type { Data } from "@/api";
import { Hint } from "@/ui";
import { formatShortDay, plural } from "@/format";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Items collected on each of the last 7 days, today last and in orange. */
export function WeekStrip({ week }: { week: number[] }) {
  const max = Math.max(...week, 1);
  const total = week.reduce((a, b) => a + b, 0);
  const label = `${plural(total, "item coletado", "itens coletados")} em 7 dias; hoje: ${week.at(-1) ?? 0}`;
  return (
    <Hint label={`${label} (do mais antigo para hoje: ${week.join(", ")})`}>
      <span role="img" aria-label={label} className="inline-flex h-6 cursor-default items-end gap-[3px]">
        {week.map((n, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the position is the day.
            key={i}
            className={
              i === week.length - 1 ? "w-1.5 rounded-[2px] bg-brand" : "w-1.5 rounded-[2px] bg-muted-foreground/45"
            }
            style={{ height: n === 0 ? "2px" : `${Math.max(4, (n / max) * 24)}px` }}
          />
        ))}
      </span>
    </Hint>
  );
}

type Day = Data<"activity">["days"][number];

const total = (d: Day) => d.stories + d.comments + d.proposals;

/** Five steps of orange: none, then quartiles of the busiest day. */
function level(n: number, max: number) {
  if (n === 0) return 0;
  return Math.min(4, Math.ceil((n / max) * 4));
}
const FILL = [
  "var(--muted)",
  "color-mix(in oklab, var(--brand) 28%, var(--muted))",
  "color-mix(in oklab, var(--brand) 50%, var(--muted))",
  "color-mix(in oklab, var(--brand) 75%, var(--muted))",
  "var(--brand)",
];

export function ActivityMap({ days }: { days: Day[] }) {
  const max = Math.max(...days.map(total), 1);
  // Columns are weeks starting on Sunday: pad the first column up to the first day's weekday.
  const first = new Date(`${days[0]?.date ?? "2026-01-01"}T12:00:00-03:00`).getUTCDay();
  const cells: (Day | null)[] = [...Array.from({ length: first }, () => null), ...days];
  const sums = days.reduce(
    (a, d) => ({
      stories: a.stories + d.stories,
      comments: a.comments + d.comments,
      proposals: a.proposals + d.proposals,
    }),
    { stories: 0, comments: 0, proposals: 0 },
  );
  const summary = `Últimas 12 semanas: ${plural(sums.stories, "notícia publicada", "notícias publicadas")}, ${plural(sums.comments, "comentário", "comentários")} e ${plural(sums.proposals, "pauta", "pautas")}.`;
  const facts = [
    { n: sums.stories, label: sums.stories === 1 ? "notícia publicada" : "notícias publicadas" },
    { n: sums.comments, label: sums.comments === 1 ? "comentário" : "comentários" },
    { n: sums.proposals, label: sums.proposals === 1 ? "pauta proposta" : "pautas propostas" },
  ];
  return (
    <figure className="surface grid gap-6 rounded-2xl p-4 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-12">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <div aria-hidden="true" className="grid grid-rows-7 gap-1 pr-1 text-[0.6875rem] text-muted-foreground">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className="flex h-4 items-center sm:h-[18px]">
                {i % 2 === 1 ? w : ""}
              </span>
            ))}
          </div>
          <div role="img" aria-label={summary} className="grid grid-flow-col grid-rows-7 gap-1">
            {cells.map((d, i) =>
              d ? (
                <Hint
                  key={d.date}
                  label={`${formatShortDay(`${d.date}T12:00:00-03:00`)}: ${plural(d.stories, "notícia", "notícias")}, ${plural(d.comments, "comentário", "comentários")}, ${plural(d.proposals, "pauta", "pautas")}`}
                >
                  <span
                    className="size-4 rounded-[4px] sm:size-[18px]"
                    style={{ background: FILL[level(total(d), max)] }}
                  />
                </Hint>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: padding before the first day has no identity.
                <span key={`pad-${i}`} className="size-4 sm:size-[18px]" />
              ),
            )}
          </div>
        </div>
        <span aria-hidden="true" className="inline-flex items-center gap-1 self-end text-xs text-muted-foreground">
          Menos
          {FILL.map((f) => (
            <span key={f} className="size-3 rounded-[3px]" style={{ background: f }} />
          ))}
          Mais
        </span>
      </div>
      <figcaption className="flex flex-col gap-4">
        <span className="text-sm text-muted-foreground">Nas últimas 12 semanas</span>
        <dl className="grid grid-cols-3 gap-4">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-1">
              <dt className="order-last text-xs text-muted-foreground">{f.label}</dt>
              <dd className="tabular text-[1.75rem] leading-none font-bold tracking-[-0.03em]">{f.n}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
