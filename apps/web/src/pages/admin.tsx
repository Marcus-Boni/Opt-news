// Administração (N-01): sources, their health and what the curation pipeline did with their items. Curators pause,
// resume and change cadence; admins also register sources and change name, feed URL and tier. The server enforces
// all of it; the page only hides what the member cannot do.
import type { SourceDetail, SourceStatus } from "@optnews/contracts";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import CountUp from "@/components/CountUp";
import { FunnelChart } from "@/components/charts/funnel-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { reducedMotion } from "@/motion";
import { api, useAction, useApi } from "../api.ts";
import { formatDateTime, plural, TIER } from "../format.ts";
import { useMe } from "../session.tsx";
import { Async, ExternalLink, Fact, Facts, Page, Pill, ProblemNote, Section, Time } from "../ui.tsx";

const ITEM_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "error" | "accent" }> = {
  discovered: { label: "Na fila", tone: "neutral" },
  selected: { label: "Publicada", tone: "success" },
  not_selected: { label: "Abaixo do limiar", tone: "neutral" },
  rejected: { label: "Rejeitada", tone: "warning" },
  archived: { label: "Arquivada (antiga)", tone: "neutral" },
  failed: { label: "Falhou", tone: "error" },
};
const INTERVALS = [15, 30, 60, 120, 360, 720, 1440];
const intervalLabel = (m: number) => (m < 60 ? `${m} min` : m === 1440 ? "1 dia" : `${m / 60} h`);
const number = new Intl.NumberFormat("pt-BR").format;
/** The kind "submission" source holds member links (N-11): it has no feed and is never fetched as one. */
const SUBMISSIONS = "Indicações da comunidade (links enviados por membros)";
/** A web_list source has no feed: a listing page whose article links start with a prefix (ADR-0015). */
const PREFIX_HELP = "Só links que começam com este endereço viram itens. Precisa ser do mesmo site da listagem.";

function KindSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select name="kind" value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full data-[size=default]:h-9">
        <SelectValue placeholder="Escolha o tipo…" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="rss">Feed RSS ou Atom</SelectItem>
          <SelectItem value="web_list">Página de listagem (site sem feed)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Health({ s }: { s: SourceStatus }) {
  if (!s.active) return <Pill>Pausada</Pill>;
  if (s.lastError) return <Pill tone="error">Com erro</Pill>;
  if (s.kind === "submission") return <Pill tone="success">Recebendo indicações</Pill>;
  if (!s.lastSuccessAt) return <Badge variant="outline">Aguardando 1ª coleta</Badge>;
  return <Pill tone="success">Coletando</Pill>;
}

