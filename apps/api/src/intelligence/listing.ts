// Sources without a feed (AIHOT "web_list", ADR-0015): the listing page gives the article links, and each new article
// page gives what a link preview shows (headline, description, date; page.ts). Nothing else from the page is kept.
import { canonicalUrl } from "../content/url-guard.ts";
import type { Sql } from "../db/index.ts";
import type { FeedEntry } from "./feeds.ts";
import { pageMetadata } from "./page.ts";

/**
 * Article pages read per run and source: a first collection catches up over a few runs instead of one burst. There is
 * no early stop on old articles: listings open with featured cards of any age (anthropic.com/news), so page order says
 * little about dates. Old articles are stored archived and never read again.
 */
const MAX_PAGES = 10;

/** Article links of a listing, in page order: absolute http(s), under the prefix, without the fragment. */
export function listingLinks(html: string, base: string, prefix: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    let url: URL;
    try {
      url = new URL((m[1] ?? "").replace(/&amp;/g, "&"), base);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    const href = url.toString();
    // The prefix itself is the listing (or its index), not an article.
    if (href.startsWith(prefix) && href.replace(/\/$/, "") !== prefix.replace(/\/$/, "")) links.add(href);
  }
  return [...links];
}

export interface ListingReport {
  entries: FeedEntry[];
  /** Pages that could not be read or carry no headline or date; they are tried again on the next run. */
  invalid: number;
}

export async function listedEntries(
  sql: Sql,
  fetchPage: (url: string) => Promise<string>,
  source: { feedUrl: string; linkPrefix: string },
  html: string,
): Promise<ListingReport> {
  const links = listingLinks(html, source.feedUrl, source.linkPrefix).flatMap((link) => {
    try {
      return [{ link, canonical: canonicalUrl(link).toString() }];
    } catch {
      return [];
    }
  });
  const known = new Set(
    (
      await sql<{ canonicalUrl: string }[]>`
        SELECT canonical_url FROM content.raw_items WHERE canonical_url = ANY(${links.map((l) => l.canonical)})`
    ).map((r) => r.canonicalUrl),
  );
  const report: ListingReport = { entries: [], invalid: 0 };
  let read = 0;
  for (const { link, canonical } of links) {
    if (known.has(canonical)) continue;
    if (read >= MAX_PAGES) break;
    read++;
    const page = await fetchPage(link).catch(() => null);
    const meta = page ? pageMetadata(page) : null;
    // shortcut: an undated page (category, landing) is read again on every run; record skipped links if it adds up.
    if (!meta?.title || !meta.publishedAt) {
      report.invalid++;
      continue;
    }
    report.entries.push({
      guid: canonical,
      link,
      title: meta.title,
      excerpt: meta.description,
      publishedAt: meta.publishedAt,
    });
  }
  return report;
}
