// Curation pipeline (ADR-0003 strategy D; N-01, N-02, N-03, X-05, X-06): fixture feeds → dedupe → prefilter →
// two scores → write → publish, on a real database, with a scripted model and no network.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  CORRECTION,
  fixtureFetch,
  type FixtureItem,
  ITEMS,
  LATER,
  scriptedModel,
} from "../../../tools/fixtures/feeds.ts";
import type { Sql } from "../src/db/index.ts";
import { ingestFixtures, seedSources } from "../src/db/seed.ts";
import { dayKey, generateDailyBriefing, grounded } from "../src/intelligence/briefing.ts";
import { FetchBlocked, guardedFetchText } from "../src/intelligence/fetch.ts";
import { ProviderUnavailable } from "../src/intelligence/model.ts";
import { runIngest } from "../src/intelligence/pipeline.ts";
import { PROMPT_VERSION } from "../src/intelligence/prompts.ts";
import { freshDb } from "./helpers.ts";

let sql: Sql;
before(async () => {
  sql = await freshDb();
  await seedSources(sql, "http://feeds.example.test");
});
after(async () => {
  await sql.end();
});

const raw = async (guid: string) =>
  (
    await sql<
      { status: string; error: string | null; attempts: number }[]
    >`SELECT status, error, attempts FROM content.raw_items WHERE guid = ${guid}`
  )[0];
const story = async (guid: string) =>
  (
    await sql<
      {
        status: string;
        summary: string;
        reviewReason: string | null;
        modelVersion: string;
        policyVersion: string;
        topics: string[];
      }[]
    >`
      SELECT s.status, s.summary, s.review_reason, s.model_version, s.policy_version, s.topics
      FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = ${guid}`
  )[0];

describe("pipeline over the fixture feeds", () => {
  let items: FixtureItem[] = [...ITEMS];
  const model = scriptedModel(() => [...items, LATER]);
  const run = () => ingestFixtures(sql, () => items, model);

  test("first run: each case lands in the right state", async () => {
    const report = await run();
    assert.deepEqual(report.outcomes, {
      selected: 13,
      under_review: 2,
      not_selected: 1,
      rejected: 1,
      failed: 1,
      deferred: 0,
    });
    const invalid = report.collected.reduce((n, c) => n + c.invalid, 0);
    const duplicates = report.collected.reduce((n, c) => n + c.duplicates, 0);
    assert.deepEqual([invalid, duplicates], [1, 1], "javascript: link dropped, mirrored URL deduplicated");

    assert.equal((await story("fx-atlas-agents"))?.status, "published");
    assert.equal((await raw("fx-test-gen"))?.status, "not_selected", "T2 source below its threshold (76)");
    assert.equal((await raw("fx-cake"))?.status, "rejected");
    assert.equal((await raw("fx-old-paper"))?.status, "archived");
    assert.equal(await story("fx-old-paper"), undefined);
    assert.deepEqual(
      [(await story("fx-undated"))?.status, (await story("fx-undated"))?.reviewReason],
      ["under_review", "sem data de publicação confiável"],
    );
    assert.match((await story("fx-rumor"))?.reviewReason ?? "", /avaliações divergentes \(88 e 40\)/);
    assert.deepEqual([(await raw("fx-hijack"))?.status, await story("fx-hijack")], ["failed", undefined]);
  });

  test("provenance: model, prompt version, topic from the allowed taxonomy", async () => {
    const s = await story("fx-rag-study");
    assert.deepEqual(
      [s?.modelVersion, s?.policyVersion, s?.topics],
      ["roteirizado-fixtures@1", PROMPT_VERSION, ["dados-rag"]],
    );
  });

  test("archived items never cost a model call; rejected ones stop after the prefilter", async () => {
    const calls = async (guid: string) =>
      (
        await sql<
          { task: string }[]
        >`SELECT m.task FROM content.model_receipts m JOIN content.raw_items r ON r.id::text = m.subject_id WHERE r.guid = ${guid} ORDER BY m.task`
      ).map((r) => r.task);
    assert.deepEqual(await calls("fx-old-paper"), []);
    assert.deepEqual(await calls("fx-cake"), ["prefilter"]);
    assert.deepEqual(await calls("fx-atlas-agents"), ["prefilter", "score_a", "score_b", "write"]);
  });

  test("re-running changes nothing and pays nothing (the invalid answer is not retried)", async () => {
    const before = model.calls;
    const report = await run();
    assert.equal(model.calls, before);
    assert.deepEqual(report.outcomes, {
      selected: 0,
      under_review: 0,
      not_selected: 0,
      rejected: 0,
      failed: 0,
      deferred: 0,
    });
  });

  test("a new item and a corrected one are processed; the story keeps its history", async () => {
    items = [...items.map((i) => (i.id === CORRECTION.id ? { ...i, summary: CORRECTION.summary } : i)), LATER];
    const report = await run();
    assert.equal(report.outcomes.selected, 2);
    assert.equal((await story(CORRECTION.id))?.summary, CORRECTION.summary);
    assert.equal((await story(LATER.id))?.status, "published");
    const history = await sql<{ change: string }[]>`
      SELECT h.change FROM content.story_history h JOIN content.stories s ON s.id = h.story_id
      JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = ${CORRECTION.id} ORDER BY h.id`;
    assert.deepEqual(
      history.map((h) => h.change),
      ["created", "grouped", "corrected"],
    );
  });

  test("a retracted story is never overwritten by a later correction", async () => {
    await sql`UPDATE content.stories s SET status = 'retracted' FROM content.raw_items r WHERE r.id::text = s.upstream_id AND r.guid = 'fx-nimbus-gpu'`;
    items = items.map((i) => (i.id === "fx-nimbus-gpu" ? { ...i, summary: `${i.summary} Atualizado.` } : i));
    await run();
    assert.equal((await story("fx-nimbus-gpu"))?.status, "retracted");
  });
});

