import { StrictMode } from "react";
import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, useRouteError } from "react-router";
import { RouterProvider } from "react-router/dom";
import "./index.css";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { rememberScroll } from "@/motion";
import { ThemeProvider } from "@/theme";
import { RequireSession, SessionProvider } from "./session.tsx";
import { Shell } from "./shell.tsx";
import { Mark, Page } from "./ui.tsx";

/**
 * Every page is its own chunk, fetched when its route first matches (React Router keeps the current page on screen
 * meanwhile). The shell, design system and session stay in the entry chunk.
 */
const page =
  <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) =>
  async () => ({ Component: (await load())[name] as React.ComponentType });

/** A rendering bug in one page must not leave a blank screen. */
function Crash() {
  const error = useRouteError();
  console.error(error);
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <title>Erro · Opt News</title>
      <h1 className="text-2xl font-bold tracking-[-0.03em]">Algo falhou ao exibir esta página</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Recarregue a página. Se continuar, avise o time responsável informando o endereço acima.
      </p>
      <div className="mt-5 flex gap-2">
        <Button onClick={() => window.location.reload()}>Recarregar</Button>
        <Button variant="outline" asChild>
          <a href="/">Ir para o início</a>
        </Button>
      </div>
    </div>
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
    <Page title="Página não encontrada">
      <p className="text-sm text-muted-foreground">
        Este endereço não existe no Opt News.{" "}
        <Link to="/" className="link">
          Voltar ao início
        </Link>
      </p>
    </Page>
  );
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
    errorElement: <Crash />,
    hydrateFallbackElement: <BootFallback />,
    children: [
      {
        element: <Shell />,
        children: [
          {
            errorElement: <Crash />,
            children: [
              { index: true, lazy: page(() => import("./pages/home.tsx"), "Home") },
              { path: "explorar", lazy: page(() => import("./pages/explore.tsx"), "Explore") },
              { path: "noticias/:id", lazy: page(() => import("./pages/story.tsx"), "StoryPage") },
              { path: "acontecimentos/:id", lazy: page(() => import("./pages/event.tsx"), "EventPage") },
              { path: "briefings/:date", lazy: page(() => import("./pages/event.tsx"), "BriefingPage") },
              { path: "comunidade", lazy: page(() => import("./pages/community.tsx"), "Community") },
              { path: "meetups", lazy: page(() => import("./pages/meetups.tsx"), "Meetups") },
              { path: "meetups/:id", lazy: page(() => import("./pages/meetup.tsx"), "MeetupPage") },
              { path: "conhecimento", lazy: page(() => import("./pages/knowledge.tsx"), "Library") },
              { path: "conhecimento/novo", lazy: page(() => import("./pages/knowledge.tsx"), "NewInsight") },
              { path: "conhecimento/:id", lazy: page(() => import("./pages/knowledge.tsx"), "InsightPage") },
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

rememberScroll(router.state);
router.subscribe(rememberScroll);

const root = document.getElementById("root");
if (root) {
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
