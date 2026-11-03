// Server-side sessions. The cookie carries a random token; the database stores its SHA-256. A session is valid only
// while the member is active, so disabling a member revokes access on the next request.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@optnews/contracts";
import type { Db } from "../db/index.ts";
import type { Actor } from "./policy.ts";

export const SESSION_COOKIE = "optnews_session";
export const SESSION_HOURS = 8;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function openSession(db: Db, memberId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  await db`INSERT INTO identity.sessions (token_hash, member_id, csrf_token, expires_at)
           VALUES (${hash(token)}, ${memberId}, ${csrfToken}, now() + make_interval(hours => ${SESSION_HOURS}))`;
  return { token, csrfToken };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db`UPDATE identity.sessions SET revoked_at = now() WHERE token_hash = ${hash(token)} AND revoked_at IS NULL`;
}

export interface SessionActor extends Actor {
  csrfToken: string;
}

export async function actorFromToken(db: Db, token: string): Promise<SessionActor | null> {
  const [row] = await db<{ id: string; displayName: string; roles: Role[]; csrfToken: string }[]>`
    SELECT m.id, m.display_name, s.csrf_token,
      coalesce((SELECT array_agg(r.role ORDER BY r.role) FROM identity.role_assignments r WHERE r.member_id = m.id), '{}') AS roles
    FROM identity.sessions s JOIN identity.members m ON m.id = s.member_id
    WHERE s.token_hash = ${hash(token)} AND s.revoked_at IS NULL AND s.expires_at > now() AND m.status = 'active'`;
  return row ?? null;
}

export function csrfMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
