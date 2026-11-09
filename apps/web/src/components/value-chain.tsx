// The living chain: where one story stands on Opt News' path (news → proposal → meetup → insight), drawn with the
// Optsolv chevron. Reached steps are lit, the step in motion pulses once, steps still ahead are dashed. On arrival an
// orange impulse runs along the reached connectors (CSS, index.css `.chain-impulse`). Static under reduced motion.
// Two shapes: `rail` (vertical, each step with the items linked to it) and `strip` (one line of four marks for narrow
// screens, pointing at the full chain).
import type { ReactNode } from "react";
import { Link } from "@/link";
import { cn } from "@/lib/utils";
import { Chevron } from "./chevron-trail";

export type StepState = "done" | "active" | "ahead";

export interface ChainStep {
  key: string;
  label: string;
  state: StepState;
  /** What is true at this step right now ("2 pautas em votação · 3 votos", "Nenhuma ainda"). */
  detail: ReactNode;
  /** What is linked at this step (the proposals, the insights), each a way in. */
  items?: { key: string; title: string; to: string; meta: string }[];
}

const STATE_LABEL: Record<StepState, string> = { done: "concluída", active: "em andamento", ahead: "ainda não" };

function Mark({ state, small = false }: { state: StepState; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center rounded-lg",
        small ? "size-6" : "size-7",
        state === "ahead"
          ? "border border-dashed border-muted-foreground/40"
          : "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_30%,transparent)]",
        state === "active" && "chain-pulse",
      )}
    >
      <Chevron className={cn(small ? "h-3" : "h-3.5", state === "ahead" ? "text-muted-foreground/50" : "text-brand")} />
    </span>
  );
}

/** Vertical chain for the context rail: each step, its state and what is linked to it. */
export function ValueChain({ steps, label }: { steps: ChainStep[]; label: string }) {
  return (
    <ol aria-label={label} className="grid">
      {steps.map((s, i) => {
        const next = steps[i + 1];
        return (
          <li key={s.key} className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
            {next && (
              <span aria-hidden="true" className="absolute top-8 bottom-1 left-[13px] w-0.5 rounded-full bg-border">
                {next.state !== "ahead" && (
                  <span
                    className="chain-impulse chain-impulse-y absolute inset-0 rounded-full bg-brand"
                    style={{ animationDelay: `${i * 140}ms` }}
                  />
                )}
              </span>
            )}
            <Mark state={s.state} />
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold">
                {s.label}
                <span className="sr-only">: {STATE_LABEL[s.state]}.</span>
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.detail}</p>
              {s.items && s.items.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {s.items.map((it) => (
                    <li key={it.key} className="text-[0.8125rem] leading-snug">
                      <Link to={it.to} className="font-medium text-foreground transition-colors hover:text-brand-text">
                        {it.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{it.meta}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One line of four marks for narrow screens; the whole strip leads to the full chain. */
export function ChainStrip({ steps, to }: { steps: ChainStep[]; to: string }) {
  return (
    <a
      href={to}
      className="-mx-1.5 flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/60"
      aria-label={`Caminho desta notícia: ${steps.map((s) => `${s.label} ${STATE_LABEL[s.state]}`).join(", ")}. Ver detalhes.`}
    >
      {steps.map((s, i) => (
        <span key={s.key} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && (
            <span
              aria-hidden="true"
              className={cn("h-0.5 w-3 rounded-full", s.state === "ahead" ? "bg-border" : "bg-brand")}
            />
          )}
          <Mark state={s.state} small />
          <span aria-hidden="true" className="truncate text-xs font-medium text-muted-foreground">
            {s.label}
          </span>
        </span>
      ))}
    </a>
  );
}
