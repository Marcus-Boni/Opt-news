// Microsoft Foundry provider (Q-03): chat completions on an Azure OpenAI deployment through the v1 API, with Entra
// tokens (az login locally, managed identity in Azure) — no API keys. Answers use strict structured outputs; the
// receipts and the OUTPUTS validation in model.ts still apply to every answer. No web search or agent tools: the
// model only reads the material the pipeline gives it, so every story keeps a traceable source.
import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";
import { z } from "zod";
import { InvalidModelOutput, type ModelProvider, OUTPUTS, ProviderUnavailable, type Task } from "./model.ts";

const SCOPE = "https://cognitiveservices.azure.com/.default";
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
// Not the item's fault: the run stops and the items wait instead of burning their attempts.
const UNAVAILABLE = new Set([401, 403, 404, ...RETRYABLE]);
// Strict mode accepts a subset of JSON Schema; lengths, ranges and patterns stay in OUTPUTS, checked after the call.
const UNSUPPORTED = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "pattern",
]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([k]) => !UNSUPPORTED.has(k))
      .map(([k, v]) => [k, strip(v)]),
  );
}

export const responseSchema = (task: Task) => strip(z.toJSONSchema(OUTPUTS[task]));

export const foundryName = (deployment: string) => `foundry:${deployment}`;

export interface FoundryOptions {
  /** Resource endpoint, e.g. https://<recurso>.cognitiveservices.azure.com */
  endpoint: string;
  deployment: string;
  credential?: TokenCredential;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (entry: Record<string, unknown>) => void;
}

interface Completion {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

export function foundryProvider(opts: FoundryOptions): ModelProvider {
  const url = new URL("openai/v1/chat/completions", opts.endpoint.endsWith("/") ? opts.endpoint : `${opts.endpoint}/`);
  if (url.protocol !== "https:") throw new Error("FOUNDRY_ENDPOINT deve usar https");
  const credential = opts.credential ?? new DefaultAzureCredential();
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const maxAttempts = opts.maxAttempts ?? 4;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log ?? ((entry) => console.log(JSON.stringify(entry)));
  let token: { value: string; expires: number } | null = null;

  async function bearer() {
    // The CLI credential starts a process per call; reuse the token until five minutes before it expires.
    if (!token || token.expires - Date.now() < 5 * 60_000) {
      const t = await credential.getToken(SCOPE);
      if (!t) throw new Error("não foi possível obter token Entra para o Foundry");
      token = { value: t.token, expires: t.expiresOnTimestamp };
    }
    return token.value;
  }

  return {
    name: foundryName(opts.deployment),
    async complete(task, system, user) {
      const body = JSON.stringify({
        model: opts.deployment,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: task, strict: true, schema: responseSchema(task) },
        },
        // Reasoning tokens count against this cap; the answers themselves are a few hundred tokens.
        max_completion_tokens: 4000,
      });
      for (let attempt = 1; ; attempt++) {
        const started = Date.now();
        let res: Response;
        try {
          res = await doFetch(url, {
            method: "POST",
            headers: { authorization: `Bearer ${await bearer()}`, "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          if (attempt >= maxAttempts) throw new ProviderUnavailable(`Foundry inacessível: ${(error as Error).message}`);
          await sleep(backoff(attempt));
          continue;
        }
        if (RETRYABLE.has(res.status) && attempt < maxAttempts) {
          await res.body?.cancel();
          await sleep(retryAfter(res) ?? backoff(attempt));
          continue;
        }
        if (!res.ok) {
          // The error body names the failing permission or quota; it never carries the request content.
          const detail = (await res.text()).slice(0, 300);
          // Azure content filtering (Prompt Shields) can block legitimate news about attacks: final, for a curator.
          if (res.status === 400 && /content_filter|content management policy/i.test(detail)) throw filtered(task);
          const message = `Foundry respondeu ${res.status}: ${detail}`;
          throw UNAVAILABLE.has(res.status) ? new ProviderUnavailable(message) : new Error(message);
        }
        const data = (await res.json()) as Completion;
        const choice = data.choices?.[0];
        log({
          msg: "model.call",
          task,
          deployment: opts.deployment,
          ms: Date.now() - started,
          attempt,
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
        });
        if (choice?.message?.refusal) throw new InvalidModelOutput(`modelo recusou ${task}`);
        if (choice?.finish_reason === "content_filter") throw filtered(task);
        if (choice?.finish_reason === "length") throw new Error(`resposta de ${task} cortada por limite de tokens`);
        try {
          return JSON.parse(choice?.message?.content ?? "");
        } catch {
          throw new InvalidModelOutput(`saída de ${task} não é JSON`);
        }
      }
    },
  };
}

const filtered = (task: Task) =>
  new InvalidModelOutput(`${task} bloqueado pelo filtro de conteúdo do Azure; revisar manualmente a fonte`);

function retryAfter(res: Response): number | null {
  const ms = Number(res.headers.get("retry-after-ms"));
  if (ms > 0) return Math.min(ms, 30_000);
  const s = Number(res.headers.get("retry-after"));
  return s > 0 ? Math.min(s * 1000, 30_000) : null;
}

const backoff = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 15_000) * (0.75 + Math.random() / 2);
