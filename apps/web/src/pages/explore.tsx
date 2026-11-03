// Explorar: the full feed. Every filter lives in the URL so a view can be shared and the back button works.
import { Search } from "lucide-react";
import { type FormEvent, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaged } from "../api.ts";
import { plural } from "../format.ts";
import { StoryRow, useTopics } from "../story-card.tsx";
import { Empty, ErrorState, Loading, Page, ProblemNote } from "../ui.tsx";

const PERIOD_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };
/** Radix Select and ToggleGroup reserve "" for "nothing selected", so "all" needs a value of its own. */
const ALL = "*";
/** Selected state of a filter: the brand's soft field, never a solid orange wall. */
const ON = "data-[state=on]:border-brand/50 data-[state=on]:bg-brand-soft data-[state=on]:text-brand-text";

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
      <div data-reveal className="flex flex-col gap-4 border-b pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <search className="min-w-0 flex-1 basis-72">
            <form onSubmit={submit} className="flex gap-2">
              <InputGroup className="h-9 flex-1">
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  key={q}
                  name="q"
                  type="search"
                  defaultValue={q}
                  maxLength={200}
                  aria-label="Buscar no feed"
                  placeholder="Buscar por termo, empresa ou tecnologia…"
                />
              </InputGroup>
              <Button type="submit" variant="secondary">
                Buscar
              </Button>
            </form>
          </search>
          <Field orientation="horizontal" className="w-auto gap-2">
            <FieldLabel htmlFor="explorar-periodo" className="font-normal text-muted-foreground">
              Período
            </FieldLabel>
            <Select value={period || ALL} onValueChange={(v) => set("periodo", v === ALL ? "" : v)}>
              <SelectTrigger id="explorar-periodo" className="data-[size=default]:h-9">
                <SelectValue placeholder="Todo o período…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>Todo o período</SelectItem>
                  <SelectItem value="24h">Últimas 24 horas</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={sort}
            onValueChange={(v) => v && set("ordem", v === "relevance" ? "relevancia" : "")}
            aria-label="Ordenar por"
          >
            <ToggleGroupItem value="recent" className={`h-9 px-3 ${ON}`}>
              Recentes
            </ToggleGroupItem>
            <ToggleGroupItem value="relevance" className={`h-9 px-3 ${ON}`}>
              Relevância
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="-mx-4 min-w-0 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:px-0">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={topic || ALL}
            onValueChange={(v) => set("tema", v === ALL ? "" : v)}
            aria-label="Tema"
            className="sm:flex-wrap"
          >
            <ToggleGroupItem value={ALL} className={`rounded-full px-3 ${ON}`}>
              Todos os temas
            </ToggleGroupItem>
            {topics.data?.map((t) => (
              <ToggleGroupItem key={t.slug} value={t.slug} className={`rounded-full px-3 ${ON}`}>
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
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
            <Loading lines={6} label="Carregando notícias…" />
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
