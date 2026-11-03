// Reading an article page, for two uses: the metadata a link preview shows (N-11 submissions) and, when the rights
// policy allows it (ARTICLE_READING, Q-02), the main text the model reads for scoring and writing. Page text is
// passed to the model only; it is never stored or shown (ADR-0008). Pages are untrusted input: no HTML survives.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// Entities first, so encoded markup (&lt;b&gt;) is stripped too.
const squash = (s: string) =>
  decodeEntities(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, names: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (key && value && names.includes(key)) return squash(value) || null;
  }
  return null;
}

export interface PageMetadata {
  title: string | null;
  description: string | null;
  publishedAt: string | null;
}

/** What a link preview shows: Open Graph first, then the plain HTML title and description. */
export function pageMetadata(html: string): PageMetadata {
  const head = html.slice(0, 200_000);
  const title = meta(head, ["og:title", "twitter:title"]) ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "";
  const published = meta(head, ["article:published_time", "og:published_time", "date", "dc.date"]);
  const t = published ? Date.parse(published) : Number.NaN;
  return {
    title: squash(title).slice(0, 300) || null,
    description: (meta(head, ["og:description", "description", "twitter:description"]) ?? "").slice(0, 1000) || null,
    publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
  };
}

/**
 * Main text of an article: the paragraphs of <article> (or <main>, or the whole body), without scripts, styles,
 * navigation, headers, footers and asides. shortcut: paragraph heuristics, not Readability; pages that render text
 * with JavaScript give nothing back and the model falls back to the feed excerpt. Upgrade to a DOM extractor if the
 * curators see thin summaries from specific sources.
 */
export function articleText(html: string, max = 6000): string | null {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const scope = /<article\b[\s\S]*<\/article>/i.exec(body)?.[0] ?? /<main\b[\s\S]*<\/main>/i.exec(body)?.[0] ?? body;
  const paragraphs = [...scope.matchAll(/<(p|h2|h3|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => squash(m[2] ?? ""))
    // Short lines are bylines, buttons and captions more often than content.
    .filter((p) => p.length >= 40);
  const text = paragraphs.join("\n");
  if (text.length < 200) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
