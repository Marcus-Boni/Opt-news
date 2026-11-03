// F05/ADR-0007: PostgreSQL full-text search (portuguese) across stories, insights and meetups. Visibility is applied
// in the query, before snippets exist, so a hidden item never contributes a title, snippet or count.
import type { Db } from "./db/index.ts";
import type { Actor } from "./identity/policy.ts";
import { listedStories } from "./targets.ts";

interface Hit {
  type: "story" | "insight" | "meetup";
  id: string;
  title: string;
  snippet: string;
  at: string;
  rank: number;
}

export async function search(db: Db, actor: Actor, q: string) {
  const hits = await db<Hit[]>`
    WITH query AS (SELECT websearch_to_tsquery('portuguese', ${q}) AS tsq)
    SELECT * FROM (
      (SELECT 'story' AS type, s.id, s.headline AS title, left(coalesce(s.summary, ''), 240) AS snippet,
         coalesce(s.original_published_at, s.first_seen_at) AS at, ts_rank(s.search, query.tsq) AS rank
       FROM content.stories s, query WHERE ${listedStories(db, actor)} AND s.search @@ query.tsq ORDER BY rank DESC LIMIT 10)
      UNION ALL
      (SELECT 'insight', i.id, i.title, left(i.hypothesis, 240), i.created_at, ts_rank(i.search, query.tsq)
       FROM knowledge.insights i, query WHERE i.search @@ query.tsq ORDER BY 6 DESC LIMIT 10)
      UNION ALL
      (SELECT 'meetup', ms.id, ms.title, left(coalesce(ms.conclusions, ms.description), 240), ms.scheduled_start, ts_rank(ms.search, query.tsq)
       FROM meetups.sessions ms, query WHERE ms.search @@ query.tsq ORDER BY 6 DESC LIMIT 10)
    ) results ORDER BY rank DESC, at DESC`;
  return { q, hits: hits.map(({ rank: _, ...h }) => h) };
}
