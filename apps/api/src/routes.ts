// Wires each contract endpoint to its module. Mutations run in one transaction, so the business change, its audit
// record and its outbox event commit together or not at all.
import { endpoints, type Role } from "@optnews/contracts";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.ts";
import { listComments, createComment, editComment, moderateComment, recentDiscussions } from "./community/comments.ts";
import { getBriefing, listBriefings } from "./content/briefings.ts";
import { getEvent, getStory, listStories, submitUrl } from "./content/stories.ts";
import type { Lookup } from "./content/url-guard.ts";
import type { Sql } from "./db/index.ts";
import { notFound } from "./http/problem.ts";
import { route } from "./http/route.ts";
import { authorize, capabilities } from "./identity/policy.ts";
import { openSession, revokeSession, SESSION_COOKIE, SESSION_HOURS } from "./identity/session.ts";
import { createInsight, getInsight, listInsights } from "./knowledge/insights.ts";
import { createProposal, decide, listProposals, vote } from "./meetups/proposals.ts";
import { addArtifact, createMeetup, getMeetup, listMeetups, updateMeetup } from "./meetups/sessions.ts";
import { calibration, curationQueue, decideReview, forceItem, labelItem } from "./intelligence/curation.ts";
import { foundryName } from "./intelligence/foundry.ts";
import { heuristicProvider } from "./intelligence/model.ts";
import { activity, createSource, getSource, listSources, updateSource } from "./intelligence/sources.ts";
import { search } from "./search.ts";

/** Synthetic personas exist only in the dev tenant; no real employee is ever listed here. */
export const DEV_TENANT = "dev-tenant";

const ROLE_HINT: Record<Role, string> = {
  visitor: "somente leitura",
  member: "lê, comenta, propõe e vota",
  organizer: "organiza meetups",
  curator: "modera e revisa conteúdo",
  admin: "administra a plataforma",
};

export interface RouteDeps {
  sql: Sql;
  config: Config;
  /** DNS resolver for submitted URLs (tests replace it to stay offline). */
  lookup?: Lookup;
}

