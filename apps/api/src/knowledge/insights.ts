// K-01/K-02: an insight is a human conclusion (never an AI summary) linked to what it came from.
import type { BodyOut, endpoints } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { invalid, notFound } from "../http/problem.ts";
import { type Actor, authorize } from "../identity/policy.ts";
import { emit } from "../ops/record.ts";
import { resolveTarget, type TargetKind } from "../targets.ts";

type Relation = "inspired_by" | "discussed_in" | "evidence" | "related";

interface Row {
  id: string;
  title: string;
  hypothesis: string;
  context: string | null;
  applicability: string | null;
  status: "proposed" | "reviewing" | "accepted" | "dismissed" | "archived";
  authorId: string;
  authorName: string;
  createdAt: string;
}

const SELECT = (db: Db) => db`
  SELECT i.id, i.title, i.hypothesis, i.context, i.applicability, i.status, i.author_id, m.display_name AS author_name, i.created_at
  FROM knowledge.insights i JOIN identity.members m ON m.id = i.author_id`;

async function view(db: Db, actor: Actor, r: Row) {
  const links = await db<{ toType: TargetKind; toId: string; relation: Relation }[]>`
    SELECT to_type, to_id, relation FROM knowledge.links WHERE from_type = 'insight' AND from_id = ${r.id} ORDER BY created_at`;
  const references = [];
  for (const l of links) {
    const target = await resolveTarget(db, actor, l.toType, l.toId);
    if (target) references.push({ type: l.toType, id: l.toId, relation: l.relation, title: target.title });
  }
  return {
    id: r.id,
    title: r.title,
    hypothesis: r.hypothesis,
    context: r.context,
    applicability: r.applicability,
    status: r.status,
    author: { id: r.authorId, displayName: r.authorName },
    createdAt: r.createdAt,
    references,
  };
}

export async function getInsight(db: Db, actor: Actor, id: string) {
  const [row] = await db<Row[]>`${SELECT(db)} WHERE i.id = ${id}`;
  if (!row) throw notFound();
  return view(db, actor, row);
}

export async function listInsights(db: Db, actor: Actor) {
  const rows = await db<Row[]>`${SELECT(db)} ORDER BY i.created_at DESC LIMIT 50`;
  return Promise.all(rows.map((r) => view(db, actor, r)));
}

export async function createInsight(
  db: Db,
  actor: Actor,
  input: BodyOut<typeof endpoints.createInsight>,
  requestId: string,
) {
  authorize(actor, "contribute");
  // Every reference must exist and be readable by the author; otherwise the link would leak or dangle.
  for (const ref of input.references) {
    if (!(await resolveTarget(db, actor, ref.type, ref.id)))
      throw invalid(`Referência inexistente ou inacessível: ${ref.type} ${ref.id}.`);
  }
  const [{ id } = { id: "" }] = await db<{ id: string }[]>`
    INSERT INTO knowledge.insights (author_id, title, hypothesis, context, applicability)
    VALUES (${actor.id}, ${input.title}, ${input.hypothesis}, ${input.context ?? null}, ${input.applicability ?? null}) RETURNING id`;
  for (const ref of input.references) {
    // clock_timestamp, not now(): links share one transaction and must keep the order the author gave.
    await db`INSERT INTO knowledge.links (from_type, from_id, to_type, to_id, relation, created_by, created_at)
             VALUES ('insight', ${id}, ${ref.type}, ${ref.id}, ${ref.relation}, ${actor.id}, clock_timestamp()) ON CONFLICT DO NOTHING`;
  }
  await emit(
    db,
    "knowledge.insight.created.v1",
    id,
    { insightId: id, references: input.references.map((r) => ({ type: r.type, id: r.id })) },
    { type: "member", correlationId: requestId },
  );
  return getInsight(db, actor, id);
}