describe("events (N-06)", () => {
  const eventOf = async (guid: string) =>
    (
      await sql<{ eventId: string | null }[]>`
        SELECT s.event_id FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = ${guid}`
    )[0]?.eventId ?? null;

  test("same occurrence from another source and a direct follow-up join one event; a roundup never does", async () => {
    const atlas = await eventOf("fx-atlas-agents");
    assert.ok(atlas);
    assert.equal(await eventOf("fx-atlas-coverage"), atlas);
    const lumen = await eventOf("fx-lumen-model");
    assert.ok(lumen && lumen !== atlas);
    assert.equal(await eventOf("fx-lumen-eval"), lumen);
    assert.equal(await eventOf("fx-roundup"), null);
    assert.equal(await eventOf("fx-rag-study"), null);
    const [ev] = await sql<
      { title: string; heatScore: number }[]
    >`SELECT title, heat_score FROM content.events WHERE id = ${atlas}`;
    assert.deepEqual(
      [ev?.title, ev?.heatScore],
      ["Atlas AI lança framework aberto para orquestrar agentes com aprovação humana", 2],
    );
  });

  test("every judgement is kept, including the ones that did not attach", async () => {
    const rows = await sql<{ relation: string; attached: boolean }[]>`
      SELECT d.relation, d.attached FROM content.event_decisions d JOIN content.stories s ON s.id = d.story_id
      JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = 'fx-roundup'`;
    assert.ok(rows.some((r) => r.relation === "ROUNDUP" && !r.attached));
    assert.ok(rows.every((r) => !r.attached));
  });
});

