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
import { DiscussionLine } from "../discussion.tsx";
import { useMe } from "../session.tsx";
import { Async, NextStep, Page, ProblemNote, Section } from "../ui.tsx";

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
      <Section title="Debates recentes">
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
              <ul>
                {list.map((d) => (
                  <DiscussionLine key={d.comment.id} entry={d} />
                ))}
              </ul>
            )}
          </Async>
        </div>
      </Section>
    </Page>
  );
}
