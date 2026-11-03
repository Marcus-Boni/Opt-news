// M-03/M-04/M-07: manual scheduling, explicit states, materials and the post-meetup record. No Teams/Graph call
// (Q-13): a Teams link is stored as typed by the organizer, so nothing claims a remote meeting was created.
import type { BodyOut, endpoints } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import { conflict, forbidden, invalid, notFound } from "../http/problem.ts";
import { type Actor, authorize, can } from "../identity/policy.ts";
import { audit, emit } from "../ops/record.ts";
import { resolveTarget } from "../targets.ts";

type State = "draft" | "scheduled" | "completed" | "documented" | "cancelled";

const TRANSITIONS: Record<State, readonly State[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["completed", "cancelled"],
  completed: ["documented"],
  documented: [],
  cancelled: [],
};

interface Row {
  id: string;
  title: string;
  description: string;
  scheduledStart: string;
  durationMinutes: number;
  state: State;
  organizerId: string;
  organizerName: string;
  responsibleId: string;
  responsibleName: string;
  proposalId: string | null;
  proposalTitle: string | null;
  proposalStoryId: string | null;
  proposalStoryStatus: string | null;
  teamsUrl: string | null;
  summary: string | null;
  conclusions: string | null;
  revision: number;
}

const SELECT = (db: Db) => db`
  SELECT ms.id, ms.title, ms.description, ms.scheduled_start, ms.duration_minutes, ms.state,
    ms.organizer_id, o.display_name AS organizer_name, ms.responsible_id, r.display_name AS responsible_name,
    ms.proposal_id, p.title AS proposal_title, p.origin_story_id AS proposal_story_id, ps.status AS proposal_story_status,
    ms.teams_url, ms.summary, ms.conclusions, ms.revision
  FROM meetups.sessions ms
  JOIN identity.members o ON o.id = ms.organizer_id
  JOIN identity.members r ON r.id = ms.responsible_id
  LEFT JOIN meetups.proposals p ON p.id = ms.proposal_id
  LEFT JOIN content.stories ps ON ps.id = p.origin_story_id`;

function view(r: Row, actor: Actor) {
  // Sessions are open to members, but their origin shows only if the reader may open the origin story.
  const originHidden = r.proposalStoryStatus === "under_review" && !can(actor, "moderate");
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    scheduledStart: r.scheduledStart,
    durationMinutes: r.durationMinutes,
    state: r.state,
    organizer: { id: r.organizerId, displayName: r.organizerName },
    responsible: { id: r.responsibleId, displayName: r.responsibleName },
    proposal:
      r.proposalId && !originHidden
        ? { id: r.proposalId, title: r.proposalTitle ?? "", storyId: r.proposalStoryId }
        : null,
    teamsUrl: r.teamsUrl,
    summary: r.summary,
    conclusions: r.conclusions,
    revision: r.revision,
  };
}

/** Manual Teams links only: https on a Microsoft Teams host, nothing else. */
function teamsLink(url: string | null | undefined): string | null {
  if (url == null) return null;
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !(u.hostname === "teams.microsoft.com" || u.hostname.endsWith(".teams.microsoft.com"))
  ) {
    throw invalid("O link da reunião deve ser um endereço https do Microsoft Teams.");
  }
  return u.toString();
}

export async function listMeetups(db: Db, actor: Actor, when: "upcoming" | "past") {
  const rows = await db<Row[]>`
    ${SELECT(db)}
    WHERE ${when === "upcoming" ? db`ms.scheduled_start >= now() - interval '1 day'` : db`ms.scheduled_start < now() - interval '1 day' OR ms.state IN ('completed', 'documented')`}
    ORDER BY ms.scheduled_start ${when === "upcoming" ? db`ASC` : db`DESC`} LIMIT 100`;
  return rows.map((r) => view(r, actor));
}

export async function getMeetup(db: Db, actor: Actor, id: string) {
  const [row] = await db<Row[]>`${SELECT(db)} WHERE ms.id = ${id}`;
  if (!row) throw notFound();
  const artifacts = await db<
    {
      id: string;
      kind: "slides" | "document" | "recording" | "link";
      title: string;
      url: string;
      authorId: string;
      authorName: string;
      createdAt: string;
    }[]
  >`
    SELECT a.id, a.kind, a.title, a.url, a.author_id, m.display_name AS author_name, a.created_at
    FROM meetups.artifacts a JOIN identity.members m ON m.id = a.author_id WHERE a.session_id = ${id} ORDER BY a.created_at`;
  const insights = await db<{ id: string; title: string; status: string }[]>`
    SELECT DISTINCT i.id, i.title, i.status FROM knowledge.links l JOIN knowledge.insights i ON i.id = l.from_id
    WHERE l.to_type = 'meetup' AND l.to_id = ${id}`;
  return {
    ...view(row, actor),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      url: a.url,
      author: { id: a.authorId, displayName: a.authorName },
      createdAt: a.createdAt,
    })),
    insights,
  };
}

