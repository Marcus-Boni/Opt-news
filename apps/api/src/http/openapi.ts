// OpenAPI 3.1 document generated from the shared contract (packages/contracts). `npm run openapi` writes it to
// docs/openapi-v1.json; the contract stays the single source of truth.
import { type Endpoint, endpoints, Problem } from "@optnews/contracts";
import { z } from "zod";

const schema = (s: z.ZodType, io: "input" | "output") => z.toJSONSchema(s, { io, unrepresentable: "any" });
const problem = { "application/problem+json": { schema: schema(Problem, "output") } };

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, ep] of Object.entries(endpoints) as [string, Endpoint][]) {
    const path = ep.path.replace(/:(\w+)/g, "{$1}");
    const parameters = [
      ...Object.keys(ep.params?.shape ?? {}).map((name) => ({
        name,
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      })),
      ...Object.entries(ep.query?.shape ?? {}).map(([name, s]) => ({
        name,
        in: "query",
        required: !(s as z.ZodType).safeParse(undefined).success,
        schema: schema(s as z.ZodType, "input"),
      })),
    ];
    const ok = ep.response
      ? {
          [String(ep.status ?? 200)]: {
            description: "OK",
            content: { "application/json": { schema: schema(ep.response, "output") } },
          },
        }
      : { "204": { description: "Sem conteúdo" } };
    paths[path] ??= {};
    paths[path][ep.method.toLowerCase()] = {
      operationId,
      summary: ep.summary,
      security: ep.access === "public" ? [] : [{ session: [] }],
      parameters,
      ...(ep.body
        ? { requestBody: { required: true, content: { "application/json": { schema: schema(ep.body, "input") } } } }
        : {}),
      responses: {
        ...ok,
        "4XX": { description: "Problem Details (RFC 9457)", content: problem },
        "5XX": { description: "Erro interno", content: problem },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Opt News API",
      version: "1.0.0",
      description: "API interna do Opt News. Mutações exigem o header x-csrf-token da sessão.",
    },
    components: { securitySchemes: { session: { type: "apiKey", in: "cookie", name: "optnews_session" } } },
    paths,
  };
}

if (import.meta.main) console.log(JSON.stringify(openApiDocument(), null, 2));
