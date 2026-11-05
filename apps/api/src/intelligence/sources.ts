// N-01: curators see source health and failures, pause/resume sources and change their cadence; admins register
// sources and change name, feed URL and tier (docs/09 RBAC: "Gerir fontes" partial for curators). Every change is
// audited with before/after. A source is never deleted: pausing keeps its items and stories traceable.
import type { BodyOut, endpoints } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { conflict, invalid, notFound } from "../http/problem.ts";
import { type Actor, authorize } from "../identity/policy.ts";
import { audit } from "../ops/record.ts";
import { assertPublicUrl, type Lookup } from "../content/url-guard.ts";
import { thresholdsFor } from "./prompts.ts";

type Tier = "T1" | "T1_5" | "T2";

interface Row {
  id: string;
  name: string;
  tier: Tier;
  kind: "rss" | "web_list" | "submission";
  active: boolean;
  feedUrl: string;
  linkPrefix: string | null;
  intervalMinutes: number;
  licensePolicy: "summary_link";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  pending: number;
  selected: number;
  notSelected: number;
  rejected: number;
  archived: number;
  failed: number;
  published: number;
  underReview: number;
  week: number[];
}

const count = (db: Db, status: string) =>
  db`(SELECT count(*)::int FROM content.raw_items r WHERE r.source_id = s.id AND r.status = ${status})`;

const SELECT = (db: Db) => db`
  SELECT s.id, s.name, s.tier, s.kind, s.active, s.feed_url, s.link_prefix, s.interval_minutes, s.license_policy,
    s.last_attempt_at, s.last_success_at, s.last_error,
    ${count(db, "discovered")} AS pending, ${count(db, "selected")} AS selected, ${count(db, "not_selected")} AS not_selected,
    ${count(db, "rejected")} AS rejected, ${count(db, "archived")} AS archived, ${count(db, "failed")} AS failed,
    (SELECT count(*)::int FROM content.stories st WHERE st.source_id = s.id AND st.status = 'published') AS published,
    (SELECT count(*)::int FROM content.stories st WHERE st.source_id = s.id AND st.status = 'under_review') AS under_review,
    (SELECT array_agg(
        (SELECT count(*)::int FROM content.raw_items r
          WHERE r.source_id = s.id AND (r.observed_at AT TIME ZONE ${TZ})::date = d.day)
        ORDER BY d.day)
      FROM (SELECT (now() AT TIME ZONE ${TZ})::date - k AS day FROM generate_series(0, 6) k) d) AS week
  FROM content.sources s`;

const TZ = "America/Sao_Paulo";

/** One row per day of the last 12 weeks: published stories (by first sighting), comments and proposals. */
export async function activity(db: Db, actor: Actor) {
  authorize(actor, "moderate");
  const days = await db<{ date: string; stories: number; comments: number; proposals: number }[]>`
    WITH d AS (SELECT ((now() AT TIME ZONE ${TZ})::date - k) AS day FROM generate_series(0, 83) k)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM content.stories st
        WHERE st.status = 'published' AND (st.first_seen_at AT TIME ZONE ${TZ})::date = d.day) AS stories,
      (SELECT count(*)::int FROM community.comments c
        WHERE c.status = 'visible' AND (c.created_at AT TIME ZONE ${TZ})::date = d.day) AS comments,
      (SELECT count(*)::int FROM meetups.proposals p WHERE (p.created_at AT TIME ZONE ${TZ})::date = d.day) AS proposals
    FROM d ORDER BY d.day`;
  return { days };
}

/** The gate shown is the one the active model is held to. */
function view({ pending, selected, notSelected, rejected, archived, failed, ...s }: Row, model: string) {
  return {
    ...s,
    threshold: thresholdsFor(model)[s.tier],
    items: { pending, selected, notSelected, rejected, archived, failed },
  };
}