describe("daily briefing (N-07)", () => {
  const ctx = () => ({ sql, provider: scriptedModel(), dailyLimit: 1000 });
  // The day of the lead story, so the test does not depend on the hour it runs.
  let today = "";
  before(async () => {
    const [s] = await sql<{ sortAt: string }[]>`
      SELECT s.sort_at FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = 'fx-atlas-agents'`;
    today = dayKey(new Date(s?.sortAt ?? Date.now()));
  });

  test("one story per event, grounded overview, quiet day publishes nothing", async () => {
    const result = await generateDailyBriefing(ctx(), today, { force: true });
    assert.equal(result?.overview, true);
    const [b] = await sql<{ overview: string; items: { storyId: string }[] }[]>`
      SELECT overview, items FROM content.briefings WHERE period_key = ${today}`;
    const ids = b?.items.map((i) => i.storyId) ?? [];
    const [coverage] = await sql<{ id: string }[]>`
      SELECT s.id FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = 'fx-atlas-coverage'`;
    assert.ok(!ids.includes(coverage?.id ?? ""), "the lower-ranked coverage of an event stays out");
    assert.match(b?.overview ?? "", /^Destaques do dia: /);
    assert.equal(await generateDailyBriefing(ctx(), "2001-01-01"), null);
  });

  test("an overview naming what the items do not name is discarded", async () => {
    const liar = {
      name: "inventa@1",
      complete: async () => ({ overview: "A Optsolv anunciou o GPT-9 com ganho de 900% em todos os testes." }),
    };
    const result = await generateDailyBriefing({ sql, provider: liar, dailyLimit: 1000 }, today, { force: true });
    assert.deepEqual([result?.items !== undefined, result?.overview], [true, false]);
    assert.equal(grounded("A Atlas AI lançou o framework.", "Atlas AI lança framework"), true);
    assert.equal(grounded("Hoje a Atlas AI cortou 40% do custo.", "Atlas AI lança framework"), false);
  });
});

describe("failures are contained", () => {
  test("one feed down: its source records the error, the others are collected", async () => {
    const fetchFeed = fixtureFetch();
    const report = await runIngest(
      {
        sql,
        fetchFeed: (url) => (url.includes("vetor") ? Promise.reject(new Error("resposta 503")) : fetchFeed(url)),
        model: { provider: scriptedModel(), dailyLimit: 1000 },
        language: "pt-BR",
      },
      { force: true },
    );
    assert.equal(report.collected.find((c) => c.sourceId === "vetor")?.error, "resposta 503");
    assert.ok(report.collected.filter((c) => c.sourceId !== "vetor").every((c) => c.error === null));
    const [s] = await sql<{ lastError: string }[]>`SELECT last_error FROM content.sources WHERE id = 'vetor'`;
    assert.equal(s?.lastError, "resposta 503");
  });

  test("daily budget reached: evaluation stops, items stay pending, nothing is called", async () => {
    const model = scriptedModel();
    const fresh: FixtureItem = {
      ...LATER,
      id: "fx-budget",
      title: "Item que chega com o orçamento esgotado",
      url: "https://comite.example.org/guias/orcamento",
    };
    const report = await runIngest(
      { sql, fetchFeed: fixtureFetch(() => [fresh]), model: { provider: model, dailyLimit: 0 }, language: "pt-BR" },
      { force: true },
    );
    assert.equal(report.outcomes.deferred, 1);
    assert.equal(model.calls, 0);
    assert.equal((await raw("fx-budget"))?.status, "discovered");
  });

  test("selection gates follow the model's scale: 45/45 passes for gpt-6-luna, not on the AIHOT gate", async () => {
    const steady = (name: string) => ({
      name,
      complete: async (task: string) =>
        task === "prefilter"
          ? { label: "PASS", reason: "IA" }
          : task.startsWith("score")
            ? { attentionScore: 45 }
            : task === "write"
              ? {
                  headline: "Guia de calibração publicado",
                  summary: "Um guia sintético para testar o corte.",
                  reason: "Teste de corte.",
                  topic: null,
                }
              : { decisions: [] },
    });
    const outcome = async (name: string, id: string) => {
      const item: FixtureItem = { ...LATER, id, title: `Guia ${id}`, url: `https://comite.example.org/guias/${id}` };
      await runIngest(
        {
          sql,
          fetchFeed: fixtureFetch(() => [item]),
          model: { provider: steady(name), dailyLimit: 1000 },
          language: "pt-BR",
        },
        { force: true },
      );
      return (await raw(id))?.status;
    };
    // Items left pending by earlier tests may be evaluated too; only these two matter here.
    assert.equal(await outcome("foundry:gpt-6-luna", "fx-gate-luna"), "selected");
    assert.equal(await outcome("outro-modelo@1", "fx-gate-other"), "not_selected");
    // Readers see the reference scale: 45 against the T1 gate 43 is 45 × 60 / 43 ≈ 62.8 ("moderada"), not 45.
    const [story] = await sql<{ editorialScore: number }[]>`
      SELECT s.editorial_score FROM content.stories s JOIN content.raw_items r ON s.upstream_id = r.id::text
      WHERE r.guid = 'fx-gate-luna'`;
    assert.equal(story?.editorialScore, 62.8);
  });

  test("provider unavailable (no permission, quota, outage): items wait without spending attempts", async () => {
    const denied = {
      name: "negado@1",
      complete: async () => {
        throw new ProviderUnavailable("Foundry respondeu 403: PermissionDenied");
      },
    };
    const fresh: FixtureItem = {
      ...LATER,
      id: "fx-denied",
      title: "Item que chega com o provedor sem permissão",
      url: "https://comite.example.org/guias/permissao",
    };
    const report = await runIngest(
      { sql, fetchFeed: fixtureFetch(() => [fresh]), model: { provider: denied, dailyLimit: 1000 }, language: "pt-BR" },
      { force: true },
    );
    assert.equal(report.outcomes.deferred, 1);
    assert.equal(report.outcomes.failed, 0);
    const item = await raw("fx-denied");
    assert.equal(item?.status, "discovered");
    assert.equal(item?.attempts, 0);
  });
});

