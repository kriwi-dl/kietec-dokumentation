const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://kietec-api.kriwi-dl.de';

export class ApiError extends Error {
  constructor(public status: number, public bodyData: unknown) {
    const msg = typeof bodyData === 'object' && bodyData !== null && 'error' in bodyData
      ? String((bodyData as { error: unknown }).error)
      : typeof bodyData === 'string' ? bodyData : `HTTP ${status}`;
    super(msg);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// === Types ===

export type UserRole = 'ADMIN' | 'VORARBEITER' | 'MONTEUR';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export type AuftragStatus =
  | 'OFFEN'
  | 'ZUGEWIESEN'
  | 'IN_BEARBEITUNG'
  | 'DOKUMENTIERT'
  | 'ABGESCHLOSSEN'
  | 'STORNIERT';

export interface Auftrag {
  id: string;
  sevdeskOrderId?: string | null;
  sevdeskOrderNumber: string;
  customerName: string;
  customerAddress?: string | null;
  orderDate?: string | null;
  status: AuftragStatus;
  positionsCount?: number;
  dokumentationenCount?: number;
  updatedAt?: string;
}

export interface AuftraegeListResponse {
  count: number;
  auftraege: Auftrag[];
}

// === API ===

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => request<User>('/auth/me', {}, token),

  listAuftraege: (token: string, status?: AuftragStatus) => {
    const query = status ? `?status=${status}` : '';
    return request<AuftraegeListResponse>(`/auftraege${query}`, {}, token);
  },
};