export async function listSources(db: Db, actor: Actor, model: string) {
  authorize(actor, "moderate");
  const rows = await db<Row[]>`${SELECT(db)} ORDER BY s.active DESC, s.name`;
  return rows.map((r) => view(r, model));
}

export async function getSource(db: Db, actor: Actor, id: string, model: string) {
  authorize(actor, "moderate");
  const [row] = await db<Row[]>`${SELECT(db)} WHERE s.id = ${id}`;
  if (!row) throw notFound();
  const recent = await db<
    {
      id: string;
      title: string;
      url: string;
      status: "discovered" | "archived" | "rejected" | "not_selected" | "selected" | "failed";
      error: string | null;
      scoreA: number | null;
      scoreB: number | null;
      publishedAt: string | null;
      observedAt: string;
      storyId: string | null;
    }[]
  >`
    SELECT r.id, r.title, r.original_url AS url, r.status, r.error, r.score_a, r.score_b, r.published_at, r.observed_at,
      (SELECT st.id FROM content.stories st WHERE st.upstream_id = r.id::text) AS story_id
    FROM content.raw_items r WHERE r.source_id = ${id} ORDER BY r.observed_at DESC, r.id LIMIT 30`;
  return {
    ...view(row, model),
    recent: recent.map(({ scoreA, scoreB, ...r }) => ({
      ...r,
      scores: scoreA === null || scoreB === null ? null : ([scoreA, scoreB] as [number, number]),
    })),
  };
}

export interface SourceDeps {
  /** Dev-only hosts that may be private (local fake feeds); empty in every shared environment. */
  privateHosts: readonly string[];
  lookup?: Lookup;
  /** Name of the active model provider, whose selection gates the views show. */
  model: string;
}

/** Feed URLs pass the same guard as submitted links, except the dev-only private hosts. */
async function checkedFeedUrl(raw: string, deps: SourceDeps): Promise<string> {
  try {
    if (deps.privateHosts.includes(new URL(raw).hostname)) return new URL(raw).toString();
  } catch {
    // Malformed: let the guard produce the 422.
  }
  return (await assertPublicUrl(raw, deps.lookup)).toString();
}

/**
 * Article links of a listing must stay on the listing's own site, so a page full of ads or partner links cannot feed
 * the pipeline from elsewhere. Defaults to everything under the listing address.
 */
function checkedPrefix(raw: string | undefined, listing: string): string {
  const prefix = raw ?? (listing.endsWith("/") ? listing : `${listing}/`);
  let url: URL;
  try {
    url = new URL(prefix);
  } catch {
    throw invalid("O prefixo dos links precisa ser um endereço completo (https://…).");
  }
  if (url.host !== new URL(listing).host) throw invalid("O prefixo dos links precisa ser do mesmo site da listagem.");
  return url.toString();
}

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

