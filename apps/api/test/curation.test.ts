// Polite collection, member submissions (N-11), curator override and article reading, on a real database with a
// scripted model and no network. Page parsing is covered without a database at the end.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { feedXml, type FixtureItem, LATER } from "../../../tools/fixtures/feeds.ts";
import type { Sql } from "../src/db/index.ts";
import { seedSources } from "../src/db/seed.ts";
import type { FetchResult } from "../src/intelligence/fetch.ts";
import type { ModelProvider } from "../src/intelligence/model.ts";
import { articleText, decodeEntities, pageMetadata } from "../src/intelligence/page.ts";
import { type IngestDeps, runIngest } from "../src/intelligence/pipeline.ts";
import { ANA, freshDb } from "./helpers.ts";

let sql: Sql;
before(async () => {
  sql = await freshDb();
  await seedSources(sql, "http://feeds.example.test");
  // Only the source each test feeds is collected.
  await sql`UPDATE content.sources SET active = (id IN ('comite', 'indicacoes'))`;
});
after(async () => {
  await sql.end();
});

/** A model with fixed scores that records every input it reads. */
function steady(name: string, score: number) {
  const inputs: { task: string; user: string }[] = [];
  const provider: ModelProvider = {
    name,
    async complete(task, _system, user) {
      inputs.push({ task, user });
      if (task === "prefilter") return { label: "PASS", reason: "trata de IA" };
      if (task.startsWith("score")) return { attentionScore: score };
      if (task === "write")
        return {
          headline: "Título escrito pelo modelo",
          summary: "Resumo sintético escrito a partir do material.",
          reason: "Relevante para o teste.",
          topic: null,
        };
      if (task === "group") return { decisions: [] };
      return { overview: "Panorama sintético do dia de teste." };
    },
  };
  return { provider, inputs };
}

const deps = (provider: ModelProvider, extra: Partial<IngestDeps> = {}): IngestDeps => ({
  sql,
  fetchFeed: async () => feedXml("comite", [], Date.now()),
  model: { provider, dailyLimit: 1000 },
  language: "pt-BR",
  ...extra,
});

const item = (id: string): FixtureItem => ({
  ...LATER,
  id,
  title: `Item ${id}`,
  url: `https://comite.example.org/x/${id}`,
});

describe("conditional GET", () => {
  test("validators of the last full response are replayed; a 304 changes nothing", async () => {
    const seen: { etag: string | null; lastModified: string | null; accept?: string }[] = [];
    let first = true;
    const fetchFeed = async (_url: string, v: (typeof seen)[number]) => {
      seen.push(v);
      if (!first) return { notModified: true } satisfies FetchResult;
      first = false;
      return {
        notModified: false,
        body: feedXml("comite", [item("fx-etag")], Date.now()),
        etag: '"v1"',
        lastModified: "Mon, 02 Nov 2026 12:00:00 GMT",
      } satisfies FetchResult;
    };
    const { provider } = steady("teste@1", 10);
    const one = await runIngest(deps(provider, { fetchFeed }), { force: true });
    const two = await runIngest(deps(provider, { fetchFeed }), { force: true });
    assert.equal(one.collected[0]?.added, 1);
    assert.deepEqual(seen[1], { etag: '"v1"', lastModified: "Mon, 02 Nov 2026 12:00:00 GMT", accept: "feed" });
    assert.equal(two.collected[0]?.notModified, true);
    assert.equal(two.collected[0]?.added, 0);
  });
});

describe("member submissions (N-11)", () => {
  const page = `<html><head><title>fallback</title>
    <meta property="og:title" content="Laboratório publica avaliação aberta de agentes &amp; ferramentas">
    <meta name="description" content="Conjunto de tarefas para medir agentes que usam ferramentas.">
    <meta property="article:published_time" content="2026-11-02T10:00:00Z"></head><body><p>texto</p></body></html>`;

  test("a submitted link becomes an item, is judged like any other, and the submission follows the verdict", async () => {
    const [sub] = await sql<{ id: string }[]>`
      INSERT INTO content.submissions (submitted_by, url, normalized_url, status)
      VALUES (${ANA}, 'https://lab.example.org/avaliacao', 'https://lab.example.org/avaliacao', 'pending_review') RETURNING id`;
    const { provider, inputs } = steady("teste@1", 90);
    const report = await runIngest(deps(provider, { fetchPage: async () => page }), { force: true });
    assert.deepEqual(report.submissions, { queued: 1, linked: 0, failed: 0 });
    const [row] = await sql<{ status: string; storyId: string | null; sourceId: string; title: string }[]>`
      SELECT s.status, s.story_id, r.source_id, r.title FROM content.submissions s JOIN content.raw_items r ON r.id = s.raw_item_id
      WHERE s.id = ${sub?.id ?? ""}`;
    assert.equal(row?.sourceId, "indicacoes");
    assert.equal(row?.title, "Laboratório publica avaliação aberta de agentes & ferramentas");
    assert.equal(row?.status, "accepted");
    assert.ok(row?.storyId);
    // The model saw the preview description, not the page body.
    assert.ok(inputs.some((i) => i.user.includes("Conjunto de tarefas para medir agentes")));
    assert.ok(!inputs.some((i) => i.user.includes("texto")));
  });

  test("a page that cannot be read stays with its reason for curators and is not retried", async () => {
    await sql`
      INSERT INTO content.submissions (submitted_by, url, normalized_url, status)
      VALUES (${ANA}, 'https://lab.example.org/quebrada', 'https://lab.example.org/quebrada', 'pending_review')`;
    let calls = 0;
    const fetchPage = async () => {
      calls++;
      throw new Error("resposta 404 de lab.example.org");
    };
    const { provider } = steady("teste@1", 90);
    await runIngest(deps(provider, { fetchPage }), { force: true });
    await runIngest(deps(provider, { fetchPage }), { force: true });
    assert.equal(calls, 1);
    const [row] = await sql<{ status: string; error: string }[]>`
      SELECT status, error FROM content.submissions WHERE normalized_url = 'https://lab.example.org/quebrada'`;
    assert.equal(row?.status, "pending_review");
    assert.match(row?.error ?? "", /404/);
  });
});

