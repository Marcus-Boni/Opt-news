// HTTP integration (F-003, F-005..F-010): authentication, authorization (401/403/404), state conflicts (409),
// validation (422), idempotency and ACL on lists/search. Real PostgreSQL, app in-process.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import type { Sql } from "../src/db/index.ts";
import { migrateDown, migrateUp } from "../src/db/migrate.ts";
import { ingestFixtures } from "../src/db/seed.ts";
import { scriptedModel } from "../../../tools/fixtures/feeds.ts";
import { dayKey, generateDailyBriefing } from "../src/intelligence/briefing.ts";
import {
  ANA,
  as,
  BRUNO,
  CARLA,
  type Client,
  DIEGO,
  EVA,
  FABIO,
  freshDb,
  GABI,
  seedStories,
  testApp,
} from "./helpers.ts";

let sql: Sql;
let app: FastifyInstance;
let ana: Client;
let bruno: Client;
let carla: Client;
let diego: Client;
let fabio: Client;
const story: Record<string, string> = {};

const inFuture = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

before(async () => {
  sql = await freshDb();
  Object.assign(story, await seedStories(sql));
  app = await testApp(sql);
  ana = await as(app, ANA);
  bruno = await as(app, BRUNO);
  carla = await as(app, CARLA);
  diego = await as(app, DIEGO);
  fabio = await as(app, FABIO);
});
after(async () => {
  await app.close();
  await sql.end();
});

describe("authentication and session", () => {
  test("no session → 401 Problem Details with requestId", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/stories" });
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["content-type"], "application/problem+json; charset=utf-8");
    const body = res.json();
    assert.equal(body.status, 401);
    assert.ok(body.requestId);
  });

  test("mutation without the CSRF token → 403, with it → 201", async () => {
    const payload = { targetType: "story", targetId: story["fx-rag-study"], body: "Sem token" };
    assert.equal((await ana.call("POST", "/api/v1/comments", payload, { "x-csrf-token": "" })).statusCode, 403);
    assert.equal((await ana.post("/api/v1/comments", payload)).statusCode, 201);
  });

  test("disabled member cannot log in; disabling an active member revokes the session", async () => {
    assert.equal(
      (await app.inject({ method: "POST", url: "/api/v1/auth/dev/login", payload: { memberId: GABI } })).statusCode,
      404,
    );
    const eva = await as(app, EVA);
    assert.equal((await eva.get("/api/v1/me")).statusCode, 200);
    await sql`UPDATE identity.members SET status = 'disabled' WHERE id = ${eva.me.id}`;
    assert.equal((await eva.get("/api/v1/me")).statusCode, 401);
    await sql`UPDATE identity.members SET status = 'active' WHERE id = ${eva.me.id}`;
  });

  test("logout revokes the session server-side", async () => {
    const temp = await as(app, BRUNO);
    assert.equal((await temp.post("/api/v1/auth/logout")).statusCode, 204);
    assert.equal((await temp.get("/api/v1/me")).statusCode, 401);
  });

  test("security headers on every response", async () => {
    const res = await ana.get("/api/v1/me");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["cache-control"], "no-store");
    assert.match(String(res.headers["content-security-policy"]), /default-src 'self'/);
  });
});

