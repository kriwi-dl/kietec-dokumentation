// TypeScript-Typen für sevdesk API Responses (nur die Felder, die wir brauchen)

export interface SevdeskListResponse<T> {
  objects: T[];
  total?: string;
}

export interface SevdeskContact {
  id: string;
  objectName: 'Contact';
  name?: string | null;          // Organisationsname (Firma)
  surename?: string | null;      // Vorname (bei Privatkunden) - "surename" ist sevdesks Schreibfehler
  familyname?: string | null;    // Nachname
  customerNumber?: string | null;
}

export interface SevdeskOrderContactRef {
  id: string;
  objectName: 'Contact';
}

export interface SevdeskOrder {
  id: string;
  objectName: 'Order';
  create?: string;
  update?: string;
  orderNumber: string;
  orderDate: string;
  status: string;                // "100" | "200" | "300" | "500" | "750" | "1000"
  orderType: 'AN' | 'AB' | 'LI'; // AN=Angebot, AB=Auftragsbestätigung, LI=Lieferschein
  header?: string | null;
  address?: string | null;       // mehrzeilige formatierte Lieferadresse
  contact?: SevdeskOrderContactRef | null;
}

export interface SevdeskOrderPos {
  id: string;
  objectName: 'OrderPos';
  order: { id: string; objectName: 'Order' };
  quantity: string;              // sevdesk liefert Zahlen als Strings
  price?: string | null;
  name?: string | null;
  text?: string | null;
  positionNumber?: string | null;
  unity?: { id: string; objectName: 'Unity' } | null;
}

export interface SevdeskUnity {
  id: string;
  objectName: 'Unity';
  name?: string | null;
  unity?: string | null;
  translationCode?: string | null;
}