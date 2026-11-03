// N-06: groups a new story with recent coverage of the same occurrence (or its direct follow-ups), following AIHOT
// events/recall.ts + group.ts (MIT, see NOTICE): recall candidates of the last two weeks by text overlap, let the model
// judge each relation, and attach only on a confident SAME_OCCURRENCE/SAME_STORY. Every judgement is kept.
import { type CallContext, callModel } from "./model.ts";
import { GROUP_MIN_CONFIDENCE, PROMPT_VERSION, RECALL_DAYS } from "./prompts.ts";

interface Candidate {
  id: string;
  headline: string;
  summary: string | null;
  sortAt: string;
  eventId: string | null;
}

const line = (s: { headline: string; summary: string | null; sortAt: string }) =>
  `${s.headline} | ${(s.summary ?? "").slice(0, 220)} | ${s.sortAt}`;

export async function groupStory(ctx: Omit<CallContext, "promptVersion">, storyId: string): Promise<string | null> {
  const { sql } = ctx;
  const [story] = await sql<Candidate[]>`
    SELECT id, headline, summary, sort_at, event_id FROM content.stories WHERE id = ${storyId}`;
  if (!story || story.eventId) return story?.eventId ?? null;
  // Any shared lexeme recalls a candidate (OR of the headline's terms); the model decides identity.
  const candidates = await sql<Candidate[]>`
    WITH q AS (SELECT replace(plainto_tsquery('portuguese', ${story.headline})::text, '&', '|') AS t)
    SELECT c.id, c.headline, c.summary, c.sort_at, c.event_id
    FROM content.stories c, q
    WHERE q.t <> '' AND c.id <> ${story.id} AND c.status IN ('published', 'under_review')
      AND c.search @@ q.t::tsquery
      AND c.sort_at BETWEEN ${story.sortAt}::timestamptz - make_interval(days => ${RECALL_DAYS})
                        AND ${story.sortAt}::timestamptz + make_interval(days => ${RECALL_DAYS})
    ORDER BY ts_rank(c.search, q.t::tsquery) DESC, c.sort_at DESC LIMIT 5`;
  if (candidates.length === 0) return null;

  const user = [
    "Notícia nova:",
    `Título: ${story.headline}`,
    `Resumo: ${story.summary ?? "(sem resumo)"}`,
    `Data: ${story.sortAt}`,
    "",
    "Candidatas:",
    ...candidates.map((c, i) => `C${i + 1} | ${line(c)}`),
  ].join("\n");
  const { decisions } = await callModel({ ...ctx, promptVersion: PROMPT_VERSION }, story.id, "group", user);

  const judged = decisions
    .map((d) => ({ ...d, candidate: candidates[Number(d.id.slice(1)) - 1] }))
    .filter((d): d is typeof d & { candidate: Candidate } => d.candidate !== undefined);
  const attachable = judged
    .filter(
      (d) => (d.relation === "SAME_OCCURRENCE" || d.relation === "SAME_STORY") && d.confidence >= GROUP_MIN_CONFIDENCE,
    )
    .sort(
      (a, b) =>
        Number(b.relation === "SAME_OCCURRENCE") - Number(a.relation === "SAME_OCCURRENCE") ||
        b.confidence - a.confidence,
    );
  const target = attachable[0]?.candidate;

  return sql.begin(async (tx) => {
    for (const d of judged) {
      await tx`INSERT INTO content.event_decisions (story_id, candidate_story_id, relation, confidence, attached, model_version, policy_version)
               VALUES (${story.id}, ${d.candidate.id}, ${d.relation}, ${d.confidence}, ${d.candidate.id === target?.id},
                 ${ctx.provider.name}, ${PROMPT_VERSION})`;
    }
    if (!target) return null;
    let eventId = target.eventId;
    if (!eventId) {
      // The event is named after the coverage that came first.
      const first = Date.parse(target.sortAt) <= Date.parse(story.sortAt) ? target : story;
      const [created] = await tx<
        { id: string }[]
      >`INSERT INTO content.events (title) VALUES (${first.headline}) RETURNING id`;
      eventId = created?.id ?? null;
      await tx`UPDATE content.stories SET event_id = ${eventId} WHERE id = ${target.id}`;
      await tx`INSERT INTO content.story_history (story_id, change, snapshot) VALUES (${target.id}, 'grouped', ${tx.json({ eventId })})`;
    }
    await tx`UPDATE content.stories SET event_id = ${eventId} WHERE id = ${story.id}`;
    await tx`INSERT INTO content.story_history (story_id, change, snapshot) VALUES (${story.id}, 'grouped', ${tx.json({ eventId, with: target.id })})`;
    // Heat = how many distinct sources cover it (AIHOT uses a richer score; recalibrate with real data).
    await tx`UPDATE content.events e SET last_updated_at = now(),
               heat_score = (SELECT count(DISTINCT source_id) FROM content.stories s WHERE s.event_id = e.id AND s.status <> 'retracted')
             WHERE e.id = ${eventId}`;
    return eventId;
  });
}
