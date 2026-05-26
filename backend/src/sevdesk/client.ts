import type {
  SevdeskListResponse,
  SevdeskOrder,
  SevdeskOrderPos,
  SevdeskContact
} from './types';

export class SevdeskApiError extends Error {
  constructor(
    public statusCode: number,
    public bodyText: string,
    public url: string
  ) {
    super(`Sevdesk API ${statusCode} at ${url}: ${bodyText.slice(0, 300)}`);
    this.name = 'SevdeskApiError';
  }
}

export interface SevdeskDocumentUploadResult {
  documentId: string;
  folderId: string;
  folderName: string;
}

export interface SevdeskDocumentOptions {
  /** Ordnername unter sevdesk → Dokumente. Wird angelegt falls nicht existent. */
  folderName: string;
  /** Optional: sevdesk-Order-ID, mit der das Dokument verknüpft wird. */
  linkedOrderId?: string;
}

export class SevdeskClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = 'https://my.sevdesk.de/api/v1',
    private readonly userAgent: string = 'KieTec-Dokumentation/0.1 (kriwi-dl)'
  ) {
    if (!token) {
      throw new Error('Sevdesk API token must not be empty');
    }
  }

  private async request<T>(
    path: string,
    params?: Record<string, string | number>
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: this.token,
        Accept: 'application/json',
        'User-Agent': this.userAgent
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new SevdeskApiError(response.status, body, url.toString());
    }

    return response.json() as Promise<T>;
  }

  async getDeliveryNotes(limit = 50, offset = 0): Promise<SevdeskOrder[]> {
    const res = await this.request<SevdeskListResponse<SevdeskOrder>>(
      '/Order',
      { orderType: 'LI', limit, offset }
    );
    return res.objects;
  }

  async getOrderPositions(orderId: string): Promise<SevdeskOrderPos[]> {
    const res = await this.request<SevdeskListResponse<SevdeskOrderPos>>(
      `/Order/${orderId}/getPositions`
    );
    return res.objects;
  }

  async getContact(contactId: string): Promise<SevdeskContact | null> {
    const res = await this.request<SevdeskListResponse<SevdeskContact>>(
      `/Contact/${contactId}`
    );
    return res.objects[0] ?? null;
  }

  /** Listet alle DocumentFolder. */
  async getDocumentFolders(): Promise<Array<{ id: string; name: string }>> {
    const res = await this.request<SevdeskListResponse<{ id: string; name: string }>>(
      '/DocumentFolder',
      { limit: 1000 }
    );
    return res.objects ?? [];
  }

  /** Legt einen neuen DocumentFolder an und gibt dessen ID zurück. */
  async createDocumentFolder(name: string): Promise<string> {
    const url = new URL(this.baseUrl + '/DocumentFolder');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': this.userAgent
      },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new SevdeskApiError(res.status, body, url.toString());
    }
    const data = await res.json() as { objects: { id: string } };
    return String(data.objects.id);
  }

  /** Findet den Ordner mit dem Namen oder legt ihn neu an. */
  async findOrCreateDocumentFolder(name: string): Promise<{ id: string; created: boolean }> {
    const folders = await this.getDocumentFolders();
    const existing = folders.find(f => f.name === name);
    if (existing) return { id: existing.id, created: false };
    const newId = await this.createDocumentFolder(name);
    return { id: newId, created: true };
  }

  /**
   * Lädt eine PDF in sevdesk → Dokumente hoch, in den genannten Ordner.
   * Optional verknüpft mit einem Order (Lieferschein).
   */
  async uploadDocument(
    pdfBuffer: Buffer,
    filename: string,
    options: SevdeskDocumentOptions
  ): Promise<SevdeskDocumentUploadResult> {
    const folder = await this.findOrCreateDocumentFolder(options.folderName);

    const url = new URL(this.baseUrl + '/Document/Factory/fileUpload');
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });

    // sevdesk erwartet Plural-Feldname für die Datei
    formData.append('files', blob, filename);

    // PHP-Array-Notation für strukturierte Felder
    formData.append('folder[id]', folder.id);
    formData.append('folder[objectName]', 'DocumentFolder');

    if (options.linkedOrderId) {
      formData.append('object[id]', options.linkedOrderId);
      formData.append('object[objectName]', 'Order');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.token,
        Accept: 'application/json',
        'User-Agent': this.userAgent
      },
      body: formData
    });

    if (!res.ok) {
      const body = await res.text();
      throw new SevdeskApiError(res.status, body, url.toString());
    }

    const rawText = await res.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`sevdesk lieferte nicht-JSON-Antwort: ${rawText.slice(0, 200)}`);
    }

    // sevdesk Document/Factory/fileUpload Response-Format ist inkonsistent dokumentiert
    // Möglichkeiten: { objects: { id } } | { objects: [{ id }] } | { objects: { document: { id } } }
    const documentId =
      data?.objects?.id ??
      data?.objects?.[0]?.id ??
      data?.objects?.document?.id ??
      data?.objects?.documents?.[0]?.id ??
      null;

    if (!documentId) {
      // Wenn wir die ID nicht extrahieren können, hilft uns die Roh-Antwort
      throw new Error(
        `Upload erfolgreich, aber DocumentId nicht in Response gefunden. Raw: ${rawText.slice(0, 500)}`
      );
    }

    return {
      documentId: String(documentId),
      folderId: folder.id,
      folderName: options.folderName
    };
  }

  /** Löscht einen Voucher (Belege-Aufräumen). */
  async deleteVoucher(voucherId: string): Promise<void> {
    const url = new URL(this.baseUrl + `/Voucher/${voucherId}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: this.token,
        Accept: 'application/json',
        'User-Agent': this.userAgent
      }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new SevdeskApiError(res.status, body, url.toString());
    }
  }
}

export function createSevdeskClient(): SevdeskClient {
  const token = process.env.SEVDESK_API_TOKEN;
  const baseUrl = process.env.SEVDESK_API_URL;
  if (!token) {
    throw new Error('SEVDESK_API_TOKEN environment variable is not set');
  }
  return new SevdeskClient(token, baseUrl);
}