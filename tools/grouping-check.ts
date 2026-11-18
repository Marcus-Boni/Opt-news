// Event grouping quality, read only (docs/07 §8.1): how often coverage of one occurrence is left as two cards, and
// which attachments a curator should read again. Everything runs in a READ ONLY transaction; no model calls.
//   npm run grouping:check            (DATABASE_URL from .env)
import { connect } from "@optnews/api/db/index";

const SIMILAR = 0.25; // shared headline lexemes (Jaccard) above which two cards are worth a look

const sql = connect(process.env.DATABASE_URL ?? "", 1);
try {
  await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
    const [overview] = await tx`
      SELECT min(sort_at)::date::text AS since, count(*)::int AS published,
        count(*) FILTER (WHERE event_id IS NOT NULL)::int AS in_events,
        count(DISTINCT event_id)::int AS events, count(DISTINCT source_id)::int AS sources
      FROM content.stories WHERE status = 'published' AND provider = 'optnews'`;
    console.log("Publicadas", overview);
    console.table(
      await tx`
      SELECT relation, attached, count(*)::int AS n, round(min(confidence)::numeric, 2) AS min_conf
      FROM content.event_decisions GROUP BY 1, 2 ORDER BY 1, 2`,
    );
    // A positive judgement whose two sides ended in different events: one occurrence, two cards.
    console.log("Mesmo fato em eventos diferentes:");
    console.table(
      await tx`
      SELECT d.relation, round(d.confidence::numeric, 2) AS conf, a.headline AS a, b.headline AS b
      FROM content.event_decisions d JOIN content.stories a ON a.id = d.story_id JOIN content.stories b ON b.id = d.candidate_story_id
      WHERE d.relation IN ('SAME_OCCURRENCE', 'SAME_STORY') AND a.status = 'published' AND b.status = 'published'
        AND a.event_id IS DISTINCT FROM b.event_id AND a.event_id IS NOT NULL AND b.event_id IS NOT NULL`,
    );
    console.log("Anexos com menos confiança (ler de novo):");
    console.table(
      await tx`
      SELECT d.relation, round(d.confidence::numeric, 2) AS conf, a.headline AS a, b.headline AS b
      FROM content.event_decisions d JOIN content.stories a ON a.id = d.story_id JOIN content.stories b ON b.id = d.candidate_story_id
      WHERE d.attached AND d.confidence < 0.9 ORDER BY d.confidence`,
    );
    console.log(`Títulos parecidos (Jaccard ≥ ${SIMILAR}) fora de um mesmo evento, até 3 dias:`);
    console.table(
      await tx`
      WITH s AS (SELECT id, event_id, sort_at, headline, tsvector_to_array(to_tsvector('portuguese', headline)) AS lex
        FROM content.stories WHERE status = 'published' AND provider = 'optnews'),
      p AS (SELECT a.id AS ida, b.id AS idb, a.headline AS a, b.headline AS b,
          (SELECT count(*) FROM unnest(a.lex) x WHERE x = ANY (b.lex))::float
            / NULLIF((SELECT count(DISTINCT y) FROM unnest(a.lex || b.lex) y), 0) AS j
        FROM s a JOIN s b ON a.id < b.id AND abs(extract(epoch FROM a.sort_at - b.sort_at)) <= 3 * 86400
          AND (a.event_id IS NULL OR a.event_id IS DISTINCT FROM b.event_id))
      SELECT round(j::numeric, 2) AS jaccard, a, b,
        (SELECT string_agg(relation || ' ' || round(confidence::numeric, 2), ', ') FROM content.event_decisions d
          WHERE (d.story_id, d.candidate_story_id) IN ((ida, idb), (idb, ida))) AS judged
      FROM p WHERE j >= ${SIMILAR} ORDER BY j DESC LIMIT 20`,
    );
  });
} finally {
  await sql.end();
}
