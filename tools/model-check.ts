// One real call per task shape to the configured Foundry deployment, with synthetic material only (no feed, no
// database). Confirms permission, deployment and structured outputs before turning MODEL_PROVIDER=foundry on.
//   npm run model:check
import { loadConfig } from "@optnews/api/config";
import { foundryProvider } from "@optnews/api/intelligence/foundry";
import { OUTPUTS, SYSTEM, type Task } from "@optnews/api/intelligence/model";
import { material } from "@optnews/api/intelligence/prompts";

const config = loadConfig({ ...process.env, MODEL_PROVIDER: "foundry" });
const provider = foundryProvider({
  endpoint: config.FOUNDRY_ENDPOINT ?? "",
  deployment: config.FOUNDRY_DEPLOYMENT ?? "",
});
const sample = material({
  sourceName: "Atlas AI Blog (fictício)",
  title: "Atlas AI lança framework aberto para orquestrar agentes com aprovação humana",
  excerpt:
    "O framework permite definir etapas que exigem aprovação de uma pessoa antes de o agente executar ações externas, com registro de cada decisão.",
  publishedAt: new Date().toISOString(),
});

let failed = false;
for (const task of ["prefilter", "score_a", "write"] satisfies Task[]) {
  try {
    const answer = await provider.complete(task, SYSTEM[task], sample);
    const parsed = OUTPUTS[task].safeParse(answer);
    console.log(task, parsed.success ? "ok" : "FORA DO FORMATO", JSON.stringify(answer));
    failed ||= !parsed.success;
  } catch (error) {
    console.log(task, "ERRO", (error as Error).message);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
