// Curadoria (NX-03, N-11, Q-10): stories under review, member links that failed, what the pipeline held back or
// published, curator labels on those decisions and the calibration they feed. The server enforces the curator role;
// the page only hides what the member cannot do.
import { toast } from "sonner";
import { Check } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link } from "@/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type Data, type Query, useAction, useApi } from "../api.ts";
import { formatScore, humanReason, plural, TIER } from "../format.ts";
import { useMe } from "../session.tsx";
import {
  Async,
  Dot,
  Empty,
  ExternalLink,
  Fact,
  Facts,
  Page,
  Pill,
  ProblemNote,
  SELECTED,
  Section,
  Time,
} from "../ui.tsx";

type Queue = Data<"curationQueue">;
type Review = Queue["reviews"][number];
type Item = Queue["items"][number];
type Filter = "held" | "selected" | "all";
type Verdict = "should_publish" | "should_skip";

const ITEM_STATUS: Record<Item["status"], { label: string; tone: "neutral" | "success" | "warning" | "error" }> = {
  discovered: { label: "Na fila", tone: "neutral" },
  selected: { label: "Publicada", tone: "success" },
  not_selected: { label: "Abaixo do corte", tone: "neutral" },
  rejected: { label: "Rejeitada no pré-filtro", tone: "warning" },
  archived: { label: "Arquivada (antiga)", tone: "neutral" },
  failed: { label: "Falhou", tone: "error" },
};
/** What "Publicar mesmo assim" accepts (the server answers 409 otherwise). */
const FORCEABLE: Item["status"][] = ["not_selected", "rejected", "failed"];
const VERDICTS: { value: Verdict; label: string; count: (i: Item) => number }[] = [
  { value: "should_publish", label: "Deveria publicar", count: (i) => i.verdicts.shouldPublish },
  { value: "should_skip", label: "Deveria ficar de fora", count: (i) => i.verdicts.shouldSkip },
];
function Scores({ scores, threshold }: { scores: [number, number] | null; threshold: number }) {
  const cut = `corte: soma ≥ ${2 * threshold} (2 × ${threshold})`;
  if (!scores) return <span className="tabular">sem notas · {cut}</span>;
  return (
    <span className="tabular">
      notas {scores[0]} e {scores[1]} (soma {scores[0] + scores[1]}) · {cut}
    </span>
  );
}

function ReviewRow({ r, onDone, onReload }: { r: Review; onDone: () => void; onReload: () => void }) {
  const id = useId();
  const decide = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setNote("");
      decide.clear();
    }
  };
  const send = async (decision: "publish" | "retract") => {
    const text = note.trim();
    const res = await decide.run(() =>
      api("decideReview", { params: { id: r.storyId }, body: text ? { decision, note: text } : { decision } }),
    );
    if (!res.ok) return;
    toast.success(decision === "publish" ? "Notícia publicada" : "Notícia retirada", { description: r.headline });
    setOpen(false);
    onDone();
  };
  const retract = (e: FormEvent) => {
    e.preventDefault();
    void send("retract");
  };
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          <Link to={`/noticias/${r.storyId}`} className="hover:text-brand-text hover:underline">
            {r.headline}
          </Link>
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span>{r.sourceName}</span>
          {r.editorialScore !== null && (
            <>
              <Dot />
              <span className="tabular">nota editorial {formatScore(r.editorialScore)}</span>
            </>
          )}
          {r.publishedAt && (
            <>
              <Dot />
              <Time iso={r.publishedAt} />
            </>
          )}
          <Dot />
          <ExternalLink href={r.url}>Original</ExternalLink>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Por que está em revisão: {r.reviewReason ? humanReason(r.reviewReason) : "não informado."}
        </p>
        {!open && (
          <div className="mt-2">
            <ProblemNote error={decide.error} onReload={onReload} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {/* One filled orange action per screen region: on a queue of cards the decision buttons stay neutral. */}
        <Button size="sm" variant="secondary" disabled={decide.pending} onClick={() => void send("publish")}>
          {decide.pending && !open && <Spinner data-icon="inline-start" aria-hidden="true" />}
          Publicar<span className="sr-only"> {r.headline}</span>
        </Button>
        <Dialog open={open} onOpenChange={toggle}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={decide.pending}>
              Retirar<span className="sr-only"> {r.headline}</span>
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <form onSubmit={retract} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Retirar esta notícia?</DialogTitle>
                <DialogDescription>{r.headline}</DialogDescription>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor={id}>Nota (opcional)</FieldLabel>
                <Textarea
                  id={id}
                  aria-describedby={`${id}-ajuda`}
                  placeholder="Ex.: fonte duplicada, fora do tema…"
                  className="min-h-20"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                />
                <FieldDescription id={`${id}-ajuda`}>Fica registrada na auditoria.</FieldDescription>
              </Field>
              <ProblemNote error={decide.error} onReload={onReload} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => toggle(false)}>
                  Voltar
                </Button>
                <Button type="submit" variant="destructive" disabled={decide.pending}>
                  {decide.pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                  Sim, retirar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </li>
  );
}

