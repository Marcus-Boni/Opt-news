// One meetup before and after it happens: explicit state transitions (with revision control), materials, the
// post-meetup record and the knowledge it produced.
import type { MeetupDetail } from "@optnews/contracts";
import { toast } from "sonner";
import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, useAction, useApi } from "../api.ts";
import { Discussion } from "../discussion.tsx";
import { ARTIFACT_KIND, formatDateTime, INSIGHT_STATUS, relativeTime } from "../format.ts";
import { useMe } from "../session.tsx";
import {
  Dot,
  ErrorState,
  ExternalLink,
  Fact,
  Facts,
  Icon,
  Loading,
  Page,
  Pill,
  ProblemNote,
  Section,
  Time,
  Trail,
  type TrailItem,
  useScrollToHash,
} from "../ui.tsx";
import { SessionStatePill } from "../session-line.tsx";

type State = MeetupDetail["state"];

/** Organizer actions per state; mirrors the server's transition table (the server still decides). */
const NEXT: Record<State, { to: State; label: string }[]> = {
  draft: [
    { to: "scheduled", label: "Confirmar agendamento" },
    { to: "cancelled", label: "Cancelar sessão" },
  ],
  scheduled: [
    { to: "completed", label: "Marcar como realizada" },
    { to: "cancelled", label: "Cancelar sessão" },
  ],
  completed: [{ to: "documented", label: "Documentar o encontro" }],
  documented: [],
  cancelled: [],
};

