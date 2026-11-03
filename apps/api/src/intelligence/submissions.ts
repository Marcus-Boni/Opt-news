// N-11: links members submit enter the pipeline as items of the 'indicacoes' source and are judged like any feed
// item. The page is read for its preview metadata only (title, description, date); its text is not stored.
import type { Sql } from "../db/index.ts";
import { pageMetadata } from "./page.ts";

export const SUBMISSION_SOURCE = "indicacoes";
const BATCH = 20;

export interface IntakeReport {
  queued: number;
  linked: number;
  failed: number;
}

/** Turns pending submissions into raw items. A submission whose URL a feed already brought is linked to that item. */
export async function intakeSubmissions(sql: Sql, fetchPage: (url: string) => Promise<string>): Promise<IntakeReport> {
  const report: IntakeReport = { queued: 0, linked: 0, failed: 0 };
  const [source] = await sql`SELECT 1 FROM content.sources WHERE id = ${SUBMISSION_SOURCE} AND active`;
  if (!source) return report;
  const pending = await sql<{ id: string; normalizedUrl: string; createdAt: string }[]>`
    SELECT id, normalized_url, created_at FROM content.submissions
    WHERE status = 'pending_review' AND raw_item_id IS NULL AND error IS NULL
    ORDER BY created_at LIMIT ${BATCH}`;
  for (const s of pending) {
    const [known] = await sql<
      { id: string }[]
    >`SELECT id FROM content.raw_items WHERE canonical_url = ${s.normalizedUrl}`;
    if (known) {
      await sql`UPDATE content.submissions SET raw_item_id = ${known.id} WHERE id = ${s.id}`;
      report.linked++;
      continue;
    }
    try {
      const meta = pageMetadata(await fetchPage(s.normalizedUrl));
      if (!meta.title) throw new Error("a página não informa um título");
      await sql.begin(async (tx) => {
        const [item] = await tx<{ id: string }[]>`
          INSERT INTO content.raw_items (source_id, guid, canonical_url, original_url, title, excerpt, published_at, content_hash)
          VALUES (${SUBMISSION_SOURCE}, ${`submission:${s.id}`}, ${s.normalizedUrl}, ${s.normalizedUrl}, ${meta.title},
            ${meta.description}, ${meta.publishedAt}, ${`submission:${s.id}`})
          RETURNING id`;
        await tx`UPDATE content.submissions SET raw_item_id = ${item?.id ?? null} WHERE id = ${s.id}`;
      });
      report.queued++;
    } catch (error) {
      // Kept for the curation queue: a curator decides; the pipeline does not retry a page that failed.
      await sql`UPDATE content.submissions SET error = ${String((error as Error).message).slice(0, 300)} WHERE id = ${s.id}`;
      report.failed++;
    }
  }
  return report;
}

/** Mirrors the pipeline's verdict on submitted items: published → accepted, kept out → rejected (curators can still promote). */
export async function settleSubmissions(sql: Sql): Promise<void> {
  await sql`
    UPDATE content.submissions sub SET
      status = CASE WHEN r.status = 'selected' THEN 'accepted' ELSE 'rejected' END,
      story_id = (SELECT st.id FROM content.stories st WHERE st.upstream_id = r.id::text)
    FROM content.raw_items r
    WHERE sub.raw_item_id = r.id AND sub.status IN ('pending_review', 'rejected')
      AND r.status IN ('selected', 'rejected', 'not_selected')
      AND sub.status IS DISTINCT FROM (CASE WHEN r.status = 'selected' THEN 'accepted' ELSE 'rejected' END)`;
}
