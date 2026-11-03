// Synthetic seed for local development: dev-tenant personas, the initial taxonomy (docs/14), synthetic sources and
// stories produced by the real curation pipeline over the fixture feeds (scripted model, no network, no cost).
// No real people, tenants or third-party content.
import {
  feedUrl,
  fixtureFetch,
  type FixtureItem,
  ITEMS,
  SOURCES,
  scriptedModel,
} from "../../../../tools/fixtures/feeds.ts";
import { loadConfig } from "../config.ts";
import { dayKey, generateDailyBriefing } from "../intelligence/briefing.ts";
import { type IngestReport, runIngest } from "../intelligence/pipeline.ts";
import { DEV_TENANT } from "../routes.ts";
import { connect, type Sql } from "./index.ts";

export const PERSONAS = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Ana Ribeiro", roles: ["member"], status: "active" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Bruno Tavares", roles: ["member"], status: "active" },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Carla Mendes",
    roles: ["member", "organizer"],
    status: "active",
  },
  { id: "00000000-0000-4000-8000-000000000004", name: "Diego Faria", roles: ["member", "curator"], status: "active" },
  { id: "00000000-0000-4000-8000-000000000005", name: "Eva Lima", roles: ["member", "admin"], status: "active" },
  { id: "00000000-0000-4000-8000-000000000006", name: "Fábio Souza", roles: ["visitor"], status: "active" },
  // Access revoked: kept to exercise offboarding (sessions stop working, authorship stays).
  { id: "00000000-0000-4000-8000-000000000007", name: "Gabi Rocha", roles: ["member"], status: "disabled" },
] as const;

export const TOPICS = [
  ["modelos-llm", "Modelos de IA e LLMs"],
  ["agentes", "Agentes e orquestração"],
  ["engenharia-software", "Engenharia de software com IA"],
  ["pesquisa-ml", "Machine learning e pesquisa"],
  ["infraestrutura", "Infraestrutura, cloud e GPUs"],
  ["dados-rag", "Dados, RAG e busca"],
  ["seguranca-governanca", "Segurança, privacidade e governança"],
  ["ferramentas-dev", "Frameworks e ferramentas"],
  ["produtos-apis", "Produtos e APIs de fornecedores"],
  ["mercado", "Mercado e concorrência"],
  ["casos-de-uso", "Casos de uso setoriais"],
] as const;

export async function seedBase(sql: Sql): Promise<void> {
  for (const p of PERSONAS) {
    await sql`INSERT INTO identity.members (id, tenant_id, entra_oid, display_name, status)
              VALUES (${p.id}, ${DEV_TENANT}, ${`dev-oid-${p.id.slice(-2)}`}, ${p.name}, ${p.status}) ON CONFLICT (id) DO NOTHING`;
    for (const role of p.roles) {
      await sql`INSERT INTO identity.role_assignments (member_id, role) VALUES (${p.id}, ${role}) ON CONFLICT DO NOTHING`;
    }
  }
  for (const [i, [slug, label]] of TOPICS.entries()) {
    await sql`INSERT INTO content.topics (slug, label, position) VALUES (${slug}, ${label}, ${i}) ON CONFLICT (slug) DO NOTHING`;
  }
}

