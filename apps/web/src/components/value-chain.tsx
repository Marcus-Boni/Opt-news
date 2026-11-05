// The living chain: where one story stands on Opt News' path (news → proposal → meetup → insight), drawn with the
// Optsolv chevron. Reached steps are lit, the step in motion pulses once, steps still ahead are dashed. On arrival an
// orange impulse runs across the reached connectors (CSS, index.css `.chain-impulse`). Static under reduced motion.
import type { ReactNode } from "react";
import { Link } from "@/link";
import { cn } from "@/lib/utils";
import { Chevron } from "./chevron-trail";

export type StepState = "done" | "active" | "ahead";

export interface ChainStep {
  key: string;
  label: string;
  state: StepState;
  /** What is true at this step right now ("Em votação · 3 votos", "Nenhuma ainda"). */
  detail: ReactNode;
  to?: string;
}

const STATE_LABEL: Record<StepState, string> = { done: "concluída", active: "em andamento", ahead: "ainda não" };

export function ValueChain({ steps, label }: { steps: ChainStep[]; label: string }) {
  return (
    <ol aria-label={label} className="grid gap-2 sm:grid-cols-4 sm:gap-0">
      {steps.map((s, i) => {
        const next = steps[i + 1];
        const body = (
          <>
            <span className="flex items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "relative grid size-7 shrink-0 place-items-center rounded-lg",
                  s.state === "ahead"
                    ? "border border-dashed border-muted-foreground/40"
                    : "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_30%,transparent)]",
                  s.state === "active" && "chain-pulse",
                )}
              >
                <Chevron className={cn("h-3.5", s.state === "ahead" ? "text-muted-foreground/50" : "text-brand")} />
              </span>
              {/* The connector to the next step, lit when the next step has been reached. */}
              {next && (
                <span aria-hidden="true" className="relative mx-3 hidden h-0.5 flex-1 rounded-full bg-border sm:block">
                  {next.state !== "ahead" && (
                    <span
                      className="chain-impulse absolute inset-0 rounded-full bg-brand"
                      style={{ animationDelay: `${i * 140}ms` }}
                    />
                  )}
                </span>
              )}
            </span>
            <span className="mt-2 block text-sm font-semibold">
              {s.label}
              <span className="sr-only">: {STATE_LABEL[s.state]}.</span>
            </span>
            <span className="mt-0.5 block pr-4 text-xs leading-snug text-muted-foreground">{s.detail}</span>
          </>
        );
        return (
          <li key={s.key} className="min-w-0">
            {s.to ? (
              <Link to={s.to} className="-m-1.5 block rounded-lg p-1.5 transition-colors hover:bg-muted/60">
                {body}
              </Link>
            ) : (
              <div className="-m-1.5 p-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
