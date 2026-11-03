// Typed client over the contract's `endpoints` map: same-origin fetch (session cookie), CSRF header on mutations,
// RFC 9457 problems surfaced as ApiError. Plain React state; no cache layer.
import {
  type BodyIn,
  type Endpoint,
  type Endpoints,
  endpoints,
  type ParamsOf,
  type Problem,
  type QueryIn,
  type ResponseOf,
} from "@optnews/contracts";
import { useCallback, useEffect, useState } from "react";

export type Name = keyof Endpoints;
export type Data<N extends Name> = ResponseOf<Endpoints[N]>;

export interface Call<N extends Name> {
  params?: ParamsOf<Endpoints[N]>;
  query?: QueryIn<Endpoints[N]>;
  body?: BodyIn<Endpoints[N]>;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }
}

let csrfToken = "";
let onUnauthorized = () => {};

/** Set by the session provider: the token for mutations and what a 401 anywhere should do. */
export function configureSession(token: string, unauthorized: () => void): void {
  csrfToken = token;
  onUnauthorized = unauthorized;
}

export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError({
    type: "about:blank",
    title: "Erro inesperado",
    status: 0,
    detail: String(err),
    requestId: "—",
  });
}

async function problemOf(res: Response): Promise<Problem> {
  const requestId = res.headers.get("x-request-id") ?? "—";
  try {
    const body = (await res.json()) as Partial<Problem>;
    if (typeof body.title === "string")
      return { type: "about:blank", status: res.status, requestId, ...body } as Problem;
  } catch {
    // Not a problem document (proxy error page, empty body): fall through to a generic one.
  }
  return {
    type: "about:blank",
    title: res.status >= 500 ? "Serviço indisponível" : "Falha na requisição",
    status: res.status,
    requestId,
  };
}

export async function api<N extends Name>(name: N, call: Call<N> = {}): Promise<Data<N>> {
  const ep: Endpoint = endpoints[name];
  const params = (call.params ?? {}) as Record<string, string>;
  const path = ep.path.replace(/:(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ""));
  const query = Object.entries((call.query ?? {}) as Record<string, unknown>).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  const qs = new URLSearchParams(query.map(([k, v]) => [k, String(v)])).toString();
  const headers: Record<string, string> = { accept: "application/json" };
  if (call.body !== undefined) headers["content-type"] = "application/json";
  if (ep.method !== "GET") headers["x-csrf-token"] = csrfToken;

  let res: Response;
  try {
    res = await fetch(qs ? `${path}?${qs}` : path, {
      method: ep.method,
      credentials: "same-origin",
      headers,
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: call.signal,
    });
  } catch (err) {
    if (call.signal?.aborted) throw err;
    throw new ApiError({
      type: "about:blank",
      title: "Sem conexão com o servidor",
      status: 0,
      detail: "Verifique a rede e tente de novo.",
      requestId: "—",
    });
  }
  if (res.status === 401 && name !== "me") onUnauthorized();
  if (!res.ok) throw new ApiError(await problemOf(res));
  return (res.status === 204 ? undefined : await res.json()) as Data<N>;
}

export interface Query<T> {
  data: T | undefined;
  error: ApiError | undefined;
  pending: boolean;
  reload: () => void;
  /** Local update (optimistic or from a mutation response) without refetching. */
  setData: (fn: (data: T) => T) => void;
}

/** GET on mount and whenever the call changes. A reload keeps the old data on screen until the new one lands. */
export function useApi<N extends Name>(name: N, call: Omit<Call<N>, "signal"> = {}, enabled = true): Query<Data<N>> {
  const key = JSON.stringify(call);
  const [state, setState] = useState<{ key: string; data?: Data<N>; error?: ApiError; pending: boolean }>({
    key: "",
    pending: enabled,
  });

  const run = useCallback(
    (signal?: AbortSignal) => {
      if (!enabled) return;
      setState((s) => ({ ...s, pending: true }));
      api(name, { ...(JSON.parse(key) as Call<N>), signal }).then(
        (data) => setState({ key, data, pending: false }),
        (err: unknown) => {
          if (!signal?.aborted) setState({ key, error: asApiError(err), pending: false });
        },
      );
    },
    [name, key, enabled],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    run(ctrl.signal);
    return () => ctrl.abort();
  }, [run]);

  const fresh = state.key === key;
  return {
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    pending: state.pending,
    reload: () => run(),
    setData: (fn) => setState((s) => (s.data === undefined ? s : { ...s, data: fn(s.data) })),
  };
}

type Paged<T> = { items: T[]; nextCursor: string | null };
type PagedName = { [K in Name]: Data<K> extends Paged<unknown> ? K : never }[Name];
export type Item<N extends Name> = Data<N> extends Paged<infer T> ? T : never;

/** Cursor pagination behind an explicit "Carregar mais" (no infinite scroll). */
export function usePaged<N extends PagedName>(name: N, call: Omit<Call<N>, "signal">) {
  const key = JSON.stringify(call);
  const [state, setState] = useState<{
    key: string;
    items: Item<N>[];
    cursor: string | null;
    error?: ApiError;
    pending: boolean;
  }>({
    key: "",
    items: [],
    cursor: null,
    pending: true,
  });

  const load = useCallback(
    async (cursor: string | null, signal?: AbortSignal) => {
      setState((s) => ({ ...s, pending: true, error: undefined }));
      const base = JSON.parse(key) as Call<N>;
      try {
        const page = (await api(name, {
          ...base,
          query: { ...base.query, ...(cursor && { cursor }) },
          signal,
        } as Call<N>)) as Paged<Item<N>>;
        setState((s) => ({
          key,
          items: cursor && s.key === key ? [...s.items, ...page.items] : page.items,
          cursor: page.nextCursor,
          pending: false,
        }));
      } catch (err) {
        if (!signal?.aborted) setState((s) => ({ ...s, error: asApiError(err), pending: false }));
      }
    },
    [name, key],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(null, ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const fresh = state.key === key;
  return {
    /** undefined until the first page of the current call arrives. */
    items: fresh ? state.items : undefined,
    error: state.error,
    pending: state.pending,
    hasMore: fresh && state.cursor !== null,
    loadMore: () => void load(state.cursor),
    reload: () => void load(null),
    update: (fn: (items: Item<N>[]) => Item<N>[]) => setState((s) => ({ ...s, items: fn(s.items) })),
  };
}

/** Pending flag and last error for one mutation; the caller decides what success means. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
    setPending(true);
    setError(null);
    try {
      return { ok: true, value: await fn() };
    } catch (err) {
      setError(asApiError(err));
      return { ok: false };
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, error, run, clear: () => setError(null) };
}
