// NX-03 curation queue: stories waiting for review, submissions the pipeline could not read, and what the pipeline
// recently held back or published. Curators publish or retract reviews, send a held item past the gate ("publicar
// mesmo assim") and label decisions; the labels are the sample that calibrates the gates (Q-10). Every action is
// audited; nothing is deleted.
import type { BodyOut, endpoints, QueryOut } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { conflict, notFound } from "../http/problem.ts";
import { type Actor, authorize } from "../identity/policy.ts";
import { audit, emit } from "../ops/record.ts";
import { thresholdsFor } from "./prompts.ts";

type Tier = "T1" | "T1_5" | "T2";
type Verdict = "should_publish" | "should_skip";
const WINDOW_DAYS = 7;
const HELD = ["not_selected", "rejected", "failed"];

interface ItemRow {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  tier: Tier;
  status: "discovered" | "archived" | "rejected" | "not_selected" | "selected" | "failed";
  scoreA: number | null;
  scoreB: number | null;
  reason: string | null;
  publishedAt: string | null;
  observedAt: string;
  storyId: string | null;
  forced: boolean;
  submittedBy: string | null;
  myVerdict: Verdict | null;
  shouldPublish: number;
  shouldSkip: number;
}

const ITEM = (db: Db, actor: Actor) => db`
  SELECT r.id, r.title, r.original_url AS url, r.source_id, s.name AS source_name, s.tier, r.status, r.score_a, r.score_b,
    r.error AS reason, r.published_at, r.observed_at, r.forced_by IS NOT NULL AS forced,
    (SELECT st.id FROM content.stories st WHERE st.upstream_id = r.id::text) AS story_id,
    (SELECT m.display_name FROM content.submissions sub JOIN identity.members m ON m.id = sub.submitted_by
      WHERE sub.raw_item_id = r.id ORDER BY sub.created_at LIMIT 1) AS submitted_by,
    (SELECT l.verdict FROM content.curation_labels l WHERE l.raw_item_id = r.id AND l.member_id = ${actor.id}) AS my_verdict,
    (SELECT count(*)::int FROM content.curation_labels l WHERE l.raw_item_id = r.id AND l.verdict = 'should_publish') AS should_publish,
    (SELECT count(*)::int FROM content.curation_labels l WHERE l.raw_item_id = r.id AND l.verdict = 'should_skip') AS should_skip
  FROM content.raw_items r JOIN content.sources s ON s.id = r.source_id`;

function view(r: ItemRow, model: string) {
  const { scoreA, scoreB, shouldPublish, shouldSkip, ...rest } = r;
  return {
    ...rest,
    scores: scoreA === null || scoreB === null ? null : ([scoreA, scoreB] as [number, number]),
    threshold: thresholdsFor(model)[r.tier],
    verdicts: { shouldPublish, shouldSkip },
  };
}

async function item(db: Db, actor: Actor, id: string, model: string) {
  const [row] = await db<ItemRow[]>`${ITEM(db, actor)} WHERE r.id = ${id}`;
  if (!row) throw notFound();
  return view(row, model);
}

export async function curationQueue(
  db: Db,
  actor: Actor,
  query: QueryOut<typeof endpoints.curationQueue>,
  model: string,
) {
  authorize(actor, "moderate");
  const reviews = await db<
    {
      storyId: string;
      headline: string;
      summary: string | null;
      sourceName: string;
      url: string;
      reviewReason: string | null;
      editorialScore: number | null;
      publishedAt: string | null;
    }[]
  >`
    SELECT id AS story_id, headline, summary, source_name, original_url AS url, review_reason, editorial_score,
      original_published_at AS published_at
    FROM content.stories WHERE status = 'under_review' ORDER BY sort_at DESC LIMIT 50`;
  const submissions = await db<
    { id: string; url: string; note: string | null; submittedBy: string; createdAt: string; error: string | null }[]
  >`
    SELECT sub.id, sub.normalized_url AS url, sub.note, m.display_name AS submitted_by, sub.created_at, sub.error
    FROM content.submissions sub JOIN identity.members m ON m.id = sub.submitted_by
    WHERE sub.status = 'pending_review' AND (sub.error IS NOT NULL OR sub.raw_item_id IS NULL)
    ORDER BY sub.created_at LIMIT 50`;
  const statuses = query.status === "held" ? HELD : query.status === "selected" ? ["selected"] : [...HELD, "selected"];
  // Closest to the gate first: those are the decisions a curator's label teaches the most about.
  const items = await db<ItemRow[]>`
    ${ITEM(db, actor)}
    WHERE r.status = ANY(${statuses}) AND r.observed_at > now() - make_interval(days => ${WINDOW_DAYS})
    ORDER BY coalesce(r.score_a + r.score_b, -1) DESC, r.observed_at DESC LIMIT 100`;
  return { reviews, submissions, items: items.map((r) => view(r, model)) };
}