export function registerRoutes(app: FastifyInstance, { sql, config, lookup }: RouteDeps): void {
  const secure = config.NODE_ENV === "production";

  route(app, sql, endpoints.devPersonas, async () => {
    if (config.AUTH_MODE !== "dev") throw notFound();
    const rows = await sql<{ id: string; displayName: string; roles: Role[] }[]>`
      SELECT m.id, m.display_name, array_agg(r.role ORDER BY r.role) AS roles
      FROM identity.members m JOIN identity.role_assignments r ON r.member_id = m.id
      WHERE m.tenant_id = ${DEV_TENANT} AND m.status = 'active' GROUP BY m.id ORDER BY m.display_name`;
    return rows.map((p) => ({ ...p, description: p.roles.map((r) => ROLE_HINT[r]).join(" · ") }));
  });

  route(
    app,
    sql,
    endpoints.devLogin,
    async ({ body, reply }) => {
      if (config.AUTH_MODE !== "dev") throw notFound();
      const [member] = await sql<{ id: string; displayName: string; roles: Role[] }[]>`
      SELECT m.id, m.display_name, coalesce(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
      FROM identity.members m LEFT JOIN identity.role_assignments r ON r.member_id = m.id
      WHERE m.id = ${body.memberId} AND m.tenant_id = ${DEV_TENANT} AND m.status = 'active' GROUP BY m.id`;
      if (!member) throw notFound();
      const { token, csrfToken } = await openSession(sql, member.id);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: SESSION_HOURS * 3600,
      });
      return { ...member, can: capabilities(member), csrfToken };
    },
    { perMinute: 20 },
  );

  route(app, sql, endpoints.logout, async ({ req, reply }) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await revokeSession(sql, token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return undefined;
  });

  route(app, sql, endpoints.me, async ({ actor }) => ({
    id: actor.id,
    displayName: actor.displayName,
    roles: actor.roles,
    can: capabilities(actor),
    csrfToken: actor.csrfToken,
  }));

  route(
    app,
    sql,
    endpoints.topics,
    async () => sql<{ slug: string; label: string }[]>`SELECT slug, label FROM content.topics ORDER BY position`,
  );
  route(app, sql, endpoints.listStories, async ({ actor, query }) => listStories(sql, actor, query));
  route(app, sql, endpoints.getStory, async ({ actor, params }) => getStory(sql, actor, params.id));
  route(app, sql, endpoints.getEvent, async ({ actor, params }) => getEvent(sql, actor, params.id));
  route(app, sql, endpoints.listBriefings, async () => listBriefings(sql));
  route(app, sql, endpoints.getBriefing, async ({ actor, params }) => getBriefing(sql, actor, params.date));
  route(
    app,
    sql,
    endpoints.submitStory,
    async ({ actor, body, req }) => {
      authorize(actor, "contribute");
      return sql.begin((tx) => submitUrl(tx, actor, body, req.id, lookup));
    },
    { perMinute: 10 },
  );

  route(app, sql, endpoints.listComments, async ({ actor, query }) => listComments(sql, actor, query));
  route(app, sql, endpoints.recentDiscussions, async ({ actor }) => recentDiscussions(sql, actor));
  route(
    app,
    sql,
    endpoints.createComment,
    async ({ actor, body, req }) => sql.begin((tx) => createComment(tx, actor, body, req.id)),
    { perMinute: 30 },
  );
  route(app, sql, endpoints.editComment, async ({ actor, params, body }) =>
    sql.begin((tx) => editComment(tx, actor, params.id, body)),
  );
  route(app, sql, endpoints.moderateComment, async ({ actor, params, body, req }) =>
    sql.begin((tx) => moderateComment(tx, actor, params.id, body, req.id)),
  );

  route(app, sql, endpoints.listProposals, async ({ actor, query }) => listProposals(sql, actor, query.status));
  route(
    app,
    sql,
    endpoints.createProposal,
    async ({ actor, body, req }) => sql.begin((tx) => createProposal(tx, actor, body, req.id)),
    { perMinute: 10 },
  );
  route(app, sql, endpoints.vote, async ({ actor, params, body }) =>
    sql.begin((tx) => vote(tx, actor, params.id, body.vote)),
  );
  route(app, sql, endpoints.decideProposal, async ({ actor, params, body, req }) =>
    sql.begin((tx) => decide(tx, actor, params.id, body.status, req.id)),
  );

  route(app, sql, endpoints.listMeetups, async ({ actor, query }) => listMeetups(sql, actor, query.when));
  route(app, sql, endpoints.createMeetup, async ({ actor, body, req }) =>
    sql.begin((tx) => createMeetup(tx, actor, body, req.id)),
  );
  route(app, sql, endpoints.getMeetup, async ({ actor, params }) => getMeetup(sql, actor, params.id));
  route(app, sql, endpoints.updateMeetup, async ({ actor, params, body, req }) =>
    sql.begin((tx) => updateMeetup(tx, actor, params.id, body, req.id)),
  );
  route(app, sql, endpoints.addArtifact, async ({ actor, params, body, req }) =>
    sql.begin((tx) => addArtifact(tx, actor, params.id, body, req.id)),
  );

  route(app, sql, endpoints.listInsights, async ({ actor }) => listInsights(sql, actor));
  route(
    app,
    sql,
    endpoints.createInsight,
    async ({ actor, body, req }) => sql.begin((tx) => createInsight(tx, actor, body, req.id)),
    { perMinute: 10 },
  );
  route(app, sql, endpoints.getInsight, async ({ actor, params }) => getInsight(sql, actor, params.id));

  route(app, sql, endpoints.search, async ({ actor, query }) => search(sql, actor, query.q));

  const model =
    config.MODEL_PROVIDER === "foundry" ? foundryName(config.FOUNDRY_DEPLOYMENT ?? "") : heuristicProvider.name;
  const sourceDeps = { privateHosts: config.INGEST_PRIVATE_HOSTS, lookup, model };
  route(app, sql, endpoints.sourceStatus, async ({ actor }) => listSources(sql, actor, model));
  route(app, sql, endpoints.activity, async ({ actor }) => activity(sql, actor));
  route(app, sql, endpoints.getSource, async ({ actor, params }) => getSource(sql, actor, params.sourceId, model));
  route(app, sql, endpoints.createSource, async ({ actor, body, req }) =>
    sql.begin((tx) => createSource(tx, actor, body, sourceDeps, req.id)),
  );
  route(app, sql, endpoints.updateSource, async ({ actor, params, body, req }) =>
    sql.begin((tx) => updateSource(tx, actor, params.sourceId, body, sourceDeps, req.id)),
  );

  route(app, sql, endpoints.curationQueue, async ({ actor, query }) => curationQueue(sql, actor, query, model));
  route(app, sql, endpoints.decideReview, async ({ actor, params, body, req }) =>
    sql.begin((tx) => decideReview(tx, actor, params.id, body, req.id)),
  );
  route(app, sql, endpoints.forceItem, async ({ actor, params, req }) =>
    sql.begin((tx) => forceItem(tx, actor, params.id, model, req.id)),
  );
  route(app, sql, endpoints.labelItem, async ({ actor, params, body, req }) =>
    sql.begin((tx) => labelItem(tx, actor, params.id, body, model, req.id)),
  );
  route(app, sql, endpoints.calibration, async ({ actor }) => calibration(sql, actor, model));
}
