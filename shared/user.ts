// The wire shape of an account, shared by the API handlers and the client.
// Never carries a password hash or a usable agent token: `agentToken.prefix` is
// only the first few characters, enough for the UI to say which token is live.
import type { UserPrefs } from "./prefs.js";

export type PublicUser = {
  id: string;
  email: string;
  name?: string;
  /** True while the account is on a password an admin set; the app forces a change. */
  mustChangePassword: boolean;
  prefs: UserPrefs;
  agentToken?: { prefix: string; createdAt: string };
  createdAt?: string;
};

/** POST /api/auth */
export type AuthResponse = { token: string; user: PublicUser };

/**
 * POST /api/me { action: "changePassword" }. The new session token replaces the
 * one the password change just invalidated, so this device stays signed in.
 */
export type ChangePasswordResponse = { user: PublicUser; token: string };

/** POST /api/me { action: "rotateAgentToken" }. `token` is shown once and never again. */
export type RotateAgentTokenResponse = { user: PublicUser; token: string };
