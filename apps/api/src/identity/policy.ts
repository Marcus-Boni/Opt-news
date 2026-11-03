// Authorization policy (deny by default). Every route asks here; the web only mirrors `capabilities` for display.
import type { Role } from "@optnews/contracts";
import { forbidden } from "../http/problem.ts";

export interface Actor {
  id: string;
  displayName: string;
  roles: Role[];
}

export type Capability = "read" | "contribute" | "organize" | "moderate" | "administer";

const GRANTS: Record<Capability, readonly Role[]> = {
  read: ["visitor", "member", "organizer", "curator", "admin"],
  contribute: ["member", "organizer", "curator", "admin"],
  organize: ["organizer", "admin"],
  moderate: ["curator", "admin"],
  administer: ["admin"],
};

export function can(actor: Actor, capability: Capability): boolean {
  return actor.roles.some((role) => GRANTS[capability].includes(role));
}

export function authorize(actor: Actor, capability: Capability): void {
  if (!can(actor, capability)) throw forbidden();
}

export function capabilities(actor: Actor) {
  return {
    contribute: can(actor, "contribute"),
    organize: can(actor, "organize"),
    moderate: can(actor, "moderate"),
    administer: can(actor, "administer"),
  };
}
