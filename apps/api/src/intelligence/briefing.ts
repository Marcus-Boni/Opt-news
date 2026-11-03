// N-07: daily briefing, following AIHOT reports/compose.ts (MIT, see NOTICE). Items, order and sections are decided
// by rule (one story per event, by editorial score); a model only writes the overview, and an overview that names
// anything the items do not name is discarded — the briefing is saved without one.
import { representative } from "../content/stories.ts";
import { type CallContext, callModel } from "./model.ts";
import { PROMPT_VERSION } from "./prompts.ts";

const MAX_ITEMS = 10;
// Brazil has had no daylight saving time since 2019, so São Paulo is a fixed UTC−3.
const SP_OFFSET_MS = 3 * 3_600_000;

/** The São Paulo calendar day of an instant, as YYYY-MM-DD. */
export const dayKey = (at: Date) => new Date(at.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Whether written text names only what the items name (port of AIHOT `grounded`, adapted to Portuguese): every word
 * with a digit or an inner capital (GPT-4o, RAG), every capitalised word that does not open a sentence, and every
 * figure of three or more digits or with a decimal or percent must appear in the items' own words.
 */
export function grounded(text: string, corpus: string): boolean {
  const known = corpus.toLowerCase();
  for (const sentence of text.split(/(?<=[.!?;:])\s+/)) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}.+-]*/gu) ?? [];
    for (const [i, raw] of words.entries()) {
      const w = raw.replace(/[.+-]+$/, "");
      const named = /\d/.test(w) || /\p{Lu}/u.test(w.slice(1)) || (i > 0 && /^\p{Lu}/u.test(w));
      if (named && !known.includes(w.toLowerCase())) return false;
    }
  }
  const figures = (text.match(/\d+(?:[.,]\d+)?%?/g) ?? []).filter((f) => f.length >= 3 || /[.,%]/.test(f));
  return figures.every((f) => known.includes(f));
}

interface Item {
  id: string;
  headline: string;
  summary: string | null;
  topic: string | null;
  label: string | null;
}

export async function generateDailyBriefing(
  ctx: Omit<CallContext, "promptVersion">,
  key: string,
  options: { force?: boolean } = {},
): Promise<{ key: string; items: number; overview: boolean } | null> {
  const { sql } = ctx;
  const [existing] = await sql`SELECT 1 FROM content.briefings WHERE kind = 'daily' AND period_key = ${key}`;
  if (existing && !options.force) return null;
  const start = new Date(Date.parse(`${key}T00:00:00Z`) + SP_OFFSET_MS).toISOString();
  const items = await sql<Item[]>`
    SELECT s.id, s.headline, s.summary, s.topics[1] AS topic, t.label
    FROM content.stories s LEFT JOIN content.topics t ON t.slug = s.topics[1]
    WHERE s.status = 'published' AND s.sort_at >= ${start}::timestamptz AND s.sort_at < ${start}::timestamptz + interval '1 day'
      AND ${representative(sql)}
    ORDER BY s.editorial_score DESC NULLS LAST, s.sort_at DESC, s.id LIMIT ${MAX_ITEMS}`;
  // A quiet day publishes no empty briefing.
  if (items.length === 0) return null;

  // Sections follow the order of their best item.
  const sections = [...new Set(items.map((i) => i.label ?? "Outros"))];
  const user = sections
    .map((label) =>
      [
        `[${label}]`,
        ...items
          .filter((i) => (i.label ?? "Outros") === label)
          .map((i) => `- ${i.headline} | ${(i.summary ?? "").slice(0, 140)}`),
      ].join("\n"),
    )
    .join("\n");
  const corpus = items.map((i) => `${i.headline} ${i.summary ?? ""}`).join("\n");
  let overview: string | null = null;
  try {
    const written = await callModel(
      { ...ctx, promptVersion: PROMPT_VERSION },
      `briefing:daily:${key}`,
      "briefing",
      user,
    );
    overview = grounded(written.overview, corpus) ? written.overview.trim() : null;
  } catch (error) {
    console.error(JSON.stringify({ msg: "briefing overview failed", key, error: String(error) }));
  }
  const stored = items.map((i) => ({ storyId: i.id, section: i.label ?? "Outros", topic: i.topic }));
  await sql`
    INSERT INTO content.briefings (kind, period_key, overview, items, model_version, policy_version)
    VALUES ('daily', ${key}, ${overview}, ${sql.json(stored)}, ${overview ? ctx.provider.name : null}, ${PROMPT_VERSION})
    ON CONFLICT (kind, period_key) DO UPDATE SET overview = EXCLUDED.overview, items = EXCLUDED.items,
      model_version = EXCLUDED.model_version, policy_version = EXCLUDED.policy_version, generated_at = now()`;
  return { key, items: items.length, overview: overview !== null };
}
