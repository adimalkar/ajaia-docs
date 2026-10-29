export type ShareRole = "viewer" | "editor";
export type Role = "owner" | ShareRole;

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  role: Role;
  owner: User;
}

export interface DocumentDetail extends DocumentSummary {
  contentHtml: string;
  version: number;
  updatedBy: string | null;
}

export interface Share {
  userId: number;
  name: string;
  email: string;
  role: ShareRole;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...init,
      headers: isForm || !init.body ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const api = {
  me: () => request<{ user: User }>("/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("/auth/login", json("POST", { email, password })),
  logout: () => request<void>("/auth/logout", json("POST")),
  users: () => request<{ users: User[] }>("/users"),

  listDocuments: () => request<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>("/documents"),
  createDocument: (title?: string) => request<DocumentDetail>("/documents", json("POST", { title })),
  getDocument: (id: string) => request<DocumentDetail>(`/documents/${id}`),
  updateDocument: (id: string, changes: { title?: string; contentHtml?: string; baseVersion: number }) =>
    request<DocumentDetail>(`/documents/${id}`, json("PATCH", changes)),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, json("DELETE")),
  importFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentDetail>("/documents/import", { method: "POST", body: form });
  },

  listShares: (id: string) => request<{ shares: Share[] }>(`/documents/${id}/shares`),
  share: (id: string, email: string, role: ShareRole) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares`, json("POST", { email, role })),
  revokeShare: (id: string, userId: number) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares/${userId}`, json("DELETE")),
};

export const IMPORT_ACCEPT = ".txt,.md,.markdown,.docx";
export const IMPORT_HINT = "Supports .txt, .md and .docx (up to 4 MB)";