export async function createSource(
  db: Db,
  actor: Actor,
  input: BodyOut<typeof endpoints.createSource>,
  deps: SourceDeps,
  requestId: string,
) {
  authorize(actor, "administer");
  const feedUrl = await checkedFeedUrl(input.feedUrl, deps);
  const linkPrefix = input.kind === "web_list" ? checkedPrefix(input.linkPrefix, feedUrl) : null;
  const id = input.id ?? slug(input.name);
  if (id.length < 2) throw conflict("Não foi possível derivar um identificador do nome; informe um id.");
  const [sameUrl] = await db<{ id: string }[]>`SELECT id FROM content.sources WHERE feed_url = ${feedUrl}`;
  if (sameUrl) throw conflict(`Este feed já está cadastrado como "${sameUrl.id}".`);
  const inserted = await db`
    INSERT INTO content.sources (id, name, kind, feed_url, link_prefix, tier, interval_minutes)
    VALUES (${id}, ${input.name}, ${input.kind}, ${feedUrl}, ${linkPrefix}, ${input.tier}, ${input.intervalMinutes})
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (inserted.length === 0) throw conflict(`Já existe uma fonte com o identificador "${id}".`);
  await audit(db, {
    actorId: actor.id,
    action: "content.source.created",
    targetType: "source",
    targetId: id,
    detail: {
      after: {
        name: input.name,
        kind: input.kind,
        feedUrl,
        linkPrefix,
        tier: input.tier,
        intervalMinutes: input.intervalMinutes,
      },
    },
    requestId,
  });
  return getSource(db, actor, id, deps.model);
}

export async function updateSource(
  db: Db,
  actor: Actor,
  id: string,
  input: BodyOut<typeof endpoints.updateSource>,
  deps: SourceDeps,
  requestId: string,
) {
  authorize(actor, "moderate");
  if (
    input.name !== undefined ||
    input.feedUrl !== undefined ||
    input.linkPrefix !== undefined ||
    input.tier !== undefined
  ) {
    authorize(actor, "administer");
  }
  const [current] = await db<
    {
      kind: Row["kind"];
      name: string;
      feedUrl: string;
      linkPrefix: string | null;
      tier: Tier;
      active: boolean;
      intervalMinutes: number;
    }[]
  >`SELECT kind, name, feed_url, link_prefix, tier, active, interval_minutes FROM content.sources WHERE id = ${id} FOR UPDATE`;
  if (!current) throw notFound();
  const { kind, ...before } = current;
  const feedUrl = input.feedUrl === undefined ? before.feedUrl : await checkedFeedUrl(input.feedUrl, deps);
  if (feedUrl !== before.feedUrl) {
    const [other] = await db<
      { id: string }[]
    >`SELECT id FROM content.sources WHERE feed_url = ${feedUrl} AND id <> ${id}`;
    if (other) throw conflict(`Este feed já está cadastrado como "${other.id}".`);
  }
  if (input.linkPrefix !== undefined && kind !== "web_list")
    throw invalid("Só fontes de listagem têm prefixo de links.");
  const after = {
    name: input.name ?? before.name,
    feedUrl,
    linkPrefix:
      kind === "web_list" && (input.linkPrefix !== undefined || feedUrl !== before.feedUrl)
        ? checkedPrefix(input.linkPrefix ?? before.linkPrefix ?? undefined, feedUrl)
        : before.linkPrefix,
    tier: input.tier ?? before.tier,
    active: input.active ?? before.active,
    intervalMinutes: input.intervalMinutes ?? before.intervalMinutes,
  };
  const changed = Object.fromEntries(
    Object.entries(after).filter(([k, v]) => v !== before[k as keyof typeof before]),
  ) as Partial<typeof after>;
  if (Object.keys(changed).length > 0) {
    // A new feed URL or a resumed source is collected on the next worker run instead of waiting a full interval.
    const collectSoon = changed.feedUrl !== undefined || changed.active === true;
    await db`
      UPDATE content.sources SET name = ${after.name}, feed_url = ${after.feedUrl}, link_prefix = ${after.linkPrefix},
        tier = ${after.tier},
        active = ${after.active}, interval_minutes = ${after.intervalMinutes},
        last_attempt_at = CASE WHEN ${collectSoon} THEN NULL ELSE last_attempt_at END,
        last_error = CASE WHEN ${changed.feedUrl !== undefined} THEN NULL ELSE last_error END,
        etag = CASE WHEN ${changed.feedUrl !== undefined} THEN NULL ELSE etag END,
        last_modified = CASE WHEN ${changed.feedUrl !== undefined} THEN NULL ELSE last_modified END
      WHERE id = ${id}`;
    const old = Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof typeof before]]));
    await audit(db, {
      actorId: actor.id,
      action:
        changed.active === false
          ? "content.source.paused"
          : changed.active
            ? "content.source.resumed"
            : "content.source.updated",
      targetType: "source",
      targetId: id,
      detail: { before: old, after: changed },
      requestId,
    });
  }
  return getSource(db, actor, id, deps.model);
}
