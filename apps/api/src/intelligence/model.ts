// Model calls go through receipts, following AIHOT providers/receipts.ts (MIT, see NOTICE): a logical request has a
// stable key (task, subject, exact input, model, prompt version); a placeholder row exists before the call, the raw answer is
// saved before any business write, and a retry reuses a received answer instead of paying again. An answer whose
// outcome is unknown (crash mid-call) is released after 30 minutes. A daily cap stops new calls.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db/index.ts";
import { BRIEFING, GROUP, PREFILTER, SCORE, WRITE } from "./prompts.ts";

export type Task = "prefilter" | "score_a" | "score_b" | "write" | "group" | "briefing";

export const RELATIONS = ["SAME_OCCURRENCE", "SAME_STORY", "UNRELATED", "ROUNDUP"] as const;

export const OUTPUTS = {
  prefilter: z.strictObject({ label: z.enum(["PASS", "BLOCK", "UNKNOWN"]), reason: z.string().max(300) }),
  score_a: z.strictObject({ attentionScore: z.int().min(0).max(100) }),
  score_b: z.strictObject({ attentionScore: z.int().min(0).max(100) }),
  write: z.strictObject({
    headline: z.string().min(5).max(160),
    summary: z.string().min(20).max(700),
    reason: z.string().min(5).max(300),
    topic: z.string().nullable(),
  }),
  group: z.strictObject({
    decisions: z
      .array(
        z.strictObject({
          id: z.string().regex(/^C\d+$/),
          relation: z.enum(RELATIONS),
          confidence: z.number().min(0).max(1),
        }),
      )
      .max(10),
  }),
  briefing: z.strictObject({ overview: z.string().min(20).max(700) }),
} as const;

export const SYSTEM: Record<Task, string> = {
  prefilter: PREFILTER,
  score_a: SCORE,
  score_b: SCORE,
  write: WRITE,
  group: GROUP,
  briefing: BRIEFING,
};

export interface ModelProvider {
  /** Recorded as provenance (modelVersion) on every story. */
  name: string;
  complete(task: Task, system: string, user: string): Promise<unknown>;
}

export class BudgetExceeded extends Error {
  override name = "BudgetExceeded";
}
export class ReceiptBusy extends Error {
  override name = "ReceiptBusy";
}
export class InvalidModelOutput extends Error {
  override name = "InvalidModelOutput";
}
/** The provider cannot serve anyone right now (permission, missing deployment, quota, outage): items wait, unharmed. */
export class ProviderUnavailable extends Error {
  override name = "ProviderUnavailable";
}

const UNKNOWN_RELEASE_MS = 30 * 60_000;

export interface CallContext {
  sql: Sql;
  provider: ModelProvider;
  promptVersion: string;
  dailyLimit: number;
}

export async function callModel<T extends Task>(
  ctx: CallContext,
  subjectId: string,
  task: T,
  user: string,
): Promise<z.infer<(typeof OUTPUTS)[T]>> {
  const { sql, provider } = ctx;
  // The input itself is part of the key: a changed item (or new grouping candidates) is a new request.
  const key = createHash("sha256")
    .update([task, subjectId, provider.name, ctx.promptVersion, user].join("|"))
    .digest("hex");
  const [prev] = await sql<{ status: string; response: unknown; createdAt: string }[]>`
    SELECT status, response, created_at FROM content.model_receipts WHERE key = ${key}`;
  let response: unknown;
  if (prev?.status === "done") {
    response = prev.response;
  } else {
    if (prev?.status === "pending" && Date.now() - Date.parse(prev.createdAt) < UNKNOWN_RELEASE_MS) {
      throw new ReceiptBusy(`chamada ${task} ainda em andamento ou com resultado desconhecido`);
    }
    const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM content.model_receipts WHERE created_at >= date_trunc('day', now())`;
    if (n >= ctx.dailyLimit) throw new BudgetExceeded(`limite diário de ${ctx.dailyLimit} chamadas de modelo atingido`);
    await sql`
      INSERT INTO content.model_receipts (key, subject_id, task, model, prompt_version, status)
      VALUES (${key}, ${subjectId}, ${task}, ${provider.name}, ${ctx.promptVersion}, 'pending')
      ON CONFLICT (key) DO UPDATE SET status = 'pending', created_at = now(), error = NULL`;
    try {
      response = await provider.complete(task, SYSTEM[task], user);
    } catch (error) {
      await sql`UPDATE content.model_receipts SET status = 'failed', error = ${String((error as Error).message).slice(0, 500)}, completed_at = now() WHERE key = ${key}`;
      throw error;
    }
    await sql`UPDATE content.model_receipts SET status = 'done', response = ${sql.json(response as never)}, completed_at = now() WHERE key = ${key}`;
  }
  const parsed = OUTPUTS[task].safeParse(response);
  if (!parsed.success) throw new InvalidModelOutput(`saída de ${task} fora do formato esperado`);
  return parsed.data as z.infer<(typeof OUTPUTS)[T]>;
}

// Deterministic stand-in used while no provider is approved (Q-03): keyword rules, zero cost, no network.
const AI_TERMS =
  /\b(ia|ai|llms?|modelos?|agentes?|gpus?|rag|embeddings?|machine learning|aprendizado|dados|benchmark|prompt)\b/gi;

export const heuristicProvider: ModelProvider = {
  name: "simulado-heuristico@1",
  async complete(task, _system, user) {
    const title = /Título: (.*)/.exec(user)?.[1] ?? "";
    const excerpt = /Trecho do feed: (.*)/.exec(user)?.[1] ?? "";
    const hits = (`${title} ${excerpt}`.match(AI_TERMS) ?? []).length;
    if (task === "prefilter")
      return { label: hits > 0 ? "PASS" : "BLOCK", reason: hits > 0 ? "menciona IA" : "sem relação com IA" };
    if (task === "score_a") return { attentionScore: Math.min(90, 55 + hits * 5) };
    if (task === "score_b") return { attentionScore: Math.min(88, 52 + hits * 5) };
    // Rules cannot judge identity: every candidate stays apart until a real model is approved.
    if (task === "group")
      return {
        decisions: [...user.matchAll(/^(C\d+) \|/gm)].map((m) => ({
          id: m[1],
          relation: "UNRELATED",
          confidence: 0.5,
        })),
      };
    if (task === "briefing") return { overview: briefingFromHeadlines(user) };
    return {
      headline: title.slice(0, 120) || "Sem título",
      summary: (excerpt.length >= 20 ? excerpt : `${title}. Resumo simulado, sem chamada a provedor.`).slice(0, 600),
      reason: "Avaliação simulada por regras, sem chamada a provedor de IA.",
      topic: null,
    };
  },
};

/** Deterministic overview from the listed headlines (simulated providers): grounded by construction. */
export function briefingFromHeadlines(user: string): string {
  const heads = [...user.matchAll(/^- (.+?) \|/gm)].map((m) => m[1]).slice(0, 2);
  return `Destaques do dia: ${heads.join("; ")}.`.slice(0, 600);
}
