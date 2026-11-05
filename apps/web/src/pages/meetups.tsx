import { toast } from "sonner";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import SmoothTab from "@/components/kokonutui/smooth-tab";
import { DateTimePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, useAction, useApi } from "../api.ts";
import { isoToSaoPauloInput, saoPauloInputToIso } from "../format.ts";
import { ProposalItem } from "../proposal.tsx";
import { useMe } from "../session.tsx";
import { SessionLine } from "../session-line.tsx";
import { Async, Icon, Page, ProblemNote, useScrollToHash } from "../ui.tsx";

function ManualProposalForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
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
          votingClosesAt: closes ? saoPauloInputToIso(closes) : undefined,
        },
      }),
    );
    if (res.ok) {
      toast.success("Pauta aberta para votação");
      onCreated();
    }
  };
  return (
    <Card className="mb-8 max-w-2xl">
      <form onSubmit={submit} aria-labelledby="nova-pauta" className="flex flex-col gap-(--card-spacing)">
        <CardHeader>
          <CardTitle className="font-semibold">
            <h2 id="nova-pauta">Nova pauta</h2>
          </CardTitle>
          <CardDescription>
            Pautas que nascem de uma notícia ficam ligadas a ela; use “Propor meetup” na página da notícia para isso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pauta-title">Título</FieldLabel>
              <Input
                id="pauta-title"
                name="title"
                placeholder="Ex.: Como medir a confiabilidade dos nossos agentes…"
                required
                minLength={5}
                maxLength={160}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pauta-rationale">Por que discutir com o time</FieldLabel>
              <Textarea
                id="pauta-rationale"
                placeholder="O que queremos entender, decidir ou testar juntos…"
                name="rationale"
                className="min-h-24"
                required
                minLength={10}
                maxLength={2000}
              />
            </Field>
            <Field className="sm:max-w-xs">
              <FieldLabel htmlFor="pauta-closes">Votação aberta até (opcional)</FieldLabel>
              <DateTimePicker
                id="pauta-closes"
                name="closes"
                min={isoToSaoPauloInput(Date.now())}
                placeholder="Sem data: prazo padrão…"
                defaultTime="18:00"
                aria-describedby="pauta-closes-hint"
              />
              <FieldDescription id="pauta-closes-hint">
                Horário de Brasília. Sem data, vale o prazo padrão.
              </FieldDescription>
            </Field>
            <ProblemNote error={create.error} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={create.pending}>
            Abrir votação
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function Proposals({ startCreating = false }: { startCreating?: boolean }) {
  const me = useMe();
  const proposals = useApi("listProposals");
  // `?nova=1` (the command palette's "Nova pauta") opens the form right away.
  const [creating, setCreating] = useState(startCreating && me.can.contribute);
  useScrollToHash(proposals.data !== undefined);
  return (
    <>
      {me.can.contribute && !creating && (
        <Button type="button" className="mb-6" onClick={() => setCreating(true)}>
          <Icon name="plus" data-icon="inline-start" />
          Nova pauta
        </Button>
      )}
      {creating && (
        <ManualProposalForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            proposals.reload();
          }}
        />
      )}
      <div className="flex max-w-3xl flex-col gap-4">
        <Async
          q={proposals}
          what="as pautas"
          lines={6}
          shape="rows"
          empty={(list) =>
            list.length === 0 &&
            "Nenhuma pauta ainda. Proponha um meetup a partir de uma notícia ou crie uma pauta manual."
          }
        >
          {(list) =>
            list.map((p) => (
              <ProposalItem
                key={p.id}
                proposal={p}
                onChange={(next) => proposals.setData((all) => all.map((x) => (x.id === next.id ? next : x)))}
              />
            ))
          }
        </Async>
      </div>
    </>
  );
}

// Radix Select items cannot carry an empty value, so "no proposal" gets its own key.
const MANUAL = "manual";