describe("stories (feed, detail, ACL)", () => {
  test("feed paginates by cursor without repeats and hides under-review items from members", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await ana.get(`/api/v1/stories?limit=4${cursor ? `&cursor=${cursor}` : ""}`);
      assert.equal(res.statusCode, 200);
      const page = res.json();
      seen.push(...page.items.map((s: { id: string }) => s.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(seen).size, seen.length);
    assert.ok(!seen.includes(story["fx-undated"] ?? ""));
    const curator = (await diego.get("/api/v1/stories?limit=50")).json();
    assert.ok(curator.items.some((s: { id: string }) => s.id === story["fx-undated"]));
  });

  test("topic and text filters", async () => {
    const byTopic = (await ana.get("/api/v1/stories?topic=dados-rag")).json();
    assert.deepEqual(
      byTopic.items.map((s: { topics: string[] }) => s.topics[0]),
      ["dados-rag"],
    );
    const byText = (await ana.get(`/api/v1/stories?q=${encodeURIComponent("injeção de prompt")}`)).json();
    assert.equal(byText.items[0]?.id, story["fx-prompt-injection"]);
  });

  test("detail exposes provenance and AI flags; under review is 404 for members", async () => {
    const res = await ana.get(`/api/v1/stories/${story["fx-atlas-agents"]}`);
    const s = res.json();
    assert.equal(s.aiGenerated, true);
    assert.equal(s.provenance.provider, "optnews");
    assert.match(s.provenance.policyVersion, /^pt-BR@/);
    assert.equal(s.provenance.modelVersion, "roteirizado-fixtures@1");
    assert.equal(s.optsolvRelevanceScore, null);
    assert.equal((await ana.get(`/api/v1/stories/${story["fx-undated"]}`)).statusCode, 404);
    assert.equal((await ana.get("/api/v1/stories/not-a-uuid")).statusCode, 404);
  });

  test("XSS payloads stay literal text in the API", async () => {
    const s = (await ana.get(`/api/v1/stories/${story["fx-xss-title"]}`)).json();
    assert.match(s.headline, /<script>alert\('xss'\)<\/script>/);
  });
});

describe("link submissions (N-11/F-006)", () => {
  test("private or malformed URLs → 422", async () => {
    for (const url of ["http://169.254.169.254/latest", "https://wiki.internal.example.com/x", "javascript:alert(1)"]) {
      const res = await ana.post("/api/v1/stories/submissions", { url });
      assert.equal(res.statusCode, 422, url);
    }
  });

  test("same URL twice is idempotent; a known story is reported as duplicate", async () => {
    const a = (
      await ana.post("/api/v1/stories/submissions", { url: "https://novo.example.org/post?utm_source=x" })
    ).json();
    const b = (await ana.post("/api/v1/stories/submissions", { url: "https://novo.example.org/post" })).json();
    assert.equal(a.id, b.id);
    assert.equal(a.status, "pending_review");
    const dup = (
      await bruno.post("/api/v1/stories/submissions", { url: "https://atlas.example.com/blog/framework-agentes" })
    ).json();
    assert.deepEqual([dup.status, dup.storyId], ["duplicate", story["fx-atlas-agents"]]);
  });

  test("visitors cannot submit", async () => {
    assert.equal((await fabio.post("/api/v1/stories/submissions", { url: "https://x.example.org/a" })).statusCode, 403);
  });
});

describe("comments (C-01/C-04)", () => {
  test("visitor can read but not comment", async () => {
    const target = { targetType: "story", targetId: story["fx-lumen-model"] };
    assert.equal((await fabio.get(`/api/v1/comments?targetType=story&targetId=${target.targetId}`)).statusCode, 200);
    assert.equal((await fabio.post("/api/v1/comments", { ...target, body: "oi" })).statusCode, 403);
  });

  test("edit is author-only and revision-checked; moderation hides with reason and audit", async () => {
    const created = (
      await ana.post("/api/v1/comments", {
        targetType: "story",
        targetId: story["fx-lumen-model"],
        body: "Primeira versão",
      })
    ).json();
    assert.equal(
      (await bruno.patch(`/api/v1/comments/${created.id}`, { body: "invasão", revision: 1 })).statusCode,
      403,
    );
    const edited = await ana.patch(`/api/v1/comments/${created.id}`, { body: "Segunda versão", revision: 1 });
    assert.equal(edited.json().revision, 2);
    assert.equal((await ana.patch(`/api/v1/comments/${created.id}`, { body: "Antiga", revision: 1 })).statusCode, 409);

    assert.equal(
      (await bruno.post(`/api/v1/comments/${created.id}/moderate`, { action: "hide", reason: "teste" })).statusCode,
      403,
    );
    const hidden = (
      await diego.post(`/api/v1/comments/${created.id}/moderate`, { action: "hide", reason: "Fora do tema" })
    ).json();
    assert.equal(hidden.status, "hidden");
    const asMember = (await bruno.get(`/api/v1/comments?targetType=story&targetId=${story["fx-lumen-model"]}`)).json();
    const placeholder = asMember.items.find((c: { id: string }) => c.id === created.id);
    assert.deepEqual([placeholder.body, placeholder.moderationReason], [null, "Fora do tema"]);
    const [entry] = await sql`SELECT action, actor_id FROM ops.audit WHERE target_id = ${created.id}`;
    assert.deepEqual(entry, { action: "community.comment.hide", actorId: DIEGO });
    const [rev] = await sql<
      { body: string }[]
    >`SELECT body FROM community.comment_revisions WHERE comment_id = ${created.id}`;
    assert.equal(rev?.body, "Primeira versão");
  });

  test("replies must stay in the same thread; retracted stories take no new comments", async () => {
    const parent = (
      await ana.post("/api/v1/comments", { targetType: "story", targetId: story["fx-rag-study"], body: "Pai" })
    ).json();
    const wrong = await bruno.post("/api/v1/comments", {
      targetType: "story",
      targetId: story["fx-lumen-model"],
      parentId: parent.id,
      body: "x",
    });
    assert.equal(wrong.statusCode, 422);
    await sql`UPDATE content.stories SET status = 'retracted' WHERE id = ${story["fx-hospital-triage"] ?? ""}`;
    const res = await ana.post("/api/v1/comments", {
      targetType: "story",
      targetId: story["fx-hospital-triage"],
      body: "x",
    });
    assert.equal(res.statusCode, 409);
    const detail = (await ana.get(`/api/v1/stories/${story["fx-hospital-triage"]}`)).json();
    assert.deepEqual([detail.status, detail.summary], ["retracted", null]);
  });
});

