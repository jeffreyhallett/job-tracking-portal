import type { Application, ApplicationInput, ApplicationPatch, BulkRequest, BulkResponse } from "../shared/types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  list: () => request<Application[]>("/api/applications"),
  create: (input: ApplicationInput) => request<Application>("/api/applications", { method: "POST", body: JSON.stringify(input) }),
  patch: (id: string, patch: ApplicationPatch) =>
    request<Application>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => request<void>(`/api/applications/${id}`, { method: "DELETE" }),
  bulk: (body: BulkRequest) => request<BulkResponse>("/api/applications/bulk", { method: "POST", body: JSON.stringify(body) }),
};
