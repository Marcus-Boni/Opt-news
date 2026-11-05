import { StrictMode } from "react";
import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, useRouteError } from "react-router";
import { Link } from "@/link";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import { OptsolvSymbol } from "@/components/brand/optsolv";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/theme";
import { RequireSession, SessionProvider } from "./session.tsx";
import { Shell } from "./shell.tsx";
import { prime, settle } from "./api.ts";
import { installSpotlight } from "./spotlight.ts";
import { Mark } from "./ui.tsx";

/**
 * Every page is its own chunk, fetched when its route first matches (React Router keeps the current page on screen
 * meanwhile). The shell, design system and session stay in the entry chunk.
 */
const page =
  <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) =>
  async () => ({ Component: (await load())[name] as React.ComponentType });

/**
 * Dead ends (unknown address, a page that failed to draw) still speak the brand: the official symbol is revealed by
 * the same chevron front as the theme change (CSS `symbol-reveal`), then the way out. One mark, no other graphic.
 */
function DeadEnd({ title, children, actions }: { title: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[70dvh] w-full max-w-3xl content-center items-center gap-x-12 gap-y-8 px-4 py-16 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-8">
      <title>{`${title} · Opt News`}</title>
      <OptsolvSymbol aria-hidden="true" className="symbol-reveal h-24 w-auto text-brand sm:h-36" />
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-[1.75rem] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[2rem]">{title}</h1>
        <p className="max-w-[48ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{children}</p>
        <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
      </div>
    </div>
  );
}

/** A rendering bug in one page must not leave a blank screen. */
function Crash() {
  const error = useRouteError();
  console.error(error);
  return (
    <DeadEnd
      title="Algo falhou ao exibir esta página"
      actions={
        <>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
          <Button variant="outline" asChild>
            <a href="/">Ir para o início</a>
          </Button>
        </>
      }
    >
      Recarregue a página. Se continuar, avise o time responsável informando o endereço acima.
    </DeadEnd>
  );
}

/** First paint while the entry route chunk arrives: the mark, nothing else. */
function BootFallback() {
  return (
    <div role="status" aria-label="Carregando o Opt News…" className="grid min-h-dvh place-items-center bg-background">
      <Mark className="h-8 w-auto animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

function NotFound() {
  return (
    <DeadEnd
      title="Página não encontrada"
      actions={
        <>
          <Button asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/busca">Buscar no Opt News</Link>
          </Button>
        </>
      }
    >
      Este endereço não existe no Opt News.
    </DeadEnd>
  );
}

/**
 * Loaders prefetch what each page asks for first (same calls, same arguments), so the page mounts with its content:
 * no skeleton flash, back/forward lands on the real page height and view transitions morph real elements. They wait
 * at most a beat (`settle`); a slow API falls back to the page's own skeleton. Below-the-fold data stays lazy.
 */
const id = (params: Record<string, string | undefined>) => ({ params: { id: params.id ?? "" } });

function exploreLoader({ request }: { request: Request }) {
  const p = new URL(request.url).searchParams;
  if (p.get("periodo")) return null; // its query carries "now", which the page computes itself
  const q = p.get("q") ?? "";
  const topic = p.get("tema") ?? "";
  const sort = p.get("ordem") === "relevancia" ? "relevance" : "recent";
  return settle(prime("listStories", { query: { q: q || undefined, topic: topic || undefined, sort, limit: 20 } }));
}

const router = createBrowserRouter([
  {
    path: "/entrar",
    lazy: page(() => import("./pages/login.tsx"), "Login"),
    errorElement: <Crash />,
    hydrateFallbackElement: <BootFallback />,
  },
  {
    path: "/sobre",
    lazy: page(() => import("./pages/landing.tsx"), "Landing"),
    errorElement: <Crash />,
    hydrateFallbackElement: <BootFallback />,
  },
  {
    element: <RequireSession />,
    loader: () => {
      void prime("topics");
      return null;
    },
    errorElement: <Crash />,
    hydrateFallbackElement: <BootFallback />,
    children: [
      {
        element: <Shell />,
        children: [
          {
            errorElement: <Crash />,
            children: [
              {
                index: true,
                lazy: page(() => import("./pages/home.tsx"), "Home"),
                loader: () =>
                  settle(
                    prime("getBriefing", { params: { date: "latest" } }),
                    prime("listStories", { query: { sort: "recent", limit: 8 } }),
                    prime("listMeetups", { query: { when: "upcoming" } }),
                    prime("listProposals", { query: { status: "open" } }),
                    prime("recentDiscussions"),
                  ),
              },
              { path: "explorar", lazy: page(() => import("./pages/explore.tsx"), "Explore"), loader: exploreLoader },
              {
                path: "noticias/:id",
                lazy: page(() => import("./pages/story.tsx"), "StoryPage"),
                loader: ({ params }) => settle(prime("getStory", id(params))),
              },
              {
                path: "acontecimentos/:id",
                lazy: page(() => import("./pages/event.tsx"), "EventPage"),
                loader: ({ params }) => settle(prime("getEvent", id(params))),
              },
              {
                path: "briefings/:date",
                lazy: page(() => import("./pages/event.tsx"), "BriefingPage"),
                loader: ({ params }) =>
                  settle(prime("getBriefing", { params: { date: params.date ?? "latest" } }), prime("listBriefings")),
              },
              {
                path: "comunidade",
                lazy: page(() => import("./pages/community.tsx"), "Community"),
                loader: () => settle(prime("recentDiscussions")),
              },
              {
                path: "meetups",
                lazy: page(() => import("./pages/meetups.tsx"), "Meetups"),
                loader: () => settle(prime("listProposals")),
              },
              {
                path: "meetups/:id",
                lazy: page(() => import("./pages/meetup.tsx"), "MeetupPage"),
                loader: ({ params }) => settle(prime("getMeetup", id(params))),
              },
              {
                path: "conhecimento",
                lazy: page(() => import("./pages/knowledge.tsx"), "Library"),
                loader: () => settle(prime("listInsights")),
              },
              { path: "conhecimento/novo", lazy: page(() => import("./pages/knowledge.tsx"), "NewInsight") },
              {
                path: "conhecimento/:id",
                lazy: page(() => import("./pages/knowledge.tsx"), "InsightPage"),
                loader: ({ params }) => settle(prime("getInsight", id(params))),
              },
              { path: "busca", lazy: page(() => import("./pages/search.tsx"), "SearchPage") },
              { path: "curadoria", lazy: page(() => import("./pages/curation.tsx"), "Curation") },
              { path: "admin", lazy: page(() => import("./pages/admin.tsx"), "Admin") },
              { path: "admin/fontes/:sourceId", lazy: page(() => import("./pages/admin.tsx"), "SourcePage") },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);

const root = document.getElementById("root");
if (root) {
  installSpotlight();
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300}>
            <SessionProvider>
              <RouterProvider router={router} />
            </SessionProvider>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </StrictMode>,
  );
}
