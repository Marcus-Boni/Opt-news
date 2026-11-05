// Notícia: source facts (headline, byline, original link) kept apart from machine text (summary, selection reason),
// which always carries the IA mark; then what the team did with it (the chevron chain) and the full provenance.
import type { StoryDetail } from "@optnews/contracts";
import { ArrowUpRight, BookOpen, BookOpenText, CalendarPlus, MessageSquare } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Link } from "@/link";
import { cn } from "@/lib/utils";
import { type ChainStep, ValueChain } from "@/components/value-chain";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import CountUp from "@/components/CountUp";
import { DateTimePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, useAction, useApi } from "../api.ts";
import { Discussion } from "../discussion.tsx";
import {
  formatDateTime,
  INSIGHT_STATUS,
  isoToSaoPauloInput,
  LANGUAGE,
  PROPOSAL_STATUS,
  PROVIDER_LABEL,
  plural,
  saoPauloInputToIso,
} from "../format.ts";
import { useMe } from "../session.tsx";
import { StatusPill, useTopics } from "../story-card.tsx";
import {
  AiTag,
  Dot,
  ErrorState,
  ExternalLink,
  Fact,
  Facts,
  Loading,
  Notice,
  ProblemNote,
  Section,
  Time,
  Trail,
  useScrollToHash,
} from "../ui.tsx";

/** The score bar fills from zero on arrival (one transform transition), so the number and the bar land together. */
function ScoreBar({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);
  return (
    <Progress value={shown} className="mt-2 h-1.5" aria-label={`Pontuação editorial: ${Math.round(score)} de 100`} />
  );
}

const scoreWord = (n: number) => (n >= 80 ? "alta" : n >= 60 ? "moderada" : "baixa");

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ProposeForm({
  story,
  onCreated,
  onCancel,
}: {
  story: StoryDetail;
  onCreated: (p: { id: string; title: string }) => void;
  onCancel: () => void;
}) {
  const create = useAction();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const closes = String(f.get("closes") ?? "");
    const res = await create.run(() =>
      api("createProposal", {
        body: {
          title: String(f.get("title") ?? ""),
          rationale: String(f.get("rationale") ?? ""),
          storyId: story.id,
          votingClosesAt: closes ? saoPauloInputToIso(closes) : undefined,
        },
      }),
    );
    if (res.ok) onCreated(res.value);
  };
  return (
    <Card>
      <form onSubmit={submit} aria-labelledby="propor-titulo">
        <CardHeader>
          <CardTitle id="propor-titulo">Propor meetup a partir desta notícia</CardTitle>
          <CardDescription>A pauta fica ligada à notícia e abre para votação do time.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="propor-title">Título da pauta</FieldLabel>
              <Input
                id="propor-title"
                name="title"
                required
                minLength={5}
                maxLength={160}
                placeholder="Ex.: Onde colocar a aprovação humana nos nossos agentes…"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="propor-rationale">Por que discutir com o time</FieldLabel>
              <Textarea
                id="propor-rationale"
                name="rationale"
                required
                minLength={10}
                maxLength={2000}
                className="min-h-24"
                placeholder="O que queremos entender, decidir ou testar…"
              />
              <FieldDescription>Mínimo de 10 caracteres.</FieldDescription>
            </Field>
            <Field className="sm:max-w-xs">
              <FieldLabel htmlFor="propor-closes">Votação aberta até (opcional)</FieldLabel>
              <DateTimePicker
                id="propor-closes"
                name="closes"
                min={isoToSaoPauloInput(Date.now())}
                placeholder="Sem data: prazo padrão…"
                defaultTime="18:00"
              />
              <FieldDescription>Horário de Brasília. Sem data, vale o prazo padrão (até 90 dias).</FieldDescription>
            </Field>
            <ProblemNote error={create.error} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 gap-2">
          <Button type="submit" disabled={create.pending}>
            {create.pending && <Spinner data-icon="inline-start" />}
            {create.pending ? "Enviando…" : "Abrir votação da pauta"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/** The story's place on the chain, from what is linked to it. The meetup step is "selected for a meetup": the
 * story detail does not carry sessions, so the chain never claims one happened. */
function chainOf(s: StoryDetail): ChainStep[] {
  const open = s.proposals.filter((p) => p.status === "open");
  const selected = s.proposals.filter((p) => p.status === "selected");
  const lead = selected[0] ?? open[0] ?? s.proposals[0];
  return [
    {
      key: "noticia",
      label: "Notícia",
      state: "done",
      detail: s.status === "published" ? "Publicada pela curadoria" : (STORY_STATE[s.status] ?? s.status),
    },
    {
      key: "pauta",
      label: "Pauta",
      state: selected.length > 0 ? "done" : open.length > 0 ? "active" : s.proposals.length > 0 ? "done" : "ahead",
      detail:
        open.length > 0
          ? `Em votação · ${plural(
              open.reduce((n, p) => n + p.votes, 0),
              "voto",
              "votos",
            )}`
          : s.proposals.length > 0
            ? plural(s.proposals.length, "pauta proposta", "pautas propostas")
            : "Nenhuma pauta ainda",
      to: lead ? `/meetups?aba=propostas#pauta-${lead.id}` : undefined,
    },
    {
      key: "meetup",
      label: "Meetup",
      state: selected.length > 0 ? (s.insights.length > 0 ? "done" : "active") : "ahead",
      detail: selected.length > 0 ? "Pauta selecionada para meetup" : "Depende de uma pauta selecionada",
      to: selected.length > 0 ? "/meetups?aba=agenda" : undefined,
    },
    {
      key: "insight",
      label: "Insight",
      state: s.insights.length > 0 ? "done" : "ahead",
      detail:
        s.insights.length > 0
          ? plural(s.insights.length, "insight registrado", "insights registrados")
          : "Nenhum ainda",
      to: s.insights[0] ? `/conhecimento/${s.insights[0].id}` : undefined,
    },
  ];
}

const STORY_STATE: Record<string, string> = { under_review: "Em revisão editorial", retracted: "Retirada" };

/** Reading mode: one centered column at a larger size, the context rail out of the way. Remembered per viewer. */
function useReadingMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem("optnews-reading") === "1";
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem("optnews-reading", next ? "1" : "0");
    } catch {
      // Storage blocked: the mode still applies for this visit.
    }
  };
  return [on, set];
}

