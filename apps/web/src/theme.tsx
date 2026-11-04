// Light / dark / follow the system. The choice lives in localStorage (a per-viewer convenience); without it, or when
// storage is blocked, the system preference wins. index.html applies the class before React to avoid a flash.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { EASE_OUT, reducedMotion } from "@/motion";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "optnews-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const resolve = (choice: ThemeChoice) => (choice === "system" ? (media().matches ? "dark" : "light") : choice);

function apply(choice: ThemeChoice): "light" | "dark" {
  const resolved = resolve(choice);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

const Ctx = createContext<{
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(read);
  const [resolved, setResolved] = useState<"light" | "dark">(() => apply(read()));

  useEffect(() => {
    setResolved(apply(choice));
    if (choice !== "system") return;
    const m = media();
    const onChange = () => setResolved(apply("system"));
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      if (c === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, c);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
    const commit = () => {
      apply(c);
      setChoiceState(c);
    };
    const changes = resolve(c) !== (document.documentElement.classList.contains("dark") ? "dark" : "light");
    if (!changes || reducedMotion() || !document.startViewTransition) return commit();
    // The signature impulse: the new theme sweeps in left to right behind a chevron front (the symbol's shape).
    const sweep = document.startViewTransition(() => flushSync(commit));
    sweep.ready
      .then(() =>
        document.documentElement.animate(
          {
            clipPath: [
              "polygon(0 0, -20% 0, 0 50%, -20% 100%, 0 100%)",
              "polygon(0 0, 100% 0, 120% 50%, 100% 100%, 0 100%)",
            ],
          },
          { duration: 700, easing: EASE_OUT, pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {
        // Skipped transition (tab hidden, another one started): the theme is already applied.
      });
  }, []);

  return <Ctx.Provider value={{ choice, resolved, setChoice }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
