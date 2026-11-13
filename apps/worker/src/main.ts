// Opt News worker: runs the curation pipeline on a schedule. pg-boss gives retries with exponential backoff and a
// dead-letter queue (content.ingest.dlq) that stays visible in the database for operators.
//   node apps/worker/src/main.ts          → scheduled worker
//   node apps/worker/src/main.ts --once   → one run (all active sources), then exit
import { loadConfig } from "@optnews/api/config";
import { connect } from "@optnews/api/db/index";
import { ingestDeps, runScheduled } from "@optnews/api/intelligence/scheduled";
import { PgBoss } from "pg-boss";

const config = loadConfig();
const sql = connect(config.DATABASE_URL, 4);
const cron = process.env.INGEST_CRON ?? "*/15 * * * *";
const deps = ingestDeps(config, sql);
const run = (force: boolean) => runScheduled(deps, force);

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
