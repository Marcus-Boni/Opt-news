// Test harness: a real PostgreSQL database whose name must end in _test, rebuilt from the migrations (down, then up)
// for every test file; the app runs in-process through fastify.inject. No network beyond the local database.
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { Lookup } from "../src/content/url-guard.ts";
import { connect, type Sql } from "../src/db/index.ts";
import { migrateDown, migrateUp } from "../src/db/migrate.ts";
import { ingestFixtures, PERSONAS, seedBase, seedSources } from "../src/db/seed.ts";

export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://optnews:optnews@127.0.0.1:5433/optnews_test";

export const [ANA, BRUNO, CARLA, DIEGO, EVA, FABIO, GABI] = PERSONAS.map((p) => p.id) as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export async function freshDb(): Promise<Sql> {
  const url = new URL(TEST_URL);
  const name = url.pathname.slice(1);
  if (!name.endsWith("_test")) throw new Error("TEST_DATABASE_URL precisa apontar para um banco terminado em _test");
  const adminUrl = new URL(TEST_URL);
  adminUrl.pathname = "/postgres";
  const admin = connect(adminUrl.toString(), 1);
  const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`;
  if (!exists) await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();
  const sql = connect(TEST_URL, 5);
  while (await migrateDown(sql));
  await migrateUp(sql);
  await seedBase(sql);
  return sql;
}

/** Offline DNS: names under `internal.example.com` resolve to a private address, everything else to a public one. */
export const fakeLookup: Lookup = async (host) => [
  { address: host.endsWith("internal.example.com") ? "10.1.2.3" : "93.184.216.34" },
];

export async function testApp(sql: Sql): Promise<FastifyInstance> {
  const config = loadConfig({ DATABASE_URL: TEST_URL, NODE_ENV: "test", AUTH_MODE: "dev" });
  return buildApp({ sql, config, logger: false, lookup: fakeLookup });
}

type Method = "GET" | "POST" | "PUT" | "PATCH";

export interface Client {
  me: { id: string; csrfToken: string; can: Record<string, boolean> };
  cookie: string;
  call(
    method: Method,
    url: string,
    payload?: object,
    headers?: Record<string, string>,
  ): Promise<LightMyRequestResponse>;
  get(url: string): Promise<LightMyRequestResponse>;
  post(url: string, payload?: object): Promise<LightMyRequestResponse>;
  put(url: string, payload?: object): Promise<LightMyRequestResponse>;
  patch(url: string, payload?: object): Promise<LightMyRequestResponse>;
}

export async function as(app: FastifyInstance, memberId: string): Promise<Client> {
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/dev/login", payload: { memberId } });
  if (res.statusCode !== 200) throw new Error(`login ${memberId} → ${res.statusCode} ${res.body}`);
  const session = res.cookies.find((c) => c.name === "optnews_session");
  if (!session) throw new Error("no session cookie");
  const me = res.json();
  const cookie = `optnews_session=${session.value}`;
  const call: Client["call"] = (method, url, payload, headers = {}) =>
    app.inject({ method, url, payload, headers: { cookie, "x-csrf-token": me.csrfToken, ...headers } });
  return {
    me,
    cookie,
    call,
    get: (url) => call("GET", url),
    post: (url, payload) => call("POST", url, payload ?? {}),
    put: (url, payload) => call("PUT", url, payload ?? {}),
    patch: (url, payload) => call("PATCH", url, payload ?? {}),
  };
}

/** Sources + one pipeline run over the fixture feeds; returns story ids by fixture guid. */
export async function seedStories(sql: Sql): Promise<Record<string, string>> {
  await seedSources(sql, "http://feeds.example.test");
  await ingestFixtures(sql);
  const rows = await sql<{ guid: string; id: string }[]>`
    SELECT r.guid, s.id FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id`;
  return Object.fromEntries(rows.map((r) => [r.guid, r.id]));
}
