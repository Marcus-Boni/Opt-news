// Shared building blocks on shadcn/ui and the Optsolv tokens. Every string from the API is rendered as React text,
// never as markup. Pages import from here so the app speaks one visual language.
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Compass,
  House,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  MessagesSquare,
  Plus,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { animate } from "animejs";
import { type ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { OptsolvSymbol } from "@/components/brand/optsolv";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty as EmptyBox, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton as SkeletonBar } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { reducedMotion, useReveal } from "@/motion";
import type { ApiError } from "./api.ts";
import { formatDateTime, relativeTime } from "./format.ts";

export { ChevronTrail as Trail, type TrailItem } from "@/components/chevron-trail";

const ICONS = {
  home: House,
  explore: Compass,
  community: MessagesSquare,
  meetups: CalendarDays,
  knowledge: BookOpen,
  search: Search,
  admin: SlidersHorizontal,
  curation: ListChecks,
  external: ArrowUpRight,
  logout: LogOut,
  menu: Menu,
  close: X,
  up: ArrowUp,
  plus: Plus,
  back: ArrowLeft,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Named app icons (lucide). Inside a Button, prefer the lucide component with `data-icon`. */
export function Icon({ name, className, ...rest }: { name: IconName; className?: string; "data-icon"?: string }) {
  const Glyph = ICONS[name];
  return <Glyph aria-hidden="true" className={className} {...rest} />;
}

/** The product mark: the Optsolv chevrons in brand orange. */
export function Mark({ className = "size-6" }: { className?: string }) {
  return <OptsolvSymbol className={cn("text-brand", className)} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark className="h-6 w-auto" />
      <span className="text-[1.0625rem] font-bold tracking-[-0.03em]">Opt News</span>
    </span>
  );
}

export function ExternalLink({
  href,
  children,
  className = "link",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  if (!/^https?:\/\//i.test(href)) return <span className="break-all text-muted-foreground">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-baseline gap-1", className)}
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="size-3.5 translate-y-0.5" />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

/**
 * The one tooltip pattern: short supplementary text on hover/focus, never the only place information lives.
 * Same delay, side and styling everywhere (TooltipProvider in main.tsx).
 */
export function Hint({
  label,
  side = "top",
  children,
}: {
  label: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-pretty">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Time({ iso, full = false }: { iso: string; full?: boolean }) {
  if (full) {
    return (
      <time dateTime={iso}>
        {formatDateTime(iso)} ({relativeTime(iso)})
      </time>
    );
  }
  // Relative in the row, exact in the hint; z-10 keeps it hoverable above whole-card links.
  return (
    <Hint label={formatDateTime(iso)}>
      <time dateTime={iso} className="relative z-10 cursor-default">
        {relativeTime(iso)}
      </time>
    </Hint>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "error";
const TONE = {
  neutral: "secondary",
  accent: "brand",
  success: "success",
  warning: "warning",
  error: "destructive",
} as const satisfies Record<Tone, string>;

/** A short state label (shadcn Badge in a semantic tone). */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <Badge variant={TONE[tone]}>{children}</Badge>;
}

/**
 * The one mark for machine-written text, used everywhere such text appears. Purple is reserved for it, so AI text
 * never reads as the brand speaking or as a colleague's words.
 */
export function AiTag({ children = "Gerado por IA" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Hint label="Texto escrito automaticamente pela curadoria a partir da fonte. Confira no original antes de citar.">
        <Badge variant="ai" className="relative z-10 cursor-default gap-1 px-1.5 font-semibold">
          <Sparkles data-icon="inline-start" />
          IA
        </Badge>
      </Hint>
      {children}
    </span>
  );
}

const SKELETON_WIDTHS = ["w-11/12", "w-full", "w-4/5", "w-2/3", "w-3/4", "w-1/2"];

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5 py-1", className)} aria-hidden="true">
      {SKELETON_WIDTHS.slice(0, lines).map((w) => (
        <SkeletonBar key={w} className={cn("h-3.5", w)} />
      ))}
    </div>
  );
}

export function Loading({ lines = 3, label = "Carregando…" }: { lines?: number; label?: string }) {
  return (
    <div aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton lines={lines} />
    </div>
  );
}

/** A failed block, inside the block: what failed, the server's words, and a retry. */
export function ErrorState({ error, what, onRetry }: { error: ApiError; what: string; onRetry?: () => void }) {
  const { status, title, detail, requestId } = error.problem;
  const message =
    status === 404
      ? `Não encontramos ${what}. Pode ter sido removido ou não estar disponível para o seu perfil.`
      : status === 403
        ? `Seu perfil não tem acesso a ${what}.`
        : `Não foi possível carregar ${what}.`;
  const technical = status !== 404 && status !== 403;
  return (
    <Alert variant={technical ? "destructive" : "default"}>
      <TriangleAlert />
      <AlertTitle>{message}</AlertTitle>
      {technical && (
        <AlertDescription>
          <p>
            {title}
            {detail ? ` — ${detail}` : ""}
            {status >= 500 || status === 0 ? ` (código ${requestId})` : ""}
          </p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              <RotateCw data-icon="inline-start" />
              Tentar de novo
            </Button>
          )}
        </AlertDescription>
      )}
    </Alert>
  );
}

/** A rejected action, next to the action. 409 means the state moved on: offer a reload instead of a retry. */
export function ProblemNote({ error, onReload }: { error: ApiError | null; onReload?: () => void }) {
  if (!error) return null;
  const { status, title, detail, requestId } = error.problem;
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      {(detail || status >= 500 || status === 0 || (status === 409 && onReload)) && (
        <AlertDescription>
          {detail && <p>{detail}</p>}
          {(status >= 500 || status === 0) && <p>Código {requestId}</p>}
          {status === 409 && onReload && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onReload}>
              <RotateCw data-icon="inline-start" />
              Recarregar e ver a versão atual
            </Button>
          )}
        </AlertDescription>
      )}
    </Alert>
  );
}

