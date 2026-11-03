// Sources without a feed (ADR-0015): links from a listing page, preview metadata from each new article page, on a
// real database with a scripted model and no network. Admin rules for the link prefix at the end.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type { Sql } from "../src/db/index.ts";
import { listingLinks } from "../src/intelligence/listing.ts";
import type { ModelProvider } from "../src/intelligence/model.ts";
import { type IngestDeps, runIngest } from "../src/intelligence/pipeline.ts";
import { as, EVA, freshDb, testApp } from "./helpers.ts";

let sql: Sql;
let app: FastifyInstance;
before(async () => {
  sql = await freshDb();
  app = await testApp(sql);
  await sql`
    INSERT INTO content.sources (id, name, kind, feed_url, link_prefix, tier, interval_minutes)
    VALUES ('lab-news', 'Lab News', 'web_list', 'https://lab.example.org/news', 'https://lab.example.org/news/', 'T1', 60)`;
});
after(async () => {
  await app.close();
  await sql.end();
});

const provider: ModelProvider = {
  name: "teste@1",
  async complete(task) {
    if (task === "prefilter") return { label: "PASS", reason: "trata de IA" };
    if (task.startsWith("score")) return { attentionScore: 90 };
    if (task === "write")
      return {
        headline: "Título escrito pelo modelo",
        summary: "Resumo sintético escrito a partir do material.",
        reason: "Relevante para o teste.",
        topic: null,
      };
    if (task === "group") return { decisions: [] };
    return { overview: "Panorama sintético." };
  },
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const article = (title: string, publishedAt: string | null) => `<html><head>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="Descrição de ${title}.">
  ${publishedAt ? `<meta property="article:published_time" content="${publishedAt}">` : ""}
  </head><body><p>CORPO-DO-ARTIGO que não pode ser guardado.</p></body></html>`;

function site(listing: string, pages: Record<string, string>) {
  const read: string[] = [];
  const deps: IngestDeps = {
    sql,
    fetchFeed: async () => listing,
    fetchPage: async (url) => {
      read.push(url);
      const page = pages[url];
      if (!page) throw new Error(`resposta 404 de ${url}`);
      return page;
    },
    model: { provider, dailyLimit: 1000 },
    language: "pt-BR",
  };
  return { deps, read };
}

describe("listing links", () => {
  test("only article links under the prefix, absolute, once, in page order", () => {
    const html = `<a href="/news">Notícias</a><a class="card" href="/news/modelo-novo#top">Modelo</a>
      <a href="https://lab.example.org/news/agentes?ref=home">Agentes</a><a href="/news/modelo-novo">De novo</a>
      <a href="https://ads.example.net/news/x">Anúncio</a><a href="/careers">Vagas</a><a href="javascript:alert(1)">x</a>`;
    assert.deepEqual(listingLinks(html, "https://lab.example.org/news", "https://lab.example.org/news/"), [
      "https://lab.example.org/news/modelo-novo",
      "https://lab.example.org/news/agentes?ref=home",
    ]);
  });
});

describe("web_list collection", () => {
  test("new articles become items from their preview metadata; undated pages and the article body are skipped", async () => {
    const listing = `<a href="/news/categoria">Categoria</a><a href="/news/modelo">Modelo</a><a href="/news/quebrada">Q</a>`;
    const { deps, read } = site(listing, {
      "https://lab.example.org/news/categoria": article("Categoria", null),
      "https://lab.example.org/news/modelo": article("Laboratório lança modelo &amp; ferramenta", hoursAgo(2)),
    });
    const report = await runIngest(deps, { force: true });
    const collected = report.collected.find((c) => c.sourceId === "lab-news");
    assert.deepEqual([collected?.added, collected?.invalid, collected?.error], [1, 2, null]);
    const rows = await sql<{ title: string; excerpt: string; status: string }[]>`
      SELECT title, excerpt, status FROM content.raw_items WHERE source_id = 'lab-news'`;
    assert.deepEqual(
      rows.map((r) => [r.title, r.excerpt, r.status]),
      [["Laboratório lança modelo & ferramenta", "Descrição de Laboratório lança modelo & ferramenta.", "selected"]],
    );
    const [body] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM content.raw_items WHERE excerpt LIKE '%CORPO-DO-ARTIGO%'`;
    assert.equal(body?.n, 0);
    // Known articles are not read again; pages that failed are.
    read.length = 0;
    await runIngest(deps, { force: true });
    assert.deepEqual(read, ["https://lab.example.org/news/categoria", "https://lab.example.org/news/quebrada"]);
  });

  test("at most 10 new pages per run; old articles are stored archived and not read again", async () => {
    const slugs = Array.from({ length: 12 }, (_, i) => `a${i}`);
    const listing = slugs.map((s) => `<a href="/news/${s}">${s}</a>`).join("");
    const pages = Object.fromEntries(
      slugs.map((s, i) => [`https://lab.example.org/news/${s}`, article(`Artigo antigo ${s}`, hoursAgo(200 + i))]),
    );
    const { deps, read } = site(listing, pages);
    const report = await runIngest(deps, { force: true });
    assert.equal(read.length, 10);
    assert.equal(report.collected.find((c) => c.sourceId === "lab-news")?.archived, 10);
    read.length = 0;
    await runIngest(deps, { force: true });
    assert.deepEqual(read, ["https://lab.example.org/news/a10", "https://lab.example.org/news/a11"]);
  });
});

describe("listing sources in the admin", () => {
  test("the link prefix defaults to the listing and must stay on its site", async () => {
    const eva = await as(app, EVA);
    const body = { name: "Blog sem feed", kind: "web_list", feedUrl: "https://blog.example.org/posts", tier: "T1" };
    const elsewhere = await eva.post("/api/v1/admin/sources", { ...body, linkPrefix: "https://outro.example.org/" });
    assert.equal(elsewhere.statusCode, 422);
    const created = await eva.post("/api/v1/admin/sources", body);
    assert.equal(created.statusCode, 201);
    assert.deepEqual([created.json().kind, created.json().linkPrefix], ["web_list", "https://blog.example.org/posts/"]);
    const rss = await eva.post("/api/v1/admin/sources", {
      name: "Feed comum",
      feedUrl: "https://blog.example.org/feed.xml",
      tier: "T2",
    });
    assert.equal(rss.json().linkPrefix, null);
    assert.equal(
      (await eva.patch("/api/v1/admin/sources/feed-comum", { linkPrefix: "https://blog.example.org/x/" })).statusCode,
      422,
    );
    const moved = await eva.patch("/api/v1/admin/sources/blog-sem-feed", { linkPrefix: "https://blog.example.org/p/" });
    assert.equal(moved.json().linkPrefix, "https://blog.example.org/p/");
  });
});
