import type { QueryOut, ResultOf } from "@optnews/contracts";
import type { endpoints } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { notFound } from "../http/problem.ts";
import type { Actor } from "../identity/policy.ts";
import { audit } from "../ops/record.ts";
import { listedStories } from "../targets.ts";
import { type Lookup, assertPublicUrl } from "./url-guard.ts";

type Card = ResultOf<typeof endpoints.getStory>;

export interface StoryRow {
  id: string;
  headline: string;
  summary: string | null;
  sourceName: string;
  originalUrl: string;
  originalPublishedAt: string | null;
  firstSeenAt: string;
  sortAt: string;
  topics: string[];
  editorialScore: number | null;
  optsolvRelevanceScore: number | null;
  aiGenerated: boolean;
  status: "published" | "under_review" | "retracted";
  comments: number;
  proposals: number;
  insights: number;
  eventId: string | null;
  eventTitle: string | null;
  coverage: number;
}

const encode = (v: unknown[]) => Buffer.from(JSON.stringify(v)).toString("base64url");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** [score?, sortAt, id] of the last row, or null when the cursor is not one we issued. */
function decode(cursor: string, byScore: boolean): [number, string, string] | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(v)) return null;
    const [score, at, id] = byScore ? v : [0, ...v];
    if (typeof score !== "number" || typeof at !== "string" || typeof id !== "string") return null;
    return Number.isFinite(score) && Number.isFinite(Date.parse(at)) && UUID.test(id) ? [score, at, id] : null;
  } catch {
    return null;
  }
}

function card(r: StoryRow) {
  return {
    id: r.id,
    headline: r.headline,
    summary: r.status === "retracted" ? null : r.summary,
    source: { name: r.sourceName },
    originalUrl: r.originalUrl,
    originalPublishedAt: r.originalPublishedAt,
    firstSeenAt: r.firstSeenAt,
    topics: r.topics,
    editorialScore: r.editorialScore,
    optsolvRelevanceScore: r.optsolvRelevanceScore,
    aiGenerated: r.aiGenerated,
    status: r.status,
    counts: { comments: r.comments, proposals: r.proposals, insights: r.insights },
    event: r.eventId ? { id: r.eventId, title: r.eventTitle ?? "", coverage: r.coverage } : null,
  };
}

/**
 * One card per event (AIHOT "seats"): a story is listed only if no other published story of its event ranks above
 * it (score, then date, then id). Stories outside any event are always listed.
 */
export const representative = (db: Db) => db`NOT EXISTS (
  SELECT 1 FROM content.stories o
  WHERE o.event_id = s.event_id AND o.id <> s.id AND o.status = 'published'
    AND (coalesce(o.editorial_score, -1), o.sort_at, o.id) > (coalesce(s.editorial_score, -1), s.sort_at, s.id))`;

const COUNTS = (db: Db) => db`
  (SELECT count(*)::int FROM community.comments c WHERE c.target_type = 'story' AND c.target_id = s.id AND c.status = 'visible') AS comments,
  (SELECT count(*)::int FROM meetups.proposals p WHERE p.origin_story_id = s.id) AS proposals,
  (SELECT count(DISTINCT l.from_id)::int FROM knowledge.links l WHERE l.to_type = 'story' AND l.to_id = s.id) AS insights,
  s.event_id, (SELECT ev.title FROM content.events ev WHERE ev.id = s.event_id) AS event_title,
  (SELECT count(*)::int FROM content.stories e WHERE e.event_id = s.event_id AND e.status = 'published') AS coverage`;

const COLUMNS = (db: Db) => db`
  s.id, s.headline, s.summary, s.source_name, s.original_url, s.original_published_at, s.first_seen_at, s.sort_at, s.topics,
  s.editorial_score, s.optsolv_relevance_score, s.ai_generated, s.status, ${COUNTS(db)}`;

