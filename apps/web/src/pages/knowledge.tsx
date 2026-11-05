// Conhecimento: insights with the reference chain back to the news, proposals and meetups they came from.
import type { Insight } from "@optnews/contracts";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Link } from "@/link";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, useAction, useApi } from "../api.ts";
import { Discussion } from "../discussion.tsx";
import { hrefFor, INSIGHT_STATUS, plural, REF_LABEL, RELATION_LABEL } from "../format.ts";
import { useMe } from "../session.tsx";
import { Async, Dot, ErrorState, Loading, Page, Pill, ProblemNote, Section, Time, Trail } from "../ui.tsx";

type RefType = Insight["references"][number]["type"];
type Relation = Insight["references"][number]["relation"];

function StatusPill({ status }: { status: Insight["status"] }) {
  const tone = status === "accepted" ? "success" : status === "reviewing" ? "warning" : "neutral";
  return <Pill tone={tone}>{INSIGHT_STATUS[status] ?? status}</Pill>;
}

export function Library() {
  const me = useMe();
  const insights = useApi("listInsights");
  return (
    <Page
      title="Conhecimento"
      subtitle="Hipóteses, decisões e aprendizados do time, cada um ligado às notícias e meetups que o originaram."
      actions={
        me.can.contribute && (
          <Button asChild>
            <Link to="/conhecimento/novo">
              <Plus data-icon="inline-start" />
              Registrar insight
            </Link>
          </Button>
        )
      }
    >
      <div className="max-w-3xl">
        <Async
          q={insights}
          what="a biblioteca"
          lines={6}
          shape="rows"
          empty={(list) =>
            list.length === 0 &&
            "A biblioteca está vazia. Registre o primeiro insight a partir de uma notícia ou de um meetup."
          }
        >
          {(list) => (
            <ul className="divide-y">
              {list.map((i) => (
                // The title link stretches over the row, so the whole entry is one target with a short name.
                <li key={i.id} data-spotlight="fill" className="-mx-4 rounded-xl px-4 py-5">
                  <h2 className="text-[1.0625rem] leading-snug font-semibold tracking-[-0.015em]">
                    <Link
                      to={`/conhecimento/${i.id}`}
                      className="underline-offset-4 after:absolute after:inset-0 hover:underline"
                    >
                      {i.title}
                    </Link>
                  </h2>
                  <p className="plain mt-1.5 line-clamp-2 max-w-[68ch] text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {i.hypothesis}
                  </p>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <StatusPill status={i.status} />
                    <span>{i.author.displayName}</span>
                    <Dot />
                    <Time iso={i.createdAt} />
                    {i.references.length > 0 && (
                      <>
                        <Dot />
                        <span className="tabular">{plural(i.references.length, "referência", "referências")}</span>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
    </Page>
  );
}

interface RefDraft {
  type: RefType;
  id: string;
  relation: Relation;
}

const DEFAULT_RELATION: Record<RefType, Relation> = {
  story: "inspired_by",
  meetup: "discussed_in",
  proposal: "inspired_by",
  insight: "related",
};

export function NewInsight() {
  const navigate = useNavigate();
  const relationId = useId();
  const [params] = useSearchParams();
  const storyId = params.get("story") ?? "";
  const meetupId = params.get("meetup") ?? "";
  const proposalId = params.get("proposal") ?? "";
  const story = useApi("getStory", { params: { id: storyId } }, Boolean(storyId));
  const meetup = useApi("getMeetup", { params: { id: meetupId } }, Boolean(meetupId));
  // No single-proposal endpoint: find it in the list.
  const proposals = useApi("listProposals", {}, Boolean(proposalId));
  const create = useAction();
  const [refs, setRefs] = useState<RefDraft[]>(() =>
    (
      [
        ["story", storyId],
        ["meetup", meetupId],
        ["proposal", proposalId],
      ] as const
    )
      .filter(([, id]) => id)
      .map(([type, id]) => ({ type, id, relation: DEFAULT_RELATION[type] })),
  );

  const lookup: Record<RefType, { title?: string; error?: boolean }> = {
    story: { title: story.data?.headline, error: Boolean(story.error) },
    meetup: { title: meetup.data?.title, error: Boolean(meetup.error) },
    proposal: {
      title: proposals.data?.find((p) => p.id === proposalId)?.title,
      error: Boolean(proposals.error) || (proposals.data && !proposals.data.some((p) => p.id === proposalId)),
    },
    insight: {},
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    const res = await create.run(() =>
      api("createInsight", {
        body: {
          title: String(f.get("title") ?? ""),
          hypothesis: String(f.get("hypothesis") ?? ""),
          context: text("context"),
          applicability: text("applicability"),
          references: refs,
        },
      }),
    );
    if (res.ok) {
      toast.success("Insight registrado", { description: "Ele já aparece no Conhecimento, ligado às referências." });
      navigate(`/conhecimento/${res.value.id}`);
    }
  };

  return (
    <Page
      title="Registrar insight"
      crumbs={[{ to: "/conhecimento", label: "Conhecimento" }]}
      subtitle="Um aprendizado que o time pode reaproveitar: o que observamos, em que contexto e onde se aplica."
    >
      <form onSubmit={submit} className="max-w-2xl">
        <FieldGroup>
          <FieldSet className="min-w-0 gap-3">
            <FieldLegend variant="label">Origem</FieldLegend>
            {refs.length === 0 ? (
              <FieldDescription>
                Sem referência. Para ligar o insight a uma notícia ou meetup, use “Registrar insight” na página deles;
                assim o caminho fica rastreável.
              </FieldDescription>
            ) : (
              <ul className="flex flex-col gap-2">
                {refs.map((r, index) => {
                  const info = lookup[r.type];
                  const selectId = `${relationId}-${index}`;
                  return (
                    <li
                      key={`${r.type}-${r.id}`}
                      className="grid gap-3 surface rounded-xl p-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{REF_LABEL[r.type]}</p>
                        <p className="mt-0.5 leading-snug font-medium">
                          {info.title ??
                            (info.error ? (
                              <span className="text-destructive">Referência não encontrada ou sem acesso</span>
                            ) : (
                              <span className="text-muted-foreground">Carregando…</span>
                            ))}
                        </p>
                      </div>
                      <Field className="gap-1.5">
                        <FieldLabel htmlFor={selectId} className="text-xs">
                          Relação
                        </FieldLabel>
                        <Select
                          value={r.relation}
                          onValueChange={(value) =>
                            setRefs((all) =>
                              all.map((x, i) => (i === index ? { ...x, relation: value as Relation } : x)),
                            )
                          }
                        >
                          <SelectTrigger id={selectId} className="w-full">
                            <SelectValue placeholder="Escolha a relação…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {Object.entries(RELATION_LABEL).map(([value, text]) => (
                                <SelectItem key={value} value={value}>
                                  {text}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => setRefs((all) => all.filter((_, i) => i !== index))}
                      >
                        Remover
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="insight-titulo">Título</FieldLabel>
            <Input
              id="insight-titulo"
              name="title"
              required
              minLength={5}
              maxLength={160}
              placeholder="Ex.: Busca híbrida só compensa onde há siglas…"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="insight-hipotese">Hipótese ou aprendizado</FieldLabel>
            <Textarea
              id="insight-hipotese"
              name="hypothesis"
              aria-describedby="insight-hipotese-ajuda"
              placeholder="Ex.: Em bases com muitas siglas internas, a busca lexical acerta mais que a vetorial…"
              className="min-h-28"
              required
              minLength={10}
              maxLength={4000}
            />
            <FieldDescription id="insight-hipotese-ajuda">
              O que acreditamos ser verdade e como poderíamos verificar.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="insight-contexto">Contexto (opcional)</FieldLabel>
            <Textarea
              id="insight-contexto"
              name="context"
              placeholder="Em que projeto, dados ou situação isso apareceu…"
              className="min-h-20"
              maxLength={4000}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="insight-aplicacao">Onde se aplica (opcional)</FieldLabel>
            <Textarea
              id="insight-aplicacao"
              name="applicability"
              placeholder="Times, produtos ou clientes em que vale testar…"
              className="min-h-20"
              maxLength={4000}
            />
          </Field>
          <ProblemNote error={create.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={create.pending}>
              {create.pending ? "Registrando…" : "Registrar insight"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
          </div>
        </FieldGroup>
      </form>
    </Page>
  );
}

const CHAIN = ["story", "proposal", "meetup", "insight"];

export function InsightPage() {
  const { id = "" } = useParams();
  const insight = useApi("getInsight", { params: { id } });

  if (!insight.data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-10">
        {insight.error ? (
          <ErrorState error={insight.error} what="este insight" onRetry={insight.reload} />
        ) : (
          <Loading shape="article" label="Carregando insight…" />
        )}
      </div>
    );
  }

  const i = insight.data;
  return (
    <Page
      title={i.title}
      crumbs={[{ to: "/conhecimento", label: "Conhecimento" }]}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={i.status} />
          <span>
            Registrado por {i.author.displayName}, <Time iso={i.createdAt} full />
          </span>
        </span>
      }
      rail={
        <Section title="Cadeia de referências">
          <Trail
            label="De onde este insight veio"
            items={[
              // Always the canonical direction of the chain: news → agenda item → meetup → insight.
              ...[...i.references]
                .sort((a, b) => CHAIN.indexOf(a.type) - CHAIN.indexOf(b.type))
                .map((r) => ({
                  key: `${r.type}-${r.id}`,
                  title: r.title,
                  to: hrefFor(r.type, r.id),
                  meta: `${REF_LABEL[r.type] ?? r.type} · ${RELATION_LABEL[r.relation] ?? r.relation}`,
                })),
              { key: i.id, title: i.title, meta: "Insight · esta página", current: true },
            ]}
          />
          {i.references.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Registrado sem referências.</p>
          )}
        </Section>
      }
    >
      <div className="flex max-w-[44rem] flex-col gap-10">
        <Section id="hipotese" title="Hipótese">
          <p className="plain max-w-[68ch] text-[1.0625rem] leading-[1.65]">{i.hypothesis}</p>
        </Section>
        {i.context && (
          <Section id="contexto" title="Contexto">
            <p className="plain max-w-[68ch] leading-relaxed">{i.context}</p>
          </Section>
        )}
        {i.applicability && (
          <Section id="aplica" title="Onde se aplica">
            <p className="plain max-w-[68ch] leading-relaxed">{i.applicability}</p>
          </Section>
        )}
        <Discussion targetType="insight" targetId={i.id} />
      </div>
    </Page>
  );
}