describe("meetup proposals and sessions (M-01..M-04, US-F008)", () => {
  let proposalId = "";

  test("propose from a story; under-review stories cannot originate proposals for members", async () => {
    const res = await bruno.post("/api/v1/meetup-proposals", {
      title: "Benchmarks de RAG",
      rationale: "Queremos comparar abordagens.",
      storyId: story["fx-rag-study"],
    });
    assert.equal(res.statusCode, 201);
    const p = res.json();
    assert.deepEqual(
      [p.status, p.origin.type, p.origin.story.id, p.votes],
      ["open", "story", story["fx-rag-study"], 0],
    );
    proposalId = p.id;
    const hidden = await bruno.post("/api/v1/meetup-proposals", {
      title: "Sem data",
      rationale: "Origem restrita aqui.",
      storyId: story["fx-undated"],
    });
    assert.equal(hidden.statusCode, 404);
  });

  test("a proposal born from a restricted story is invisible to members", async () => {
    const res = await diego.post("/api/v1/meetup-proposals", {
      title: "Pauta restrita",
      rationale: "Origem em revisão editorial.",
      storyId: story["fx-undated"],
    });
    assert.equal(res.statusCode, 201);
    const restricted = res.json().id;
    const list = (await ana.get("/api/v1/meetup-proposals")).json();
    assert.ok(!list.some((p: { id: string }) => p.id === restricted));
    assert.equal((await ana.put(`/api/v1/meetup-proposals/${restricted}/vote`, { vote: true })).statusCode, 404);

    // Scheduled anyway by an admin: members see the session, never its restricted origin.
    const eva = await as(app, EVA);
    await eva.post(`/api/v1/meetup-proposals/${restricted}/decision`, { status: "selected" });
    const session = (
      await eva.post("/api/v1/meetups", {
        title: "Sessão com origem restrita",
        description: "Pauta vinda de notícia em revisão.",
        scheduledStart: inFuture(5),
        responsibleId: DIEGO,
        proposalId: restricted,
      })
    ).json();
    const upcoming = (await ana.get("/api/v1/meetups?when=upcoming")).json();
    assert.equal(upcoming.find((m: { id: string }) => m.id === session.id)?.proposal, null);
    assert.equal((await ana.get(`/api/v1/meetups/${session.id}`)).json().proposal, null);
    assert.equal((await diego.get(`/api/v1/meetups/${session.id}`)).json().proposal.id, restricted);
  });

  test("one vote per member, idempotent and safe under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ana.put(`/api/v1/meetup-proposals/${proposalId}/vote`, { vote: true })),
    );
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.deepEqual((await ana.put(`/api/v1/meetup-proposals/${proposalId}/vote`, { vote: true })).json(), {
      votes: 1,
      myVote: true,
    });
    assert.deepEqual((await carla.put(`/api/v1/meetup-proposals/${proposalId}/vote`, { vote: true })).json(), {
      votes: 2,
      myVote: true,
    });
    assert.deepEqual((await carla.put(`/api/v1/meetup-proposals/${proposalId}/vote`, { vote: false })).json(), {
      votes: 1,
      myVote: false,
    });
    assert.equal((await fabio.put(`/api/v1/meetup-proposals/${proposalId}/vote`, { vote: true })).statusCode, 403);
  });

  test("closed voting → 409 and the count does not change", async () => {
    const p = (
      await bruno.post("/api/v1/meetup-proposals", {
        title: "Prazo curto",
        rationale: "Votação que vai encerrar.",
        votingClosesAt: inFuture(1),
      })
    ).json();
    await sql`UPDATE meetups.proposals SET voting_closes_at = now() - interval '1 minute' WHERE id = ${p.id}`;
    assert.equal((await ana.put(`/api/v1/meetup-proposals/${p.id}/vote`, { vote: true })).statusCode, 409);
    const [votes] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM meetups.votes WHERE proposal_id = ${p.id}`;
    assert.equal(votes?.n, 0);
  });

  test("only organizers decide; decided proposals cannot be decided again", async () => {
    assert.equal(
      (await ana.post(`/api/v1/meetup-proposals/${proposalId}/decision`, { status: "selected" })).statusCode,
      403,
    );
    assert.equal(
      (await carla.post(`/api/v1/meetup-proposals/${proposalId}/decision`, { status: "selected" })).json().status,
      "selected",
    );
    assert.equal(
      (await carla.post(`/api/v1/meetup-proposals/${proposalId}/decision`, { status: "rejected" })).statusCode,
      409,
    );
  });

  test("scheduling: future date, one session per proposal, valid Teams link, explicit transitions", async () => {
    const base = {
      title: "RAG na prática",
      description: "Comparação de estratégias de busca.",
      responsibleId: BRUNO,
      proposalId,
    };
    assert.equal((await ana.post("/api/v1/meetups", { ...base, scheduledStart: inFuture(7) })).statusCode, 403);
    assert.equal((await carla.post("/api/v1/meetups", { ...base, scheduledStart: inFuture(-1) })).statusCode, 422);
    assert.equal(
      (
        await carla.post("/api/v1/meetups", {
          ...base,
          scheduledStart: inFuture(7),
          teamsUrl: "https://evil.example.com/meet",
        })
      ).statusCode,
      422,
    );
    const created = await carla.post("/api/v1/meetups", {
      ...base,
      scheduledStart: inFuture(7),
      teamsUrl: "https://teams.microsoft.com/l/meetup-join/abc",
    });
    assert.equal(created.statusCode, 201);
    const m = created.json();
    assert.deepEqual([m.state, m.proposal.id, m.responsible.id], ["scheduled", proposalId, BRUNO]);
    assert.equal((await carla.post("/api/v1/meetups", { ...base, scheduledStart: inFuture(8) })).statusCode, 409);

    assert.equal(
      (await carla.patch(`/api/v1/meetups/${m.id}`, { revision: m.revision, state: "documented" })).statusCode,
      409,
    );
    const done = (await carla.patch(`/api/v1/meetups/${m.id}`, { revision: m.revision, state: "completed" })).json();
    assert.equal(
      (await carla.patch(`/api/v1/meetups/${m.id}`, { revision: m.revision, state: "completed" })).statusCode,
      409,
      "stale revision",
    );
    assert.equal(
      (await carla.patch(`/api/v1/meetups/${m.id}`, { revision: done.revision, state: "documented" })).statusCode,
      422,
    );
    // The responsible presenter may attach material; another member may not.
    assert.equal(
      (
        await bruno.post(`/api/v1/meetups/${m.id}/artifacts`, {
          kind: "slides",
          title: "Slides",
          url: "https://docs.example.com/s",
        })
      ).statusCode,
      201,
    );
    assert.equal(
      (
        await ana.post(`/api/v1/meetups/${m.id}/artifacts`, {
          kind: "link",
          title: "Link",
          url: "https://docs.example.com/l",
        })
      ).statusCode,
      403,
    );
  });
});

describe("knowledge and search (K-01/K-02, F05)", () => {
  test("references must be readable by the author", async () => {
    const res = await ana.post("/api/v1/insights", {
      title: "Insight inválido",
      hypothesis: "Referência a conteúdo em revisão não pode ser criada.",
      references: [{ type: "story", id: story["fx-undated"], relation: "evidence" }],
    });
    assert.equal(res.statusCode, 422);
  });

  test("search respects visibility before returning titles or snippets", async () => {
    const member = (await ana.get(`/api/v1/search?q=${encodeURIComponent("benchmark")}`)).json();
    assert.ok(!member.hits.some((h: { id: string }) => h.id === story["fx-undated"]));
    const curator = (await diego.get(`/api/v1/search?q=${encodeURIComponent("benchmark")}`)).json();
    assert.ok(curator.hits.some((h: { id: string }) => h.id === story["fx-undated"]));
    // Fact vs machine text survives search: every hit says whether its snippet was written by the model.
    for (const h of curator.hits as { type: string; aiGenerated: unknown }[]) {
      assert.equal(typeof h.aiGenerated, "boolean");
      if (h.type !== "story") assert.equal(h.aiGenerated, false);
    }
  });

  test("422 for short queries", async () => {
    assert.equal((await ana.get("/api/v1/search?q=a")).statusCode, 422);
  });
});

describe("events and briefings (N-06/N-07)", () => {
  test("the feed shows one card per event, with its coverage; the event page has the timeline", async () => {
    const feed = (await ana.get("/api/v1/stories?limit=50")).json();
    const ids = feed.items.map((s: { id: string }) => s.id);
    assert.ok(ids.includes(story["fx-atlas-agents"]));
    assert.ok(!ids.includes(story["fx-atlas-coverage"]), "lower-ranked coverage is folded into the event");
    const card = feed.items.find((s: { id: string }) => s.id === story["fx-atlas-agents"]);
    assert.equal(card.event.coverage, 2);
    const ev = (await ana.get(`/api/v1/events/${card.event.id}`)).json();
    assert.deepEqual(
      ev.stories.map((s: { id: string }) => s.id),
      [story["fx-atlas-agents"], story["fx-atlas-coverage"]],
    );
    const detail = (await ana.get(`/api/v1/stories/${story["fx-atlas-coverage"]}`)).json();
    assert.equal(detail.event.stories.length, 2);
    assert.equal((await ana.get("/api/v1/events/00000000-0000-4000-8000-0000000000ff")).statusCode, 404);
  });

  test("a story in review never names its event for readers", async () => {
    const first = story["fx-atlas-agents"] ?? "";
    const coverage = story["fx-atlas-coverage"] ?? "";
    const headline = async (id: string) =>
      (await sql<{ headline: string }[]>`SELECT headline FROM content.stories WHERE id = ${id}`)[0]?.headline;
    await sql`UPDATE content.stories SET status = 'under_review' WHERE id = ${first}`;
    try {
      const detail = (await ana.get(`/api/v1/stories/${coverage}`)).json();
      assert.equal(detail.event.title, await headline(coverage));
      assert.equal((await ana.get(`/api/v1/events/${detail.event.id}`)).json().title, await headline(coverage));
      const card = (await ana.get("/api/v1/stories?limit=50"))
        .json()
        .items.find((s: { id: string }) => s.id === coverage);
      assert.equal(card.event.title, await headline(coverage));
      // Curators see the coverage in review, so it still names the event for them.
      assert.equal((await diego.get(`/api/v1/events/${detail.event.id}`)).json().title, await headline(first));
    } finally {
      await sql`UPDATE content.stories SET status = 'published' WHERE id = ${first}`;
    }
  });

  test("a briefing loses its overview when one of its stories is retracted", async () => {
    const [lead] = await sql<
      { sortAt: string }[]
    >`SELECT sort_at FROM content.stories WHERE id = ${story["fx-lumen-model"] ?? ""}`;
    const key = dayKey(new Date(lead?.sortAt ?? Date.now()));
    await generateDailyBriefing({ sql, provider: scriptedModel(), dailyLimit: 1000 }, key, { force: true });
    const before = (await ana.get(`/api/v1/briefings/${key}`)).json();
    assert.ok(before.overview);
    const inIt = before.sections.flatMap((s: { stories: { id: string }[] }) => s.stories.map((x) => x.id));
    assert.ok(inIt.includes(story["fx-lumen-model"]));
    await sql`UPDATE content.stories SET status = 'retracted' WHERE id = ${story["fx-lumen-model"] ?? ""}`;
    const after = (await ana.get("/api/v1/briefings/latest")).json();
    assert.deepEqual([after.overview, after.overviewWithdrawn], [null, true]);
    assert.ok(
      !after.sections
        .flatMap((s: { stories: { id: string }[] }) => s.stories.map((x) => x.id))
        .includes(story["fx-lumen-model"]),
    );
    assert.equal((await ana.get("/api/v1/briefings/ontem")).statusCode, 404);
    assert.ok((await ana.get("/api/v1/briefings")).json().length >= 1);
  });
});

describe("source administration (N-01)", () => {
  test("activity: 84 São Paulo days, today last, only for curators", async () => {
    assert.equal((await ana.get("/api/v1/admin/activity")).statusCode, 403);
    const { days } = (await diego.get("/api/v1/admin/activity")).json();
    assert.equal(days.length, 84);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    assert.equal(days.at(-1).date, today);
    const [row] = await sql<{ published: number }[]>`
      SELECT count(*)::int AS published FROM content.stories
      WHERE status = 'published' AND first_seen_at > now() - interval '83 days'`;
    assert.equal(
      days.reduce((n: number, d: { stories: number }) => n + d.stories, 0),
      row?.published,
    );
  });

  test("only curators and admins see sources; the detail explains each item's fate", async () => {
    assert.equal((await ana.get("/api/v1/admin/sources")).statusCode, 403);
    const list = (await diego.get("/api/v1/admin/sources")).json();
    assert.ok(list.some((s: { id: string; threshold: number }) => s.id === "radar-ia" && s.threshold === 76));
    // The week strip: seven daily counts of collected items, never more than the source holds.
    const radar = list.find((s: { id: string; week: number[]; items: Record<string, number> }) => s.id === "radar-ia");
    assert.equal(radar.week.length, 7);
    const held = Object.values(radar.items as Record<string, number>).reduce((a, b) => a + b, 0);
    assert.ok(radar.week.reduce((a: number, b: number) => a + b, 0) <= held);
    const detail = (await diego.get("/api/v1/admin/sources/sentinela")).json();
    const hijack = detail.recent.find((r: { title: string }) => r.title.startsWith("Post pede ao avaliador"));
    assert.deepEqual([hijack.status, hijack.storyId], ["failed", null]);
    assert.match(hijack.error, /fora do formato/);
    const published = detail.recent.find((r: { status: string }) => r.status === "selected");
    assert.ok(published.storyId && published.scores.length === 2);
    assert.equal((await diego.get("/api/v1/admin/sources/nao-existe")).statusCode, 404);
    assert.equal((await diego.get("/api/v1/admin/sources/../me")).statusCode, 404);
  });

  test("curators pause and resume and change cadence, but not name, URL or tier; every change is audited", async () => {
    const paused = await diego.patch("/api/v1/admin/sources/vetor", { active: false, intervalMinutes: 120 });
    assert.equal(paused.statusCode, 200);
    assert.deepEqual([paused.json().active, paused.json().intervalMinutes], [false, 120]);
    assert.equal((await diego.patch("/api/v1/admin/sources/vetor", { tier: "T2" })).statusCode, 403);
    assert.equal(
      (await diego.patch("/api/v1/admin/sources/vetor", { feedUrl: "https://x.example.org/f.xml" })).statusCode,
      403,
    );
    assert.equal((await ana.patch("/api/v1/admin/sources/vetor", { active: true })).statusCode, 403);
    const [entry] = await sql<
      { action: string; detail: { before: Record<string, unknown>; after: Record<string, unknown> } }[]
    >`
      SELECT action, detail FROM ops.audit WHERE target_type = 'source' AND target_id = 'vetor' ORDER BY id DESC LIMIT 1`;
    assert.equal(entry?.action, "content.source.paused");
    assert.deepEqual(entry?.detail, {
      before: { active: true, intervalMinutes: 60 },
      after: { active: false, intervalMinutes: 120 },
    });

    // A paused source is skipped by the pipeline even when a run is forced.
    const report = await ingestFixtures(sql);
    assert.ok(!report.collected.some((c) => c.sourceId === "vetor"));

    const resumed = (await diego.patch("/api/v1/admin/sources/vetor", { active: true })).json();
    assert.deepEqual(
      [resumed.active, resumed.lastAttemptAt],
      [true, null],
      "resumed sources are collected on the next run",
    );
  });

  test("admins register sources: internal and duplicate feeds refused, id derived from the name", async () => {
    const eva = await as(app, EVA);
    const body = { name: "Blog Técnico Exemplo", feedUrl: "https://blog.example.org/feed.xml", tier: "T1" };
    assert.equal((await diego.post("/api/v1/admin/sources", body)).statusCode, 403);
    for (const feedUrl of [
      "http://169.254.169.254/latest",
      "https://feeds.internal.example.com/rss",
      "ftp://x.example.org/f",
    ]) {
      assert.equal((await eva.post("/api/v1/admin/sources", { ...body, feedUrl })).statusCode, 422, feedUrl);
    }
    const created = await eva.post("/api/v1/admin/sources", body);
    assert.equal(created.statusCode, 201);
    assert.deepEqual(
      [created.json().id, created.json().intervalMinutes, created.json().licensePolicy],
      ["blog-tecnico-exemplo", 60, "summary_link"],
    );
    assert.equal((await eva.post("/api/v1/admin/sources", { ...body, name: "Outro nome" })).statusCode, 409);
    assert.equal(
      (await eva.post("/api/v1/admin/sources", { ...body, feedUrl: "https://blog.example.org/outro.xml" })).statusCode,
      409,
    );
    const moved = (
      await eva.patch("/api/v1/admin/sources/blog-tecnico-exemplo", {
        feedUrl: "https://blog.example.org/novo.xml",
        tier: "T2",
      })
    ).json();
    assert.deepEqual([moved.feedUrl, moved.tier, moved.threshold], ["https://blog.example.org/novo.xml", "T2", 76]);
  });
});

describe("rate limit", () => {
  test("a made-up session cookie does not buy a fresh bucket", async () => {
    const forged = (i: number) =>
      app.inject({
        method: "GET",
        url: "/api/v1/stories",
        remoteAddress: "203.0.113.7",
        cookies: { optnews_session: `forjado-${i}` },
      });
    for (let i = 0; i < 300; i++) await forged(i);
    assert.equal((await forged(300)).statusCode, 429);
    assert.notEqual((await ana.get("/api/v1/stories")).statusCode, 429, "a live session keeps its own bucket");
  });
});

describe("migrations", () => {
  test("0003 and 0002 revert and reapply on their own", async () => {
    const exists = async (table: string, column = "%") =>
      (
        await sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'content' AND table_name = ${table} AND column_name LIKE ${column}`
      )[0]?.n ?? -1;
    assert.equal(await migrateDown(sql), "0003_web_list");
    assert.equal(await exists("sources", "link_prefix"), 0);
    assert.equal(await migrateDown(sql), "0002_curation");
    assert.equal(await exists("curation_labels"), 0);
    assert.deepEqual(await migrateUp(sql), ["0002_curation", "0003_web_list"]);
  });

  test("down removes every schema and up restores them", async () => {
    assert.equal(await migrateDown(sql), "0003_web_list");
    assert.equal(await migrateDown(sql), "0002_curation");
    assert.equal(await migrateDown(sql), "0001_init");
    const schemas = async () =>
      (
        await sql<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('identity','content','community','meetups','knowledge','ops')`
      )[0]?.n;
    assert.equal(await schemas(), 0);
    assert.deepEqual(await migrateUp(sql), ["0001_init", "0002_curation", "0003_web_list"]);
    assert.equal(await schemas(), 6);
  });
});
