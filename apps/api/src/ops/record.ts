// Audit trail and transactional outbox. Both are written with the business change, in the same transaction.
// Payloads carry ids and states only: no comment bodies, tokens or personal data.
import type { Db } from "../db/index.ts";

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown>;
  requestId?: string;
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db`INSERT INTO ops.audit (actor_id, action, target_type, target_id, detail, request_id)
           VALUES (${e.actorId}, ${e.action}, ${e.targetType}, ${e.targetId}, ${db.json((e.detail ?? {}) as never)}, ${e.requestId ?? null})`;
}

/** Event names follow docs/06-contratos-api.md: `<context>.<aggregate>.<fact>.v<version>`. */
export type EventType =
  | "content.story.published.v1"
  | "content.story.retracted.v1"
  | "community.comment.created.v1"
  | "meetups.proposal.created.v1"
  | "meetups.session.completed.v1"
  | "knowledge.insight.created.v1";

export async function emit(
  db: Db,
  eventType: EventType,
  aggregateId: string,
  payload: Record<string, unknown>,
  actor: { type: "member" | "system"; correlationId?: string },
): Promise<void> {
  await db`INSERT INTO ops.outbox (event_type, version, aggregate_id, actor_type, correlation_id, payload)
           VALUES (${eventType}, 1, ${aggregateId}, ${actor.type}, ${actor.correlationId ?? null}, ${db.json(payload as never)})`;
}
