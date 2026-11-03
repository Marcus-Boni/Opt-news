import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ZodError } from "zod";
import { HttpError } from "./http/problem.ts";
import { registerRoutes, type RouteDeps } from "./routes.ts";

const WEB_DIST = resolve(fileURLToPath(new URL("../../web/dist/", import.meta.url)));
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

/** Serves the built SPA: files under web/dist only, hashed assets cached for good, every other path gets index.html. */
async function sendWeb(url: string, reply: FastifyReply) {
  let path: string;
  try {
    path = resolve(WEB_DIST, `.${decodeURIComponent(new URL(url, "http://local").pathname)}`);
  } catch {
    path = WEB_DIST;
  }
  const inside = path.startsWith(WEB_DIST + sep);
  const file =
    inside && TYPES[extname(path)] && (await stat(path).catch(() => null))?.isFile()
      ? path
      : resolve(WEB_DIST, "index.html");
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  reply.header(
    "cache-control",
    file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
  );
  return reply.type(type).send(createReadStream(file));
}

// The web is a same-origin SPA: scripts, styles, fonts and API calls come only from this origin (no CDNs).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export async function buildApp(deps: RouteDeps & { logger?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            level: deps.config.NODE_ENV === "production" ? "info" : "debug",
            redact: ["req.headers.cookie", "req.headers['x-csrf-token']"],
          },
    genReqId: (req) => {
      const given = req.headers["x-request-id"];
      return typeof given === "string" && /^[\w-]{8,64}$/.test(given) ? given : randomUUID();
    },
    bodyLimit: 64 * 1024,
    trustProxy: deps.config.NODE_ENV === "production",
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.cookies.optnews_session ?? req.ip,
    errorResponseBuilder: (req, ctx) => ({
      type: "about:blank",
      title: "Muitas requisições",
      status: 429,
      detail: `Tente novamente em ${ctx.after}.`,
      requestId: req.id,
      statusCode: 429,
    }),
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("content-security-policy", CSP);
    if (req.url.startsWith("/api/")) reply.header("cache-control", "no-store");
  });

  app.setErrorHandler((error, req, reply) => {
    const problem = (status: number, title: string, detail?: string) =>
      reply
        .code(status)
        .type("application/problem+json")
        .send({ type: "about:blank", title, status, detail, requestId: req.id });
    if (error instanceof HttpError) return problem(error.status, error.title, error.message);
    if (error instanceof ZodError) {
      const detail = error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(corpo)"}: ${i.message}`)
        .join("; ");
      return problem(422, "Dados inválidos", detail);
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return problem(429, "Muitas requisições", "Aguarde um pouco e tente novamente.");
    if (status && status >= 400 && status < 500)
      return problem(status, "Requisição inválida", (error as Error).message);
    req.log.error({ err: error }, "unhandled error");
    return problem(500, "Erro interno", "Algo falhou do nosso lado. Informe o requestId ao suporte.");
  });

  if (deps.config.SERVE_WEB && !existsSync(resolve(WEB_DIST, "index.html"))) {
    throw new Error(`SERVE_WEB=true mas ${WEB_DIST} não tem build: rode npm run build`);
  }
  app.setNotFoundHandler((req, reply) => {
    if (deps.config.SERVE_WEB && req.method === "GET" && !req.url.startsWith("/api/")) return sendWeb(req.url, reply);
    return reply
      .code(404)
      .type("application/problem+json")
      .send({ type: "about:blank", title: "Não encontrado", status: 404, requestId: req.id });
  });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_req, reply) => {
    try {
      await deps.sql`SELECT 1`;
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });

  registerRoutes(app, deps);
  return app;
}
