// Foundry provider against a scripted fetch: no network, no Azure call, no real model (AGENTS.md: no LLM in CI).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TokenCredential } from "@azure/identity";
import { foundryProvider, responseSchema } from "../src/intelligence/foundry.ts";
import { InvalidModelOutput, OUTPUTS, ProviderUnavailable, type Task } from "../src/intelligence/model.ts";

function setup(replies: (() => Response)[]) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const waits: number[] = [];
  let tokens = 0;
  const credential: TokenCredential = {
    getToken: async () => ({ token: `tok-${++tokens}`, expiresOnTimestamp: Date.now() + 3_600_000 }),
  };
  const provider = foundryProvider({
    endpoint: "https://recurso.cognitiveservices.azure.com",
    deployment: "gpt-6-luna",
    credential,
    fetch: (async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
      const next = replies.shift();
      if (!next) throw new Error("sem resposta roteirizada");
      return next();
    }) as typeof fetch,
    sleep: async (ms) => {
      waits.push(ms);
    },
    log: () => {},
  });
  return { provider, calls, waits, tokens: () => tokens };
}

const ok =
  (content: unknown, finish = "stop") =>
  () =>
    Response.json({
      choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 900, completion_tokens: 40 },
    });

describe("foundry provider", () => {
  test("sends a strict structured-output request with an Entra bearer and returns the parsed answer", async () => {
    const { provider, calls } = setup([ok({ attentionScore: 81 })]);
    assert.equal(provider.name, "foundry:gpt-6-luna");
    assert.deepEqual(await provider.complete("score_a", "sistema", "material"), { attentionScore: 81 });
    const [call] = calls;
    assert.equal(call?.url, "https://recurso.cognitiveservices.azure.com/openai/v1/chat/completions");
    assert.equal(call?.headers.get("authorization"), "Bearer tok-1");
    assert.equal(call?.body.model, "gpt-6-luna");
    assert.deepEqual(call?.body.messages, [
      { role: "system", content: "sistema" },
      { role: "user", content: "material" },
    ]);
    const format = call?.body.response_format as { json_schema: { strict: boolean; name: string } };
    assert.equal(format.json_schema.strict, true);
    assert.equal(format.json_schema.name, "score_a");
    // No tools: the model never searches the web on its own.
    assert.equal(call?.body.tools, undefined);
  });

  test("every task schema is valid for strict mode: closed objects, all properties required, no range keywords", () => {
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      for (const k of ["minLength", "maxLength", "minimum", "maximum", "maxItems", "pattern", "$schema"]) {
        assert.ok(!(k in n), `${k} não é aceito em modo estrito`);
      }
      if (n.type === "object") {
        assert.equal(n.additionalProperties, false);
        assert.deepEqual([...(n.required as string[])].sort(), Object.keys(n.properties as object).sort());
      }
      Object.values(n).forEach(walk);
    };
    for (const task of Object.keys(OUTPUTS) as Task[]) walk(responseSchema(task));
  });

  test("retries throttling and server errors, honouring retry-after-ms, and reuses the token", async () => {
    const { provider, calls, waits, tokens } = setup([
      () => new Response("muitas", { status: 429, headers: { "retry-after-ms": "1200" } }),
      () => new Response("falha", { status: 503 }),
      ok({ label: "PASS", reason: "lançamento de modelo" }),
    ]);
    assert.deepEqual(await provider.complete("prefilter", "s", "u"), { label: "PASS", reason: "lançamento de modelo" });
    assert.equal(calls.length, 3);
    assert.equal(waits[0], 1200);
    assert.equal(tokens(), 1);
  });

  test("permission and quota errors surface with the service detail; nothing is retried", async () => {
    const { provider, calls } = setup([
      () => Response.json({ error: { code: "PermissionDenied", message: "lacks data action" } }, { status: 403 }),
    ]);
    await assert.rejects(
      provider.complete("write", "s", "u"),
      (e: Error) => e instanceof ProviderUnavailable && /403: .*PermissionDenied/.test(e.message),
    );
    assert.equal(calls.length, 1);
  });

  test("Azure content filtering is final and readable, never retried", async () => {
    const blocked = () =>
      Response.json(
        {
          error: {
            code: "content_filter",
            message: "The response was filtered due to the prompt triggering Azure OpenAI's content management policy.",
          },
        },
        { status: 400 },
      );
    const cut = () => Response.json({ choices: [{ finish_reason: "content_filter", message: { content: "" } }] });
    const { provider, calls } = setup([blocked, cut]);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        provider.complete("score_a", "s", "u"),
        (e: Error) => e instanceof InvalidModelOutput && /filtro de conteúdo do Azure/.test(e.message),
      );
    }
    assert.equal(calls.length, 2);
  });

  test("gives up after the last attempt", async () => {
    const busy = () => new Response("", { status: 429 });
    const { provider, calls } = setup([busy, busy, busy, busy]);
    await assert.rejects(provider.complete("group", "s", "u"), /Foundry respondeu 429/);
    assert.equal(calls.length, 4);
  });

  test("refusals and non-JSON are invalid output (final); a truncated answer is a retryable error", async () => {
    const refusal = () =>
      Response.json({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "não posso" } }] });
    const prose = () =>
      Response.json({ choices: [{ finish_reason: "stop", message: { content: "Claro! Aqui vai" } }] });
    const { provider } = setup([refusal, prose, ok({ overview: "parcial" }, "length")]);
    await assert.rejects(provider.complete("briefing", "s", "u"), InvalidModelOutput);
    await assert.rejects(provider.complete("briefing", "s", "u"), InvalidModelOutput);
    await assert.rejects(provider.complete("briefing", "s", "u"), (e: Error) => !(e instanceof InvalidModelOutput));
  });

  test("refuses a non-https endpoint", () => {
    assert.throws(() =>
      foundryProvider({ endpoint: "http://recurso.local", deployment: "x", credential: {} as TokenCredential }),
    );
  });
});
