// Content intelligence pipeline (ADR-0003, strategy D), following the AIHOT flow: collect → dedupe → prefilter →
// two independent scores → write → publish. Model calls happen only here (worker), never in a reader's request.
import { createHash } from "node:crypto";
import { cleanText, publishStory } from "../content/publish.ts";
import { canonicalUrl } from "../content/url-guard.ts";
import type { Sql } from "../db/index.ts";
import type { FetchResult } from "./fetch.ts";
import { type FeedEntry, parseFeed } from "./feeds.ts";
import { listedEntries } from "./listing.ts";
import { groupStory } from "./events.ts";
import {
  BudgetExceeded,
  type CallContext,
  callModel,
  InvalidModelOutput,
  ProviderUnavailable,
  ReceiptBusy,
} from "./model.ts";
import { type IntakeReport, intakeSubmissions, settleSubmissions } from "./submissions.ts";
import { DISAGREEMENT, editorialScore, MAX_AGE_HOURS, material, PROMPT_VERSION, thresholdsFor } from "./prompts.ts";

export const PROVIDER = "optnews";
const ARTICLE_LABEL = "Texto do artigo (só para análise; não copie frases, escreva com suas palavras):";

/**
 * The selection gate for this run. Reading the article changes the score scale (cred rises), so it has its own key;
 * an uncalibrated key falls back to the AIHOT gates, which were set for models that read the full article.
 */
const gate = (deps: IngestDeps) => thresholdsFor(`${deps.model.provider.name}${deps.readArticle ? "+artigo" : ""}`);
const MAX_ATTEMPTS = 3;

export interface IngestDeps {
  sql: Sql;
  /** A plain string is a full response without validators (fixtures, tests). */
  fetchFeed: (
    url: string,
    validators: { etag: string | null; lastModified: string | null; accept?: "feed" | "html" },
  ) => Promise<string | FetchResult>;
  model: Omit<CallContext, "sql" | "promptVersion">;
  language: string;
  now?: () => Date;
  /** Article page as HTML, for member submissions (N-11) and listing sources. Without it, both wait. */
  fetchPage?: (url: string) => Promise<string>;
  /**
   * Main text of the article for scoring and writing (ARTICLE_READING, Q-02). Absent = feed excerpt only. The text
   * reaches the model and nothing else: it is never stored or shown.
   */
  readArticle?: (url: string) => Promise<string | null>;
}

export interface CollectReport {
  sourceId: string;
  added: number;
  changed: number;
  archived: number;
  duplicates: number;
  invalid: number;
  /** The feed answered 304: nothing changed since the last full response. */
  notModified: boolean;
  error: string | null;
}

interface Source {
  id: string;
  name: string;
  kind: "rss" | "web_list";
  feedUrl: string;
  /** web_list only: article links start with this. */
  linkPrefix: string | null;
  tier: "T1" | "T1_5" | "T2";
  etag: string | null;
  lastModified: string | null;
}

