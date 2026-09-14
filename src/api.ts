import type { UserPrefs } from "../shared/prefs";
import type { Application, ApplicationInput, ApplicationPatch, BulkRequest, BulkResponse } from "../shared/types";
import type { AuthResponse, ChangePasswordResponse, PublicUser, RotateAgentTokenResponse } from "../shared/user";
import { getToken, setToken, signOut } from "./auth";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send<T>(path, init)).data;
}

async function send<T>(path: string, init?: RequestInit): Promise<{ res: Response; data: T }> {
  let res: Response;
  const token = getToken();
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
  if (res.status === 401 && path !== "/api/auth") signOut();
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return { res, data: undefined as T };
  return { res, data: (await res.json()) as T };
}

/** Trade email + password for a session token, and return who signed in. */
export async function login(email: string, password: string): Promise<PublicUser> {
  const { token, user } = await request<AuthResponse>("/api/auth", { method: "POST", body: JSON.stringify({ email, password }) });
  setToken(token);
  return user;
}

const account = (body: Record<string, unknown>) => ({ method: "POST", body: JSON.stringify(body) }) satisfies RequestInit;

export const api = {
  list: async (): Promise<{ apps: Application[]; owner: string }> => {
    const { res, data } = await send<Application[]>("/api/applications");
    return { apps: data, owner: res.headers.get("x-owner-email") ?? res.headers.get("x-owner-id") ?? "unknown" };
  },
  create: (input: ApplicationInput) => request<Application>("/api/applications", { method: "POST", body: JSON.stringify(input) }),
  patch: (id: string, patch: ApplicationPatch) =>
    request<Application>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string, keepalive = false) => request<void>(`/api/applications/${id}`, { method: "DELETE", keepalive }),
  bulk: (body: BulkRequest) => request<BulkResponse>("/api/applications/bulk", { method: "POST", body: JSON.stringify(body) }),

  me: () => request<PublicUser>("/api/me"),
  updateMe: (patch: { name?: string | null; prefs?: UserPrefs; reassignStages?: { from: string; to: string }[] }) =>
    request<PublicUser>("/api/me", { method: "PATCH", body: JSON.stringify(patch) }),

  /**
   * A password change invalidates every token this user holds, including the one
   * we just used, so the fresh token in the response is stored right away.
   */
  changePassword: async (newPassword: string, currentPassword?: string): Promise<PublicUser> => {
    const { user, token } = await request<ChangePasswordResponse>("/api/me", account({ action: "changePassword", newPassword, ...(currentPassword ? { currentPassword } : {}) }));
    setToken(token);
    return user;
  },
  /** The plaintext token comes back once here and is never retrievable again. */
  rotateAgentToken: () => request<RotateAgentTokenResponse>("/api/me", account({ action: "rotateAgentToken" })),
  revokeAgentToken: () => request<PublicUser>("/api/me", account({ action: "revokeAgentToken" })),
  resetPrefs: () => request<PublicUser>("/api/me", account({ action: "resetPrefs" })),
};
