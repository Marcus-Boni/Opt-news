// Who is signed in. `can` only decides which actions to show; the API enforces every rule again.
import type { Me } from "@optnews/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { type ApiError, api, asApiError, configureSession } from "./api.ts";
import { ErrorState, Mark } from "./ui.tsx";

interface Session {
  /** undefined while the first /me is in flight; null when signed out. */
  me: Me | null | undefined;
  error: ApiError | null;
  /** True after an explicit "Sair": the next sign-in starts at Início, not at the last page. */
  signedOut: boolean;
  signIn: (me: Me) => void;
  signOut: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api("me").then(setMe, (err: unknown) => {
      const e = asApiError(err);
      if (e.status === 401) setMe(null);
      else setError(e);
    });
  }, []);

  useEffect(() => load(), [load]);
  useEffect(() => configureSession(me?.csrfToken ?? "", () => setMe(null)), [me]);

  const signOut = useCallback(async () => {
    // Leaving is the user's intent: drop the local session even if the server call fails.
    await api("logout").catch(() => undefined);
    setSignedOut(true);
    setMe(null);
  }, []);

  return (
    <SessionContext
      value={{
        me,
        error,
        signedOut,
        signIn: (next) => {
          setSignedOut(false);
          setMe(next);
        },
        signOut,
        retry: load,
      }}
    >
      {children}
    </SessionContext>
  );
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** The signed-in member; only valid under <RequireSession>. */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error("useMe outside RequireSession");
  return me;
}

export function RequireSession() {
  const { me, error, retry, signedOut } = useSession();
  const location = useLocation();
  if (error && me === undefined) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <ErrorState error={error} what="sua sessão" onRetry={retry} />
      </div>
    );
  }
  if (me === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <Mark className="size-7 opacity-60" />
        <span className="sr-only">Carregando sessão…</span>
      </div>
    );
  }
  if (me === null)
    return (
      <Navigate to="/entrar" replace state={signedOut ? null : { from: `${location.pathname}${location.search}` }} />
    );
  return <Outlet />;
}