export async function collectSource(deps: IngestDeps, source: Source): Promise<CollectReport> {
  const { sql } = deps;
  const now = deps.now?.() ?? new Date();
  const report: CollectReport = {
    sourceId: source.id,
    added: 0,
    changed: 0,
    archived: 0,
    duplicates: 0,
    invalid: 0,
    notModified: false,
    error: null,
  };
  await sql`UPDATE content.sources SET last_attempt_at = now() WHERE id = ${source.id}`;
  try {
    const listing = source.kind === "web_list";
    if (listing && !deps.fetchPage) throw new Error("leitura de páginas indisponível neste worker");
    const fetched = await deps.fetchFeed(source.feedUrl, {
      etag: source.etag,
      lastModified: source.lastModified,
      accept: listing ? "html" : "feed",
    });
    const res =
      typeof fetched === "string"
        ? { notModified: false as const, body: fetched, etag: null, lastModified: null }
        : fetched;
    if (res.notModified) {
      report.notModified = true;
      await sql`UPDATE content.sources SET last_success_at = now(), last_error = NULL WHERE id = ${source.id}`;
      return report;
    }
    let entries: FeedEntry[];
    if (listing && deps.fetchPage) {
      const found = await listedEntries(
        sql,
        deps.fetchPage,
        { feedUrl: source.feedUrl, linkPrefix: source.linkPrefix ?? source.feedUrl },
        res.body,
      );
      entries = found.entries;
      report.invalid += found.invalid;
    } else entries = parseFeed(res.body);
    await sql.begin(async (tx) => {
      for (const e of entries) {
        let canonical: string;
        try {
          canonical = canonicalUrl(e.link).toString();
        } catch {
          report.invalid++;
          continue;
        }
        const hash = createHash("sha256")
          .update(`${e.title}\n${e.excerpt ?? ""}`)
          .digest("hex");
        const [other] = await tx`
          SELECT 1 FROM content.raw_items WHERE canonical_url = ${canonical} AND NOT (source_id = ${source.id} AND guid = ${e.guid})`;
        // shortcut: the second source of a URL is not recorded as extra coverage; upgrade with event grouping (N-06).
        if (other) {
          report.duplicates++;
          continue;
        }
        const old = e.publishedAt !== null && Date.parse(e.publishedAt) < now.getTime() - MAX_AGE_HOURS * 3_600_000;
        const [row] = await tx<{ inserted: boolean }[]>`
          INSERT INTO content.raw_items (source_id, guid, canonical_url, original_url, title, excerpt, published_at, content_hash, status)
          VALUES (${source.id}, ${e.guid}, ${canonical}, ${e.link}, ${e.title}, ${e.excerpt}, ${e.publishedAt}, ${hash},
            ${old ? "archived" : "discovered"})
          ON CONFLICT (source_id, guid) DO UPDATE SET title = EXCLUDED.title, excerpt = EXCLUDED.excerpt,
            published_at = EXCLUDED.published_at, content_hash = EXCLUDED.content_hash, revision = content.raw_items.revision + 1,
            status = CASE WHEN content.raw_items.status = 'archived' THEN 'archived' ELSE 'discovered' END, attempts = 0, error = NULL
          WHERE content.raw_items.content_hash <> EXCLUDED.content_hash
          RETURNING (xmax = 0) AS inserted`;
        if (!row) continue;
        if (!row.inserted) report.changed++;
        else if (old) report.archived++;
        else report.added++;
      }
    });
    // Validators are kept only after the items are safely stored, so a failed run fetches the full feed again. A
    // listing keeps none: an unchanged listing may still hold links a capped run did not read yet.
    await sql`UPDATE content.sources SET last_success_at = now(), last_error = NULL,
              etag = ${listing ? null : res.etag}, last_modified = ${listing ? null : res.lastModified} WHERE id = ${source.id}`;
  } catch (error) {
    report.error = String((error as Error).message).slice(0, 500);
    await sql`UPDATE content.sources SET last_error = ${report.error} WHERE id = ${source.id}`;
  }
  return report;
}

interface Pending {
  id: string;
  sourceId: string;
  sourceName: string;
  tier: Source["tier"];
  title: string;
  excerpt: string | null;
  originalUrl: string;
  canonicalUrl: string;
  publishedAt: string | null;
  observedAt: string;
  contentHash: string;
  forcedBy: string | null;
}

export type Outcome = "selected" | "under_review" | "not_selected" | "rejected" | "failed" | "deferred";

async function setStatus(sql: Sql, id: string, status: string, extra: { a?: number; b?: number; error?: string } = {}) {
  await sql`UPDATE content.raw_items SET status = ${status}, score_a = coalesce(${extra.a ?? null}, score_a),
            score_b = coalesce(${extra.b ?? null}, score_b), error = ${extra.error ?? null} WHERE id = ${id}`;
}

