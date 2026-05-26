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
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
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
  | 'OFFEN' | 'ZUGEWIESEN' | 'IN_BEARBEITUNG'
  | 'DOKUMENTIERT' | 'ABGESCHLOSSEN' | 'STORNIERT';

export type DokuStatus =
  | 'ENTWURF' | 'IN_ARBEIT' | 'ZUR_UNTERSCHRIFT'
  | 'UNTERSCHRIEBEN' | 'VERSENDET' | 'SEVDESK_HOCHGELADEN';

export interface Position {
  id: string;
  auftragId: string;
  sevdeskPosNumber?: string | null;
  bezeichnung: string;
  menge: number;
  einheit?: string | null;
  serialNumber?: string | null;
  verbaut: boolean;
  verbautAm?: string | null;
  verbautVonId?: string | null;
  verbautVon?: { id: string; name: string } | null;
  bemerkung?: string | null;
}

export interface Auftrag {
  id: string;
  sevdeskOrderId?: string | null;
  sevdeskOrderNumber: string;
  customerName: string;
  customerAddress?: string | null;
  orderDate?: string | null;
  status: AuftragStatus;
  positions?: Position[];
  positionsCount?: number;
  dokumentationenCount?: number;
  updatedAt?: string;
}

export interface AuftraegeListResponse {
  count: number;
  auftraege: Auftrag[];
}

export interface Dokumentation {
  id: string;
  auftragId: string;
  vorarbeiterId: string;
  status: DokuStatus;
  wetter?: string | null;
  bemerkung?: string | null;
  arbeitsstunden?: number | null;
  startedAt: string;
  completedAt?: string | null;
  pdfPath?: string | null;
  versendetAn?: string | null;
  versendetAm?: string | null;
  sevdeskVoucherId?: string | null;
}

export interface DokumentationenListResponse {
  count: number;
  dokumentationen: Dokumentation[];
}

// === API ===

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => request<User>('/auth/me', {}, token),

  listAuftraege: (token: string, status?: AuftragStatus) => {
    const query = status ? `?status=${status}` : '';
    return request<AuftraegeListResponse>(`/auftraege${query}`, {}, token);
  },

  getAuftrag: (token: string, id: string) =>
    request<Auftrag>(`/auftraege/${id}`, {}, token),

  listDokus: (token: string, params: { auftragId?: string; status?: DokuStatus; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.auftragId) qs.set('auftragId', params.auftragId);
    if (params.status) qs.set('status', params.status);
    if (params.mine) qs.set('mine', 'true');
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<DokumentationenListResponse>(`/dokumentationen${query}`, {}, token);
  },

  getDoku: (token: string, id: string) =>
    request<Dokumentation>(`/dokumentationen/${id}`, {}, token),

  createDoku: (token: string, auftragId: string, data: { wetter?: string; bemerkung?: string; arbeitsstunden?: number } = {}) =>
    request<Dokumentation>(`/auftraege/${auftragId}/dokumentationen`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, token),

  updateDoku: (token: string, id: string, data: Partial<Pick<Dokumentation, 'wetter' | 'bemerkung' | 'arbeitsstunden'>>) =>
    request<Dokumentation>(`/dokumentationen/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, token),

  updatePosition: (token: string, id: string, data: Partial<Pick<Position, 'verbaut' | 'serialNumber' | 'bemerkung'>>) =>
    request<Position>(`/positionen/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, token),
};