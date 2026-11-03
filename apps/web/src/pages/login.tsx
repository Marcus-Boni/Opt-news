// Dev-only sign-in: pick a synthetic persona. Replaced by Microsoft Entra ID SSO once that decision lands (Q-04).
// The brand moment of the app: the Optsolv logo on warm graphite with the symbol's point field, then the chooser.
// Motion: GSAP arrival for the copy and the cards; when a persona is chosen, anime.js nudges it forward (the chevron's
// "impulsiona") while the others step back; the point field answers the pointer. All of it off under reduced motion.
import { animate, type JSAnimation } from "animejs";
import { ChevronRight } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { OptsolvSymbol, OptsolvTagline } from "@/components/brand/optsolv";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { reducedMotion, useReveal } from "@/motion";
import { api, useAction, useApi } from "../api.ts";
import { ROLE_LABEL } from "../format.ts";
import { useSession } from "../session.tsx";
import { Async, Notice, ProblemNote } from "../ui.tsx";

const ChevronField = lazy(() => import("@/components/chevron-field").then((m) => ({ default: m.ChevronField })));

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();

export function Login() {
  const { me, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const personas = useApi("devPersonas");
  const login = useAction();
  const [chosen, setChosen] = useState<string | null>(null);
  const scope = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useReveal(scope, [personas.data]);
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  // The chosen card moves forward and the others step back while the session opens; a failure brings them back.
  useEffect(() => {
    const root = list.current;
    if (!root || reducedMotion()) return;
    const cards = [...root.querySelectorAll<HTMLElement>("[data-persona]")];
    const anims: JSAnimation[] = cards.map((card) =>
      card.dataset.persona === chosen
        ? animate(card, { translateX: [0, 8], duration: 420, ease: "outExpo" })
        : animate(card, { opacity: chosen ? 0.4 : 1, translateX: 0, duration: 320, ease: "outQuad" }),
    );
    return () => {
      for (const a of anims) a.revert();
    };
  }, [chosen]);

  if (me) return <Navigate to={from} replace />;

  return (
    <main
      ref={scope}
      className="grid min-h-dvh overflow-x-clip bg-background lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]"
    >
      <title>Entrar · Opt News</title>
      {/* Always graphite, whatever the theme: the logo's dark ground, with the symbol's point field behind the copy. */}
      <section
        aria-label="Opt News"
        className="dark relative isolate flex min-h-[46dvh] flex-col justify-between gap-8 overflow-hidden bg-background px-6 py-8 text-foreground sm:px-10 lg:min-h-0 lg:px-14 lg:py-12"
      >
        <div className="absolute inset-y-0 right-0 -z-10 aspect-square h-full max-h-[52rem] translate-x-[28%] opacity-80 sm:translate-x-[18%] lg:translate-x-[30%]">
          <Suspense fallback={<OptsolvSymbol className="absolute inset-[18%] text-brand/40" />}>
            <ChevronField className="absolute inset-0" />
          </Suspense>
        </div>
        <OptsolvTagline className="h-auto w-60 self-start text-warm-light lg:w-72" />
        <div className="flex flex-col gap-4">
          <p
            data-reveal
            translate="no"
            className="text-[2.5rem] leading-none font-bold tracking-[-0.035em] text-foreground lg:text-[3.75rem]"
          >
            Opt News
          </p>
          <p data-reveal className="max-w-[36ch] text-[1.0625rem] leading-relaxed text-muted-foreground">
            Notícias de tecnologia com fonte, debate do time, meetups e o que aprendemos com eles.
          </p>
          <Link
            data-reveal
            to="/sobre"
            className="group inline-flex w-fit items-center gap-1.5 text-[0.9375rem] font-semibold text-brand-text"
          >
            Conhecer o Opt News
            <ChevronRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        </div>
      </section>

      <div className="flex flex-col justify-center px-4 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <h1 data-reveal className="text-[1.75rem] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[2rem]">
            Entrar no Opt News
          </h1>

          <div data-reveal>
            <Notice>
              <strong className="font-semibold">Ambiente de desenvolvimento — login simulado</strong> (SSO Microsoft
              Entra ID pendente). As pessoas abaixo são fictícias; cada uma tem um papel diferente.
            </Notice>
          </div>

          {personas.error?.status === 404 ? (
            <p className="text-sm text-muted-foreground">O login simulado não está disponível neste ambiente.</p>
          ) : (
            <Async q={personas} what="as personas de teste" lines={4}>
              {(items) => (
                <ul ref={list} className="flex flex-col gap-2" aria-label="Personas de teste">
                  {items.map((p) => (
                    <li key={p.id} data-reveal data-persona={p.id}>
                      <Item asChild variant="outline">
                        <Button
                          variant="ghost"
                          disabled={login.pending}
                          aria-busy={login.pending && chosen === p.id}
                          onClick={async () => {
                            setChosen(p.id);
                            const res = await login.run(() => api("devLogin", { body: { memberId: p.id } }));
                            if (res.ok) {
                              signIn(res.value);
                              navigate(from, { replace: true });
                            } else setChosen(null);
                          }}
                          className={cn(
                            "h-auto justify-start gap-3.5 bg-card px-4 py-3 text-left font-normal whitespace-normal",
                            "transition-[border-color,background-color] hover:border-brand hover:bg-brand-soft/40 disabled:cursor-wait disabled:opacity-100",
                          )}
                        >
                          <Avatar size="lg">
                            <AvatarFallback className="font-semibold text-foreground">
                              {initials(p.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold">{p.displayName}</span>
                              {p.roles.map((r) => (
                                <Badge key={r} variant={r === "visitor" || r === "member" ? "secondary" : "outline"}>
                                  {ROLE_LABEL[r] ?? r}
                                </Badge>
                              ))}
                            </span>
                            <span className="text-sm leading-snug text-muted-foreground">{p.description}</span>
                          </span>
                          {login.pending && chosen === p.id ? (
                            <Spinner aria-hidden="true" className="text-brand" />
                          ) : (
                            <ChevronRight
                              aria-hidden="true"
                              className="text-muted-foreground transition-colors group-hover/button:text-brand"
                            />
                          )}
                        </Button>
                      </Item>
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          )}
          <div aria-live="polite">
            <ProblemNote error={login.error} />
          </div>
        </div>
      </div>
    </main>
  );
}
