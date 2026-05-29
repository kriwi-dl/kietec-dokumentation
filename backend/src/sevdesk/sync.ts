import type { PrismaClient } from '@prisma/client';
import type { SevdeskClient } from './client';
import type { SevdeskContact, SevdeskOrder } from './types';

export interface SyncResult {
  totalSeen: number;
  ordersCreated: number;
  ordersUpdated: number;
  positionsCreated: number;
  positionsUpdated: number;
  errors: Array<{
    sevdeskId: string;
    orderNumber?: string;
    message: string;
  }>;
  durationMs: number;
}

/**
 * Synchronisiert alle Lieferscheine aus sevdesk in die lokale DB.
 * - Lokale Felder wie `status`, `notiz`, `verbaut` werden NIE überschrieben.
 * - Bestehende Einträge werden aktualisiert anhand der sevdeskId.
 */
export async function syncDeliveryNotes(
  prisma: PrismaClient,
  client: SevdeskClient,
  options: { limit?: number } = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    totalSeen: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    positionsCreated: 0,
    positionsUpdated: 0,
    errors: [],
    durationMs: 0
  };

  // Einheiten-Map (Unity-ID → Anzeigename) einmalig laden
  const unitMap = new Map<string, string>();
  try {
    const units = await client.getUnits();
    for (const u of units) {
      const label = (u.name ?? u.unity ?? '').toString().trim();
      if (label) unitMap.set(String(u.id), label);
    }
  } catch {
    // Einheiten nicht ladbar – Sync läuft ohne Einheit weiter
  }

  const pageSize = 50;
  let offset = 0;
  const maxIterations = 50; // Hard-Stop bei 50 * 50 = 2500 Aufträgen

  for (let i = 0; i < maxIterations; i++) {
    let orders: SevdeskOrder[];
    try {
      orders = await client.getDeliveryNotes(pageSize, offset);
    } catch (e) {
      result.errors.push({
        sevdeskId: '(pagination)',
        message: e instanceof Error ? e.message : String(e)
      });
      break;
    }

    if (orders.length === 0) break;

    for (const order of orders) {
      result.totalSeen++;

      if (options.limit && result.totalSeen > options.limit) {
        result.durationMs = Date.now() - startTime;
        return result;
      }

      try {
        await syncSingleOrder(prisma, client, order, result, unitMap);
      } catch (e) {
        result.errors.push({
          sevdeskId: order.id,
          orderNumber: order.orderNumber,
          message: e instanceof Error ? e.message : String(e)
        });
      }
    }

    if (orders.length < pageSize) break;
    offset += pageSize;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

async function syncSingleOrder(
  prisma: PrismaClient,
  client: SevdeskClient,
  order: SevdeskOrder,
  result: SyncResult,
  unitMap: Map<string, string>
) {
  // Kontakt holen (für Kundennamen)
  let customerName = '(Unbekannt)';
  let customerNumber: string | null = null;
  if (order.contact?.id) {
    try {
      const contact = await client.getContact(order.contact.id);
      if (contact) {
        customerName = formatContactName(contact);
        customerNumber = contact.customerNumber ?? null;
      }
    } catch {
      // Kontakt nicht gefunden - mit Platzhalter weitermachen
    }
  }

  const orderDate = order.orderDate ? new Date(order.orderDate) : null;

  // Auftrag-Upsert mit Schutz lokaler Felder
  const existing = await prisma.auftrag.findUnique({
    where: { sevdeskId: order.id }
  });

  let auftragId: string;
  if (existing) {
    const updated = await prisma.auftrag.update({
      where: { id: existing.id },
      data: {
        sevdeskOrderNumber: order.orderNumber,
        sevdeskStatus: order.status,
        customerSevdeskId: order.contact?.id ?? null,
        customerName,
        customerNumber,
        customerAddress: order.address ?? null,
        orderDate,
        syncedAt: new Date()
        // status (AuftragStatus) und notiz werden NICHT überschrieben
      }
    });
    auftragId = updated.id;
    result.ordersUpdated++;
  } else {
    const created = await prisma.auftrag.create({
      data: {
        sevdeskId: order.id,
        sevdeskOrderNumber: order.orderNumber,
        sevdeskOrderType: order.orderType,
        sevdeskStatus: order.status,
        customerSevdeskId: order.contact?.id ?? null,
        customerName,
        customerNumber,
        customerAddress: order.address ?? null,
        orderDate,
        syncedAt: new Date()
      }
    });
    auftragId = created.id;
    result.ordersCreated++;
  }

  // Positionen syncen
  const positions = await client.getOrderPositions(order.id);

  for (const pos of positions) {
    const existingPos = await prisma.position.findUnique({
      where: { sevdeskPosId: pos.id }
    });

    const menge = parseFloat(pos.quantity || '0');
    const einheit = pos.unity?.id ? (unitMap.get(String(pos.unity.id)) ?? null) : null;

    if (existingPos) {
      await prisma.position.update({
        where: { id: existingPos.id },
        data: {
          sevdeskPosNumber: pos.positionNumber ?? null,
          bezeichnung: pos.name ?? existingPos.bezeichnung,
          beschreibung: pos.text ?? null,
          menge,
          einheit
          // verbaut, verbautAm, verbautVon, serialNumbers, bemerkung: nicht anfassen
        }
      });
      result.positionsUpdated++;
    } else {
      await prisma.position.create({
        data: {
          auftragId,
          sevdeskPosId: pos.id,
          sevdeskPosNumber: pos.positionNumber ?? null,
          bezeichnung: pos.name ?? '(unbenannt)',
          beschreibung: pos.text ?? null,
          menge,
          einheit
        }
      });
      result.positionsCreated++;
    }
  }
}

function formatContactName(contact: SevdeskContact): string {
  if (contact.name && contact.name.trim()) return contact.name.trim();
  const parts = [contact.surename, contact.familyname]
    .filter(Boolean)
    .map((s) => s!.trim());
  return parts.length > 0 ? parts.join(' ') : '(Unbekannt)';
}