function StateActions({
  meetup,
  onSaved,
  onReload,
}: {
  meetup: MeetupDetail;
  onSaved: (m: MeetupDetail) => void;
  onReload: () => void;
}) {
  const update = useAction();
  const [confirm, setConfirm] = useState<State | null>(null);
  const actions = NEXT[meetup.state];
  if (actions.length === 0) return null;

  const send = async (state: State, extra: { summary?: string; conclusions?: string } = {}) => {
    const res = await update.run(() =>
      api("updateMeetup", { params: { id: meetup.id }, body: { revision: meetup.revision, state, ...extra } }),
    );
    if (res.ok) {
      onSaved(res.value);
      setConfirm(null);
      toast.success("Sessão atualizada");
    }
  };

  const saveRecord = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await send("documented", {
      summary: String(f.get("summary") ?? ""),
      conclusions: String(f.get("conclusions") ?? ""),
    });
  };

  const reload = () => {
    update.clear();
    setConfirm(null);
    onReload();
  };

  return (
    <Section title="Organização">
      <Dialog open={confirm === "cancelled"} onOpenChange={(open) => setConfirm(open ? "cancelled" : null)}>
        {confirm === "documented" ? (
          <form onSubmit={saveRecord}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="registro-summary">Resumo do encontro</FieldLabel>
                <Textarea
                  id="registro-summary"
                  name="summary"
                  placeholder="O que foi apresentado, quem participou e o que se discutiu…"
                  className="min-h-28"
                  required
                  minLength={10}
                  maxLength={8000}
                  defaultValue={meetup.summary ?? ""}
                  aria-describedby="registro-summary-hint"
                />
                <FieldDescription id="registro-summary-hint">
                  O que foi apresentado e discutido. Mínimo de 10 caracteres.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="registro-conclusions">Conclusões</FieldLabel>
                <Textarea
                  id="registro-conclusions"
                  name="conclusions"
                  placeholder="Decisões, próximos passos e o que fica como aprendizado…"
                  className="min-h-28"
                  required
                  minLength={10}
                  maxLength={8000}
                  defaultValue={meetup.conclusions ?? ""}
                  aria-describedby="registro-conclusions-hint"
                />
                <FieldDescription id="registro-conclusions-hint">
                  Decisões, recomendações e próximos passos.
                </FieldDescription>
              </Field>
              <ProblemNote error={update.error} onReload={reload} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={update.pending}>
                  Salvar registro e documentar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
                  Cancelar
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {actions.map((a) =>
                a.to === "cancelled" ? (
                  <DialogTrigger key={a.to} asChild>
                    <Button type="button" variant="destructive" disabled={update.pending}>
                      {a.label}
                    </Button>
                  </DialogTrigger>
                ) : (
                  <Button
                    key={a.to}
                    type="button"
                    disabled={update.pending}
                    onClick={() => (a.to === "documented" ? setConfirm(a.to) : send(a.to))}
                  >
                    {a.label}
                  </Button>
                ),
              )}
            </div>
            {confirm !== "cancelled" && <ProblemNote error={update.error} onReload={reload} />}
          </div>
        )}
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Cancelar esta sessão?</DialogTitle>
            <DialogDescription>Ela deixa a agenda e não poderá ser reaberta.</DialogDescription>
          </DialogHeader>
          <ProblemNote error={update.error} onReload={reload} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button type="button" variant="destructive" disabled={update.pending} onClick={() => send("cancelled")}>
              Sim, cancelar sessão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function AddMaterial({ meetup, onSaved }: { meetup: MeetupDetail; onSaved: (m: MeetupDetail) => void }) {
  const add = useAction();
  const [open, setOpen] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const kind = String(f.get("kind")) as MeetupDetail["artifacts"][number]["kind"];
    const res = await add.run(() =>
      api("addArtifact", {
        params: { id: meetup.id },
        body: { kind, title: String(f.get("title") ?? ""), url: String(f.get("url") ?? "") },
      }),
    );
    if (res.ok) {
      onSaved(res.value);
      setOpen(false);
      toast.success("Material adicionado");
    }
  };
  if (!open) {
    return (
      <Button type="button" variant="secondary" className="mt-4" onClick={() => setOpen(true)}>
        <Icon name="plus" data-icon="inline-start" />
        Adicionar material
      </Button>
    );
  }
  return (
    <Card className="mt-4">
      <form onSubmit={submit} className="flex flex-col gap-(--card-spacing)">
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field>
                <FieldLabel htmlFor="material-kind">Tipo</FieldLabel>
                <Select name="kind" defaultValue="slides">
                  <SelectTrigger id="material-kind" className="w-full">
                    <SelectValue placeholder="Escolha o tipo…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(ARTIFACT_KIND).map(([value, text]) => (
                        <SelectItem key={value} value={value}>
                          {text}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="material-title">Título</FieldLabel>
                <Input
                  id="material-title"
                  name="title"
                  placeholder="Ex.: Slides da apresentação…"
                  required
                  minLength={3}
                  maxLength={200}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="material-url">Link (https)</FieldLabel>
              <Input
                id="material-url"
                name="url"
                type="url"
                required
                pattern="https://.*"
                placeholder="https://exemplo.com/material…"
                aria-describedby="material-url-hint"
              />
              <FieldDescription id="material-url-hint">
                Arquivos ficam no SharePoint/OneDrive; aqui vai só o link.
              </FieldDescription>
            </Field>
            <ProblemNote error={add.error} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={add.pending}>
            Adicionar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function MeetupPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const meetup = useApi("getMeetup", { params: { id } });
  const storyId = meetup.data?.proposal?.storyId ?? "";
  const story = useApi("getStory", { params: { id: storyId } }, Boolean(storyId));
  useScrollToHash(meetup.data !== undefined);

  if (!meetup.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        {meetup.error ? (
          <ErrorState error={meetup.error} what="este meetup" onRetry={meetup.reload} />
        ) : (
          <Loading lines={6} label="Carregando meetup…" />
        )}
      </div>
    );
  }

  const m = meetup.data;
  const save = (next: MeetupDetail) => meetup.setData(() => next);
  const canAddMaterial = (me.can.organize || me.id === m.responsible.id) && m.state !== "cancelled";

  const trail: TrailItem[] = [];
  if (m.proposal?.storyId) {
    trail.push({
      key: m.proposal.storyId,
      title: story.data?.headline ?? "Notícia de origem",
      to: `/noticias/${m.proposal.storyId}`,
      meta: "Notícia",
    });
  }
  if (m.proposal)
    trail.push({
      key: m.proposal.id,
      title: m.proposal.title,
      to: `/meetups?aba=propostas#pauta-${m.proposal.id}`,
      meta: "Pauta votada",
    });
  trail.push({ key: m.id, title: m.title, meta: "Meetup · esta página", current: true });
  for (const i of m.insights)
    trail.push({
      key: i.id,
      title: i.title,
      to: `/conhecimento/${i.id}`,
      meta: `Insight · ${INSIGHT_STATUS[i.status] ?? i.status}`,
    });

  return (
    <Page
      title={m.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <SessionStatePill state={m.state} />
          <span>
            {formatDateTime(m.scheduledStart)} ({relativeTime(m.scheduledStart)})
          </span>
        </span>
      }
      rail={
        <>
          <Section title="Origem e desdobramentos">
            <Trail label="Origem e desdobramentos do meetup" items={trail} />
            {!m.proposal && (
              <p className="mt-3 text-xs text-muted-foreground">Sessão criada manualmente, sem pauta de origem.</p>
            )}
          </Section>
          <Section title="Aprendizados">
            {m.insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum insight registrado a partir desta sessão.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {m.insights.map((i) => (
                  <li key={i.id} className="text-sm">
                    <Link to={`/conhecimento/${i.id}`} className="link">
                      {i.title}
                    </Link>{" "}
                    <Pill>{INSIGHT_STATUS[i.status] ?? i.status}</Pill>
                  </li>
                ))}
              </ul>
            )}
            {me.can.contribute && (
              <Button asChild variant="secondary" className="mt-4">
                <Link to={`/conhecimento/novo?meetup=${m.id}`}>
                  <Icon name="knowledge" data-icon="inline-start" />
                  Registrar aprendizado
                </Link>
              </Button>
            )}
          </Section>
        </>
      }
    >
      <div className="flex max-w-[44rem] flex-col gap-10">
        <Facts>
          <Fact term="Quando">{`${formatDateTime(m.scheduledStart)} · ${m.durationMinutes} min`}</Fact>
          <Fact term="Organização">{m.organizer.displayName}</Fact>
          <Fact term="Responsável">{m.responsible.displayName}</Fact>
          <Fact term="Reunião">
            {m.teamsUrl ? (
              <ExternalLink href={m.teamsUrl}>Entrar no Teams</ExternalLink>
            ) : (
              <span className="text-muted-foreground">link ainda não informado</span>
            )}
          </Fact>
        </Facts>

        <section aria-labelledby="sobre">
          <h2 id="sobre" className="mb-2.5 text-base font-semibold tracking-[-0.015em]">
            Sobre a sessão
          </h2>
          <p className="plain max-w-[68ch] text-[1.0625rem] leading-[1.65] text-foreground">{m.description}</p>
        </section>

        {(m.summary || m.conclusions) && (
          <section aria-labelledby="registro" className="flex flex-col gap-4">
            <h2 id="registro" className="text-base font-semibold tracking-[-0.015em]">
              Registro do encontro
            </h2>
            {m.summary && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Resumo</h3>
                <p className="plain mt-1 max-w-[68ch] leading-relaxed">{m.summary}</p>
              </div>
            )}
            {m.conclusions && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Conclusões</h3>
                <p className="plain mt-1 max-w-[68ch] leading-relaxed">{m.conclusions}</p>
              </div>
            )}
          </section>
        )}

        {me.can.organize && <StateActions meetup={m} onSaved={save} onReload={meetup.reload} />}

        <Section title={`Materiais (${m.artifacts.length})`}>
          {m.artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum material ainda. Slides, documentos e gravações entram aqui por link.
            </p>
          ) : (
            <ItemGroup className="gap-2">
              {m.artifacts.map((a) => (
                <Item key={a.id} role="listitem" variant="outline" size="sm">
                  <ItemMedia>
                    <Pill>{ARTIFACT_KIND[a.kind] ?? a.kind}</Pill>
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full">
                      <ExternalLink href={a.url}>{a.title}</ExternalLink>
                    </ItemTitle>
                    <ItemDescription className="text-xs">
                      {a.author.displayName} <Dot /> <Time iso={a.createdAt} />
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
          {canAddMaterial && <AddMaterial meetup={m} onSaved={save} />}
        </Section>

        <Discussion
          targetType="meetup"
          targetId={m.id}
          writable={m.state !== "cancelled"}
          closedNote="Sessão cancelada: sem novos comentários."
        />
      </div>
    </Page>
  );
}
