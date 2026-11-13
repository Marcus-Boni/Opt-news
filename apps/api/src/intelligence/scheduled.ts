// One curation run: collect every due source, score and publish, then refresh today's briefing. Shared by the
// long-running worker (pg-boss schedule) and the hosted cron endpoint (Vercel), so both run exactly the same code.
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.ts";
import type { Sql } from "../db/index.ts";
import { dayKey, generateDailyBriefing } from "./briefing.ts";
import { guardedFetch } from "./fetch.ts";
import { foundryProvider } from "./foundry.ts";
import { heuristicProvider } from "./model.ts";
import { articleText } from "./page.ts";
import { type IngestDeps, runIngest } from "./pipeline.ts";

export function ingestDeps(config: Config, sql: Sql): IngestDeps {
  // Pages are larger than feeds; the same guard (SSRF, redirects, deadline) applies.
  const fetchPage = async (url: string) => {
    const res = await guardedFetch(url, {
      privateHosts: config.INGEST_PRIVATE_HOSTS,
      accept: "html",
      maxBytes: 4 * 1024 * 1024,
    });
    return res.notModified ? "" : res.body;
  };
  return {
    sql,
    fetchFeed: (url, validators) => guardedFetch(url, { privateHosts: config.INGEST_PRIVATE_HOSTS, ...validators }),
    model: {
      provider:
        config.MODEL_PROVIDER === "foundry"
          ? foundryProvider({ endpoint: config.FOUNDRY_ENDPOINT ?? "", deployment: config.FOUNDRY_DEPLOYMENT ?? "" })
          : heuristicProvider,
      dailyLimit: config.MODEL_DAILY_CALL_LIMIT,
    },
    language: config.CONTENT_LANGUAGE,
    fetchPage,
    readArticle: config.ARTICLE_READING ? async (url) => articleText(await fetchPage(url)) : undefined,
  };
}

/** Arbitrary constant: one curation run at a time across every instance (the scheduler may deliver twice). */
const INGEST_LOCK = 4_201_101;
/** Vercel stops the function at 300 s: start no new work after 240 s, leaving room for the briefing and the reply. */
const RUN_BUDGET_MS = 240_000;

/**
 * Hosted schedulers (Vercel Cron) call GET /api/cron/ingest with `Authorization: Bearer <CRON_SECRET>`. Registered
 * only when CRON_SECRET is set; a wrong or missing secret is answered like a missing route.
 */
export function registerCron(app: FastifyInstance, config: Config, sql: Sql): void {
  const secret = config.CRON_SECRET;
  if (!secret) return;
  const expected = Buffer.from(`Bearer ${secret}`);
  app.get("/api/cron/ingest", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const given = Buffer.from(req.headers.authorization ?? "");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.code(404).type("application/problem+json").send({ title: "Não encontrado", status: 404 });
    }
    // The transaction holds the advisory lock (and one connection) for the run; a second delivery skips.
    return sql.begin(async (tx) => {
      const [lock] = await tx<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${INGEST_LOCK}) AS ok`;
      if (!lock?.ok) return { status: "skipped", reason: "another run in progress" };
      const { msg: _, ...summary } = await runScheduled(ingestDeps(config, sql), false, Date.now() + RUN_BUDGET_MS);
      return { status: "done", ...summary };
    });
  });
}

/** `deadline` (epoch ms) bounds a hosted run; the long-running worker passes none. */
export async function runScheduled(deps: IngestDeps, force: boolean, deadline?: number) {
  const started = Date.now();
  const report = await runIngest(deps, { force, deadline });
  // Today's briefing follows the day as it fills up; an unchanged list reuses its receipt, so it costs nothing.
  const briefing = await generateDailyBriefing({ sql: deps.sql, ...deps.model }, dayKey(new Date()), { force: true });
  const summary = { msg: "content.ingest done", ms: Date.now() - started, ...report, briefing };
  console.log(JSON.stringify(summary));
  return summary;
}
