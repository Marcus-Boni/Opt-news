// Vercel Function entry (ADR-0018). tools/vercel-build.ts bundles this file into .vercel/output/functions/api.func;
// every /api/*, /healthz and /readyz request lands here with its original URL and Fastify routes it as usual.
// One app and one small pool per instance: Fluid compute reuses the instance across concurrent requests.
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { connect } from "./db/index.ts";

const config = loadConfig();
const sql = connect(config.DATABASE_URL, 5);
const ready = buildApp({ sql, config }).then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await ready;
  app.server.emit("request", req, res);
}