export function StoryPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const { label } = useTopics();
  const story = useApi("getStory", { params: { id } });
  const [proposing, setProposing] = useState(false);
  const [reading, setReading] = useReadingMode();
  useScrollToHash(story.data !== undefined);

  if (!story.data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-10">
        {story.error ? (
          <ErrorState error={story.error} what="esta notícia" onRetry={story.reload} />
        ) : (
          <Loading shape="article" label="Carregando notícia…" />
        )}
      </div>
    );
  }

  const s = story.data;
  const retracted = s.status === "retracted";
  const canAct = me.can.contribute && !retracted;
  const score = s.editorialScore;

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-10">
      <title>{`${s.headline} · Opt News`}</title>
      <Breadcrumb className="mb-5" data-reveal>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/explorar">Explorar</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {s.topics.map((t) => (
            <span key={t} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild className="font-medium text-brand-text">
                  <Link to={`/explorar?tema=${encodeURIComponent(t)}`}>{label(t)}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* The headline is the shared element of the list → story transition, so it is not part of the arrival. */}
      <header className="max-w-3xl">
        <h1 className="vt-story-title text-[2rem] leading-[1.1] font-bold tracking-[-0.035em] text-balance sm:text-[2.75rem]">
          {s.headline}
        </h1>
        {s.status !== "published" && (
          <div data-reveal className="mt-4 flex flex-col items-start gap-2">
            <StatusPill status={s.status} />
            {s.status === "under_review" && (
              <Notice tone="neutral">
                Em revisão editorial: visível apenas para a curadoria até ser publicada ou descartada.
              </Notice>
            )}
            {retracted && (
              <Notice>
                Notícia retirada{s.retractedAt ? ` em ${formatDateTime(s.retractedAt)}` : ""}. O resumo foi removido;
                fonte, proveniência e discussão permanecem para registro.
              </Notice>
            )}
          </div>
        )}
        <div data-reveal className="mt-6 flex flex-col gap-1.5 text-sm">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-semibold">{s.source.name}</span>
            <Dot />
            <span className="text-muted-foreground">
              {s.originalPublishedAt ? (
                <>
                  Publicado em <Time iso={s.originalPublishedAt} full />
                </>
              ) : (
                "Data de publicação não informada pela fonte"
              )}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground">
            <span>
              Coletado em <time dateTime={s.firstSeenAt}>{formatDateTime(s.firstSeenAt)}</time>
            </span>
            <Dot />
            <span>{LANGUAGE[s.language] ?? s.language}</span>
          </p>
        </div>
        {/* Long source hosts wrap instead of pushing the page sideways on a phone. */}
        <Button
          asChild
          data-reveal
          variant="outline"
          className="mt-5 h-auto min-h-9 max-w-full shrink py-2 whitespace-normal"
        >
          <a href={s.originalUrl} target="_blank" rel="noopener noreferrer">
            Ler na fonte original ({hostOf(s.originalUrl)})
            <ArrowUpRight data-icon="inline-end" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        </Button>
        <Button
          type="button"
          data-reveal
          variant="ghost"
          aria-pressed={reading}
          onClick={() => setReading(!reading)}
          className="mt-5 ml-2 aria-pressed:bg-muted"
        >
          <BookOpenText data-icon="inline-start" />
          {reading ? "Sair do modo leitura" : "Modo leitura"}
        </Button>
      </header>

      <section aria-labelledby="caminho" data-reveal className="surface mt-9 rounded-2xl px-5 py-5 sm:px-6">
        <h2 id="caminho" className="mb-4 text-sm font-semibold text-muted-foreground">
          Caminho desta notícia
        </h2>
        <ValueChain label="Onde esta notícia está no caminho até o conhecimento" steps={chainOf(s)} />
      </section>

      <Separator className="my-9" />

      <div
        className={cn(
          "grid gap-x-14 gap-y-12",
          reading ? "mx-auto max-w-[42rem]" : "xl:grid-cols-[minmax(0,1fr)_19rem] xl:grid-rows-[auto_1fr]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-9">
          {s.summary ? (
            <section aria-labelledby="resumo" className="max-w-[44rem]" data-reveal>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="resumo" className="text-base font-semibold">
                  Resumo
                </h2>
                {s.aiGenerated ? <AiTag /> : <span className="text-xs text-muted-foreground">Resumo editorial</span>}
              </div>
              <p
                className={cn(
                  "plain text-foreground",
                  reading ? "text-[1.3125rem] leading-[1.75]" : "text-[1.125rem] leading-[1.7]",
                )}
              >
                {s.summary}
              </p>
              {s.aiGenerated && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Escrito automaticamente pela curadoria a partir do trecho da fonte; não é texto da fonte nem de um
                  colega. Confirme os fatos no original antes de citar.
                </p>
              )}
            </section>
          ) : (
            !retracted && (
              <p className="text-sm text-muted-foreground">
                A curadoria não gerou resumo para esta notícia. Leia a fonte original.
              </p>
            )
          )}

          {s.selectionReason && !retracted && (
            <section
              aria-labelledby="por-que"
              className="max-w-[44rem] rounded-2xl bg-ai-soft/60 px-5 py-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ai)_20%,transparent)]"
              data-reveal
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <h2 id="por-que" className="text-sm font-semibold">
                  Por que foi selecionada
                </h2>
                <AiTag />
              </div>
              <p className="plain text-[0.9375rem] leading-relaxed text-muted-foreground">{s.selectionReason}</p>
            </section>
          )}

          {canAct ? (
            <div className="flex flex-col gap-4" data-reveal>
              <div className="flex flex-wrap gap-2">
                <Button aria-expanded={proposing} onClick={() => setProposing((v) => !v)}>
                  <CalendarPlus data-icon="inline-start" />
                  Propor meetup
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/conhecimento/novo?story=${s.id}`}>
                    <BookOpen data-icon="inline-start" />
                    Registrar insight
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <a href="#discussao">
                    <MessageSquare data-icon="inline-start" />
                    Comentar
                  </a>
                </Button>
              </div>
              {proposing && (
                <ProposeForm
                  story={s}
                  onCancel={() => setProposing(false)}
                  onCreated={(p) => {
                    setProposing(false);
                    toast.success(`Pauta “${p.title}” aberta para votação`, {
                      action: {
                        label: "Ver em Meetups",
                        onClick: () => navigate(`/meetups?aba=propostas#pauta-${p.id}`),
                      },
                    });
                    story.setData((d) => ({
                      ...d,
                      proposals: [{ id: p.id, title: p.title, status: "open", votes: 0 }, ...d.proposals],
                    }));
                  }}
                />
              )}
            </div>
          ) : (
            !me.can.contribute && (
              <p className="text-sm text-muted-foreground">
                Seu perfil é somente leitura: você pode ler e acompanhar, sem propor ou comentar.
              </p>
            )
          )}
        </div>

        <aside
          hidden={reading}
          aria-label="Relevância, desdobramentos e proveniência"
          // Below xl the rail drops under the discussion: on a phone the conversation comes right after the summary.
          data-rail
          className="flex min-w-0 flex-col gap-5 max-xl:order-last xl:col-start-2 xl:row-span-2 xl:row-start-1"
        >
          <Section title="Relevância">
            <div className="flex flex-col gap-5 text-sm">
              <div>
                <p className="text-muted-foreground">Pontuação editorial automática</p>
                {score === null ? (
                  <p className="mt-1">Não informada</p>
                ) : (
                  <>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="tabular text-3xl font-bold tracking-[-0.03em] text-brand-text">
                        <CountUp to={Math.round(score)} duration={1} />
                      </span>
                      <span className="text-muted-foreground">de 100 · {scoreWord(score)}</span>
                    </p>
                    <ScoreBar score={score} />
                  </>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Estimativa automática de importância editorial. Indica prioridade de leitura, não certeza dos fatos.
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Relevância para a Optsolv</p>
                {s.optsolvRelevanceScore === null ? (
                  <>
                    <p className="mt-1 font-semibold">Não calibrado</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A curadoria ainda não aprovou um critério interno; nenhum número é exibido até lá.
                    </p>
                  </>
                ) : (
                  <p className="mt-1">
                    <span className="tabular text-lg font-semibold">{s.optsolvRelevanceScore}</span>
                    <span className="text-muted-foreground"> de 100 (critério interno)</span>
                  </p>
                )}
              </div>
            </div>
          </Section>

          {s.event && s.event.stories.length > 1 && (
            <Section
              title="Mesmo acontecimento"
              action={
                <Button asChild variant="link" size="sm" className="text-xs">
                  <Link to={`/acontecimentos/${s.event.id}`}>Linha do tempo</Link>
                </Button>
              }
            >
              <Trail
                label="Coberturas do mesmo acontecimento"
                items={s.event.stories.map((c) => ({
                  key: c.id,
                  title: c.headline,
                  to: c.id === s.id ? undefined : `/noticias/${c.id}`,
                  current: c.id === s.id,
                  meta: `${c.source.name}${c.id === s.id ? " · esta página" : ""}`,
                }))}
              />
            </Section>
          )}

          <Section title="Desdobramentos">
            <Trail
              label="Desdobramentos desta notícia"
              items={[
                { key: s.id, title: s.headline, meta: "Notícia · esta página", current: true },
                ...s.proposals.map((p) => ({
                  key: p.id,
                  title: p.title,
                  to: `/meetups?aba=propostas#pauta-${p.id}`,
                  meta: `Pauta · ${PROPOSAL_STATUS[p.status] ?? p.status} · ${plural(p.votes, "voto", "votos")}`,
                })),
                ...s.insights.map((i) => ({
                  key: i.id,
                  title: i.title,
                  to: `/conhecimento/${i.id}`,
                  meta: `Insight · ${INSIGHT_STATUS[i.status] ?? i.status}`,
                })),
              ]}
            />
            {s.proposals.length + s.insights.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Nenhuma pauta ou insight ligado a esta notícia ainda.
              </p>
            )}
          </Section>

          <Section title="Proveniência">
            <Facts>
              <Fact term="Processo">{PROVIDER_LABEL[s.provenance.provider] ?? "Curadoria automática"}</Fact>
              <Fact term="Política editorial">
                {s.provenance.policyVersion ? (
                  <code className="font-mono text-[0.8125rem]">{s.provenance.policyVersion}</code>
                ) : (
                  <span className="text-muted-foreground">não informada</span>
                )}
              </Fact>
              <Fact term="Versão do modelo">
                {s.provenance.modelVersion ? (
                  <code className="font-mono text-[0.8125rem]">{s.provenance.modelVersion}</code>
                ) : (
                  <span className="text-muted-foreground">não informado</span>
                )}
              </Fact>
              <Fact term="Sincronizado em">
                <Time iso={s.provenance.syncedAt} full />
              </Fact>
              <Fact term="Evidências">
                {s.provenance.evidenceUrls.length === 0 ? (
                  <span className="text-muted-foreground">nenhuma informada</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {s.provenance.evidenceUrls.map((u) => (
                      <li key={u}>
                        <ExternalLink href={u}>{hostOf(u)}</ExternalLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Fact>
            </Facts>
          </Section>
        </aside>

        <div className="min-w-0 max-w-[44rem]">
          <Discussion
            targetType="story"
            targetId={s.id}
            writable={!retracted}
            closedNote="Notícia retirada: a discussão fica para registro, sem novos comentários."
          />
        </div>
      </div>
    </article>
  );
}
