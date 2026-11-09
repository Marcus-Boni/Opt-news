// Comunidade: the latest contributions across news, meetups and insights, plus "Indicar link" into curation.
import type { endpoints, ResponseOf } from "@optnews/contracts";
import { CircleCheck, Info, Link2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "@/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { api, useAction, useApi } from "../api.ts";
import { AuthorAvatar, type DiscussionEntry } from "../discussion.tsx";
import { hrefFor, plural } from "../format.ts";
import { StoryPreview } from "../story-preview.tsx";
import { useMe } from "../session.tsx";
import { Async, Dot, NextStep, Page, ProblemNote, Section, Time } from "../ui.tsx";

type Submission = ResponseOf<typeof endpoints.submitStory>;

function SubmissionResult({ result }: { result: Submission }) {
  const story = result.storyId && (
    <Link to={`/noticias/${result.storyId}`} className="font-medium underline">
      Abrir a notícia
    </Link>
  );
  switch (result.status) {
    case "pending_review":
      return (
        <Alert variant="success">
          <CircleCheck />
          <AlertTitle>Recebido.</AlertTitle>
          <AlertDescription>
            O link entrou na fila da curadoria; se for aceito, aparece no feed com a fonte atribuída.
          </AlertDescription>
        </Alert>
      );
    case "duplicate":
      return (
        <Alert variant="brand">
          <Info />
          <AlertTitle>Este link já está no Opt News.</AlertTitle>
          <AlertDescription>{story ?? "A indicação anterior ainda está na fila da curadoria."}</AlertDescription>
        </Alert>
      );
    case "accepted":
      return (
        <Alert variant="success">
          <CircleCheck />
          <AlertTitle>Este link já foi aceito pela curadoria.</AlertTitle>
          {story && <AlertDescription>{story}</AlertDescription>}
        </Alert>
      );
    case "rejected":
      return (
        <Alert>
          <Info />
          <AlertTitle>Este link já foi avaliado e recusado pela curadoria.</AlertTitle>
        </Alert>
      );
  }
}

function SubmitLink() {
  const submit = useAction();
  const [result, setResult] = useState<Submission | null>(null);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const note = String(f.get("note") ?? "").trim();
    setResult(null);
    const res = await submit.run(() =>
      api("submitStory", { body: { url: String(f.get("url") ?? ""), note: note || undefined } }),
    );
    if (res.ok) {
      setResult(res.value);
      form.reset();
    }
  };
  return (
    <form onSubmit={onSubmit}>
      <FieldGroup className="gap-4">
        <FieldDescription>
          Achou algo que o time deveria ler? Indique o link original. A curadoria confere a fonte antes de publicar.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="indicar-url">Endereço (URL)</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <Link2 />
            </InputGroupAddon>
            <InputGroupInput
              id="indicar-url"
              name="url"
              type="url"
              inputMode="url"
              required
              minLength={8}
              maxLength={2048}
              placeholder="https://exemplo.com/artigo…"
            />
          </InputGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="indicar-nota">Nota para a curadoria (opcional)</FieldLabel>
          <Textarea
            id="indicar-nota"
            name="note"
            className="min-h-20"
            maxLength={500}
            placeholder="Por que vale a leitura do time…"
          />
        </Field>
        <div className="flex flex-col gap-2" aria-live="polite">
          <ProblemNote error={submit.error} />
          {result && <SubmissionResult result={result} />}
        </div>
        <div>
          <Button type="submit" disabled={submit.pending}>
            {submit.pending ? "Enviando…" : "Indicar link"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

const KIND = { story: "Notícia", meetup: "Meetup", insight: "Insight" } as const;

interface ConversationGroup {
  key: string;
  target: DiscussionEntry["target"];
  entries: DiscussionEntry[];
}

/** Recent comments gathered by what they discuss, most recently active first (the feed already comes newest first). */
function conversations(list: DiscussionEntry[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const e of list) {
    const key = `${e.target.type}:${e.target.id}`;
    const g = groups.get(key) ?? { key, target: e.target, entries: [] };
    g.entries.push(e);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** One conversation: what it is about, who is in it, and its latest words. */
function Conversation({ conversation: { target, entries } }: { conversation: ConversationGroup }) {
  const href = `${hrefFor(target.type, target.id)}#discussao`;
  const people = [...new Map(entries.map((e) => [e.comment.author.id, e.comment.author.displayName])).values()];
  const latest = entries[0];
  const title = (
    <Link to={href} className="underline-offset-4 hover:underline">
      {target.title}
    </Link>
  );
  return (
    <li data-spotlight className="surface flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{KIND[target.type]}</p>
          <h3 className="mt-1 text-[1.0625rem] leading-snug font-semibold tracking-[-0.015em] text-balance">
            {target.type === "story" ? <StoryPreview id={target.id}>{title}</StoryPreview> : title}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="tabular">{plural(entries.length, "comentário recente", "comentários recentes")}</span>
            {latest && (
              <>
                <Dot />
                <span>
                  última <Time iso={latest.comment.createdAt} />
                </span>
              </>
            )}
          </p>
        </div>
        {/* Who is in the conversation, overlapping like a table of people. */}
        <span className="flex shrink-0 -space-x-1" aria-label={`Participantes: ${people.join(", ")}`} role="img">
          {people.slice(0, 4).map((name) => (
            <span key={name} className="rounded-full ring-2 ring-card">
              <AuthorAvatar name={name} size="sm" />
            </span>
          ))}
        </span>
      </div>
      <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
        {entries.slice(0, 2).map((e) => (
          <li key={e.comment.id} className="min-w-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{e.comment.author.displayName}</span> ·{" "}
              <Time iso={e.comment.createdAt} />
            </p>
            <p className="plain mt-0.5 line-clamp-3 text-sm leading-relaxed">{e.comment.body}</p>
          </li>
        ))}
      </ol>
      <Button asChild variant="link" size="sm" className="self-start text-xs">
        <Link to={href}>{entries.length > 2 ? `Ver as ${entries.length} mensagens` : "Abrir a conversa"}</Link>
      </Button>
    </li>
  );
}

export function Community() {
  const me = useMe();
  const discussions = useApi("recentDiscussions");
  return (
    <Page
      title="Comunidade"
      subtitle="O que o time está discutindo sobre as notícias, os meetups e os aprendizados."
      rail={
        <Section title="Indicar link">
          {me.can.contribute ? (
            <SubmitLink />
          ) : (
            <p className="text-sm text-muted-foreground">Seu perfil é somente leitura e não pode indicar links.</p>
          )}
        </Section>
      }
    >
      <Section title="Conversas recentes">
        <div className="max-w-3xl">
          <Async
            q={discussions}
            what="os debates"
            lines={6}
            shape="comments"
            empty={(list) =>
              list.length === 0 &&
              "Nenhum debate ainda. Abra uma notícia em Explorar e comente o que ela muda para o seu projeto."
            }
            emptyAction={<NextStep to="/explorar">Explorar notícias</NextStep>}
          >
            {(list) => (
              <ul className="flex flex-col gap-4">
                {conversations(list).map((c) => (
                  <Conversation key={c.key} conversation={c} />
                ))}
              </ul>
            )}
          </Async>
        </div>
      </Section>
    </Page>
  );
}
