import type { UserRow } from "../db/schema.js";
import type { PublicUser } from "../shared/user.js";

export type { PublicUser };

export function publicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    ...(row.name ? { name: row.name } : {}),
    mustChangePassword: row.mustChangePassword,
    prefs: row.prefs ?? {},
    ...(row.agentTokenHash && row.agentTokenPrefix
      ? { agentToken: { prefix: row.agentTokenPrefix, createdAt: (row.agentTokenCreatedAt ?? new Date()).toISOString() } }
      : {}),
    ...(row.createdAt ? { createdAt: row.createdAt.toISOString() } : {}),
  };
}
