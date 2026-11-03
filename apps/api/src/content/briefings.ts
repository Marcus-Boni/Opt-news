// Reading a briefing applies each story's current state: a retracted or hidden story leaves the briefing, and the
// machine-written overview goes with it, since it may summarise that story (AIHOT does the same for its reports).
import type { Db } from "../db/index.ts";
import { notFound } from "../http/problem.ts";
import type { Actor } from "../identity/policy.ts";
import { cardsByIds } from "./stories.ts";

interface Row {
  periodKey: string;
  generatedAt: string;
  overview: string | null;
  items: { storyId: string; section: string }[];
  modelVersion: string | null;
  policyVersion: string;
}

export async function listBriefings(db: Db) {
  const rows = await db<{ periodKey: string; generatedAt: string; items: number }[]>`
    SELECT period_key, generated_at, jsonb_array_length(items) AS items FROM content.briefings
    WHERE kind = 'daily' ORDER BY period_key DESC LIMIT 30`;
  return rows.map((r) => ({ date: r.periodKey, generatedAt: r.generatedAt, items: r.items }));
}

export async function getBriefing(db: Db, actor: Actor, date: string) {
  const [b] = await db<Row[]>`
    SELECT period_key, generated_at, overview, items, model_version, policy_version FROM content.briefings
    WHERE kind = 'daily' ${date === "latest" ? db`` : db`AND period_key = ${date}`}
    ORDER BY period_key DESC LIMIT 1`;
  if (!b) throw notFound();
  const cards = await cardsByIds(
    db,
    actor,
    b.items.map((i) => i.storyId),
  );
  const shown = new Map(cards.map((c) => [c.id, c]));
  const withdrawn = b.items.some((i) => shown.get(i.storyId)?.status !== "published");
  const sections = [...new Set(b.items.map((i) => i.section))]
    .map((label) => ({
      label,
      stories: b.items
        .filter((i) => i.section === label)
        .flatMap((i) => {
          const c = shown.get(i.storyId);
          return c?.status === "published" ? [c] : [];
        }),
    }))
    .filter((s) => s.stories.length > 0);
  return {
    date: b.periodKey,
    generatedAt: b.generatedAt,
    overview: withdrawn ? null : b.overview,
    overviewWithdrawn: withdrawn && b.overview !== null,
    sections,
    modelVersion: b.modelVersion,
    policyVersion: b.policyVersion,
  };
}
