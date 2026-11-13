// Microsoft Entra ID sign-in (ADR-0017): OIDC authorization code + PKCE with a confidential client, all server-side.
// The browser sees only redirects; the code is exchanged here, the id_token is verified and dropped, and what remains
// is the member (tenant + oid + display name) and our own session. First sign-in creates the member as `member`.
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.ts";
import { cleanText } from "../content/publish.ts";
import type { Sql } from "../db/index.ts";
import { audit } from "../ops/record.ts";
import { openSession, setSessionCookie } from "./session.ts";

export const ENTRA_PATH = "/api/v1/auth/entra";
const FLOW_COOKIE = "optnews_oidc";
const SKEW_SECONDS = 300;

export interface IdClaims {
  tid: string;
  oid: string;
  name?: string;
  preferred_username?: string;
  /** Optional claim configured on the app registration: 0 = tenant member, 1 = guest. */
  acct?: number;
}

interface Flow {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

const authority = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}`;
const random = () => randomBytes(32).toString("base64url");
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

/** Only same-site paths: an open redirect after sign-in would hand the fresh session's tab to someone else's page. */
// Browsers drop tabs/newlines and read "\" as "/", so "/\t/evil" would become "//evil": refuse those, then parse.
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point.
const REDIRECT_UNSAFE = /[\u0000-\u001f\u007f\\]/;

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || !value.startsWith("/") || REDIRECT_UNSAFE.test(value))
    return "/";
  const base = "http://same.invalid";
  const url = new URL(value, base);
  const out = `${url.pathname}${url.search}${url.hash}`;
  // Dot segments normalize "/.//evil" into "//evil": check what will actually go into Location.
  return url.origin === base && !out.startsWith("//") ? out : "/";
}

/** Verifies signature (RS256 against the tenant's keys) and every claim that ties the token to this sign-in. */
export async function verifyIdToken(
  idToken: string,
  expected: { tenantId: string; clientId: string; nonce: string },
  keys: () => Promise<Jwk[]>,
  now = Date.now() / 1000,
): Promise<IdClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token malformado");
  const [head, body, signature] = parts as [string, string, string];
  const header = decode(head) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error(`algoritmo não aceito: ${header.alg}`);
  const jwk = (await keys()).find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("chave de assinatura desconhecida");
  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  if (!verify("RSA-SHA256", Buffer.from(`${head}.${body}`), key, Buffer.from(signature, "base64url"))) {
    throw new Error("assinatura inválida");
  }
  const c = decode(body) as IdClaims & { iss?: string; aud?: string; exp?: number; nbf?: number; nonce?: string };
  const checks: [boolean, string][] = [
    [c.iss === `${authority(expected.tenantId)}/v2.0`, "emissor"],
    [c.aud === expected.clientId, "audiência"],
    [c.tid === expected.tenantId, "tenant"],
    [typeof c.oid === "string" && c.oid.length > 0, "oid"],
    [typeof c.exp === "number" && c.exp > now - SKEW_SECONDS, "expiração"],
    [(c.nbf ?? 0) < now + SKEW_SECONDS, "nbf"],
    [typeof c.nonce === "string" && sameText(c.nonce, expected.nonce), "nonce"],
  ];
  const failed = checks.find(([ok]) => !ok);
  if (failed) throw new Error(`id_token rejeitado: ${failed[1]}`);
  return c;
}

/** Finds the member by (tenant, oid) or creates it with the `member` role; the name follows Entra on every sign-in. */
export async function memberFromClaims(
  sql: Sql,
  c: IdClaims,
  requestId?: string,
): Promise<{ id: string; status: string; created: boolean }> {
  const name = cleanText(c.name, 120) ?? cleanText(c.preferred_username?.split("@")[0], 120) ?? "Membro Optsolv";
  return sql.begin(async (tx) => {
    const [m] = await tx<{ id: string; status: string; created: boolean }[]>`
      INSERT INTO identity.members (tenant_id, entra_oid, display_name) VALUES (${c.tid}, ${c.oid}, ${name})
      ON CONFLICT (tenant_id, entra_oid) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id, status, (xmax = 0) AS created`;
    if (!m) throw new Error("member upsert returned nothing");
    if (m.created) {
      await tx`INSERT INTO identity.role_assignments (member_id, role) VALUES (${m.id}, 'member')`;
      await audit(tx, {
        actorId: m.id,
        action: "member.created",
        targetType: "member",
        targetId: m.id,
        detail: { via: "entra" },
        requestId,
      });
    }
    return m;
  });
}

export function registerEntra(
  app: FastifyInstance,
  { sql, config, fetchFn = fetch }: { sql: Sql; config: Config; fetchFn?: typeof fetch },
): void {
  const tenantId = config.ENTRA_TENANT_ID ?? "";
  const clientId = config.ENTRA_CLIENT_ID ?? "";
  const redirectUri = `${config.WEB_ORIGIN}${ENTRA_PATH}/callback`;
  const secure = config.NODE_ENV === "production";
  const limit = { rateLimit: { max: 30, timeWindow: "1 minute" } };
  const keys = async (): Promise<Jwk[]> => {
    const res = await fetchFn(`${authority(tenantId)}/discovery/v2.0/keys`);
    if (!res.ok) throw new Error(`chaves do Entra: ${res.status}`);
    return ((await res.json()) as { keys: Jwk[] }).keys;
  };

  app.get(`${ENTRA_PATH}/login`, { config: limit }, async (req, reply) => {
    const flow: Flow = {
      state: random(),
      nonce: random(),
      verifier: random(),
      returnTo: safeReturnTo((req.query as { returnTo?: unknown }).returnTo),
    };
    reply.setCookie(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), {
      httpOnly: true,
      sameSite: "lax", // the callback is a top-level GET from login.microsoftonline.com
      secure,
      path: ENTRA_PATH,
      maxAge: 600,
    });
    const url = new URL(`${authority(tenantId)}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      response_mode: "query",
      redirect_uri: redirectUri,
      scope: "openid profile",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return reply.redirect(url.toString());
  });

  app.get(`${ENTRA_PATH}/callback`, { config: limit }, async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const fail = (reason: string) => reply.redirect(`/entrar?erro=${reason}`);
    let flow: Flow | null = null;
    try {
      flow = JSON.parse(Buffer.from(req.cookies[FLOW_COOKIE] ?? "", "base64url").toString("utf8"));
    } catch {}
    reply.clearCookie(FLOW_COOKIE, { path: ENTRA_PATH });
    if (q.error) return fail(q.error === "access_denied" ? "cancelado" : "entra");
    if (!flow?.state || !q.code || !q.state || !sameText(q.state, flow.state)) return fail("expirado");

    let claims: IdClaims;
    try {
      const res = await fetchFn(`${authority(tenantId)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: config.ENTRA_CLIENT_SECRET ?? "",
          grant_type: "authorization_code",
          code: q.code,
          redirect_uri: redirectUri,
          code_verifier: flow.verifier,
          scope: "openid profile",
        }),
      });
      const body = (await res.json()) as { id_token?: string; error?: string };
      if (!res.ok || !body.id_token) throw new Error(`troca do código: ${res.status} ${body.error ?? ""}`);
      claims = await verifyIdToken(body.id_token, { tenantId, clientId, nonce: flow.nonce }, keys);
    } catch (error) {
      req.log.warn({ err: error }, "entra sign-in rejected");
      return fail("entra");
    }
    if (claims.acct === 1) return fail("convidado");

    const member = await memberFromClaims(sql, claims, req.id);
    if (member.status !== "active") return fail("desativado");
    const { token } = await openSession(sql, member.id);
    setSessionCookie(reply, token, secure);
    return reply.redirect(flow.returnTo);
  });
}