export function Notice({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "neutral" | "success";
  children: ReactNode;
}) {
  return (
    <Alert variant={tone === "neutral" ? "default" : tone}>
      <AlertDescription className="text-current">{children}</AlertDescription>
    </Alert>
  );
}

/** An empty block keeps its frame and says what to do next. */
/** The symbol in an empty state gives one small forward push (anime.js) when it appears: "impulsiona", not idle. */
function EmptyMark() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current || reducedMotion()) return;
    const anim = animate(ref.current, {
      translateX: [
        { from: -6, to: 3, duration: 380, ease: "outQuad" },
        { to: 0, duration: 520, ease: "outElastic(1, .6)" },
      ],
      opacity: { from: 0, to: 1, duration: 300 },
      delay: 150,
    });
    return () => {
      anim.revert();
    };
  }, []);
  return (
    <span ref={ref} className="inline-flex">
      <Mark className="h-5 w-auto" />
    </span>
  );
}

export function Empty({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <EmptyBox className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <EmptyMark />
        </EmptyMedia>
        {title && <EmptyTitle>{title}</EmptyTitle>}
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </EmptyBox>
  );
}

export function Async<T>({
  q,
  what,
  children,
  lines = 3,
  empty,
}: {
  q: { data: T | undefined; error: ApiError | undefined; reload: () => void };
  what: string;
  children: (data: T) => ReactNode;
  lines?: number;
  empty?: (data: T) => ReactNode | false;
}) {
  if (q.error) return <ErrorState error={q.error} what={what} onRetry={q.reload} />;
  if (q.data === undefined) return <Loading lines={lines} label={`Carregando ${what}…`} />;
  const nothing = empty?.(q.data);
  return nothing ? <Empty>{nothing}</Empty> : children(q.data);
}

export function Section({
  title,
  action,
  children,
  id,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, "-")}-titulo`;
  return (
    <section aria-labelledby={headingId} id={id} className={cn("scroll-mt-20", className)} data-reveal>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-base font-semibold tracking-[-0.015em] text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Page({
  title,
  subtitle,
  actions,
  rail,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  rail?: ReactNode;
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope, [title]);
  return (
    <div ref={scope} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-10">
      <title>{`${title} · Opt News`}</title>
      <header data-reveal className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[2rem]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {rail ? (
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">{children}</div>
          <aside className="flex min-w-0 flex-col gap-9" aria-label="Contexto">
            {rail}
          </aside>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Deep links like #discussao point into content that arrives after the first render. */
export function useScrollToHash(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (ready && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [ready, hash]);
}

/** Label over value, for bylines and provenance. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">{children}</dl>;
}

export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:contents">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 wrap-anywhere text-foreground">{children}</dd>
    </div>
  );
}

export function Dot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("text-muted-foreground/60", className)}>
      ·
    </span>
  );
}