describe("curator override and article reading", () => {
  test("an item below the gate is published when a curator forces it", async () => {
    const fetchFeed = async () => feedXml("comite", [item("fx-forced")], Date.now());
    const { provider } = steady("teste@1", 20);
    await runIngest(deps(provider, { fetchFeed }), { force: true });
    const [before] = await sql<
      { id: string; status: string }[]
    >`SELECT id, status FROM content.raw_items WHERE guid = 'fx-forced'`;
    assert.equal(before?.status, "not_selected");
    await sql`UPDATE content.raw_items SET status = 'discovered', forced_by = ${ANA} WHERE id = ${before?.id ?? ""}`;
    await runIngest(deps(provider, { fetchFeed }), { force: true });
    const [after] = await sql<{ status: string; storyStatus: string }[]>`
      SELECT r.status, s.status AS story_status FROM content.raw_items r JOIN content.stories s ON s.upstream_id = r.id::text
      WHERE r.guid = 'fx-forced'`;
    assert.equal(after?.status, "selected");
    assert.equal(after?.storyStatus, "published");
  });

  test("the article text reaches scoring and writing, not the prefilter, and the gate switches scale", async () => {
    const fetchFeed = async () => feedXml("comite", [item("fx-article")], Date.now());
    // 45/45 passes the excerpt gate of gpt-6-luna (43) but not the uncalibrated "+artigo" one (AIHOT: 60).
    const { provider, inputs } = steady("foundry:gpt-6-luna", 45);
    await runIngest(deps(provider, { fetchFeed, readArticle: async () => "TEXTO-DO-ARTIGO completo para análise." }), {
      force: true,
    });
    const read = (task: string) =>
      inputs.filter((i) => i.task === task).some((i) => i.user.includes("TEXTO-DO-ARTIGO"));
    assert.equal(read("prefilter"), false);
    assert.equal(read("score_a"), true);
    const [row] = await sql<{ status: string }[]>`SELECT status FROM content.raw_items WHERE guid = 'fx-article'`;
    assert.equal(row?.status, "not_selected");
    // Never stored: the item keeps only the feed excerpt.
    const [stored] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM content.raw_items WHERE excerpt LIKE '%TEXTO-DO-ARTIGO%' OR title LIKE '%TEXTO-DO-ARTIGO%'`;
    assert.equal(stored?.n, 0);
  });
});

describe("page parsing", () => {
  test("metadata prefers Open Graph, decodes entities and keeps no markup", () => {
    const meta = pageMetadata(
      `<title>Site &#8211; Título</title><meta content='Desc &lt;b&gt;ok&lt;/b&gt;' name='description'>`,
    );
    assert.equal(meta.title, "Site – Título");
    assert.equal(meta.description, "Desc ok");
    assert.equal(decodeEntities("a &amp; b &#x41; &nbsp;c &bogus;"), "a & b A  c &bogus;");
  });

  test("article text keeps the article paragraphs and drops scripts, navigation and asides", () => {
    const long = "Parágrafo com conteúdo suficiente para contar como texto do artigo em si.";
    const html = `<nav><p>${long} menu</p></nav><script>alert(1)</script><article><h2>Seção com título longo o bastante para contar</h2>
      <p>${long} um</p><aside><p>${long} propaganda</p></aside><p>${long} dois</p><p>${long} três</p></article>`;
    const text = articleText(html) ?? "";
    assert.match(text, /um\n/);
    assert.match(text, /três/);
    assert.doesNotMatch(text, /menu|propaganda|alert/);
    assert.equal(articleText("<p>curto</p>"), null);
  });
});
