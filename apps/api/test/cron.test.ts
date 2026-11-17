// Hosted schedule (ADR-0018): GET /api/cron/ingest runs one curation pass, only with the bearer secret, one at a time.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { publishStory } from "../src/content/publish.ts";
import { connect, type Sql } from "../src/db/index.ts";
import { dayKey } from "../src/intelligence/briefing.ts";
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

test("a run also closes yesterday's briefing: stories found after midnight are dated the day before", async () => {
  const yesterday = new Date(Date.now() - 86_400_000);
  await sql`INSERT INTO content.sources (id, name, kind, feed_url, tier, active)
            VALUES ('ontem', 'Ontem', 'rss', 'https://ontem.example/feed', 'T1', false)`;
  await publishStory(sql, {
    sourceId: "ontem",
    canonicalUrl: "https://ontem.example/a",
    originalUrl: "https://ontem.example/a",
    sourceName: "Ontem",
    originalPublishedAt: yesterday.toISOString(),
    firstSeenAt: new Date().toISOString(),
    headline: "Notícia publicada ontem e encontrada hoje",
    summary: null,
    selectionReason: null,
    language: "pt-BR",
    topics: [],
    editorialScore: 50,
    evidenceUrls: ["https://ontem.example/a"],
    publicationState: "published",
    reviewReason: null,
    provenance: { provider: "teste", upstreamId: "ontem-a", modelVersion: null, policyVersion: null },
  });
  assert.equal((await call(`Bearer ${SECRET}`)).json().status, "done");
  const [b] = await sql`SELECT 1 FROM content.briefings WHERE kind = 'daily' AND period_key = ${dayKey(yesterday)}`;
  assert.ok(b, "yesterday's briefing exists");
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