/** A small amount of collaboration so every pillar has something to show in a fresh environment. */
async function seedCollaboration(sql: Sql): Promise<void> {
  const [has] = await sql`SELECT 1 FROM community.comments LIMIT 1`;
  if (has) return;
  const [agents] = await sql<
    { id: string }[]
  >`SELECT s.id FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = 'fx-atlas-agents'`;
  const [rag] = await sql<
    { id: string }[]
  >`SELECT s.id FROM content.stories s JOIN content.raw_items r ON r.id::text = s.upstream_id WHERE r.guid = 'fx-rag-study'`;
  if (!agents || !rag) return;
  const [ana, bruno, carla] = PERSONAS;
  await sql`INSERT INTO community.comments (target_type, target_id, author_id, body, created_at) VALUES
    ('story', ${agents.id}, ${bruno.id}, 'O ponto de aprovação por ação é exatamente o que faltava no nosso piloto de atendimento. Alguém já testou o modo de simulação?', now() - interval '2 hours'),
    ('story', ${agents.id}, ${ana.id}, 'Testei rapidamente: ele registra as decisões, mas ainda não exporta para auditoria. Vale levar para um meetup.', now() - interval '1 hour')`;
  await sql`INSERT INTO meetups.proposals (author_id, title, rationale, origin_story_id, voting_closes_at) VALUES
    (${ana.id}, 'Agentes com aprovação humana: onde colocar o ponto de controle?', 'Temos dois pilotos de agentes e nenhum padrão de aprovação. Proponho comparar abordagens a partir do framework anunciado.', ${agents.id}, now() + interval '10 days')`;
  const [past] = await sql<{ id: string }[]>`
    INSERT INTO meetups.sessions (title, description, scheduled_start, duration_minutes, state, organizer_id, responsible_id, summary, conclusions)
    VALUES ('RAG híbrido na prática', 'Comparação entre busca lexical, vetorial e híbrida nas bases de conhecimento dos projetos.',
      now() - interval '9 days', 60, 'documented', ${carla.id}, ${bruno.id},
      'Apresentamos três experimentos em bases internas sintéticas e discutimos custo de indexação.',
      'Busca híbrida venceu em consultas com siglas; vetorial pura bastou em perguntas abertas. Próximo passo: medir custo por consulta.')
    RETURNING id`;
  const [insight] = await sql<{ id: string }[]>`
    INSERT INTO knowledge.insights (author_id, title, hypothesis, context, applicability, status)
    VALUES (${bruno.id}, 'Começar a busca de conhecimento por FTS + vetorial só quando houver siglas',
      'Busca lexical do PostgreSQL resolve a maior parte das consultas internas; a camada vetorial só compensa onde há siglas e códigos.',
      'Conclusão do meetup RAG híbrido na prática, apoiada no estudo comparativo.',
      'Projetos com base documental < 100 mil trechos.', 'accepted')
    RETURNING id`;
  if (!past || !insight) return;
  await sql`INSERT INTO knowledge.links (from_type, from_id, to_type, to_id, relation, created_by) VALUES
    ('insight', ${insight.id}, 'meetup', ${past.id}, 'discussed_in', ${bruno.id}),
    ('insight', ${insight.id}, 'story', ${rag.id}, 'evidence', ${bruno.id})`;
}

/** Registers the synthetic sources (feeds served by tools/fake-feeds, or in-process by fixtureFetch). */
export async function seedSources(sql: Sql, baseUrl: string): Promise<void> {
  for (const s of SOURCES) {
    await sql`INSERT INTO content.sources (id, name, kind, feed_url, tier) VALUES (${s.id}, ${s.name}, 'rss', ${feedUrl(baseUrl, s.id)}, ${s.tier})
              ON CONFLICT (id) DO NOTHING`;
  }
}

/** Runs the real pipeline over the fixture feeds with the scripted model (seed and tests). */
export function ingestFixtures(
  sql: Sql,
  items: () => FixtureItem[] = () => ITEMS,
  model = scriptedModel(),
): Promise<IngestReport> {
  return runIngest(
    { sql, fetchFeed: fixtureFetch(items), model: { provider: model, dailyLimit: 1000 }, language: "pt-BR" },
    { force: true, limit: 200 },
  );
}

if (import.meta.main) {
  const config = loadConfig();
  const sql = connect(config.DATABASE_URL, 1);
  try {
    await seedBase(sql);
    await seedSources(sql, config.FAKE_FEEDS_BASE_URL);
    const report = await ingestFixtures(sql);
    const model = { sql, provider: scriptedModel(), dailyLimit: 1000 };
    for (const day of [dayKey(new Date(Date.now() - 86_400_000)), dayKey(new Date())]) {
      await generateDailyBriefing(model, day, { force: true });
    }
    await seedCollaboration(sql);
    console.log("seed ok", report.outcomes);
  } finally {
    await sql.end();
  }
}
