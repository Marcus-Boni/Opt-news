// Curation queue over HTTP (NX-03, Q-10): who can see and act, review decisions, "publicar mesmo assim" and the
// calibration summary built from curator labels. Fixture pipeline outcomes: 2 in review, 1 below the gate, 1
// rejected by the prefilter, 1 failed (output out of format).
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type { Sql } from "../src/db/index.ts";
import { as, type Client, DIEGO, freshDb, seedStories, testApp, ANA } from "./helpers.ts";

let sql: Sql;
let app: FastifyInstance;
let diego: Client;
let ana: Client;
let stories: Record<string, string>;

before(async () => {
  sql = await freshDb();
  stories = await seedStories(sql);
  app = await testApp(sql);
  diego = await as(app, DIEGO);
  ana = await as(app, ANA);
});
after(async () => {
  await app.close();
  await sql.end();
});

const itemId = async (guid: string) =>
  (await sql<{ id: string }[]>`SELECT id FROM content.raw_items WHERE guid = ${guid}`)[0]?.id ?? "";

describe("curation queue (NX-03)", () => {
  test("members cannot see or act on the queue", async () => {
    assert.equal((await ana.get("/api/v1/curation")).statusCode, 403);
    assert.equal((await ana.post(`/api/v1/curation/items/${await itemId("fx-test-gen")}/force`)).statusCode, 403);
    assert.equal((await ana.get("/api/v1/curation/calibration")).statusCode, 403);
  });

  test("the queue lists reviews and the items the pipeline held back, closest to the gate first", async () => {
    const res = await diego.get("/api/v1/curation");
    assert.equal(res.statusCode, 200);
    const queue = res.json();
    assert.deepEqual(queue.reviews.map((r: { reviewReason: string }) => r.reviewReason.split(" ")[0]).sort(), [
      "avaliações",
      "sem",
    ]);
    const statuses = queue.items.map((i: { status: string }) => i.status);
    assert.deepEqual([...new Set(statuses)].sort(), ["failed", "not_selected", "rejected"]);
    const held = queue.items.find((i: { title: string }) => i.title.startsWith("Framework de testes"));
    assert.deepEqual(held.scores, [70, 68]);
    assert.equal(held.threshold, 76);
    const selected = (await diego.get("/api/v1/curation?status=selected")).json();
    assert.ok(selected.items.length > 0 && selected.items.every((i: { status: string }) => i.status === "selected"));
  });

  test("a review is published or retracted once, with history and audit", async () => {
    const rumor = stories["fx-rumor"] ?? "";
    const res = await diego.post(`/api/v1/curation/reviews/${rumor}`, { decision: "retract", note: "boato sem fonte" });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { storyId: rumor, status: "retracted" });
    assert.equal((await diego.post(`/api/v1/curation/reviews/${rumor}`, { decision: "publish" })).statusCode, 409);
    const [history] = await sql<{ change: string }[]>`
      SELECT change FROM content.story_history WHERE story_id = ${rumor} ORDER BY id DESC LIMIT 1`;
    assert.equal(history?.change, "retracted");
    const [log] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ops.audit WHERE action = 'content.story.review.retract' AND target_id = ${rumor}`;
    assert.equal(log?.n, 1);
    const undated = stories["fx-undated"] ?? "";
    assert.equal(
      (await diego.post(`/api/v1/curation/reviews/${undated}`, { decision: "publish" })).json().status,
      "published",
    );
    assert.equal((await ana.get(`/api/v1/stories/${undated}`)).statusCode, 200);
  });

  test("publicar mesmo assim reopens a held item for the gate-free path and counts as a label", async () => {
    const id = await itemId("fx-test-gen");
    const res = await diego.post(`/api/v1/curation/items/${id}/force`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "discovered");
    assert.equal(res.json().forced, true);
    assert.equal(res.json().myVerdict, "should_publish");
    // Only held items: a selected one is refused.
    assert.equal((await diego.post(`/api/v1/curation/items/${await itemId("fx-atlas-agents")}/force`)).statusCode, 409);
  });

  test("labels feed the calibration summary per tier", async () => {
    const label = (guid: string, verdict: string) =>
      itemId(guid).then((id) => diego.put(`/api/v1/curation/items/${id}/label`, { verdict }));
    assert.equal((await label("fx-rag-study", "should_publish")).statusCode, 200);
    assert.equal((await label("fx-cake", "should_skip")).statusCode, 200);
    assert.equal((await label("fx-retail-round", "should_skip")).statusCode, 200);
    // Changing one's mind replaces the label instead of adding one.
    assert.equal((await label("fx-retail-round", "should_skip")).json().verdicts.shouldSkip, 1);
    const t2 = async () => {
      const cal = (await diego.get("/api/v1/curation/calibration")).json();
      return { cal, tier: cal.byTier.find((t: { tier: string }) => t.tier === "T2") };
    };
    // The forced test-gen (70+68 = 138) is a should_publish below retail's should_skip (154): labels overlap.
    const overlap = await t2();
    assert.deepEqual([overlap.cal.labels, overlap.cal.agreed, overlap.cal.missed, overlap.cal.extra], [4, 2, 1, 1]);
    assert.deepEqual([overlap.tier.lowestShouldPublish, overlap.tier.highestShouldSkip], [138, 154]);
    assert.equal(overlap.tier.suggested, null);
    // A forced item is back in the pipeline: it cannot be relabelled until the pipeline decides again.
    assert.equal((await label("fx-test-gen", "should_skip")).statusCode, 409);
    // T1: nimbus (74+70 = 144) should publish, embeddings (69+67 = 136) should skip → a gate in (68, 72].
    await label("fx-nimbus-gpu", "should_publish");
    await label("fx-embeddings-price", "should_skip");
    const t1 = (await diego.get("/api/v1/curation/calibration"))
      .json()
      .byTier.find((t: { tier: string }) => t.tier === "T1");
    assert.deepEqual([t1.lowestShouldPublish, t1.highestShouldSkip], [144, 136]);
    assert.ok(t1.suggested > 68 && t1.suggested <= 72);
  });
});
