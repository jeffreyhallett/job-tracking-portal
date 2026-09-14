// Password rules, shared by the sign-in screens, the API, and scripts/users.ts.
//
// Deliberately separate from shared/crypto.ts: that file imports node:crypto,
// which must never reach the browser bundle. This one has no imports at all, so
// the client can validate before it posts and the server can reject with the
// same wording.

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

/** Why the password is unacceptable, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.trim().length === 0) return "Cannot be blank";
  // NFKC so a password typed on a different keyboard layout is measured the
  // same way hashPassword() will measure it.
  if (password.normalize("NFKC").length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}