function ScheduleForm({ proposalId, onCancel }: { proposalId: string; onCancel: () => void }) {
  const navigate = useNavigate();
  const selected = useApi("listProposals", { query: { status: "selected" } });
  const people = useApi("devPersonas");
  const create = useAction();
  const [pick, setPick] = useState(proposalId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const available = selected.data?.filter((p) => !p.sessionId) ?? [];
  const chosen = available.find((p) => p.id === pick);
  // Prefill from the chosen proposal until the organizer types their own text.
  const shownTitle = title || chosen?.title || "";
  const shownDescription = description || chosen?.rationale || "";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const teams = String(f.get("teams") ?? "").trim();
    const res = await create.run(() =>
      api("createMeetup", {
        body: {
          title: shownTitle,
          description: shownDescription,
          scheduledStart: saoPauloInputToIso(String(f.get("start") ?? "")),
          durationMinutes: Number(f.get("duration") ?? 60),
          responsibleId: String(f.get("responsible") ?? ""),
          proposalId: chosen?.id,
          teamsUrl: teams || undefined,
        },
      }),
    );
    if (res.ok) {
      toast.success("Sessão agendada", { description: "Ela já aparece na Agenda." });
      navigate(`/meetups/${res.value.id}`);
    }
  };

  return (
    <Card className="mb-8 max-w-2xl">
      <form onSubmit={submit} aria-labelledby="agendar" className="flex flex-col gap-(--card-spacing)">
        <CardHeader>
          <CardTitle className="font-semibold">
            <h2 id="agendar">Agendar sessão</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="agendar-origem">Origem</FieldLabel>
              <Select value={chosen?.id ?? MANUAL} onValueChange={(v) => setPick(v === MANUAL ? "" : v)}>
                <SelectTrigger id="agendar-origem" className="w-full">
                  <SelectValue placeholder="Escolha a pauta de origem…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={MANUAL}>Sessão manual (sem pauta)</SelectItem>
                    {available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        Pauta selecionada: {p.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selected.data && available.length === 0 && (
                <FieldDescription>Nenhuma pauta selecionada aguardando sessão.</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="agendar-title">Título</FieldLabel>
              <Input
                id="agendar-title"
                placeholder="Ex.: Aprovação humana em agentes, na prática…"
                value={shownTitle}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={5}
                maxLength={160}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="agendar-description">Descrição</FieldLabel>
              <Textarea
                id="agendar-description"
                placeholder="Formato, roteiro e o que cada pessoa deve trazer…"
                className="min-h-24"
                value={shownDescription}
                onChange={(e) => setDescription(e.target.value)}
                required
                minLength={10}
                maxLength={4000}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <Field>
                <FieldLabel htmlFor="agendar-start">Data e hora</FieldLabel>
                <DateTimePicker
                  id="agendar-start"
                  name="start"
                  required
                  min={isoToSaoPauloInput(Date.now())}
                  placeholder="Escolha o dia e o horário da sessão…"
                  defaultTime="16:00"
                  aria-describedby="agendar-start-hint"
                />
                <FieldDescription id="agendar-start-hint">Horário de Brasília.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="agendar-duration">Duração (min)</FieldLabel>
                <Input
                  id="agendar-duration"
                  placeholder="60…"
                  name="duration"
                  type="number"
                  className="tabular"
                  required
                  min={15}
                  max={480}
                  step={15}
                  defaultValue={60}
                />
              </Field>
            </div>
            {people.error ? (
              <Field>
                <FieldLabel htmlFor="agendar-responsible">Responsável pela sessão (identificador)</FieldLabel>
                <Input
                  id="agendar-responsible"
                  name="responsible"
                  required
                  placeholder="Identificador do membro…"
                  aria-describedby="agendar-responsible-hint"
                />
                <FieldDescription id="agendar-responsible-hint">
                  A lista de pessoas só existe no ambiente de desenvolvimento.
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="agendar-responsible">Responsável pela sessão</FieldLabel>
                <Select name="responsible" required disabled={!people.data}>
                  <SelectTrigger id="agendar-responsible" className="w-full">
                    <SelectValue placeholder={people.data ? "Escolha quem conduz…" : "Carregando pessoas…"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {people.data
                        ?.filter((p) => p.roles.some((r) => r !== "visitor"))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.displayName}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="agendar-teams">Link da reunião no Teams (opcional)</FieldLabel>
              <Input
                id="agendar-teams"
                name="teams"
                type="url"
                placeholder="https://teams.microsoft.com/…"
                aria-describedby="agendar-teams-hint"
              />
              <FieldDescription id="agendar-teams-hint">
                Colado manualmente; o Opt News ainda não cria reuniões no Teams.
              </FieldDescription>
            </Field>
            <ProblemNote error={create.error} />
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="submit" disabled={create.pending}>
            {create.pending ? "Agendando…" : "Agendar sessão"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function Agenda({ proposalId }: { proposalId: string }) {
  const me = useMe();
  const [, setParams] = useSearchParams();
  const meetups = useApi("listMeetups", { query: { when: "upcoming" } });
  const [scheduling, setScheduling] = useState(Boolean(proposalId));
  return (
    <>
      {me.can.organize && !scheduling && (
        <Button type="button" className="mb-6" onClick={() => setScheduling(true)}>
          <Icon name="plus" data-icon="inline-start" />
          Agendar sessão
        </Button>
      )}
      {me.can.organize && scheduling && (
        <ScheduleForm
          proposalId={proposalId}
          onCancel={() => {
            setScheduling(false);
            setParams({ aba: "agenda" }, { replace: true });
          }}
        />
      )}
      <div className="max-w-3xl">
        <Async
          q={meetups}
          what="a agenda"
          lines={5}
          shape="cards"
          empty={(list) =>
            list.length === 0 && "Nenhuma sessão agendada. Pautas selecionadas na votação viram as próximas sessões."
          }
        >
          {(list) => (
            <ul>
              {list.map((m) => (
                <SessionLine key={m.id} session={m} />
              ))}
            </ul>
          )}
        </Async>
      </div>
    </>
  );
}

function History() {
  const meetups = useApi("listMeetups", { query: { when: "past" } });
  return (
    <div className="max-w-3xl">
      <Async
        q={meetups}
        what="o histórico"
        lines={5}
        shape="cards"
        empty={(list) =>
          list.length === 0 && "Ainda não houve sessões. O registro de cada meetup realizado aparece aqui."
        }
      >
        {(list) => (
          <ul>
            {list.map((m) => (
              <SessionLine key={m.id} session={m} />
            ))}
          </ul>
        )}
      </Async>
    </div>
  );
}

const TABS = [
  ["propostas", "Propostas"],
  ["agenda", "Agenda"],
  ["historico", "Histórico"],
] as const;

// SmoothTab is drawn for short demo panels; these turn it into page sections: tabs at the start, no frame around the
// panel (the forms inside are cards), selectable text, pinch-zoom kept, and a 4px inset so focus rings are not clipped.
const TAB_LAYOUT =
  "max-w-none gap-6 [&>div:first-child]:justify-start [&>div:last-child]:-m-1 [&>div:last-child]:rounded-none [&>div:last-child]:border-0 [&>div:last-child]:bg-transparent [&>div:last-child]:touch-auto [&>div:last-child]:select-text [&_[role=tabpanel]]:min-h-0 [&_[role=tabpanel]]:p-0";

export function Meetups() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find(([key]) => key === params.get("aba"))?.[0] ?? "propostas";
  const panel =
    tab === "propostas" ? (
      <Proposals startCreating={params.get("nova") === "1"} />
    ) : tab === "agenda" ? (
      <Agenda key={params.get("pauta") ?? ""} proposalId={params.get("pauta") ?? ""} />
    ) : (
      <History />
    );
  return (
    <Page
      title="Meetups"
      subtitle="Notícias viram pautas; as mais votadas viram sessões; cada sessão deixa registro e aprendizados."
    >
      <SmoothTab
        label="Seções de meetups"
        className={TAB_LAYOUT}
        activeColor="bg-foreground"
        activeTextColor="text-background"
        value={tab}
        onChange={(key) => setParams({ aba: key })}
        items={TABS.map(([key, title]) => ({
          id: key,
          title,
          // Only the open tab mounts (one request at a time). Swiping the content is off: a drag there selects text
          // or edits a form, and must never switch tabs and drop what was typed.
          content:
            key === tab ? (
              <div className="min-w-0 p-1" onPointerDown={(e) => e.stopPropagation()}>
                {/* The tab is the visual heading; this keeps the outline h1 → h2 → h3 for screen readers. */}
                <h2 className="sr-only">{title}</h2>
                {panel}
              </div>
            ) : null,
        }))}
      />
    </Page>
  );
}
