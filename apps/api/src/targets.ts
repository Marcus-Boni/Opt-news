// Cross-context references (comment targets, insight references, search). Each target type applies its own
// visibility rule here: a link or a comment never grants access to what it points at.
import type { Db } from "./db/index.ts";
import { type Actor, can } from "./identity/policy.ts";

export type TargetKind = "story" | "meetup" | "proposal" | "insight";

export interface Target {
  type: TargetKind;
  id: string;
  title: string;
  /** False when the target exists and is readable but takes no new contributions (retracted story, cancelled meetup). */
  writable: boolean;
}

/** SQL condition for stories (alias `s`) a member may read in lists: published, plus items under review for curators. */
export function listedStories(db: Db, actor: Actor) {
  return can(actor, "moderate") ? db`s.status IN ('published', 'under_review')` : db`s.status = 'published'`;
}

/** Retracted stories stay reachable by id (with their content withheld) so references do not break silently. */
function storyReadable(status: string, actor: Actor): boolean {
  return status !== "under_review" || can(actor, "moderate");
}

export async function resolveTarget(db: Db, actor: Actor, type: TargetKind, id: string): Promise<Target | null> {
  switch (type) {
    case "story": {
      const [s] = await db<
        { headline: string; status: string }[]
      >`SELECT headline, status FROM content.stories WHERE id = ${id}`;
      return s && storyReadable(s.status, actor)
        ? { type, id, title: s.headline, writable: s.status !== "retracted" }
        : null;
    }
    case "proposal": {
      const [p] = await db<{ title: string; status: string; storyStatus: string | null }[]>`
        SELECT p.title, p.status, s.status AS story_status
        FROM meetups.proposals p LEFT JOIN content.stories s ON s.id = p.origin_story_id WHERE p.id = ${id}`;
      if (!p || (p.storyStatus && !storyReadable(p.storyStatus, actor))) return null;
      return { type, id, title: p.title, writable: p.status === "open" };
    }
    case "meetup": {
      const [m] = await db<
        { title: string; state: string }[]
      >`SELECT title, state FROM meetups.sessions WHERE id = ${id}`;
      return m ? { type, id, title: m.title, writable: m.state !== "cancelled" } : null;
    }
    case "insight": {
      const [i] = await db<{ title: string }[]>`SELECT title FROM knowledge.insights WHERE id = ${id}`;
      return i ? { type, id, title: i.title, writable: true } : null;
    }
  }
}
