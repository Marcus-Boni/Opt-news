// Ordered SQL migrations with an explicit down file each. `up` applies every pending one; `down` reverts the last.
import { readdir, readFile } from "node:fs/promises";
import { connect, type Sql } from "./index.ts";

const DIR = new URL("./migrations/", import.meta.url);

async function names(): Promise<string[]> {
  const files = await readdir(DIR);
  return files
    .filter((f) => f.endsWith(".up.sql"))
    .map((f) => f.slice(0, -".up.sql".length))
    .sort();
}

async function applied(sql: Sql): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const rows = await sql<{ name: string }[]>`SELECT name FROM public.schema_migrations ORDER BY name`;
  return rows.map((r) => r.name);
}

export async function migrateUp(sql: Sql): Promise<string[]> {
  const done = new Set(await applied(sql));
  const pending = (await names()).filter((n) => !done.has(n));
  for (const name of pending) {
    const text = await readFile(new URL(`${name}.up.sql`, DIR), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`INSERT INTO public.schema_migrations (name) VALUES (${name})`;
    });
  }
  return pending;
}

export async function migrateDown(sql: Sql): Promise<string | null> {
  const last = (await applied(sql)).at(-1);
  if (!last) return null;
  const text = await readFile(new URL(`${last}.down.sql`, DIR), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`DELETE FROM public.schema_migrations WHERE name = ${last}`;
  });
  return last;
}

if (import.meta.main) {
  const direction = process.argv[2];
  if (direction !== "up" && direction !== "down") throw new Error("uso: migrate.ts up|down");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const sql = connect(url, 1);
  try {
    const result = direction === "up" ? await migrateUp(sql) : await migrateDown(sql);
    console.log(
      direction === "up"
        ? `aplicadas: ${(result as string[]).join(", ") || "nenhuma"}`
        : `revertida: ${result ?? "nenhuma"}`,
    );
  } finally {
    await sql.end();
  }
}
