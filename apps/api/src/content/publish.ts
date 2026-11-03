// PublishedStoryV1 (docs/03-arquitetura.md): the only shape in which curated content enters content.stories.
// Upsert is idempotent by (provider, upstreamId) plus a revision hash; every change keeps a history row.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db/index.ts";
import { emit } from "../ops/record.ts";

export const PublishedStoryV1 = z.object({
  sourceId: z.string(),
  canonicalUrl: z.url(),
  originalUrl: z.url(),
  sourceName: z.string().min(1),
  originalPublishedAt: z.iso.datetime().nullable(),
  firstSeenAt: z.iso.datetime(),
  headline: z.string().min(1).max(300),
  summary: z.string().max(2000).nullable(),
  selectionReason: z.string().max(1000).nullable(),
  language: z.string(),
  topics: z.array(z.string()),
  editorialScore: z.number().min(0).max(100).nullable(),
  evidenceUrls: z.array(z.url()),
  publicationState: z.enum(["published", "under_review"]),
  reviewReason: z.string().nullable(),
  provenance: z.object({
    provider: z.string(),
    upstreamId: z.string(),
    modelVersion: z.string().nullable(),
    policyVersion: z.string().nullable(),
  }),
});
export type PublishedStoryV1 = z.infer<typeof PublishedStoryV1>;

// Control characters and bidirectional overrides can hide or reorder text; machine and feed text is plain text only.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
const UNSAFE_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g;

export function cleanText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const clean = value.replace(UNSAFE_CHARS, "").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function publishStory(
  db: Db,
  input: PublishedStoryV1,
): Promise<{ change: "created" | "corrected" | "unchanged"; id: string | null }> {
  const s = PublishedStoryV1.parse(input);
  const revision = createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 32);
  // A second item for a URL already shown is kept for curators instead of becoming a visible duplicate.
  const [dupe] = await db<{ id: string }[]>`
    SELECT id FROM content.stories
    WHERE canonical_url = ${s.canonicalUrl} AND status = 'published'
      AND NOT (provider = ${s.provenance.provider} AND upstream_id = ${s.provenance.upstreamId})
    LIMIT 1`;
  const status = dupe ? "under_review" : s.publicationState;
  const reviewReason = dupe ? "mesma URL de uma notícia já publicada" : s.reviewReason;
  const [row] = await db<{ id: string; inserted: boolean; previousStatus: string | null }[]>`
    INSERT INTO content.stories (source_id, provider, upstream_id, headline, summary, original_url, canonical_url,
      source_name, original_published_at, first_seen_at, language, topics, editorial_score, selection_reason,
      ai_generated, model_version, policy_version, evidence_urls, status, review_reason, upstream_revision)
    VALUES (${s.sourceId}, ${s.provenance.provider}, ${s.provenance.upstreamId}, ${s.headline}, ${s.summary},
      ${s.originalUrl}, ${s.canonicalUrl}, ${s.sourceName}, ${s.originalPublishedAt}, ${s.firstSeenAt}, ${s.language},
      ${s.topics}, ${s.editorialScore}, ${s.selectionReason}, true, ${s.provenance.modelVersion},
      ${s.provenance.policyVersion}, ${s.evidenceUrls}, ${status}, ${reviewReason}, ${revision})
    ON CONFLICT (provider, upstream_id) DO UPDATE SET
      headline = EXCLUDED.headline, summary = EXCLUDED.summary, original_url = EXCLUDED.original_url,
      canonical_url = EXCLUDED.canonical_url, source_name = EXCLUDED.source_name,
      original_published_at = EXCLUDED.original_published_at, language = EXCLUDED.language, topics = EXCLUDED.topics,
      editorial_score = EXCLUDED.editorial_score, selection_reason = EXCLUDED.selection_reason,
      model_version = EXCLUDED.model_version, policy_version = EXCLUDED.policy_version,
      evidence_urls = EXCLUDED.evidence_urls, status = EXCLUDED.status, review_reason = EXCLUDED.review_reason,
      upstream_revision = EXCLUDED.upstream_revision, synced_at = now()
    WHERE content.stories.upstream_revision IS DISTINCT FROM EXCLUDED.upstream_revision
      AND content.stories.status <> 'retracted'
    RETURNING id, (xmax = 0) AS inserted,
      (SELECT status FROM content.stories o WHERE o.id = content.stories.id) AS previous_status`;
  if (!row) return { change: "unchanged", id: null };
  const change = row.inserted ? "created" : "corrected";
  await db`INSERT INTO content.story_history (story_id, change, snapshot) VALUES (${row.id}, ${change}, ${db.json(s as never)})`;
  if (status === "published" && (row.inserted || row.previousStatus !== "published")) {
    await emit(db, "content.story.published.v1", row.id, { storyId: row.id }, { type: "system" });
  }
  return { change, id: row.id };
}
