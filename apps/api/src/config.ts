import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().startsWith("postgres"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().default(3001),
  AUTH_MODE: z.enum(["dev", "entra"]).default("dev"),
  /** Language the pipeline writes summaries in; recorded on every story. */
  CONTENT_LANGUAGE: z.string().default("pt-BR"),
  /** `simulated` costs nothing and needs no network; `foundry` is the approved provider (Q-03). */
  MODEL_PROVIDER: z.enum(["simulated", "foundry"]).default("simulated"),
  /** Foundry resource endpoint and deployment name; auth is Entra only (az login / managed identity). */
  FOUNDRY_ENDPOINT: z.url({ protocol: /^https$/ }).optional(),
  FOUNDRY_DEPLOYMENT: z.string().min(1).optional(),
  MODEL_DAILY_CALL_LIMIT: z.coerce.number().int().min(0).default(500),
  /** Hostnames collectors may reach on private addresses: local fake feeds only. Empty in any shared environment. */
  INGEST_PRIVATE_HOSTS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean),
    ),
  /** Where the seed points the synthetic sources (tools/fake-feeds). */
  FAKE_FEEDS_BASE_URL: z.url().default("http://127.0.0.1:4020"),
  SERVE_WEB: z.stringbool().default(false),
  /**
   * Let the model read the article page (never stored or shown) for scoring and writing. Off until the rights
   * policy (Q-02) allows third-party text to reach the AI provider.
   */
  ARTICLE_READING: z.stringbool().default(false),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = Env.parse(env);
  // Simulated login must never reach production; the real Entra flow is blocked on Q-04 (tenant/app registration).
  if (config.AUTH_MODE === "dev" && config.NODE_ENV === "production") {
    throw new Error("AUTH_MODE=dev é recusado com NODE_ENV=production");
  }
  if (config.NODE_ENV === "production" && config.INGEST_PRIVATE_HOSTS.length > 0) {
    throw new Error("INGEST_PRIVATE_HOSTS é só para feeds locais de desenvolvimento");
  }
  if (config.AUTH_MODE === "entra") {
    throw new Error("AUTH_MODE=entra ainda não implementado: depende de tenant e app registration aprovados (Q-04)");
  }
  if (config.MODEL_PROVIDER === "foundry" && (!config.FOUNDRY_ENDPOINT || !config.FOUNDRY_DEPLOYMENT)) {
    throw new Error("MODEL_PROVIDER=foundry exige FOUNDRY_ENDPOINT e FOUNDRY_DEPLOYMENT");
  }
  return config;
}