export async function listStories(db: Db, actor: Actor, q: QueryOut<typeof endpoints.listStories>) {
  const byScore = q.sort === "relevance";
  // Keyset pagination: the cursor holds the sort key of the last row; malformed cursors restart from the top.
  const after = q.cursor ? decode(q.cursor, byScore) : null;
  const keyset = !after
    ? db``
    : byScore
      ? db`AND (coalesce(s.editorial_score, -1), s.sort_at, s.id) < (${after[0]}::real, ${after[1]}::timestamptz, ${after[2]}::uuid)`
      : db`AND (s.sort_at, s.id) < (${after[1]}::timestamptz, ${after[2]}::uuid)`;
  const rows = await db<StoryRow[]>`
    SELECT ${COLUMNS(db)} FROM content.stories s
    WHERE ${listedStories(db, actor)} AND ${representative(db)}
      ${q.topic ? db`AND s.topics @> ARRAY[${q.topic}]::text[]` : db``}
      ${q.q ? db`AND s.search @@ websearch_to_tsquery('portuguese', ${q.q})` : db``}
      ${q.from ? db`AND s.sort_at >= ${q.from}` : db``}
      ${q.to ? db`AND s.sort_at <= ${q.to}` : db``}
      ${keyset}
    ORDER BY ${byScore ? db`coalesce(s.editorial_score, -1) DESC,` : db``} s.sort_at DESC, s.id DESC
    LIMIT ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > q.limit && last
      ? encode(byScore ? [last.editorialScore ?? -1, last.sortAt, last.id] : [last.sortAt, last.id])
      : null;
  return { items: page.map(card), nextCursor };
}

export async function getStory(db: Db, actor: Actor, id: string): Promise<Card> {
  const [r] = await db<
    (StoryRow & {
      language: string;
      selectionReason: string | null;
      modelVersion: string | null;
      policyVersion: string | null;
      evidenceUrls: string[];
      syncedAt: string;
      retractedAt: string | null;
      provider: string;
    })[]
  >`
    SELECT ${COLUMNS(db)}, s.language, s.selection_reason, s.model_version, s.policy_version, s.evidence_urls,
      s.synced_at, s.retracted_at, s.provider
    FROM content.stories s
    WHERE s.id = ${id} AND (${listedStories(db, actor)} OR s.status = 'retracted')`;
  if (!r) throw notFound();
  const retracted = r.status === "retracted";
  const proposals = await db<{ id: string; title: string; status: string; votes: number }[]>`
    SELECT p.id, p.title, p.status, (SELECT count(*)::int FROM meetups.votes v WHERE v.proposal_id = p.id) AS votes
    FROM meetups.proposals p WHERE p.origin_story_id = ${id} ORDER BY p.created_at DESC`;
  const insights = await db<{ id: string; title: string; status: string }[]>`
    SELECT DISTINCT i.id, i.title, i.status, i.created_at FROM knowledge.links l JOIN knowledge.insights i ON i.id = l.from_id
    WHERE l.to_type = 'story' AND l.to_id = ${id} ORDER BY i.created_at DESC`;
  return {
    ...card(r),
    language: r.language,
    selectionReason: retracted ? null : r.selectionReason,
    provenance: {
      provider: r.provider,
      modelVersion: r.modelVersion,
      policyVersion: r.policyVersion,
      evidenceUrls: r.evidenceUrls,
      syncedAt: r.syncedAt,
    },
    retractedAt: r.retractedAt,
    proposals,
    insights: insights.map(({ id, title, status }) => ({ id, title, status })),
    event: r.eventId ? await eventSummary(db, actor, r.eventId) : null,
  };
}

async function eventSummary(db: Db, actor: Actor, eventId: string) {
  const [ev] = await db<{ id: string; title: string; heatScore: number }[]>`
    SELECT id, title, heat_score FROM content.events WHERE id = ${eventId}`;
  if (!ev) return null;
  const stories = await db<
    {
      id: string;
      headline: string;
      sourceName: string;
      originalPublishedAt: string | null;
      status: StoryRow["status"];
    }[]
  >`
    SELECT s.id, s.headline, s.source_name, s.original_published_at, s.status FROM content.stories s
    WHERE s.event_id = ${eventId} AND ${listedStories(db, actor)} ORDER BY s.sort_at, s.id`;
  return { ...ev, stories: stories.map(({ sourceName, ...st }) => ({ ...st, source: { name: sourceName } })) };
}

/** Cards for the given ids that the actor may read, in the given order. */
export async function cardsByIds(db: Db, actor: Actor, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db<StoryRow[]>`
    SELECT ${COLUMNS(db)} FROM content.stories s WHERE s.id = ANY(${ids}::uuid[]) AND ${listedStories(db, actor)}`;
  const byId = new Map(rows.map((r) => [r.id, card(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function getEvent(db: Db, actor: Actor, id: string) {
  const [ev] = await db<{ id: string; title: string; heatScore: number; lastUpdatedAt: string }[]>`
    SELECT id, title, heat_score, last_updated_at FROM content.events WHERE id = ${id}`;
  if (!ev) throw notFound();
  const rows = await db<StoryRow[]>`
    SELECT ${COLUMNS(db)} FROM content.stories s WHERE s.event_id = ${id} AND ${listedStories(db, actor)}
    ORDER BY s.sort_at, s.id`;
  // An event whose coverage the reader cannot see does not exist for them.
  if (rows.length === 0) throw notFound();
  return { ...ev, stories: rows.map(card) };
}

/** N-11/F-006: a member suggests a link; it waits for curation. Same member + same URL is idempotent. */
export async function submitUrl(
  db: Db,
  actor: Actor,
  input: { url: string; note?: string },
  requestId: string,
  lookup?: Lookup,
) {
  const url = (await assertPublicUrl(input.url, lookup)).toString();
  const [existing] = await db<{ id: string }[]>`
    SELECT id FROM content.stories s WHERE s.canonical_url = ${url} AND ${listedStories(db, actor)} LIMIT 1`;
  const [row] = await db<
    {
      id: string;
      normalizedUrl: string;
      status: string;
      storyId: string | null;
      createdAt: string;
      inserted: boolean;
    }[]
  >`
    INSERT INTO content.submissions (submitted_by, url, normalized_url, note, status, story_id)
    VALUES (${actor.id}, ${input.url}, ${url}, ${input.note ?? null}, ${existing ? "duplicate" : "pending_review"}, ${existing?.id ?? null})
    ON CONFLICT (submitted_by, normalized_url) DO UPDATE SET normalized_url = EXCLUDED.normalized_url
    RETURNING id, normalized_url, status, story_id, created_at, (xmax = 0) AS inserted`;
  if (!row) throw new Error("submission upsert returned nothing");
  if (row.inserted) {
    await audit(db, {
      actorId: actor.id,
      action: "content.submission.created",
      targetType: "submission",
      targetId: row.id,
      detail: { status: row.status },
      requestId,
    });
  }
  const { inserted: _, ...submission } = row;
  return submission as {
    id: string;
    normalizedUrl: string;
    status: "pending_review" | "duplicate";
    storyId: string | null;
    createdAt: string;
  };
}
