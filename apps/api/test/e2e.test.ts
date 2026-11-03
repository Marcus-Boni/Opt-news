// F-011: the product's main end-to-end flow (docs/15-rastreabilidade.md), over HTTP against a real database:
// feeds → pipeline → story → discussion → proposal → vote → meetup → materials/record → insight → search, then resilience.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { runIngest } from "../src/intelligence/pipeline.ts";
import type { Sql } from "../src/db/index.ts";
import { ANA, as, BRUNO, CARLA, FABIO, freshDb, seedStories, testApp } from "./helpers.ts";

let sql: Sql;
let app: FastifyInstance;

before(async () => {
  sql = await freshDb();
  app = await testApp(sql);
});
after(async () => {
  await app.close();
  await sql.end();
});

test("notícia → debate → pauta → meetup → aprendizado → busca", async () => {
  // 1. The pipeline collects the synthetic feeds and publishes (scripted model: no paid call, no network).
  await seedStories(sql);
  const a = await as(app, ANA);
  const b = await as(app, BRUNO);
  const c = await as(app, FABIO);
  const organizer = await as(app, CARLA);

  // 2. A opens the article and sees the source and the AI marker.
  const feed = (await a.get("/api/v1/stories?topic=agentes")).json();
  const story = (await a.get(`/api/v1/stories/${feed.items[0].id}`)).json();
  assert.equal(story.headline, "Atlas AI lança framework aberto para orquestrar agentes com aprovação humana");
  assert.equal(story.source.name, "Atlas AI Blog (fictício)");
  assert.equal(story.aiGenerated, true);
  assert.ok(story.originalPublishedAt && story.firstSeenAt && story.originalPublishedAt !== story.firstSeenAt);

  // 3. A comments, B replies, C (read-only) is denied.
  const target = { targetType: "story", targetId: story.id };
  const first = (
    await a.post("/api/v1/comments", { ...target, body: "Isso resolve o ponto de aprovação do nosso piloto?" })
  ).json();
  const reply = await b.post("/api/v1/comments", {
    ...target,
    parentId: first.id,
    body: "Em parte; o modo de simulação ajuda na auditoria.",
  });
  assert.equal(reply.statusCode, 201);
  assert.equal((await c.post("/api/v1/comments", { ...target, body: "Também quero opinar" })).statusCode, 403);

  // 4. B proposes it as a meetup topic, A votes, the organizer selects and schedules.
  const proposal = (
    await b.post("/api/v1/meetup-proposals", {
      title: "Aprovação humana em agentes",
      rationale: "Dois pilotos precisam de um padrão comum.",
      storyId: story.id,
    })
  ).json();
  assert.deepEqual((await a.put(`/api/v1/meetup-proposals/${proposal.id}/vote`, { vote: true })).json(), {
    votes: 1,
    myVote: true,
  });
  await organizer.post(`/api/v1/meetup-proposals/${proposal.id}/decision`, { status: "selected" });
  const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const meetup = (
    await organizer.post("/api/v1/meetups", {
      title: proposal.title,
      description: "Comparar abordagens de aprovação humana.",
      scheduledStart: start,
      responsibleId: BRUNO,
      proposalId: proposal.id,
    })
  ).json();
  assert.equal(meetup.proposal.storyId, story.id, "origin preserved: meetup → proposal → story");

  // 5. Materials and the manual post-meetup record.
  await organizer.post(`/api/v1/meetups/${meetup.id}/artifacts`, {
    kind: "slides",
    title: "Slides da sessão",
    url: "https://docs.example.com/slides-agentes",
  });
  const completed = (
    await organizer.patch(`/api/v1/meetups/${meetup.id}`, { revision: meetup.revision, state: "completed" })
  ).json();
  const documented = (
    await organizer.patch(`/api/v1/meetups/${meetup.id}`, {
      revision: completed.revision,
      state: "documented",
      summary: "Comparamos aprovação por ação e por plano em dois pilotos.",
      conclusions: "Aprovação por ação com modo de simulação primeiro; revisar em 30 dias.",
    })
  ).json();
  assert.equal(documented.state, "documented");
  assert.equal(documented.artifacts.length, 1);

  // 6. A records an insight linked to the story and the meetup.
  const insight = await a.post("/api/v1/insights", {
    title: "Aprovação por ação antes de autonomia total",
    hypothesis: "Agentes com aprovação humana por ação reduzem incidentes nos pilotos sem travar o fluxo.",
    references: [
      { type: "story", id: story.id, relation: "inspired_by" },
      { type: "meetup", id: meetup.id, relation: "discussed_in" },
    ],
  });
  assert.equal(insight.statusCode, 201);
  const created = insight.json();
  assert.deepEqual(
    created.references.map((r: { type: string }) => r.type),
    ["story", "meetup"],
  );

  // 7. Search finds the story and the insight; details navigate both ways.
  const hits = (await a.get(`/api/v1/search?q=${encodeURIComponent("aprovação humana agentes")}`)).json().hits;
  assert.ok(hits.some((h: { type: string; id: string }) => h.type === "story" && h.id === story.id));
  assert.ok(hits.some((h: { type: string; id: string }) => h.type === "insight" && h.id === created.id));
  const back = (await a.get(`/api/v1/stories/${story.id}`)).json();
  assert.deepEqual([back.counts.comments, back.proposals[0].id, back.insights[0].id], [2, proposal.id, created.id]);
  assert.equal((await a.get(`/api/v1/meetups/${meetup.id}`)).json().insights[0].id, created.id);

  // 8. Every feed down and the model failing: collection fails visibly, reading and commenting keep working.
  const down = async () => {
    throw new Error("simulated outage");
  };
  await runIngest(
    { sql, fetchFeed: down, model: { provider: { name: "down", complete: down }, dailyLimit: 10 }, language: "pt-BR" },
    { force: true },
  );
  assert.equal((await a.get(`/api/v1/stories/${story.id}`)).statusCode, 200);
  assert.equal(
    (await b.post("/api/v1/comments", { ...target, body: "Ainda funciona com a coleta fora do ar." })).statusCode,
    201,
  );
  const sources = (await (await as(app, "00000000-0000-4000-8000-000000000004")).get("/api/v1/admin/sources")).json();
  assert.ok(
    sources
      .filter((s: { kind: string }) => s.kind === "rss")
      .every((s: { lastError: string }) => /simulated outage/.test(s.lastError)),
  );

  // Outbox recorded each cross-pillar fact for future consumers.
  const events = await sql<{ eventType: string }[]>`SELECT DISTINCT event_type FROM ops.outbox ORDER BY event_type`;
  assert.deepEqual(
    events.map((e) => e.eventType),
    [
      "community.comment.created.v1",
      "content.story.published.v1",
      "knowledge.insight.created.v1",
      "meetups.proposal.created.v1",
      "meetups.session.completed.v1",
    ],
  );
});
