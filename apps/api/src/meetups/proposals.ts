// M-01/M-02 (US-F008): proposals from a story or manual, one vote per member, organizer decides.
import type { BodyOut, endpoints } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { conflict, invalid, notFound } from "../http/problem.ts";
import { type Actor, authorize, can } from "../identity/policy.ts";
import { audit, emit } from "../ops/record.ts";
import { resolveTarget } from "../targets.ts";

const DAY = 86_400_000;

interface Row {
  id: string;
  title: string;
  rationale: string;
  status: "open" | "selected" | "rejected" | "expired" | "withdrawn";
  originStoryId: string | null;
  originHeadline: string | null;
  originStatus: string | null;
  authorId: string;
  authorName: string;
  votingClosesAt: string;
  createdAt: string;
  votes: number;
  myVote: boolean;
  sessionId: string | null;
}

const SELECT = (db: Db, actor: Actor) => db`
  SELECT p.id, p.title, p.rationale, p.status, p.origin_story_id, s.headline AS origin_headline, s.status AS origin_status,
    p.author_id, m.display_name AS author_name, p.voting_closes_at, p.created_at,
    (SELECT count(*)::int FROM meetups.votes v WHERE v.proposal_id = p.id) AS votes,
    EXISTS (SELECT 1 FROM meetups.votes v WHERE v.proposal_id = p.id AND v.member_id = ${actor.id}) AS my_vote,
    (SELECT ms.id FROM meetups.sessions ms WHERE ms.proposal_id = p.id) AS session_id
  FROM meetups.proposals p
  JOIN identity.members m ON m.id = p.author_id
  LEFT JOIN content.stories s ON s.id = p.origin_story_id`;

function view(r: Row) {
  return {
    id: r.id,
    title: r.title,
    rationale: r.rationale,
    status: r.status,
    origin: r.originStoryId
      ? { type: "story" as const, story: { id: r.originStoryId, headline: r.originHeadline ?? "" } }
      : { type: "manual" as const },
    author: { id: r.authorId, displayName: r.authorName },
    votingClosesAt: r.votingClosesAt,
    createdAt: r.createdAt,
    votes: r.votes,
    myVote: r.myVote,
    sessionId: r.sessionId,
  };
}

async function loadVisible(db: Db, actor: Actor, id: string): Promise<Row> {
  // A proposal born from a story the reader cannot open stays invisible to that reader.
  if (!(await resolveTarget(db, actor, "proposal", id))) throw notFound();
  const [row] = await db<Row[]>`${SELECT(db, actor)} WHERE p.id = ${id}`;
  if (!row) throw notFound();
  return row;
}

export async function listProposals(db: Db, actor: Actor, status?: Row["status"]) {
  const rows = await db<Row[]>`
    ${SELECT(db, actor)}
    WHERE (s.id IS NULL OR s.status <> 'under_review' OR ${can(actor, "moderate")})
    ${status ? db`AND p.status = ${status}` : db``}
    ORDER BY (p.status = 'open') DESC, p.created_at DESC LIMIT 100`;
  return rows.map(view);
}

export async function getProposal(db: Db, actor: Actor, id: string) {
  return view(await loadVisible(db, actor, id));
}

export async function createProposal(
  db: Db,
  actor: Actor,
  input: BodyOut<typeof endpoints.createProposal>,
  requestId: string,
) {
  authorize(actor, "contribute");
  if (input.storyId) {
    const story = await resolveTarget(db, actor, "story", input.storyId);
    if (!story) throw notFound();
    if (!story.writable) throw conflict("Notícia retirada não pode originar pauta.");
  }
  const closes = input.votingClosesAt ? Date.parse(input.votingClosesAt) : Date.now() + 14 * DAY;
  if (closes <= Date.now() || closes > Date.now() + 90 * DAY)
    throw invalid("O prazo de votação deve estar entre agora e 90 dias.");
  const [{ id } = { id: "" }] = await db<{ id: string }[]>`
    INSERT INTO meetups.proposals (author_id, title, rationale, origin_story_id, voting_closes_at)
    VALUES (${actor.id}, ${input.title}, ${input.rationale}, ${input.storyId ?? null}, ${new Date(closes).toISOString()}) RETURNING id`;
  await emit(
    db,
    "meetups.proposal.created.v1",
    id,
    { proposalId: id, originStoryId: input.storyId ?? null },
    { type: "member", correlationId: requestId },
  );
  return getProposal(db, actor, id);
}

/** Idempotent: voting twice keeps one vote; `vote: false` removes it. Closed or decided proposals answer 409. */
export async function vote(db: Db, actor: Actor, id: string, value: boolean) {
  authorize(actor, "contribute");
  const p = await loadVisible(db, actor, id);
  if (p.status !== "open" || Date.parse(p.votingClosesAt) <= Date.now())
    throw conflict("A votação desta pauta está encerrada.");
  if (value) {
    await db`INSERT INTO meetups.votes (proposal_id, member_id) VALUES (${id}, ${actor.id}) ON CONFLICT DO NOTHING`;
  } else {
    await db`DELETE FROM meetups.votes WHERE proposal_id = ${id} AND member_id = ${actor.id}`;
  }
  const [r] = await db<{ votes: number; myVote: boolean }[]>`
    SELECT (SELECT count(*)::int FROM meetups.votes WHERE proposal_id = ${id}) AS votes,
      EXISTS (SELECT 1 FROM meetups.votes WHERE proposal_id = ${id} AND member_id = ${actor.id}) AS my_vote`;
  return r ?? { votes: 0, myVote: false };
}

export async function decide(db: Db, actor: Actor, id: string, status: "selected" | "rejected", requestId: string) {
  authorize(actor, "organize");
  await loadVisible(db, actor, id);
  const updated = await db`
    UPDATE meetups.proposals SET status = ${status}, decided_by = ${actor.id}, decided_at = now()
    WHERE id = ${id} AND status = 'open' RETURNING id`;
  if (updated.length === 0) throw conflict("A pauta já foi decidida.");
  await audit(db, {
    actorId: actor.id,
    action: `meetups.proposal.${status}`,
    targetType: "proposal",
    targetId: id,
    requestId,
  });
  return getProposal(db, actor, id);
}
