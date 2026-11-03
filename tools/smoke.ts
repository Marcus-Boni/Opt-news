// Smoke test against a running instance: node tools/smoke.ts [baseUrl]. Read-only except one dev login and logout.
const base = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001";

async function check(name: string, run: () => Promise<void>) {
  const started = Date.now();
  try {
    await run();
    console.log(`ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    console.log(`FAIL ${name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

async function get(path: string, cookie = "") {
  const res = await fetch(new URL(path, base), { headers: { cookie } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res;
}

let cookie = "";
let csrf = "";
let storyId = "";

await check("liveness /healthz", async () => void (await get("/healthz")));
await check("readiness /readyz (banco)", async () => void (await get("/readyz")));
await check("sem sessão → 401", async () => {
  const res = await fetch(new URL("/api/v1/stories", base));
  if (res.status !== 401) throw new Error(`esperado 401, veio ${res.status}`);
});
await check("login simulado (persona leitora)", async () => {
  const personas = (await (await get("/api/v1/auth/dev/personas")).json()) as { id: string; roles: string[] }[];
  const reader = personas.find((p) => p.roles.includes("member"));
  if (!reader) throw new Error("nenhuma persona member");
  const res = await fetch(new URL("/api/v1/auth/dev/login", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ memberId: reader.id }),
  });
  if (!res.ok) throw new Error(`login → ${res.status}`);
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  csrf = ((await res.json()) as { csrfToken: string }).csrfToken;
});
await check("feed com notícias", async () => {
  const page = (await (await get("/api/v1/stories?limit=5", cookie)).json()) as { items: { id: string }[] };
  if (page.items.length === 0) throw new Error("feed vazio (rode o seed ou o worker)");
  storyId = page.items[0]?.id ?? "";
});
await check("detalhe com proveniência", async () => {
  const s = (await (await get(`/api/v1/stories/${storyId}`, cookie)).json()) as { provenance?: { provider: string } };
  if (!s.provenance?.provider) throw new Error("sem proveniência");
});
await check("busca", async () => void (await get("/api/v1/search?q=agentes", cookie)));
await check("web servido (SPA)", async () => {
  const res = await fetch(new URL("/", base));
  if (res.status === 404) throw new Error("web não servido (SERVE_WEB=false?) — ignore em dev");
});
await check("logout", async () => {
  const res = await fetch(new URL("/api/v1/auth/logout", base), {
    method: "POST",
    headers: { cookie, "x-csrf-token": csrf },
  });
  if (res.status !== 204) throw new Error(`logout → ${res.status}`);
});
