import type { Application, ApplicationInput, ApplicationPatch, BulkRequest, BulkResponse } from "../shared/types";
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

export async function login(password: string): Promise<void> {
  const { token } = await request<{ token: string }>("/api/auth", { method: "POST", body: JSON.stringify({ password }) });
  setToken(token);
}

export const api = {
  list: async (): Promise<{ apps: Application[]; owner: string }> => {
    const { res, data } = await send<Application[]>("/api/applications");
    return { apps: data, owner: res.headers.get("x-owner-id") ?? "unknown" };
  },
  create: (input: ApplicationInput) => request<Application>("/api/applications", { method: "POST", body: JSON.stringify(input) }),
  patch: (id: string, patch: ApplicationPatch) =>
    request<Application>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => request<void>(`/api/applications/${id}`, { method: "DELETE" }),
  bulk: (body: BulkRequest) => request<BulkResponse>("/api/applications/bulk", { method: "POST", body: JSON.stringify(body) }),
};
