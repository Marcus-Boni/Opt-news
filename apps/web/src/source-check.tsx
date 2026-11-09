// "Conferir com a fonte": the AI summary beside the words the source itself published. Each summary sentence becomes a
// claim you can select; the source excerpt below lights up the words that back it, and sentences the source barely
// supports are tinted in AI purple (what the model added). A reading aid built on word overlap (support.ts), never a
// verdict on the facts. Off by default; when on, the summary stays readable as plain text for screen readers too.
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { keyOf, sentencesOf } from "./support.ts";

function Toggle({ on, onChange, controls }: { on: boolean; onChange: (on: boolean) => void; controls: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-controls={controls}
      onClick={() => onChange(!on)}
      className="group/sw inline-flex items-center gap-2 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors duration-200",
          on ? "bg-ai" : "bg-muted-foreground/35",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-background shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            on && "translate-x-3",
          )}
        />
      </span>
      Conferir com a fonte
    </button>
  );
}

/** Words of the source excerpt, the ones in `lit` marked; whitespace kept as is. */
function SourceText({ text, lit }: { text: string; lit: Set<string> }) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const k = keyOf(part);
        const on = k !== null && lit.has(k);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the excerpt is static; position is identity.
            key={i}
            className={cn("rounded-[3px] transition-colors duration-300", on && "bg-brand-soft text-foreground")}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

export function SourceCheck({
  summary,
  headline,
  excerpt,
  sourceName,
  className,
}: {
  summary: string;
  headline: string;
  excerpt: string;
  sourceName: string;
  className?: string;
}) {
  const id = useId();
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState(0);
  const sentences = useMemo(() => sentencesOf(summary, `${headline} ${excerpt}`), [summary, headline, excerpt]);
  const current = sentences[Math.min(picked, sentences.length - 1)];
  const lit = on && current ? current.keys : new Set<string>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Toggle on={on} onChange={setOn} controls={`${id}-texto`} />
      </div>
      <div id={`${id}-texto`} className={className}>
        {on
          ? sentences.map((s, i) => {
              // Purple grows with what the source does not say (the model's own addition).
              const added = Math.round((1 - s.ratio) * 22);
              return (
                <span key={s.text}>
                  <button
                    type="button"
                    aria-pressed={i === picked}
                    onClick={() => setPicked(i)}
                    className={cn(
                      "rounded-md px-0.5 text-left underline decoration-dotted decoration-1 underline-offset-[0.3em] transition-[background-color,text-decoration-color] duration-200",
                      i === picked ? "decoration-ai decoration-solid" : "decoration-muted-foreground/60",
                    )}
                    style={{ backgroundColor: `color-mix(in oklab, var(--ai) ${added}%, transparent)` }}
                  >
                    {s.text}
                    <span className="sr-only">
                      {" "}
                      ({s.found} de {s.keys.size} palavras aparecem no trecho da fonte)
                    </span>
                  </button>{" "}
                </span>
              );
            })
          : summary}
      </div>
      {on && current && (
        <figure className="flex flex-col gap-2.5 rounded-2xl bg-muted/50 px-5 py-4 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_6%,transparent)]">
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Trecho publicado por <span className="font-medium text-foreground">{sourceName}</span>
            </span>
            <span aria-live="polite" className="tabular">
              Frase {Math.min(picked, sentences.length - 1) + 1}: {current.found} de {current.keys.size} palavras estão
              no trecho
            </span>
          </figcaption>
          <blockquote className="text-[0.9375rem] leading-relaxed text-foreground/85">
            <p className="font-medium">
              <SourceText text={headline} lit={lit} />
            </p>
            <p className="mt-1">
              <SourceText text={excerpt} lit={lit} />
            </p>
          </blockquote>
          <p className="text-xs text-muted-foreground">
            Comparação de palavras entre o resumo e o que a fonte publicou: o realce mostra o que a IA repetiu, e o
            roxo, o que ela acrescentou. Não é checagem de fatos; confirme no original.
          </p>
        </figure>
      )}
    </div>
  );
}
