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
        Authorization: this.token,        // sevdesk braucht KEIN "Bearer "-Präfix
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

  /** Lieferscheine listen (Orders mit orderType=LI). */
  async getDeliveryNotes(limit = 50, offset = 0): Promise<SevdeskOrder[]> {
    const res = await this.request<SevdeskListResponse<SevdeskOrder>>(
      '/Order',
      { orderType: 'LI', limit, offset }
    );
    return res.objects;
  }

  /** Alle Positionen eines Auftrags. */
  async getOrderPositions(orderId: string): Promise<SevdeskOrderPos[]> {
    const res = await this.request<SevdeskListResponse<SevdeskOrderPos>>(
      `/Order/${orderId}/getPositions`
    );
    return res.objects;
  }

  /** Einzelnen Kontakt holen. */
  async getContact(contactId: string): Promise<SevdeskContact | null> {
    const res = await this.request<SevdeskListResponse<SevdeskContact>>(
      `/Contact/${contactId}`
    );
    return res.objects[0] ?? null;
  }
}

/** Client aus Environment-Variablen erstellen. */
export function createSevdeskClient(): SevdeskClient {
  const token = process.env.SEVDESK_API_TOKEN;
  const baseUrl = process.env.SEVDESK_API_URL;
  if (!token) {
    throw new Error('SEVDESK_API_TOKEN environment variable is not set');
  }
  return new SevdeskClient(token, baseUrl);
}