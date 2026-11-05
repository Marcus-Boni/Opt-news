// Explorar: the full feed. One toolbar, one decision per control (filter text, topic, period, order); what is active
// shows as removable chips. Every filter lives in the URL so a view can be shared and the back button works. The
// field filters this feed only; the search page (Busca) covers meetups and insights too.
import { ListFilter, X } from "lucide-react";
import { type FormEvent, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaged } from "../api.ts";
import { plural } from "../format.ts";
import { StoryRow, useTopics } from "../story-card.tsx";
import { Empty, ErrorState, Loading, Page, ProblemNote, SELECTED } from "../ui.tsx";

const PERIOD_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };
/** Radix Select and ToggleGroup reserve "" for "nothing selected", so "all" needs a value of its own. */
const ALL = "*";
const PERIOD_LABEL: Record<string, string> = {
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

export function Explore() {
  const [params, setParams] = useSearchParams();
  const { topics, label } = useTopics();
  const q = params.get("q") ?? "";
  const topic = params.get("tema") ?? "";
  const sort = params.get("ordem") === "relevancia" ? "relevance" : "recent";
  const period = params.get("periodo") ?? "";
  // Fixed when the period is chosen, so re-renders do not refetch with a new instant.
  const from = useMemo(() => {
    const days = PERIOD_DAYS[period];
    return days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
  }, [period]);
  const feed = usePaged("listStories", {
    query: { q: q || undefined, topic: topic || undefined, sort, from, limit: 20 },
  });

  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    set("q", String(new FormData(e.currentTarget).get("q") ?? "").trim());
  };

  const filtered = Boolean(q || topic || period);

  return (
    <Page
      title="Explorar"
      subtitle="Todas as notícias selecionadas pela curadoria automática, com fonte e data de coleta."
    >
      <div
        data-reveal
        data-sticky-filters
        className="sticky top-[4.25rem] z-10 mb-8 flex flex-col gap-3 rounded-2xl bg-card/80 p-3 shadow-elev-1 backdrop-blur-xl backdrop-saturate-150"
      >
        <div className="flex flex-wrap items-end gap-3">
          <search className="min-w-0 flex-1 basis-64">
            <form onSubmit={submit} className="flex gap-2">
              <InputGroup className="h-9 flex-1">
                <InputGroupAddon>
                  <ListFilter aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  key={q}
                  name="q"
                  type="search"
                  defaultValue={q}
                  maxLength={200}
                  aria-label="Filtrar este feed por termo"
                  placeholder="Filtrar por termo…"
                />
              </InputGroup>
              <Button type="submit" variant="secondary">
                Filtrar
              </Button>
            </form>
          </search>
          <Select value={topic || ALL} onValueChange={(v) => set("tema", v === ALL ? "" : v)}>
            <SelectTrigger aria-label="Tema" className="w-full data-[size=default]:h-9 sm:w-56">
              <SelectValue placeholder="Todos os temas…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>Todos os temas</SelectItem>
                {topics.data?.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={period || ALL} onValueChange={(v) => set("periodo", v === ALL ? "" : v)}>
            <SelectTrigger aria-label="Período" className="data-[size=default]:h-9">
              <SelectValue placeholder="Todo o período…" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>Todo o período</SelectItem>
                {Object.entries(PERIOD_LABEL).map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={sort}
            onValueChange={(v) => v && set("ordem", v === "relevance" ? "relevancia" : "")}
            aria-label="Ordenar por"
          >
            <ToggleGroupItem value="recent" className={`h-9 px-3 ${SELECTED}`}>
              Recentes
            </ToggleGroupItem>
            <ToggleGroupItem value="relevance" className={`h-9 px-3 ${SELECTED}`}>
              Relevância
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {filtered && (
          <ul aria-label="Filtros ativos" className="flex flex-wrap items-center gap-2">
            {[
              q && { key: "q", text: `Termo: “${q}”` },
              topic && { key: "tema", text: `Tema: ${label(topic)}` },
              period && { key: "periodo", text: PERIOD_LABEL[period] ?? period },
            ]
              .filter((c): c is { key: string; text: string } => Boolean(c))
              .map((c) => (
                <li key={c.key}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-full pr-2 pl-3 font-normal"
                    onClick={() => set(c.key, "")}
                    aria-label={`Remover filtro ${c.text}`}
                  >
                    {c.text}
                    <X data-icon="inline-end" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            <li>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-7 px-1 text-xs"
                onClick={() => setParams(sort === "relevance" ? { ordem: "relevancia" } : {}, { replace: true })}
              >
                Limpar filtros
              </Button>
            </li>
          </ul>
        )}
      </div>

      <section aria-labelledby="resultados" className="mt-6 max-w-3xl">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="resultados" className="text-base font-semibold tracking-[-0.015em]">
            {q ? `Resultados para “${q}”` : topic ? label(topic) : "Todas as notícias"}
          </h2>
          <p className="tabular text-xs text-muted-foreground" aria-live="polite">
            {feed.items &&
              `${plural(feed.items.length, "notícia carregada", "notícias carregadas")}${feed.hasMore ? "; há mais" : ""}`}
          </p>
        </div>
        {feed.items === undefined ? (
          feed.error ? (
            <ErrorState error={feed.error} what="o feed" onRetry={feed.reload} />
          ) : (
            <Loading lines={4} shape="rows" label="Carregando notícias…" />
          )
        ) : feed.items.length === 0 ? (
          <Empty>
            Nenhuma notícia com esses filtros.{" "}
            {filtered && (
              <Button variant="link" className="h-auto p-0" onClick={() => setParams({}, { replace: true })}>
                Limpar filtros
              </Button>
            )}
          </Empty>
        ) : (
          <div className="flex flex-col">
            {feed.items.map((s) => (
              <StoryRow key={s.id} story={s} topicLabel={label} />
            ))}
          </div>
        )}
        {feed.items && feed.error && (
          <div className="mt-3">
            <ProblemNote error={feed.error} />
          </div>
        )}
        {feed.hasMore && (
          <Button variant="outline" className="mt-6" disabled={feed.pending} onClick={feed.loadMore}>
            {feed.pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {feed.pending ? "Carregando…" : "Carregar mais notícias"}
          </Button>
        )}
      </section>
    </Page>
  );
}