export async function createMeetup(
  db: Db,
  actor: Actor,
  input: BodyOut<typeof endpoints.createMeetup>,
  requestId: string,
) {
  authorize(actor, "organize");
  if (Date.parse(input.scheduledStart) <= Date.now()) throw invalid("A data do meetup precisa estar no futuro.");
  const [responsible] =
    await db`SELECT 1 FROM identity.members WHERE id = ${input.responsibleId} AND status = 'active'`;
  if (!responsible) throw invalid("Responsável inexistente ou inativo.");
  if (input.proposalId) {
    if (!(await resolveTarget(db, actor, "proposal", input.proposalId))) throw notFound();
    const [p] = await db<{ status: string; hasSession: boolean }[]>`
      SELECT status, EXISTS (SELECT 1 FROM meetups.sessions WHERE proposal_id = ${input.proposalId}) AS has_session
      FROM meetups.proposals WHERE id = ${input.proposalId}`;
    if (p?.status !== "selected") throw conflict("Só pautas selecionadas viram sessão.");
    if (p.hasSession) throw conflict("Esta pauta já tem uma sessão agendada.");
  }
  const [{ id } = { id: "" }] = await db<{ id: string }[]>`
    INSERT INTO meetups.sessions (proposal_id, title, description, scheduled_start, duration_minutes, state, organizer_id, responsible_id, teams_url)
    VALUES (${input.proposalId ?? null}, ${input.title}, ${input.description}, ${input.scheduledStart}, ${input.durationMinutes},
      'scheduled', ${actor.id}, ${input.responsibleId}, ${teamsLink(input.teamsUrl)})
    ON CONFLICT (proposal_id) DO NOTHING RETURNING id`;
  if (!id) throw conflict("Esta pauta já tem uma sessão agendada.");
  await audit(db, {
    actorId: actor.id,
    action: "meetups.session.scheduled",
    targetType: "meetup",
    targetId: id,
    detail: { proposalId: input.proposalId ?? null },
    requestId,
  });
  return getMeetup(db, actor, id);
}

export async function updateMeetup(
  db: Db,
  actor: Actor,
  id: string,
  input: BodyOut<typeof endpoints.updateMeetup>,
  requestId: string,
) {
  authorize(actor, "organize");
  const [row] = await db<Row[]>`${SELECT(db)} WHERE ms.id = ${id}`;
  if (!row) throw notFound();
  if (row.revision !== input.revision)
    throw conflict("A sessão foi alterada depois que você a abriu. Recarregue e tente de novo.");
  const state = input.state ?? row.state;
  if (state !== row.state && !TRANSITIONS[row.state].includes(state))
    throw conflict(`Transição inválida: ${row.state} → ${state}.`);
  if (input.scheduledStart !== undefined) {
    if (!["draft", "scheduled"].includes(row.state)) throw conflict("Só sessões não realizadas podem ser remarcadas.");
    if (Date.parse(input.scheduledStart) <= Date.now()) throw invalid("A nova data precisa estar no futuro.");
  }
  const summary = input.summary ?? row.summary;
  const conclusions = input.conclusions ?? row.conclusions;
  if (state === "documented" && (!summary || !conclusions))
    throw invalid("Para documentar, registre resumo e conclusões.");
  const updated = await db`
    UPDATE meetups.sessions SET state = ${state}, scheduled_start = ${input.scheduledStart ?? row.scheduledStart},
      summary = ${summary}, conclusions = ${conclusions},
      teams_url = ${input.teamsUrl === undefined ? row.teamsUrl : teamsLink(input.teamsUrl)}, revision = revision + 1
    WHERE id = ${id} AND revision = ${input.revision} RETURNING id`;
  if (updated.length === 0)
    throw conflict("A sessão foi alterada depois que você a abriu. Recarregue e tente de novo.");
  if (state !== row.state) {
    await audit(db, {
      actorId: actor.id,
      action: `meetups.session.${state}`,
      targetType: "meetup",
      targetId: id,
      detail: { from: row.state },
      requestId,
    });
    if (state === "completed")
      await emit(
        db,
        "meetups.session.completed.v1",
        id,
        { sessionId: id },
        { type: "member", correlationId: requestId },
      );
  }
  return getMeetup(db, actor, id);
}

export async function addArtifact(
  db: Db,
  actor: Actor,
  id: string,
  input: BodyOut<typeof endpoints.addArtifact>,
  requestId: string,
) {
  const [row] = await db<
    { responsibleId: string; state: State }[]
  >`SELECT responsible_id, state FROM meetups.sessions WHERE id = ${id}`;
  if (!row) throw notFound();
  if (!can(actor, "organize") && row.responsibleId !== actor.id)
    throw forbidden("Somente organizadores ou o responsável pela sessão podem anexar materiais.");
  if (row.state === "cancelled") throw conflict("Sessão cancelada não recebe materiais.");
  if (new URL(input.url).protocol !== "https:") throw invalid("Materiais precisam de um link https.");
  const [{ id: artifactId } = { id: "" }] = await db<{ id: string }[]>`
    INSERT INTO meetups.artifacts (session_id, kind, title, url, author_id)
    VALUES (${id}, ${input.kind}, ${input.title}, ${input.url}, ${actor.id}) RETURNING id`;
  await audit(db, {
    actorId: actor.id,
    action: "meetups.artifact.added",
    targetType: "meetup",
    targetId: id,
    detail: { artifactId, kind: input.kind },
    requestId,
  });
  return getMeetup(db, actor, id);
}
