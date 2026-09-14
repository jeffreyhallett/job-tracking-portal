// Password rules, shared by the sign-in screens, the API, and scripts/users.ts.
//
// Deliberately separate from shared/crypto.ts: that file imports node:crypto,
// which must never reach the browser bundle. This one has no imports at all, so
// the client can validate before it posts and the server can reject with the
// same wording.
//
// There is no minimum length. This is a personal tracker whose accounts are
// created by hand, and the sign-in throttle in api/auth.ts is what actually
// stands between an account and a guessing attack.

export const MAX_PASSWORD_LENGTH = 200;

/** Why the password is unacceptable, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.trim().length === 0) return "Cannot be blank";
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}
