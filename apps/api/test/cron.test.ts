// Hosted schedule (ADR-0018): GET /api/cron/ingest runs one curation pass, only with the bearer secret, one at a time.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { connect, type Sql } from "../src/db/index.ts";
import { freshDb, TEST_URL } from "./helpers.ts";

const SECRET = "s".repeat(40);
let sql: Sql;
let app: FastifyInstance;

before(async () => {
  sql = await freshDb();
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: "test", CRON_SECRET: SECRET });
  app = await buildApp({ sql, config, logger: false });
});
after(async () => {
  await app.close();
  await sql.end();
});

const call = (authorization?: string) =>
  app.inject({ url: "/api/cron/ingest", headers: authorization ? { authorization } : {} });

test("without the bearer secret the endpoint looks absent", async () => {
  assert.equal((await call()).statusCode, 404);
  assert.equal((await call(`Bearer ${"x".repeat(40)}`)).statusCode, 404);
  assert.equal((await call(SECRET)).statusCode, 404);
});

test("with the secret it runs one curation pass", async () => {
  const res = await call(`Bearer ${SECRET}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "done");
});

test("a second delivery while a run holds the lock is skipped", async () => {
  const other = connect(TEST_URL, 1);
  try {
    await other.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(4201101)`;
      const res = await call(`Bearer ${SECRET}`);
      assert.equal(res.json().status, "skipped");
    });
  } finally {
    await other.end();
  }
});

test("Vercel requires a cron secret; without one the endpoint is not registered", async () => {
  assert.throws(() => loadConfig({ DATABASE_URL: TEST_URL, PLATFORM: "vercel" }), /CRON_SECRET/);
  const plain = await buildApp({ sql, config: loadConfig({ DATABASE_URL: TEST_URL }), logger: false });
  assert.equal((await plain.inject({ url: "/api/cron/ingest" })).statusCode, 404);
  await plain.close();
});
