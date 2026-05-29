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

export interface PositionAbnahme {
  id: string;
  typ: UnterschriftTyp;
  signerName: string;
  signedAt: string;
  ipAddress?: string | null;
}

export interface Position {
  id: string;
  auftragId: string;
  sevdeskPosNumber?: string | null;
  bezeichnung: string;
  beschreibung?: string | null;
  menge: number;
  einheit?: string | null;
  serialNumbers: string[];
  verbaut: boolean;
  verbautAm?: string | null;
  verbautVonId?: string | null;
  verbautVon?: { id: string; name: string } | null;
  bemerkung?: string | null;
  abnahmen?: PositionAbnahme[];
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

export type FotoKategorie =
  | 'VOR_BEGINN'
  | 'FORTSCHRITT'
  | 'VERKABELUNG'
  | 'TYPENSCHILD'
  | 'MAENGEL'
  | 'ENDABNAHME'
  | 'SONSTIGES';

export interface Foto {
  id: string;
  dokumentationId: string;
  positionId?: string | null;
  filename: string;
  kategorie: FotoKategorie;
  beschreibung?: string | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  uploadedAt: string;
}

export type UnterschriftTyp = 'MONTEUR' | 'KUNDE' | 'VORARBEITER';

export interface Unterschrift {
  id: string;
  typ: UnterschriftTyp;
  signerName: string;
  signedAt: string;
  positionId?: string | null;
}

export interface Dokumentation {
  id: string;
  auftragId: string;
  auftrag?: Auftrag;
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
  fotos?: Foto[];
  unterschriften?: Unterschrift[];
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

  updatePosition: (token: string, id: string, data: Partial<Pick<Position, 'verbaut' | 'serialNumbers' | 'bemerkung'>>) =>
    request<Position>(`/positionen/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, token),

  listFotos: (token: string, dokuId: string) =>
    request<{ count: number; fotos: Foto[] }>(`/dokumentationen/${dokuId}/fotos`, {}, token),

  uploadFoto: async (
    token: string,
    dokuId: string,
    file: File,
    options: { kategorie?: FotoKategorie; beschreibung?: string; positionId?: string } = {}
  ) => {
    const formData = new FormData();
    // WICHTIG: Wertfelder VOR der Datei appenden,
    // sonst werden sie von @fastify/multipart nicht gelesen.
    formData.append('kategorie', options.kategorie ?? 'FORTSCHRITT');
    if (options.beschreibung) formData.append('beschreibung', options.beschreibung);
    if (options.positionId) formData.append('positionId', options.positionId);
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/dokumentationen/${dokuId}/fotos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      let body: unknown;
      try { body = await res.json(); } catch { body = await res.text(); }
      throw new ApiError(res.status, body);
    }
    return res.json() as Promise<{ foto: Foto }>;
  },

  deleteFoto: (token: string, fotoId: string) =>
    request<{ success: boolean }>(`/fotos/${fotoId}`, { method: 'DELETE' }, token),

  fetchFotoBlob: async (token: string, fotoId: string, kind: 'thumbnail' | 'file') => {
    const res = await fetch(`${API_BASE}/fotos/${fotoId}/${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, 'Foto-Download fehlgeschlagen');
    return res.blob();
  },

  createSignature: (
    token: string,
    dokuId: string,
    data: { typ: UnterschriftTyp; signerName: string; signatureData: string; positionId?: string }
  ) =>
    request<{
      signature: Unterschrift;
      url: string;
      statusAdvanced: boolean;
    }>(`/dokumentationen/${dokuId}/unterschriften`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, token),

  generatePdf: (token: string, dokuId: string) =>
    request<{ success: boolean; url: string; sizeKb: number; generatedAt: string }>(
      `/dokumentationen/${dokuId}/pdf`,
      { method: 'POST', body: '{}' },
      token
    ),

  fetchPdfBlob: async (token: string, dokuId: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/dokumentationen/${dokuId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, 'PDF-Download fehlgeschlagen');
    return res.blob();
  },

  sendEmail: (token: string, dokuId: string, data: { to: string; subject?: string; message?: string }) =>
    request<{
      success: boolean;
      messageId: string;
      accepted: string[];
      rejected: string[];
      sentTo: string;
      sentAt: string;
      statusAdvanced: boolean;
    }>(`/dokumentationen/${dokuId}/email`, {
      method: 'POST',
      body: JSON.stringify(data),
    }, token),

  uploadToSevdesk: (token: string, dokuId: string) =>
    request<{
      success: boolean;
      documentId: string;
      folderName: string;
      folderId: string;
      linkedOrderId: string | null;
      statusAdvanced: boolean;
      uploadedAt: string;
    }>(`/dokumentationen/${dokuId}/sevdesk-upload`, {
      method: 'POST',
      body: '{}',
    }, token),

    syncSevdesk: (token: string) =>
    request<{
      created?: number;
      updated?: number;
      positions?: number;
      errors?: number;
      [k: string]: unknown;
    }>('/sync/sevdesk', { method: 'POST', body: '{}' }, token),
};