/** Pause or resume, used in the list and on the source page. */
function ActiveToggle({ source, onSaved }: { source: SourceStatus; onSaved: (s: SourceDetail) => void }) {
  const save = useAction();
  const toggle = async () => {
    const res = await save.run(() =>
      api("updateSource", { params: { sourceId: source.id }, body: { active: !source.active } }),
    );
    if (res.ok) {
      onSaved(res.value);
      toast.success(source.active ? `Coleta de ${source.name} pausada` : `Coleta de ${source.name} retomada`);
    }
  };
  return (
    <div className="grid max-w-64 justify-items-end gap-1.5">
      <Button variant="outline" size="sm" onClick={toggle} disabled={save.pending}>
        {save.pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {source.active ? "Pausar" : "Retomar"}
        <span className="sr-only"> {source.name}</span>
      </Button>
      <ProblemNote error={save.error} />
    </div>
  );
}

function TierSelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <Select name="tier" defaultValue={defaultValue}>
      <SelectTrigger id={id} className="w-full data-[size=default]:h-9">
        <SelectValue placeholder="Escolha o nível da fonte…" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {Object.entries(TIER).map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function IntervalSelect({ id, defaultValue }: { id: string; defaultValue: number }) {
  return (
    <Select name="interval" defaultValue={String(defaultValue)}>
      <SelectTrigger id={id} className="w-full data-[size=default]:h-9">
        <SelectValue placeholder="Escolha a frequência…" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {[...new Set([...INTERVALS, defaultValue])]
            .sort((a, b) => a - b)
            .map((m) => (
              <SelectItem key={m} value={String(m)}>
                {intervalLabel(m)}
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function NewSourceForm({ onCancel }: { onCancel: () => void }) {
  const create = useAction();
  const navigate = useNavigate();
  const [kind, setKind] = useState("rss");
  const listing = kind === "web_list";
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await create.run(() =>
      api("createSource", {
        body: {
          name: String(f.get("name") ?? ""),
          kind: listing ? "web_list" : "rss",
          feedUrl: String(f.get("feedUrl") ?? ""),
          ...(listing && f.get("linkPrefix") && { linkPrefix: String(f.get("linkPrefix")) }),
          tier: String(f.get("tier")) as "T1" | "T1_5" | "T2",
          intervalMinutes: Number(f.get("interval")),
        },
      }),
    );
    if (res.ok) {
      toast.success("Fonte cadastrada", { description: "A primeira coleta entra na próxima execução do worker." });
      navigate(`/admin/fontes/${res.value.id}`);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-6 px-4 pb-6" aria-label="Nova fonte">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="nova-fonte-nome">Nome</FieldLabel>
          <Input
            id="nova-fonte-nome"
            name="name"
            placeholder="Ex.: Blog de engenharia da Atlas AI…"
            required
            minLength={3}
            maxLength={120}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="nova-fonte-tipo">Tipo</FieldLabel>
          <KindSelect id="nova-fonte-tipo" value={kind} onChange={setKind} />
        </Field>
        <Field>
          <FieldLabel htmlFor="nova-fonte-feed">{listing ? "Endereço da listagem" : "Endereço do feed"}</FieldLabel>
          <Input
            id="nova-fonte-feed"
            name="feedUrl"
            type="url"
            className="h-9"
            required
            placeholder={listing ? "https://exemplo.com/blog…" : "https://exemplo.com/feed.xml…"}
            aria-describedby="nova-fonte-feed-ajuda"
          />
          <FieldDescription id="nova-fonte-feed-ajuda">
            {listing
              ? "A página que lista os artigos. De cada artigo novo só são lidos título, descrição e data. Endereços de rede interna são recusados."
              : "Endereços de rede interna são recusados."}
          </FieldDescription>
        </Field>
        {listing && (
          <Field>
            <FieldLabel htmlFor="nova-fonte-prefixo">Prefixo dos links (opcional)</FieldLabel>
            <Input
              id="nova-fonte-prefixo"
              name="linkPrefix"
              type="url"
              className="h-9"
              placeholder="https://exemplo.com/blog/…"
              aria-describedby="nova-fonte-prefixo-ajuda"
            />
            <FieldDescription id="nova-fonte-prefixo-ajuda">
              {PREFIX_HELP} Em branco, vale o próprio endereço da listagem.
            </FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="nova-fonte-nivel">Nível da fonte</FieldLabel>
          <TierSelect id="nova-fonte-nivel" defaultValue="T2" />
        </Field>
        <Field>
          <FieldLabel htmlFor="nova-fonte-intervalo">Coletar a cada</FieldLabel>
          <IntervalSelect id="nova-fonte-intervalo" defaultValue={60} />
        </Field>
      </FieldGroup>
      <ProblemNote error={create.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={create.pending}>
          {create.pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          Cadastrar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function NoAccess() {
  return (
    <Page title="Administração">
      <p className="text-sm text-muted-foreground">
        Esta área é da curadoria e da administração. Seu perfil não tem acesso.
      </p>
    </Page>
  );
}

/** Key figures and the curation funnel, summed over every source. Every value comes from the API. */
function Overview({ rows }: { rows: SourceStatus[] }) {
  const sum = (f: (s: SourceStatus) => number) => rows.reduce((n, s) => n + f(s), 0);
  const collected = sum((s) => Object.values(s.items).reduce((a, b) => a + b, 0));
  // Neutral stages, orange only on the outcome: the funnel reads as data, not as an orange wall.
  const quiet = "color-mix(in oklab, var(--muted-foreground) 55%, var(--card))";
  const stages = [
    { label: "Coletados", value: collected, color: quiet },
    { label: "Avaliados", value: collected - sum((s) => s.items.pending + s.items.archived), color: quiet },
    { label: "Selecionados", value: sum((s) => s.items.selected), color: quiet },
    { label: "Publicados", value: sum((s) => s.published) },
  ];
  const failed = sum((s) => s.items.failed);
  const figures = [
    { label: "Fontes ativas", value: rows.filter((s) => s.active).length, of: rows.length },
    { label: "Publicadas", value: sum((s) => s.published) },
    { label: "Em revisão", value: sum((s) => s.underReview) },
    { label: "Falhas", value: failed, alert: failed > 0 },
  ];
  const still = reducedMotion();
  return (
    <>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col gap-1 bg-card px-4 py-4 sm:px-5">
            <dt className="text-sm text-muted-foreground">{f.label}</dt>
            <dd
              className={cn(
                "flex items-baseline gap-1.5 text-[1.75rem] leading-tight font-bold tracking-[-0.03em]",
                f.alert && "text-destructive",
              )}
            >
              <CountUp to={f.value} separator="." duration={1.2} />
              {f.of !== undefined && (
                <span className="tabular text-sm font-normal tracking-normal text-muted-foreground">de {f.of}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Section title="Funil da curadoria">
        <figure className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
          {collected > 0 ? (
            <div aria-hidden="true">
              <FunnelChart
                data={stages}
                color="var(--brand)"
                edges="curved"
                formatValue={number}
                staggerDelay={still ? 0 : 0.12}
                enterTransition={still ? { duration: 0 } : undefined}
                className="h-44 sm:h-52"
                style={{ aspectRatio: "auto" }}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum item coletado ainda.</p>
          )}
          <figcaption className="text-xs text-muted-foreground">
            <span className="sr-only">{stages.map((s) => `${s.label}: ${number(s.value)}`).join("; ")}. </span>
            Soma de todas as fontes. Avaliados não inclui itens na fila nem os arquivados por idade.
          </figcaption>
        </figure>
      </Section>
    </>
  );
}

function SourcesTable({ rows, onSaved }: { rows: SourceStatus[]; onSaved: () => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Fonte</TableHead>
          <TableHead className="hidden sm:table-cell">Estado</TableHead>
          <TableHead className="hidden text-right md:table-cell">Publicadas</TableHead>
          <TableHead className="hidden text-right md:table-cell">Em revisão</TableHead>
          <TableHead className="hidden text-right md:table-cell">Falhas</TableHead>
          <TableHead>
            <span className="sr-only">Ação</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="min-w-56 py-3.5 align-top whitespace-normal">
              <p className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/admin/fontes/${s.id}`}
                  className="font-medium text-foreground hover:text-brand-text hover:underline"
                >
                  {s.name}
                </Link>
                <span className="sm:hidden">
                  <Health s={s} />
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.kind === "submission" ? (
                  <>
                    {SUBMISSIONS} · {TIER[s.tier]}
                  </>
                ) : (
                  <>
                    {TIER[s.tier]}
                    {s.kind === "web_list" && " · listagem sem feed"} · a cada {intervalLabel(s.intervalMinutes)} ·
                    última coleta {s.lastSuccessAt ? <Time iso={s.lastSuccessAt} /> : "nunca"}
                  </>
                )}
              </p>
              <p className="tabular mt-1 text-xs text-muted-foreground">
                <span className="md:hidden">
                  {plural(s.published, "publicada", "publicadas")} · {s.underReview} em revisão ·{" "}
                </span>
                {s.items.notSelected} abaixo do limiar · {s.items.rejected} rejeitadas · {s.items.archived} arquivadas
                {s.items.failed > 0 && (
                  <span className="text-destructive md:hidden"> · {plural(s.items.failed, "falha", "falhas")}</span>
                )}
              </p>
              {s.lastError && <p className="mt-1 text-xs text-destructive">Último erro: {s.lastError}</p>}
            </TableCell>
            <TableCell className="hidden py-3.5 align-top sm:table-cell">
              <Health s={s} />
            </TableCell>
            <TableCell className="tabular hidden py-3.5 text-right align-top md:table-cell">{s.published}</TableCell>
            <TableCell className="tabular hidden py-3.5 text-right align-top md:table-cell">{s.underReview}</TableCell>
            <TableCell
              className={cn(
                "tabular hidden py-3.5 text-right align-top md:table-cell",
                s.items.failed > 0 && "font-medium text-destructive",
              )}
            >
              {s.items.failed}
            </TableCell>
            <TableCell className="py-3 text-right align-top whitespace-normal">
              <ActiveToggle source={s} onSaved={onSaved} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Admin() {
  const me = useMe();
  const sources = useApi("sourceStatus", {}, me.can.moderate);
  const [creating, setCreating] = useState(false);
  if (!me.can.moderate) return <NoAccess />;
  return (
    <Page
      title="Administração"
      subtitle="Fontes, saúde da coleta e o que a curadoria automática fez com cada item."
      actions={
        me.can.administer && (
          <Sheet open={creating} onOpenChange={setCreating}>
            <SheetTrigger asChild>
              <Button>
                <Plus data-icon="inline-start" />
                Nova fonte
              </Button>
            </SheetTrigger>
            <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
              <SheetHeader className="pr-12">
                <SheetTitle className="text-lg font-semibold tracking-[-0.015em]">Nova fonte</SheetTitle>
                <SheetDescription>
                  Só feeds RSS ou Atom. O Opt News guarda título, trecho do feed e link — nunca o texto integral — até
                  que a fonte tenha base legal para mais (Q-02).
                </SheetDescription>
              </SheetHeader>
              <NewSourceForm onCancel={() => setCreating(false)} />
            </SheetContent>
          </Sheet>
        )
      }
    >
      <Async q={sources} what="as fontes" lines={4} empty={(rows) => rows.length === 0 && "Nenhuma fonte cadastrada."}>
        {(rows) => (
          <div className="flex flex-col gap-10">
            <Overview rows={rows} />
            <Section title="Fontes">
              <SourcesTable rows={rows} onSaved={() => sources.reload()} />
            </Section>
          </div>
        )}
      </Async>
    </Page>
  );
}

function ConfigForm({
  source,
  canAdmin,
  onSaved,
}: {
  source: SourceDetail;
  canAdmin: boolean;
  onSaved: (s: SourceDetail) => void;
}) {
  const save = useAction();
  const feed = source.kind !== "submission";
  const listing = source.kind === "web_list";
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = canAdmin
      ? {
          intervalMinutes: Number(f.get("interval")),
          name: String(f.get("name") ?? ""),
          ...(feed && { feedUrl: String(f.get("feedUrl") ?? "") }),
          ...(listing && { linkPrefix: String(f.get("linkPrefix") ?? "") }),
          tier: String(f.get("tier")) as "T1" | "T1_5" | "T2",
        }
      : { intervalMinutes: Number(f.get("interval")) };
    const res = await save.run(() => api("updateSource", { params: { sourceId: source.id }, body }));
    if (res.ok) {
      onSaved(res.value);
      toast.success("Alterações salvas");
    }
  };
  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
      <FieldGroup>
        {canAdmin && (
          <>
            <Field>
              <FieldLabel htmlFor="fonte-nome">Nome</FieldLabel>
              <Input
                id="fonte-nome"
                name="name"
                placeholder="Ex.: Blog de engenharia da Atlas AI…"
                defaultValue={source.name}
                required
                minLength={3}
                maxLength={120}
              />
            </Field>
            {feed && (
              <Field>
                <FieldLabel htmlFor="fonte-feed">{listing ? "Endereço da listagem" : "Endereço do feed"}</FieldLabel>
                <Input
                  id="fonte-feed"
                  name="feedUrl"
                  type="url"
                  placeholder={listing ? "https://exemplo.com/blog…" : "https://exemplo.com/feed.xml…"}
                  defaultValue={source.feedUrl}
                  required
                  aria-describedby="fonte-feed-ajuda"
                />
                <FieldDescription id="fonte-feed-ajuda">
                  Trocar o endereço agenda uma nova coleta e limpa o último erro.
                </FieldDescription>
              </Field>
            )}
            {listing && (
              <Field>
                <FieldLabel htmlFor="fonte-prefixo">Prefixo dos links</FieldLabel>
                <Input
                  id="fonte-prefixo"
                  name="linkPrefix"
                  type="url"
                  placeholder="https://exemplo.com/blog/…"
                  defaultValue={source.linkPrefix ?? ""}
                  required
                  aria-describedby="fonte-prefixo-ajuda"
                />
                <FieldDescription id="fonte-prefixo-ajuda">{PREFIX_HELP}</FieldDescription>
              </Field>
            )}
          </>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          {canAdmin && (
            <Field>
              <FieldLabel htmlFor="fonte-nivel">Nível da fonte</FieldLabel>
              <TierSelect id="fonte-nivel" defaultValue={source.tier} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="fonte-intervalo">Coletar a cada</FieldLabel>
            <IntervalSelect id="fonte-intervalo" defaultValue={source.intervalMinutes} />
          </Field>
        </div>
      </FieldGroup>
      <ProblemNote error={save.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.pending}>
          {save.pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}

function RecentItems({ items }: { items: SourceDetail["recent"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Estado</TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Notas</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Coletado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((r) => {
          const st = ITEM_STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
          return (
            <TableRow key={r.id}>
              <TableCell className="py-3 align-top">
                <Pill tone={st.tone}>{st.label}</Pill>
              </TableCell>
              <TableCell className="min-w-56 py-3 align-top whitespace-normal">
                <p className="text-sm text-foreground">
                  {r.storyId ? (
                    <Link to={`/noticias/${r.storyId}`} className="hover:text-brand-text hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    r.title
                  )}
                </p>
                {r.error && <p className="mt-0.5 text-xs text-muted-foreground">Motivo: {r.error}</p>}
                <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <ExternalLink href={r.url} className="link">
                    Original
                  </ExternalLink>
                  <span className="sm:hidden">
                    {r.scores && (
                      <span className="tabular">
                        notas {r.scores[0]} e {r.scores[1]} ·{" "}
                      </span>
                    )}
                    coletado <Time iso={r.observedAt} />
                  </span>
                </p>
              </TableCell>
              <TableCell className="tabular hidden py-3 text-right align-top sm:table-cell">
                {r.scores ? `${r.scores[0]} e ${r.scores[1]}` : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="hidden py-3 text-right align-top text-muted-foreground sm:table-cell">
                <Time iso={r.observedAt} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function SourcePage() {
  const me = useMe();
  const { sourceId = "" } = useParams();
  const source = useApi("getSource", { params: { sourceId } }, me.can.moderate);
  if (!me.can.moderate) return <NoAccess />;
  return (
    <Async q={source} what="a fonte" lines={6}>
      {(s) => (
        <Page
          title={s.name}
          subtitle={`${TIER[s.tier]} · limiar ${s.threshold} · ${plural(s.published, "notícia publicada", "notícias publicadas")}`}
          rail={
            <Section title="Estado">
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Health s={s} />
                  <ActiveToggle source={s} onSaved={(next) => source.setData(() => next)} />
                </div>
                <Facts>
                  <Fact term="Última tentativa">{s.lastAttemptAt ? formatDateTime(s.lastAttemptAt) : "nunca"}</Fact>
                  <Fact term="Último sucesso">{s.lastSuccessAt ? formatDateTime(s.lastSuccessAt) : "nunca"}</Fact>
                </Facts>
                {s.lastError && <p className="text-destructive">Último erro: {s.lastError}</p>}
                <p className="text-xs text-muted-foreground">
                  Política de conteúdo: título, {s.kind === "rss" ? "trecho do feed" : "descrição da prévia"} e link
                  (texto integral não é armazenado).
                </p>
                {s.kind === "submission" ? (
                  <p className="text-muted-foreground">{SUBMISSIONS}. Não há feed para abrir.</p>
                ) : (
                  <ExternalLink href={s.feedUrl}>
                    {s.kind === "web_list" ? "Abrir a listagem" : "Abrir o feed"}
                  </ExternalLink>
                )}
              </div>
            </Section>
          }
        >
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-6">
            <Link to="/admin">
              <ArrowLeft data-icon="inline-start" />
              Todas as fontes
            </Link>
          </Button>
          <Section title="Configuração">
            <ConfigForm source={s} canAdmin={me.can.administer} onSaved={(next) => source.setData(() => next)} />
          </Section>
          <Section title="Itens recentes" className="mt-12">
            {s.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {s.kind === "submission"
                  ? "Nenhuma indicação recebida ainda."
                  : `Nada coletado ainda. A próxima execução do worker busca ${s.kind === "web_list" ? "a listagem" : "o feed"}.`}
              </p>
            ) : (
              <RecentItems items={s.recent} />
            )}
          </Section>
        </Page>
      )}
    </Async>
  );
}