function Reviews({ q }: { q: Query<Queue> }) {
  const reviews = q.data?.reviews ?? [];
  if (reviews.length === 0) return <Empty>Nenhuma notícia em revisão.</Empty>;
  const drop = (storyId: string) =>
    q.setData((d) => ({ ...d, reviews: d.reviews.filter((r) => r.storyId !== storyId) }));
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {reviews.map((r) => (
        <ReviewRow key={r.storyId} r={r} onDone={() => drop(r.storyId)} onReload={q.reload} />
      ))}
    </ul>
  );
}

function Submissions({ rows }: { rows: Queue["submissions"] }) {
  if (rows.length === 0) return <Empty>Nenhuma indicação com problema.</Empty>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {rows.map((s) => (
        <li key={s.id} className="px-4 py-3.5 text-sm">
          <p className="break-all">
            <ExternalLink href={s.url}>{s.url}</ExternalLink>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Indicada por {s.submittedBy} · <Time iso={s.createdAt} />
          </p>
          {s.note && <p className="mt-1 text-xs text-muted-foreground">Nota: {s.note}</p>}
          <p className={s.error ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"}>
            {s.error ? `Erro: ${s.error}` : "Aguardando leitura"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ItemRow({ item, onChange, onReload }: { item: Item; onChange: (i: Item) => void; onReload: () => void }) {
  const label = useAction();
  const force = useAction();
  const [confirm, setConfirm] = useState(false);
  const queued = item.forced && item.status === "discovered";
  const st = queued
    ? { label: "Na fila · publica na próxima execução", tone: "neutral" as const }
    : ITEM_STATUS[item.status];
  const deciding = item.status === "discovered";

  const setVerdict = async (verdict: Verdict) => {
    const res = await label.run(() => api("labelItem", { params: { id: item.id }, body: { verdict } }));
    if (res.ok) {
      onChange(res.value);
      toast.success("Rótulo registrado", { description: "Entra na calibração do corte." });
    }
  };
  const forceIt = async () => {
    const res = await force.run(() => api("forceItem", { params: { id: item.id } }));
    if (!res.ok) return;
    onChange(res.value);
    setConfirm(false);
    toast.success("Item devolvido ao pipeline", { description: "Publica na próxima execução do worker." });
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      {/* The status always sits in the same slot, top right, whatever the title's length. */}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-medium text-foreground">
          <ExternalLink href={item.url} className="hover:text-brand-text hover:underline">
            {item.title}
          </ExternalLink>
        </p>
        <span className="shrink-0">
          <Pill tone={st.tone}>{st.label}</Pill>
        </span>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span>
            {item.sourceName} · {TIER[item.tier] ?? item.tier}
          </span>
          <Dot />
          <span>
            coletado <Time iso={item.observedAt} />
          </span>
          {item.submittedBy && (
            <>
              <Dot />
              <span>Indicada por {item.submittedBy}</span>
            </>
          )}
          {item.storyId && (
            <>
              <Dot />
              <Link to={`/noticias/${item.storyId}`} className="link">
                Ver notícia
              </Link>
            </>
          )}
        </p>
        <p>
          <Scores scores={item.scores} threshold={item.threshold} />
        </p>
        {item.reason && <p>Motivo: {humanReason(item.reason)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset
          aria-label={`Seu rótulo para ${item.title} (calibra o corte)`}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            Seu rótulo:
          </span>
          {VERDICTS.map((v) => {
            const on = item.myVerdict === v.value;
            const n = v.count(item);
            return (
              <Button
                key={v.value}
                type="button"
                size="sm"
                variant="outline"
                className={on ? "border-foreground bg-foreground text-background hover:bg-foreground/90" : undefined}
                aria-pressed={on}
                disabled={label.pending || deciding}
                onClick={() => void setVerdict(v.value)}
              >
                {on && <Check data-icon="inline-start" aria-hidden="true" />}
                {v.label}
                <span className={on ? "tabular opacity-80" : "tabular text-muted-foreground"}>
                  · {plural(n, "rótulo", "rótulos")}
                </span>
              </Button>
            );
          })}
        </fieldset>
        {FORCEABLE.includes(item.status) && (
          <Dialog
            open={confirm}
            onOpenChange={(o) => {
              setConfirm(o);
              if (!o) force.clear();
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                Publicar mesmo assim<span className="sr-only"> {item.title}</span>
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Publicar mesmo assim?</DialogTitle>
                <DialogDescription>
                  {item.title} volta ao pipeline e passa pelo corte na próxima execução do worker (cerca de 15 min).
                </DialogDescription>
              </DialogHeader>
              <ProblemNote error={force.error} onReload={onReload} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
                  Voltar
                </Button>
                <Button type="button" disabled={force.pending} onClick={() => void forceIt()}>
                  {force.pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
                  Sim, publicar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {deciding && <p className="text-xs text-muted-foreground">O pipeline ainda está decidindo; rotule depois.</p>}
      <ProblemNote error={label.error} onReload={onReload} />
    </li>
  );
}

function Decisions({ q, onLabelled }: { q: Query<Queue>; onLabelled: () => void }) {
  return (
    <Async
      q={q}
      what="as decisões do pipeline"
      lines={4}
      empty={(d) => d.items.length === 0 && "Nenhuma decisão do pipeline neste filtro."}
    >
      {(d) => (
        <ul className="divide-y rounded-xl border bg-card">
          {d.items.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              onReload={q.reload}
              onChange={(next) => {
                q.setData((x) => ({ ...x, items: x.items.map((y) => (y.id === next.id ? next : y)) }));
                onLabelled();
              }}
            />
          ))}
        </ul>
      )}
    </Async>
  );
}

function CalibrationCard({ q }: { q: Query<Data<"calibration">> }) {
  return (
    <Section title="Calibração">
      <Async q={q} what="a calibração" lines={4}>
        {(c) => (
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-sm">
            <Facts>
              <Fact term="Modelo">{c.model}</Fact>
              <Fact term="Rótulos">{c.labels}</Fact>
            </Facts>
            {c.labels === 0 ? (
              <p className="text-muted-foreground">
                Nenhum rótulo ainda. Marque as decisões do pipeline para calibrar o corte.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                <li>
                  <span className="tabular font-semibold">{c.agreed}</span> — o pipeline concordou
                </li>
                <li>
                  <span className="tabular font-semibold">{c.missed}</span> — deixou de fora o que devia publicar
                </li>
                <li>
                  <span className="tabular font-semibold">{c.extra}</span> — publicou o que devia ficar de fora
                </li>
              </ul>
            )}
            <ul className="flex flex-col gap-3 border-t pt-4">
              {c.byTier.map((t) => (
                <li key={t.tier}>
                  <p className="font-medium">{TIER[t.tier] ?? t.tier}</p>
                  <p className="tabular text-muted-foreground">
                    corte atual {t.threshold} · {plural(t.labels, "rótulo", "rótulos")}
                  </p>
                  <p className="tabular">
                    {t.suggested !== null
                      ? `Sugerido: ${t.suggested}`
                      : t.lowestShouldPublish !== null && t.highestShouldSkip !== null
                        ? "Sem sugestão: rótulos ainda se sobrepõem"
                        : "Sem sugestão: rótulos insuficientes"}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              A sugestão é insumo para uma decisão humana: o corte não muda automaticamente.
            </p>
          </div>
        )}
      </Async>
    </Section>
  );
}

export function Curation() {
  const me = useMe();
  const [filter, setFilter] = useState<Filter>("held");
  const queue = useApi("curationQueue", {}, me.can.moderate);
  // The default call already brings the held items; only the other filters need their own request.
  const other = useApi("curationQueue", { query: { status: filter } }, me.can.moderate && filter !== "held");
  const calibration = useApi("calibration", {}, me.can.moderate);
  if (!me.can.moderate) {
    return (
      <Page title="Curadoria">
        <p className="text-sm text-muted-foreground">Esta área é da curadoria. Seu perfil não tem acesso.</p>
      </Page>
    );
  }
  return (
    <Page
      title="Curadoria"
      subtitle="Notícias em revisão, indicações com problema e o que o pipeline decidiu com cada item."
      rail={<CalibrationCard q={calibration} />}
    >
      <Async q={queue} what="a fila de curadoria" lines={5} shape="cards">
        {(d) => (
          <div className="flex flex-col gap-10">
            <Section id="revisao" title="Em revisão">
              <Reviews q={queue} />
            </Section>
            <Section title="Indicações com problema">
              <Submissions rows={d.submissions} />
            </Section>
            <Section
              id="decisoes"
              title="Decisões do pipeline"
              action={
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={filter}
                  onValueChange={(v) => v && setFilter(v as Filter)}
                  aria-label="Filtrar decisões"
                >
                  <ToggleGroupItem value="held" className={`h-8 px-3 ${SELECTED}`}>
                    Barradas
                  </ToggleGroupItem>
                  <ToggleGroupItem value="selected" className={`h-8 px-3 ${SELECTED}`}>
                    Publicadas
                  </ToggleGroupItem>
                  <ToggleGroupItem value="all" className={`h-8 px-3 ${SELECTED}`}>
                    Todas
                  </ToggleGroupItem>
                </ToggleGroup>
              }
            >
              <Decisions q={filter === "held" ? queue : other} onLabelled={calibration.reload} />
            </Section>
          </div>
        )}
      </Async>
    </Page>
  );
}
