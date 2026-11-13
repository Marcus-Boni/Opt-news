// Vercel build (ADR-0018): writes .vercel/output in the Build Output API v3 format, so Vercel serves exactly what we
// built: the web as static files, and the API bundled into one Node function (no reliance on Vercel compiling the
// repo's .ts imports). Run after `npm run build`:  node tools/vercel-build.ts
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";
import { CSP } from "../apps/api/src/app.ts";

const root = new URL("../", import.meta.url);
const out = new URL(".vercel/output/", root);
const fn = new URL("functions/api.func/", out);
const json = (file: URL, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

/** Daily at 09:00 UTC (06:00 in São Paulo): the most a Hobby plan allows. On Pro, "*\/15 * * * *" matches the worker. */
const INGEST_SCHEDULE = process.env.INGEST_SCHEDULE ?? "0 9 * * *";

// Same headers the API sends (apps/api/src/app.ts), for the static files Vercel serves without the API.
const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
};

await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await cp(new URL("apps/web/dist/", root), new URL("static/", out), { recursive: true });

await build({
  input: fileURLToPath(new URL("apps/api/src/vercel.ts", root)),
  platform: "node",
  logLevel: "warn",
  output: { file: fileURLToPath(new URL("index.mjs", fn)), format: "esm", codeSplitting: false },
});

await json(new URL(".vc-config.json", fn), {
  runtime: "nodejs24.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  // Fastify reads the raw request stream; Vercel's body helpers must not consume it first.
  shouldAddHelpers: false,
  maxDuration: 300,
  // Next to the database (Azure Brazil South).
  regions: ["gru1"],
  environment: { NODE_ENV: "production", PLATFORM: "vercel" },
});

await json(new URL("config.json", out), {
  version: 3,
  routes: [
    { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
    { src: "^/(?!api/|healthz$|readyz$).*$", headers: SECURITY_HEADERS, continue: true },
    // The function keeps the original URL, so Fastify routes it like any other request.
    { src: "^/(api/.*|healthz|readyz)$", dest: "/api" },
    { handle: "filesystem" },
    // A missing hashed file is a 404, not the app shell (HTML served as JS hides a broken deploy).
    { src: "^/assets/.*$", status: 404 },
    { src: "^/.*$", dest: "/index.html", headers: { "cache-control": "no-cache" } },
  ],
  crons: [{ path: "/api/cron/ingest", schedule: INGEST_SCHEDULE }],
});

console.log(`.vercel/output pronto (cron ${INGEST_SCHEDULE})`);