export async function evaluateItem(deps: IngestDeps, item: Pending, topics: ReadonlySet<string>): Promise<Outcome> {
  const { sql } = deps;
  const ctx: CallContext = { sql, promptVersion: PROMPT_VERSION, ...deps.model };
  const user = material(item);
  try {
    const pre = await callModel(ctx, item.id, "prefilter", user);
    // A curator's "publicar mesmo assim" passes the prefilter and the gate; the model still scores and writes it.
    const forced = item.forcedBy !== null;
    if (pre.label === "BLOCK" && !forced) {
      await setStatus(sql, item.id, "rejected", { error: `pré-filtro: ${pre.reason}` });
      return "rejected";
    }
    // The prefilter only needs the headline; reading the article is paid once the item may matter.
    const article = deps.readArticle ? await deps.readArticle(item.originalUrl).catch(() => null) : null;
    const full = article ? [user, ARTICLE_LABEL, article].join("\n") : user;
    const a = (await callModel(ctx, item.id, "score_a", full)).attentionScore;
    const b = (await callModel(ctx, item.id, "score_b", full)).attentionScore;
    if (!forced && a + b < 2 * gate(deps)[item.tier]) {
      await setStatus(sql, item.id, "not_selected", { a, b });
      return "not_selected";
    }
    const w = await callModel(ctx, item.id, "write", `${full}\nTópicos permitidos: ${[...topics].join(", ")}`);
    const reviewReason = forced
      ? null
      : !item.publishedAt
        ? "sem data de publicação confiável"
        : Math.abs(a - b) >= DISAGREEMENT
          ? `avaliações divergentes (${a} e ${b})`
          : null;
    const published = await sql.begin(async (tx) => {
      const result = await publishStory(tx, {
        sourceId: item.sourceId,
        canonicalUrl: item.canonicalUrl,
        originalUrl: item.originalUrl,
        sourceName: item.sourceName,
        originalPublishedAt: item.publishedAt,
        firstSeenAt: item.observedAt,
        headline: cleanText(w.headline, 300) ?? item.title,
        summary: cleanText(w.summary, 2000),
        selectionReason: cleanText(w.reason, 1000),
        language: deps.language,
        topics: w.topic && topics.has(w.topic) ? [w.topic] : [],
        editorialScore: editorialScore(gate(deps), item.tier, a, b),
        evidenceUrls: [item.originalUrl],
        publicationState: reviewReason ? "under_review" : "published",
        reviewReason,
        provenance: {
          provider: PROVIDER,
          upstreamId: item.id,
          modelVersion: deps.model.provider.name,
          policyVersion: PROMPT_VERSION,
        },
      });
      await tx`UPDATE content.raw_items SET status = 'selected', score_a = ${a}, score_b = ${b}, error = NULL WHERE id = ${item.id}`;
      return result;
    });
    // Grouping failures never undo a selection: the story just stays on its own (re-grouping: NX-11 follow-up).
    if (published.change === "created" && published.id) {
      await groupStory({ sql, ...deps.model }, published.id).catch((error: unknown) =>
        console.error(JSON.stringify({ msg: "grouping failed", storyId: published.id, error: String(error) })),
      );
    }
    return reviewReason ? "under_review" : "selected";
  } catch (error) {
    // Budget and in-flight receipts leave the item for a later run; nothing is lost or paid twice.
    if (error instanceof BudgetExceeded || error instanceof ReceiptBusy || error instanceof ProviderUnavailable)
      return "deferred";
    const message = String((error as Error).message).slice(0, 500);
    // An invalid answer is saved in its receipt and would be reused, so retrying it is pointless.
    const final = error instanceof InvalidModelOutput;
    await sql`UPDATE content.raw_items SET status = 'failed', error = ${message},
              attempts = CASE WHEN ${final} THEN ${MAX_ATTEMPTS} ELSE attempts + 1 END WHERE id = ${item.id}`;
    return "failed";
  }
}

export interface IngestReport {
  collected: CollectReport[];
  submissions: IntakeReport | null;
  outcomes: Record<Outcome, number>;
}

/** One run: collect every due active source, then evaluate pending items oldest first. */
export async function runIngest(
  deps: IngestDeps,
  options: { force?: boolean; limit?: number } = {},
): Promise<IngestReport> {
  const { sql } = deps;
  const sources = await sql<Source[]>`
    SELECT id, name, kind, feed_url, link_prefix, tier, etag, last_modified FROM content.sources
    WHERE active AND kind IN ('rss', 'web_list') AND (${options.force ?? false} OR last_attempt_at IS NULL OR last_attempt_at < now() - make_interval(mins => interval_minutes))
    ORDER BY id`;
  const collected = [];
  for (const s of sources) collected.push(await collectSource(deps, s));
  const submissions = deps.fetchPage ? await intakeSubmissions(sql, deps.fetchPage) : null;
  const topics = new Set((await sql<{ slug: string }[]>`SELECT slug FROM content.topics`).map((t) => t.slug));
  const pending = await sql<Pending[]>`
    SELECT r.id, r.source_id, s.name AS source_name, s.tier, r.title, r.excerpt, r.original_url, r.canonical_url,
      r.published_at, r.observed_at, r.content_hash, r.forced_by
    FROM content.raw_items r JOIN content.sources s ON s.id = r.source_id
    WHERE r.status = 'discovered' OR (r.status = 'failed' AND r.attempts < ${MAX_ATTEMPTS})
    ORDER BY r.observed_at, r.id LIMIT ${options.limit ?? 50}`;
  const outcomes: Record<Outcome, number> = {
    selected: 0,
    under_review: 0,
    not_selected: 0,
    rejected: 0,
    failed: 0,
    deferred: 0,
  };
  for (const item of pending) {
    const outcome = await evaluateItem(deps, item, topics);
    outcomes[outcome]++;
    if (outcome === "deferred") break;
  }
  await settleSubmissions(sql);
  return { collected, submissions, outcomes };
}
