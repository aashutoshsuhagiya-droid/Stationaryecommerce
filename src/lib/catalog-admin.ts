import "server-only";

import { AuthenticationError, requireRequestActor } from "./auth-session";

/** Catalog mutations are reserved for a Super Admin with catalog management rights. */
export async function requireCatalogAdmin(request: Request) {
  const actor = await requireRequestActor(request, "catalog.manage");
  if (!actor.roles.includes("admin")) {
    throw new AuthenticationError(403, "FORBIDDEN", "Super Admin access is required.");
  }
  return actor;
}
