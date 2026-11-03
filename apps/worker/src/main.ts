// Opt News worker: runs the curation pipeline on a schedule. pg-boss gives retries with exponential backoff and a
// dead-letter queue (content.ingest.dlq) that stays visible in the database for operators.
//   node apps/worker/src/main.ts          → scheduled worker
//   node apps/worker/src/main.ts --once   → one run (all active sources), then exit
import { loadConfig } from "@optnews/api/config";
import { connect } from "@optnews/api/db/index";
import { dayKey, generateDailyBriefing } from "@optnews/api/intelligence/briefing";
import { guardedFetch } from "@optnews/api/intelligence/fetch";
import { articleText } from "@optnews/api/intelligence/page";
import { foundryProvider } from "@optnews/api/intelligence/foundry";
import { heuristicProvider } from "@optnews/api/intelligence/model";
import { type IngestDeps, runIngest } from "@optnews/api/intelligence/pipeline";
import { PgBoss } from "pg-boss";

const config = loadConfig();
const sql = connect(config.DATABASE_URL, 4);
const cron = process.env.INGEST_CRON ?? "*/15 * * * *";
// Pages are larger than feeds; the same guard (SSRF, redirects, deadline) applies.
const fetchPage = async (url: string) => {
  const res = await guardedFetch(url, {
    privateHosts: config.INGEST_PRIVATE_HOSTS,
    accept: "html",
    maxBytes: 4 * 1024 * 1024,
  });
  return res.notModified ? "" : res.body;
};
const deps: IngestDeps = {
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

async function run(force: boolean) {
  const started = Date.now();
  const report = await runIngest(deps, { force });
  // Today's briefing follows the day as it fills up; an unchanged list reuses its receipt, so it costs nothing.
  const briefing = await generateDailyBriefing({ sql, ...deps.model }, dayKey(new Date()), { force: true });
  console.log(JSON.stringify({ msg: "content.ingest done", ms: Date.now() - started, ...report, briefing }));
}

if (process.argv.includes("--once")) {
  try {
    await run(true);
  } finally {
    await sql.end();
  }
} else {
  const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: "ops_jobs" });
  boss.on("error", (error) => console.error(JSON.stringify({ msg: "pg-boss error", error: String(error) })));
  await boss.start();
  await boss.createQueue("content.ingest.dlq");
  await boss.createQueue("content.ingest", {
    policy: "singleton",
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    deadLetter: "content.ingest.dlq",
  });
  await boss.schedule("content.ingest", cron);
  await boss.work("content.ingest", async () => {
    await run(false);
  });
  // Run once at start so a fresh environment does not wait for the first cron tick.
  await boss.send("content.ingest", {});
  console.log(JSON.stringify({ msg: "worker started", cron }));

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, async () => {
      await boss.stop({ graceful: true });
      await sql.end({ timeout: 5 });
      process.exit(0);
    });
  }
}
