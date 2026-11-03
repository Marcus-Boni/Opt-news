// RSS 2.0 and Atom → plain feed entries. Only metadata and the feed's own excerpt are kept (ADR-0008: no full text).
import { XMLParser } from "fast-xml-parser";

export interface FeedEntry {
  guid: string;
  title: string;
  link: string;
  excerpt: string | null;
  publishedAt: string | null;
}

const MAX_ENTRIES = 100;
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  htmlEntities: true,
  // Arrays even when a feed has a single entry.
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as object)) return String((v as { "#text": unknown })["#text"]);
  return "";
};

/** Feed HTML becomes plain text for the model and for storage; it is never rendered as HTML. */
export function plainText(html: string, max = 1000): string | null {
  const clean = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function date(v: unknown): string | null {
  const t = Date.parse(text(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const channel = (doc.rss as { channel?: { item?: Record<string, unknown>[] } } | undefined)?.channel;
  const feed = doc.feed as { entry?: Record<string, unknown>[] } | undefined;
  if (!channel && !feed) throw new Error("documento não é RSS nem Atom");
  // An empty feed is valid: no items yet.
  const rss = channel ? (channel.item ?? []) : undefined;
  const atom = feed ? (feed.entry ?? []) : undefined;
  const entries = (rss ?? atom ?? []).slice(0, MAX_ENTRIES).map((e) => {
    const links = (e.link as unknown[] | undefined) ?? [];
    const link = rss
      ? text(links[0])
      : text((links as Record<string, unknown>[]).find((l) => !l["@rel"] || l["@rel"] === "alternate")?.["@href"]);
    const guid = text(e.guid) || text(e.id) || link;
    return {
      guid,
      // Titles are plain text by spec: markup in them stays literal (and is shown as text), never stripped into meaning.
      title: text(e.title).replace(/\s+/g, " ").trim().slice(0, 300),
      link: link.trim(),
      excerpt: plainText(text(e.description) || text(e.summary) || text(e.content)),
      publishedAt: date(e.pubDate ?? e.published ?? e.updated),
    };
  });
  return entries.filter((e) => e.guid && e.title && e.link);
}