export async function decideReview(
  db: Db,
  actor: Actor,
  storyId: string,
  input: BodyOut<typeof endpoints.decideReview>,
  requestId: string,
) {
  authorize(actor, "moderate");
  const [story] = await db<{ status: string }[]>`SELECT status FROM content.stories WHERE id = ${storyId} FOR UPDATE`;
  if (!story) throw notFound();
  if (story.status !== "under_review") throw conflict("Esta notícia não está mais em revisão.");
  const status = input.decision === "publish" ? "published" : "retracted";
  await db`
    UPDATE content.stories SET status = ${status}, review_reason = NULL,
      retracted_at = CASE WHEN ${status === "retracted"} THEN now() ELSE retracted_at END
    WHERE id = ${storyId}`;
  await db`INSERT INTO content.story_history (story_id, change, snapshot)
           VALUES (${storyId}, ${status === "published" ? "reviewed" : "retracted"}, ${db.json({ by: actor.id, note: input.note ?? null })})`;
  await emit(
    db,
    status === "published" ? "content.story.published.v1" : "content.story.retracted.v1",
    storyId,
    { storyId, reviewedBy: actor.id },
    { type: "member", correlationId: requestId },
  );
  await audit(db, {
    actorId: actor.id,
    action: `content.story.review.${input.decision}`,
    targetType: "story",
    targetId: storyId,
    detail: { note: input.note ?? null },
    requestId,
  });
  return { storyId, status } as const;
}

async function label(db: Db, actor: Actor, id: string, verdict: Verdict, note: string | null, model: string) {
  // The label keeps the pipeline's decision as it was, so later reprocessing does not rewrite the sample.
  await db`
    INSERT INTO content.curation_labels (raw_item_id, member_id, verdict, pipeline_status, score_a, score_b, model_version, note)
    SELECT r.id, ${actor.id}, ${verdict}, r.status, r.score_a, r.score_b, ${model}, ${note}
    FROM content.raw_items r WHERE r.id = ${id}
    ON CONFLICT (raw_item_id, member_id) DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note,
      pipeline_status = EXCLUDED.pipeline_status, score_a = EXCLUDED.score_a, score_b = EXCLUDED.score_b,
      model_version = EXCLUDED.model_version, created_at = now()`;
}

export async function labelItem(
  db: Db,
  actor: Actor,
  id: string,
  input: BodyOut<typeof endpoints.labelItem>,
  model: string,
  requestId: string,
) {
  authorize(actor, "moderate");
  const [row] = await db<{ status: string }[]>`SELECT status FROM content.raw_items WHERE id = ${id}`;
  if (!row) throw notFound();
  if (!["selected", ...HELD].includes(row.status)) throw conflict("O pipeline ainda não decidiu este item.");
  await label(db, actor, id, input.verdict, input.note ?? null, model);
  await audit(db, {
    actorId: actor.id,
    action: "content.item.labelled",
    targetType: "raw_item",
    targetId: id,
    detail: { verdict: input.verdict, pipelineStatus: row.status },
    requestId,
  });
  return item(db, actor, id, model);
}

export async function forceItem(db: Db, actor: Actor, id: string, model: string, requestId: string) {
  authorize(actor, "moderate");
  const [row] = await db<{ status: string }[]>`SELECT status FROM content.raw_items WHERE id = ${id} FOR UPDATE`;
  if (!row) throw notFound();
  if (!HELD.includes(row.status)) throw conflict("Só itens barrados pelo pipeline podem ser publicados mesmo assim.");
  // A forced item is a should_publish label too: the curator disagreed with the gate.
  await label(db, actor, id, "should_publish", null, model);
  await db`UPDATE content.raw_items SET status = 'discovered', forced_by = ${actor.id}, attempts = 0, error = NULL WHERE id = ${id}`;
  await audit(db, {
    actorId: actor.id,
    action: "content.item.forced",
    targetType: "raw_item",
    targetId: id,
    detail: { from: row.status },
    requestId,
  });
  return item(db, actor, id, model);
}

export async function calibration(db: Db, actor: Actor, model: string) {
  authorize(actor, "moderate");
  const rows = await db<{ tier: Tier; verdict: Verdict; pipelineStatus: string; sum: number | null }[]>`
    SELECT s.tier, l.verdict, l.pipeline_status, l.score_a + l.score_b AS sum
    FROM content.curation_labels l JOIN content.raw_items r ON r.id = l.raw_item_id JOIN content.sources s ON s.id = r.source_id
    WHERE l.model_version = ${model}`;
  const kept = (status: string) => status !== "selected";
  const gates = thresholdsFor(model);
  const byTier = (["T1", "T1_5", "T2"] as const).map((tier) => {
    const mine = rows.filter((r) => r.tier === tier && r.sum !== null);
    const publish = mine.filter((r) => r.verdict === "should_publish").map((r) => r.sum as number);
    const skip = mine.filter((r) => r.verdict === "should_skip").map((r) => r.sum as number);
    const lowestShouldPublish = publish.length ? Math.min(...publish) : null;
    const highestShouldSkip = skip.length ? Math.max(...skip) : null;
    // Gate T selects when a + b ≥ 2T, so it separates the labels for T in (highestSkip / 2, lowestPublish / 2].
    const low = highestShouldSkip === null ? null : Math.floor(highestShouldSkip / 2) + 1;
    const high = lowestShouldPublish === null ? null : Math.floor(lowestShouldPublish / 2);
    const suggested = low !== null && high !== null && low <= high ? Math.floor((low + high) / 2) : null;
    return { tier, threshold: gates[tier], labels: mine.length, lowestShouldPublish, highestShouldSkip, suggested };
  });
  return {
    model,
    labels: rows.length,
    agreed: rows.filter((r) => (r.verdict === "should_publish") !== kept(r.pipelineStatus)).length,
    missed: rows.filter((r) => r.verdict === "should_publish" && kept(r.pipelineStatus)).length,
    extra: rows.filter((r) => r.verdict === "should_skip" && !kept(r.pipelineStatus)).length,
    byTier,
  };
}
