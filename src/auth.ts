// Device-level "remember me": the session token from POST /api/auth lives in
// localStorage, so a sign-in survives closing the tab and restarting the
// browser. It is per device and per browser profile.
//
// It stops working when: it passes SESSION_MAX_AGE_DAYS (90) from the sign-in
// that issued it, the account's password changes (the hash is the signing key),
// AUTH_SECRET changes, or the user clears site data. Nothing else — deploys and
// migrations do not touch it. A 401 from any call drops it and shows the
// sign-in screen.

const TOKEN_KEY = "jobtracker.token";
export const UNAUTHORIZED_EVENT = "jobtracker:unauthorized";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode: the session still works until reload
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/** Called by the API client on a 401: drop the token and tell the app. */
export function signOut(): void {
  clearToken();
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}
