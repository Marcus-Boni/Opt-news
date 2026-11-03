// A meetup session as a calendar line, shared by the Meetups agenda and the Início rail. Kept apart from the Meetups
// page so the home route does not pull in its forms, date picker and tabs.
import type { MeetupSession } from "@optnews/contracts";
import { Link } from "react-router";
import { formatTime, SESSION_STATE, TZ } from "./format.ts";
import { Dot, Pill } from "./ui.tsx";

const dayNum = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit" });
const monthShort = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "short" });
const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" });

export function SessionStatePill({ state }: { state: MeetupSession["state"] }) {
  const tone =
    state === "scheduled" ? "accent" : state === "documented" ? "success" : state === "cancelled" ? "error" : "neutral";
  return <Pill tone={tone}>{SESSION_STATE[state] ?? state}</Pill>;
}

/** A session as a calendar line: the date block carries the rhythm of the agenda. */
export function SessionLine({ session: m, compact = false }: { session: MeetupSession; compact?: boolean }) {
  const start = new Date(m.scheduledStart);
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-t py-4 first:border-t-0 first:pt-0">
      <div className="text-center leading-none" aria-hidden="true">
        <div className="text-xs text-muted-foreground">{weekday.format(start).replace(".", "")}</div>
        <div className="tabular mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-brand-text">
          {dayNum.format(start)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{monthShort.format(start).replace(".", "")}</div>
      </div>
      <div className="min-w-0">
        <Link
          to={`/meetups/${m.id}`}
          className="text-[1.0625rem] leading-snug font-semibold tracking-[-0.01em] transition-colors hover:text-brand-text"
        >
          {m.title}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <time dateTime={m.scheduledStart} className="sr-only">
            {start.toLocaleDateString("pt-BR", { timeZone: TZ, dateStyle: "full" })}
          </time>
          <span>{formatTime(m.scheduledStart)}</span>
          <Dot />
          <span>{m.durationMinutes} min</span>
          <Dot />
          <span>com {m.responsible.displayName}</span>
          <SessionStatePill state={m.state} />
        </p>
        {!compact && m.summary && (
          <p className="plain mt-2 line-clamp-2 max-w-[68ch] text-sm text-muted-foreground">{m.summary}</p>
        )}
      </div>
    </li>
  );
}
