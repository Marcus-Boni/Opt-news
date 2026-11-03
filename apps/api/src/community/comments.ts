// C-01/C-04: threaded comments with author, controlled editing (revision), soft states and audited moderation.
// Bodies are plain text: the web renders them as text, never as HTML.
import type { BodyOut, QueryOut, endpoints } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { conflict, forbidden, invalid, notFound } from "../http/problem.ts";
import { type Actor, authorize, can } from "../identity/policy.ts";
import { audit, emit } from "../ops/record.ts";
import { resolveTarget } from "../targets.ts";

interface Row {
  id: string;
  targetType: "story" | "meetup" | "insight";
  targetId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  status: "visible" | "hidden" | "deleted";
  revision: number;
  createdAt: string;
  editedAt: string | null;
  moderationReason: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT = (db: Db) => db`
  SELECT c.id, c.target_type, c.target_id, c.parent_id, c.author_id, m.display_name AS author_name, c.body, c.status,
    c.revision, c.created_at, c.edited_at, c.moderation_reason
  FROM community.comments c JOIN identity.members m ON m.id = c.author_id`;

function view(r: Row, actor: Actor) {
  // Curators still read hidden text (to review or restore it); everyone else sees the placeholder.
  const showBody = r.status === "visible" || (r.status === "hidden" && can(actor, "moderate"));
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    parentId: r.parentId,
    author: { id: r.authorId, displayName: r.authorName },
    body: showBody ? r.body : null,
    status: r.status,
    revision: r.revision,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    moderationReason: r.status === "hidden" ? r.moderationReason : null,
  };
}

async function load(db: Db, id: string): Promise<Row> {
  const [row] = await db<Row[]>`${SELECT(db)} WHERE c.id = ${id}`;
  if (!row) throw notFound();
  return row;
}

/** A comment is reachable only through a target the actor may read. */
async function loadVisible(db: Db, actor: Actor, id: string): Promise<Row> {
  const row = await load(db, id);
  if (!(await resolveTarget(db, actor, row.targetType, row.targetId))) throw notFound();
  return row;
}

export async function listComments(db: Db, actor: Actor, q: QueryOut<typeof endpoints.listComments>) {
  if (!(await resolveTarget(db, actor, q.targetType, q.targetId))) throw notFound();
  const [at, lastId] = q.cursor?.split("_") ?? [];
  const after = at && lastId && Number.isFinite(Date.parse(at)) && UUID.test(lastId);
  const rows = await db<Row[]>`
    ${SELECT(db)} WHERE c.target_type = ${q.targetType} AND c.target_id = ${q.targetId}
    ${after ? db`AND (c.created_at, c.id) > (${at}::timestamptz, ${lastId}::uuid)` : db``}
    ORDER BY c.created_at, c.id LIMIT ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return {
    items: page.map((r) => view(r, actor)),
    nextCursor: rows.length > q.limit && last ? `${last.createdAt}_${last.id}` : null,
  };
}

export async function createComment(
  db: Db,
  actor: Actor,
  input: BodyOut<typeof endpoints.createComment>,
  requestId: string,
) {
  authorize(actor, "contribute");
  const target = await resolveTarget(db, actor, input.targetType, input.targetId);
  if (!target) throw notFound();
  if (!target.writable) throw conflict("Este conteúdo não aceita novos comentários.");
  if (input.parentId) {
    const parent = await load(db, input.parentId);
    if (parent.targetType !== input.targetType || parent.targetId !== input.targetId)
      throw invalid("A resposta precisa estar na mesma discussão.");
    if (parent.status === "deleted") throw conflict("Não é possível responder a um comentário excluído.");
  }
  const [{ id } = { id: "" }] = await db<{ id: string }[]>`
    INSERT INTO community.comments (target_type, target_id, parent_id, author_id, body)
    VALUES (${input.targetType}, ${input.targetId}, ${input.parentId ?? null}, ${actor.id}, ${input.body}) RETURNING id`;
  await emit(
    db,
    "community.comment.created.v1",
    id,
    { commentId: id, targetType: input.targetType, targetId: input.targetId },
    { type: "member", correlationId: requestId },
  );
  return view(await load(db, id), actor);
}

export async function editComment(db: Db, actor: Actor, id: string, input: BodyOut<typeof endpoints.editComment>) {
  authorize(actor, "contribute");
  const row = await loadVisible(db, actor, id);
  if (row.authorId !== actor.id) throw forbidden("Somente o autor pode editar o comentário.");
  if (row.status !== "visible") throw conflict("Comentário oculto ou excluído não pode ser editado.");
  const updated = await db`
    UPDATE community.comments SET body = ${input.body}, revision = revision + 1, edited_at = now()
    WHERE id = ${id} AND revision = ${input.revision} RETURNING id`;
  if (updated.length === 0)
    throw conflict("O comentário foi alterado depois que você o abriu. Recarregue e tente de novo.");
  await db`INSERT INTO community.comment_revisions (comment_id, revision, body) VALUES (${id}, ${row.revision}, ${row.body})`;
  return view(await load(db, id), actor);
}

export async function moderateComment(
  db: Db,
  actor: Actor,
  id: string,
  input: BodyOut<typeof endpoints.moderateComment>,
  requestId: string,
) {
  authorize(actor, "moderate");
  const row = await loadVisible(db, actor, id);
  const next = input.action === "hide" ? "hidden" : "visible";
  if (row.status === "deleted") throw conflict("Comentário excluído não pode ser moderado.");
  if (row.status === next) return view(row, actor);
  await db`UPDATE community.comments SET status = ${next}, moderation_reason = ${input.reason}, moderated_by = ${actor.id} WHERE id = ${id}`;
  await audit(db, {
    actorId: actor.id,
    action: `community.comment.${input.action}`,
    targetType: "comment",
    targetId: id,
    detail: { reason: input.reason },
    requestId,
  });
  return view(await load(db, id), actor);
}

/** Pillar 2 entry point: the latest visible contributions, only on targets the reader can open. */
export async function recentDiscussions(db: Db, actor: Actor) {
  const rows = await db<Row[]>`${SELECT(db)} WHERE c.status = 'visible' ORDER BY c.created_at DESC LIMIT 60`;
  const out = [];
  for (const r of rows) {
    const target = await resolveTarget(db, actor, r.targetType, r.targetId);
    if (target)
      out.push({ comment: view(r, actor), target: { type: r.targetType, id: r.targetId, title: target.title } });
    if (out.length === 20) break;
  }
  return out;
}
