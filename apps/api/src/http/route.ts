// Registers one contract endpoint: session + CSRF, input parsing, the handler, and the response schema as an
// output allowlist (fields a handler did not mean to expose are stripped).
import type { BodyOut, Endpoint, ParamsOf, QueryOut, ResultOf } from "@optnews/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Sql } from "../db/index.ts";
import { actorFromToken, csrfMatches, SESSION_COOKIE, type SessionActor } from "../identity/session.ts";
import { forbidden, notFound, unauthorized } from "./problem.ts";

export interface Ctx<E extends Endpoint> {
  actor: E extends { access: "public" } ? SessionActor | null : SessionActor;
  params: ParamsOf<E>;
  query: QueryOut<E>;
  body: BodyOut<E>;
  req: FastifyRequest;
  reply: FastifyReply;
}

export interface RouteOptions {
  /** Stricter per-route limit (requests per minute) on top of the global one. */
  perMinute?: number;
}

export function route<E extends Endpoint>(
  app: FastifyInstance,
  sql: Sql,
  ep: E,
  handler: (ctx: Ctx<E>) => Promise<ResultOf<E>>,
  options: RouteOptions = {},
): void {
  app.route({
    method: ep.method,
    url: ep.path,
    config: options.perMinute ? { rateLimit: { max: options.perMinute, timeWindow: "1 minute" } } : {},
    handler: async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
      const actor = token ? await actorFromToken(sql, token) : null;
      if (ep.access !== "public") {
        if (!actor) throw unauthorized();
        const header = req.headers["x-csrf-token"];
        if (ep.method !== "GET" && !csrfMatches(actor.csrfToken, typeof header === "string" ? header : undefined)) {
          throw forbidden("Token CSRF ausente ou inválido.");
        }
      }
      // A malformed id is answered like a missing one.
      const params = ep.params ? ep.params.safeParse(req.params) : null;
      if (params && !params.success) throw notFound();
      const result = await handler({
        actor,
        params: params?.data,
        query: ep.query?.parse(req.query),
        body: ep.body?.parse(req.body ?? {}),
        req,
        reply,
      } as Ctx<E>);
      if (!ep.response) return reply.code(204).send();
      const out = ep.response.safeParse(result);
      if (!out.success) {
        req.log.error({ issues: out.error.issues, path: ep.path }, "response violates contract");
        throw new Error("response contract violation");
      }
      return reply.code(ep.status ?? 200).send(out.data);
    },
  });
}
