// Microsoft Entra sign-in (ADR-0017) against a simulated Entra: a test RSA key signs the id_tokens, no network.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { Sql } from "../src/db/index.ts";
import { safeReturnTo, verifyIdToken } from "../src/identity/entra.ts";
import { freshDb, TEST_URL } from "./helpers.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
const keys = async () => [JWK];
const now = Math.floor(Date.now() / 1000);

function idToken(claims: Record<string, unknown>, kid = "k1"): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${enc({ alg: "RS256", kid, typ: "JWT" })}.${enc({
    iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
    aud: CLIENT,
    tid: TENANT,
    oid: "aaaaaaaa-0000-4000-8000-000000000001",
    name: "Pessoa Optsolv",
    preferred_username: "pessoa@optsolv.example",
    acct: 0,
    nonce: "n-1",
    iat: now,
    nbf: now,
    exp: now + 3600,
    ...claims,
  })}`;
  return `${head}.${sign("RSA-SHA256", Buffer.from(head), privateKey).toString("base64url")}`;
}

const expected = { tenantId: TENANT, clientId: CLIENT, nonce: "n-1" };

describe("id_token verification", () => {
  test("a token signed by the tenant key, for this app and this sign-in, is accepted", async () => {
    const c = await verifyIdToken(idToken({}), expected, keys);
    assert.equal(c.oid, "aaaaaaaa-0000-4000-8000-000000000001");
  });

  for (const [why, claims, pattern] of [
    ["another app", { aud: randomUUID() }, /audiência/],
    ["another tenant", { tid: randomUUID() }, /tenant/],
    ["another issuer", { iss: "https://evil.example/v2.0" }, /emissor/],
    ["a replayed sign-in", { nonce: "n-2" }, /nonce/],
    ["an expired token", { exp: now - 3600 }, /expiração/],
    ["no oid", { oid: "" }, /oid/],
  ] as const) {
    test(`rejects ${why}`, async () => {
      await assert.rejects(verifyIdToken(idToken(claims), expected, keys), pattern);
    });
  }

  test("rejects a tampered payload, an unknown key and alg=none", async () => {
    const [h, , s] = idToken({}).split(".");
    const forged = Buffer.from(JSON.stringify({ tid: TENANT, oid: "x", aud: CLIENT })).toString("base64url");
    await assert.rejects(verifyIdToken(`${h}.${forged}.${s}`, expected, keys), /assinatura/);
    await assert.rejects(verifyIdToken(idToken({}, "k9"), expected, keys), /chave/);
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${idToken({}).split(".")[1]}.`;
    await assert.rejects(verifyIdToken(none, expected, keys), /algoritmo/);
  });

  test("return paths stay on this site", () => {
    assert.equal(safeReturnTo("/noticias/1?x=2"), "/noticias/1?x=2");
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/.//evil.example",
      "/..//evil.example",
      "/a/..//evil.example",
      "https://evil.example",
      "",
      undefined,
      42,
    ]) {
      assert.equal(safeReturnTo(bad), "/");
    }
  });
});

describe("Microsoft sign-in flow", () => {
  let sql: Sql;
  let app: FastifyInstance;
  let nonce = "";
  let extra: Record<string, unknown> = {};
  // Simulated Entra: the keys endpoint and a token endpoint that answers with a token for the pending nonce.
  const entraFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/discovery/v2.0/keys")) return Response.json({ keys: [JWK] });
    if (url.endsWith("/oauth2/v2.0/token")) return Response.json({ id_token: idToken({ nonce, ...extra }) });
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  before(async () => {
    sql = await freshDb();
    const config = loadConfig({
      DATABASE_URL: TEST_URL,
      NODE_ENV: "test",
      AUTH_MODE: "entra",
      ENTRA_TENANT_ID: TENANT,
      ENTRA_CLIENT_ID: CLIENT,
      ENTRA_CLIENT_SECRET: "test-secret",
    });
    app = await buildApp({ sql, config, logger: false, entraFetch });
  });
  after(async () => {
    await app.close();
    await sql.end();
  });

  async function signIn(returnTo = "/reunioes") {
    const start = await app.inject({ url: `/api/v1/auth/entra/login?returnTo=${encodeURIComponent(returnTo)}` });
    assert.equal(start.statusCode, 302);
    const authorize = new URL(start.headers.location as string);
    assert.equal(authorize.origin, "https://login.microsoftonline.com");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorize.searchParams.get("redirect_uri"), "http://localhost:5173/api/v1/auth/entra/callback");
    nonce = authorize.searchParams.get("nonce") ?? "";
    const flow = start.cookies.find((c) => c.name === "optnews_oidc");
    assert.ok(flow?.httpOnly);
    const state = authorize.searchParams.get("state");
    return app.inject({
      url: `/api/v1/auth/entra/callback?code=c-1&state=${state}`,
      headers: { cookie: `optnews_oidc=${flow?.value}` },
    });
  }

  test("first sign-in creates the member with the member role, audited, and opens a session", async () => {
    extra = {};
    const res = await signIn();
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, "/reunioes");
    const session = res.cookies.find((c) => c.name === "optnews_session");
    assert.ok(session?.httpOnly);
    const me = await app.inject({ url: "/api/v1/me", headers: { cookie: `optnews_session=${session?.value}` } });
    assert.equal(me.json().displayName, "Pessoa Optsolv");
    assert.deepEqual(me.json().roles, ["member"]);
    const [audit] = await sql`SELECT count(*)::int AS n FROM ops.audit WHERE action = 'member.created'`;
    assert.equal(audit?.n, 1);
  });

  test("signing in again reuses the member and follows a renamed account", async () => {
    extra = { name: "Pessoa Renomeada" };
    const res = await signIn("/");
    assert.equal(res.headers.location, "/");
    const rows = await sql`SELECT display_name FROM identity.members WHERE tenant_id = ${TENANT}`;
    assert.deepEqual(
      rows.map((r) => r.displayName),
      ["Pessoa Renomeada"],
    );
  });

  test("guests, disabled members and a mismatched state are refused without a session", async () => {
    extra = { acct: 1, oid: "aaaaaaaa-0000-4000-8000-000000000002" };
    const guest = await signIn();
    assert.equal(guest.headers.location, "/entrar?erro=convidado");
    assert.ok(!guest.cookies.some((c) => c.name === "optnews_session"));
    extra = { acct: undefined, oid: "aaaaaaaa-0000-4000-8000-000000000003" };
    const unknown = await signIn();
    assert.equal(unknown.headers.location, "/entrar?erro=convidado", "no acct claim fails closed");

    extra = {};
    await sql`UPDATE identity.members SET status = 'disabled' WHERE tenant_id = ${TENANT}`;
    const disabled = await signIn();
    assert.equal(disabled.headers.location, "/entrar?erro=desativado");
    await sql`UPDATE identity.members SET status = 'active' WHERE tenant_id = ${TENANT}`;

    const forged = await app.inject({ url: "/api/v1/auth/entra/callback?code=c&state=forjado" });
    assert.equal(forged.headers.location, "/entrar?erro=expirado");
    const cancelled = await app.inject({ url: "/api/v1/auth/entra/callback?error=access_denied" });
    assert.equal(cancelled.headers.location, "/entrar?erro=cancelado");
  });

  test("the simulated persona login does not exist in entra mode", async () => {
    const res = await app.inject({ url: "/api/v1/auth/dev/personas" });
    assert.equal(res.statusCode, 404);
  });
});