describe("guarded fetch (SSRF)", () => {
  let server: Server;
  let base = "";
  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect-internal") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
        return res.end();
      }
      if (req.url === "/big") return res.end("x".repeat(5000));
      if (req.url === "/latin1") {
        res.writeHead(200, { "content-type": "application/rss+xml; charset=ISO-8859-1" });
        return res.end(Buffer.from("<rss><title>Inteligência artificial</title></rss>", "latin1"));
      }
      if (req.url === "/declared") {
        res.writeHead(200, { "content-type": "text/xml" });
        return res.end(Buffer.from('<?xml version="1.0" encoding="windows-1252"?><rss>ação</rss>', "latin1"));
      }
      res.writeHead(200, { "content-type": "application/rss+xml" });
      res.end("<rss/>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  test("a private address is refused unless explicitly allowed (dev feeds)", async () => {
    await assert.rejects(guardedFetchText(`${base}/feed.xml`), FetchBlocked);
    assert.equal(await guardedFetchText(`${base}/feed.xml`, { privateHosts: ["127.0.0.1"] }), "<rss/>");
  });

  test("a name resolving to loopback is refused at connect time", async () => {
    const port = new URL(base).port;
    await assert.rejects(guardedFetchText(`http://localhost:${port}/feed.xml`), FetchBlocked);
  });

  test("every redirect hop is checked again", async () => {
    await assert.rejects(guardedFetchText(`${base}/redirect-internal`, { privateHosts: ["127.0.0.1"] }), FetchBlocked);
  });

  test("Latin-1 feeds decode by header or XML declaration", async () => {
    const opts = { privateHosts: ["127.0.0.1"] };
    assert.match(await guardedFetchText(`${base}/latin1`, opts), /Inteligência artificial/);
    assert.match(await guardedFetchText(`${base}/declared`, opts), /ação/);
  });

  test("size limit and non-web schemes", async () => {
    await assert.rejects(guardedFetchText(`${base}/big`, { privateHosts: ["127.0.0.1"], maxBytes: 1000 }), /maior que/);
    await assert.rejects(guardedFetchText("file:///etc/passwd"), FetchBlocked);
  });
});
