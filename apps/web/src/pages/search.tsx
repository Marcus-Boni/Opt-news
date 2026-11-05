// Busca: one query over everything the reader may open, grouped by kind. The query lives in the URL.
import { Search, X } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Link } from "@/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useApi } from "../api.ts";
import { hrefFor, plural, REF_LABEL } from "../format.ts";
import { AiTag, Async, Empty, Hint, NextStep, Page, Section, Time } from "../ui.tsx";

const GROUPS = [
  ["story", "Notícias"],
  ["meetup", "Meetups"],
  ["insight", "Conhecimento"],
] as const;

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const ready = q.length >= 2;
  const result = useApi("search", { query: { q } }, ready);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(q);
  // The URL can change from outside (command menu, back button): the field follows it.
  const [shown, setShown] = useState(q);
  if (shown !== q) {
    setShown(q);
    setText(q);
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = text.trim();
    setParams(next ? { q: next } : {});
  };
  const clear = () => {
    setText("");
    if (q) setParams({});
    input.current?.focus();
  };

  return (
    <Page title="Busca" subtitle="Notícias, meetups e conhecimento que você tem permissão para abrir.">
      <search>
        <form onSubmit={submit} className="flex max-w-2xl gap-2">
          <InputGroup className="h-10 min-w-0 flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              ref={input}
              name="q"
              type="search"
              aria-label="Termo de busca"
              value={text}
              onChange={(e) => setText(e.target.value)}
              minLength={2}
              maxLength={200}
              placeholder="Ex.: agentes, RAG, embeddings…"
              className="md:text-base [&::-webkit-search-cancel-button]:hidden"
            />
            {text && (
              <InputGroupAddon align="inline-end">
                <Hint label="Limpar busca">
                  <InputGroupButton size="icon-sm" aria-label="Limpar busca" onClick={clear}>
                    <X />
                  </InputGroupButton>
                </Hint>
              </InputGroupAddon>
            )}
          </InputGroup>
          <Button type="submit" size="lg">
            <Search data-icon="inline-start" />
            Buscar
          </Button>
        </form>
      </search>

      <div className="mt-8 max-w-3xl" aria-live="polite">
        {!ready ? (
          <Empty>Digite pelo menos 2 caracteres. A busca cobre títulos e resumos.</Empty>
        ) : (
          <Async
            q={result}
            what="os resultados"
            lines={6}
            shape="rows"
            empty={(r) =>
              r.hits.length === 0 &&
              `Nada encontrado para “${r.q}”. Tente um termo mais amplo ou o nome da tecnologia em inglês.`
            }
            emptyAction={<NextStep to="/explorar">Navegar por tema em Explorar</NextStep>}
          >
            {(r) => (
              <div className="flex flex-col gap-9">
                <p className="tabular text-sm text-muted-foreground">
                  {plural(r.hits.length, "resultado", "resultados")} para “{r.q}”
                </p>
                {GROUPS.map(([type, title]) => {
                  const hits = r.hits.filter((h) => h.type === type);
                  if (hits.length === 0) return null;
                  return (
                    <Section key={type} id={`busca-${type}`} title={`${title} (${hits.length})`}>
                      <ul className="divide-y">
                        {hits.map((h) => (
                          // The title link stretches over the row; its accessible name stays the title.
                          <li key={h.id} data-spotlight="fill" className="-mx-4 rounded-xl px-4 py-4">
                            <h3 className="text-[1.0625rem] leading-snug font-semibold tracking-[-0.015em]">
                              <Link
                                to={hrefFor(h.type, h.id)}
                                className="underline-offset-4 after:absolute after:inset-0 hover:underline"
                              >
                                {h.title}
                              </Link>
                            </h3>
                            {h.aiGenerated && (
                              <div className="mt-1.5">
                                <AiTag>Resumo</AiTag>
                              </div>
                            )}
                            <p className="plain mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                              {h.snippet}
                            </p>
                            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary">{REF_LABEL[h.type] ?? h.type}</Badge>
                              <Time iso={h.at} />
                            </p>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  );
                })}
              </div>
            )}
          </Async>
        )}
      </div>
    </Page>
  );
}
