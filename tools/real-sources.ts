// Starter list of public feeds (Q-02, proposal under review): official AI and cloud blogs (T1), technical press and
// analysis (T1_5), general tech press (T2). Every source uses the summary + link policy (ADR-0008): title, feed
// excerpt and link only, never the full text. Checked by hand on 2026-11-02; VentureBeat left out (answers 429).
// Sites without a feed (Anthropic, Claude) are listing pages (web_list, ADR-0015): title, description and date
// come from each article's preview metadata. The second block matches the AIHOT demo list (industry/sources.json).
// Registers through the same admin rule as the UI (URL guard, duplicates, audit), as the dev admin persona, and
// pauses the synthetic sources so the two never mix:
//   DATABASE_URL=... node tools/real-sources.ts
import { loadConfig } from "@optnews/api/config";
import { connect } from "@optnews/api/db/index";
import type { Actor } from "@optnews/api/identity/policy";
import { createSource, updateSource } from "@optnews/api/intelligence/sources";

type Tier = "T1" | "T1_5" | "T2";
export const REAL_SOURCES: {
  id: string;
  name: string;
  feedUrl: string;
  kind?: "rss" | "web_list";
  linkPrefix?: string;
  tier: Tier;
  intervalMinutes: number;
}[] = [
  {
    id: "anthropic-news",
    name: "Anthropic — Notícias",
    kind: "web_list",
    feedUrl: "https://www.anthropic.com/news",
    tier: "T1",
    intervalMinutes: 60,
  },
  {
    id: "claude-blog",
    name: "Claude — Blog",
    kind: "web_list",
    feedUrl: "https://claude.com/blog",
    // The blog index links its posts under /resources/articles/ (claude.com/blog/<slug> redirects there).
    linkPrefix: "https://claude.com/resources/articles/",
    tier: "T1",
    intervalMinutes: 60,
  },
  { id: "mistral", name: "Mistral AI", feedUrl: "https://mistral.ai/news/rss", tier: "T1", intervalMinutes: 120 },
  {
    id: "google-research",
    name: "Google Research",
    feedUrl: "https://research.google/blog/rss/",
    tier: "T1",
    intervalMinutes: 120,
  },
  {
    id: "bair",
    name: "Berkeley AI Research (BAIR)",
    feedUrl: "https://bair.berkeley.edu/blog/feed.xml",
    tier: "T1_5",
    intervalMinutes: 360,
  },
  {
    id: "import-ai",
    name: "Import AI",
    feedUrl: "https://importai.substack.com/feed",
    tier: "T1_5",
    intervalMinutes: 360,
  },
  {
    id: "latent-space",
    name: "Latent Space",
    feedUrl: "https://www.latent.space/feed",
    tier: "T1_5",
    intervalMinutes: 360,
  },
  { id: "the-decoder", name: "The Decoder", feedUrl: "https://the-decoder.com/feed/", tier: "T2", intervalMinutes: 60 },
  { id: "openai", name: "OpenAI News", feedUrl: "https://openai.com/news/rss.xml", tier: "T1", intervalMinutes: 60 },
  {
    id: "google-deepmind",
    name: "Google DeepMind Blog",
    feedUrl: "https://deepmind.google/blog/rss.xml",
    tier: "T1",
    intervalMinutes: 60,
  },
  {
    id: "google-ai",
    name: "Google AI (The Keyword)",
    feedUrl: "https://blog.google/technology/ai/rss/",
    tier: "T1",
    intervalMinutes: 60,
  },
  {
    id: "azure-blog",
    name: "Microsoft Azure Blog",
    feedUrl: "https://azure.microsoft.com/en-us/blog/feed/",
    tier: "T1",
    intervalMinutes: 60,
  },
  {
    id: "microsoft-research",
    name: "Microsoft Research Blog",
    feedUrl: "https://www.microsoft.com/en-us/research/feed/",
    tier: "T1",
    intervalMinutes: 120,
  },
  { id: "github-blog", name: "GitHub Blog", feedUrl: "https://github.blog/feed/", tier: "T1", intervalMinutes: 60 },
  {
    id: "aws-ml",
    name: "AWS Machine Learning Blog",
    feedUrl: "https://aws.amazon.com/blogs/machine-learning/feed/",
    tier: "T1",
    intervalMinutes: 60,
  },
  {
    id: "nvidia-blog",
    name: "NVIDIA Blog",
    feedUrl: "https://blogs.nvidia.com/feed/",
    tier: "T1",
    intervalMinutes: 120,
  },
  {
    id: "hugging-face",
    name: "Hugging Face Blog",
    feedUrl: "https://huggingface.co/blog/feed.xml",
    tier: "T1",
    intervalMinutes: 120,
  },
  {
    id: "mit-tech-review-ai",
    name: "MIT Technology Review — IA",
    feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    tier: "T1_5",
    intervalMinutes: 60,
  },
  {
    id: "ars-technica-ai",
    name: "Ars Technica — IA",
    feedUrl: "https://arstechnica.com/ai/feed/",
    tier: "T1_5",
    intervalMinutes: 60,
  },
  {
    id: "infoq-ai",
    name: "InfoQ — IA, ML e dados",
    feedUrl: "https://feed.infoq.com/ai-ml-data-eng/",
    tier: "T1_5",
    intervalMinutes: 60,
  },
  {
    id: "simon-willison",
    name: "Simon Willison’s Weblog",
    feedUrl: "https://simonwillison.net/atom/everything/",
    tier: "T1_5",
    intervalMinutes: 60,
  },
  {
    id: "the-verge-ai",
    name: "The Verge — IA",
    feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    tier: "T2",
    intervalMinutes: 30,
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch — IA",
    feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    tier: "T2",
    intervalMinutes: 30,
  },
  { id: "tecnoblog", name: "Tecnoblog", feedUrl: "https://tecnoblog.net/feed/", tier: "T2", intervalMinutes: 30 },
];

if (import.meta.main) {
  const config = loadConfig();
  const sql = connect(config.DATABASE_URL, 1);
  // The audit trail names the admin who ran it (the dev admin persona locally).
  const [admin] = await sql<{ id: string; displayName: string; roles: Actor["roles"] }[]>`
    SELECT m.id, m.display_name, array_agg(r.role) AS roles FROM identity.members m
    JOIN identity.role_assignments r ON r.member_id = m.id
    WHERE m.status = 'active' GROUP BY m.id HAVING 'admin' = ANY(array_agg(r.role)) ORDER BY m.display_name LIMIT 1`;
  if (!admin) throw new Error("nenhum admin ativo: rode o seed base");
  const actor: Actor = admin;
  const deps = { privateHosts: [], model: "-" };
  try {
    for (const s of REAL_SOURCES) {
      const [exists] = await sql`SELECT 1 FROM content.sources WHERE id = ${s.id}`;
      if (exists) continue;
      await sql.begin((tx) => createSource(tx, actor, { kind: "rss", ...s }, deps, "tools/real-sources"));
      console.log("cadastrada", s.id);
    }
    const real = REAL_SOURCES.map((s) => s.id);
    const synthetic = await sql<
      { id: string }[]
    >`SELECT id FROM content.sources WHERE active AND kind <> 'submission' AND id <> ALL(${real})`;
    for (const { id } of synthetic) {
      await sql.begin((tx) => updateSource(tx, actor, id, { active: false }, deps, "tools/real-sources"));
      console.log("pausada", id);
    }
  } finally {
    await sql.end();
  }
}
