// Device-level "remember me": the bearer token from POST /api/auth lives in
// localStorage. Clearing site data or changing APP_PASSWORD signs out.

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
