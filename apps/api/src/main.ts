import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { connect } from "./db/index.ts";

const config = loadConfig();
const sql = connect(config.DATABASE_URL);
const app = await buildApp({ sql, config });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}

await app.listen({ host: config.API_HOST, port: config.API_PORT });
