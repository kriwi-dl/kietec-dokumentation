import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'node:fs';
import { UserRole, DokuStatus } from '@prisma/client';
import { z } from 'zod';
import { createSevdeskClient, SevdeskApiError } from '../sevdesk/client';
import { syncDeliveryNotes } from '../sevdesk/sync';

const syncQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional()
});

const FOLDER_NAME = 'Dokumentationen';

const syncRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.get('/sync/sevdesk/test', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!fastify.requireAdmin(request, reply)) return;
    try {
      const client = createSevdeskClient();
      const orders = await client.getDeliveryNotes(1, 0);
      return {
        success: true,
        message: 'sevdesk API erreichbar',
        sampleOrderFound: orders.length > 0,
        sampleOrderNumber: orders[0]?.orderNumber ?? null,
        sampleOrderId: orders[0]?.id ?? null
      };
    } catch (e) {
      if (e instanceof SevdeskApiError) {
        return reply.code(502).send({
          success: false, statusCode: e.statusCode, url: e.url,
          bodyPreview: e.bodyText.slice(0, 300)
        });
      }
      return reply.code(500).send({
        success: false, message: e instanceof Error ? e.message : String(e)
      });
    }
  });

  fastify.post('/sync/sevdesk', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!fastify.requireAdmin(request, reply)) return;
    const parsed = syncQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues });
    }
    try {
      const client = createSevdeskClient();
      const result = await syncDeliveryNotes(fastify.prisma, client, parsed.data);
      return result;
    } catch (e) {
      if (e instanceof SevdeskApiError) {
        return reply.code(502).send({
          error: 'sevdesk API error', statusCode: e.statusCode, url: e.url,
          bodyPreview: e.bodyText.slice(0, 300)
        });
      }
      request.log.error(e);
      return reply.code(500).send({
        error: 'Internal error', message: e instanceof Error ? e.message : String(e)
      });
    }
  });

  // PDF einer Doku in sevdesk → Dokumente → "Dokumentationen" hochladen
  fastify.post('/dokumentationen/:id/sevdesk-upload', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id },
      include: { auftrag: true }
    });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });

    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (doku.status !== DokuStatus.UNTERSCHRIEBEN &&
        doku.status !== DokuStatus.VERSENDET &&
        doku.status !== DokuStatus.SEVDESK_HOCHGELADEN) {
      return reply.code(400).send({
        error: `Doku muss UNTERSCHRIEBEN/VERSENDET sein. Aktuell: ${doku.status}`
      });
    }

    if (!doku.pdfPath) {
      return reply.code(400).send({
        error: 'Kein PDF generiert. Zuerst POST /dokumentationen/:id/pdf aufrufen.'
      });
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fs.readFile(doku.pdfPath);
    } catch {
      return reply.code(500).send({ error: 'PDF-Datei nicht lesbar' });
    }

    try {
      const client = createSevdeskClient();
      const result = await client.uploadDocument(
        pdfBuffer,
        `Lieferschein_${doku.auftrag.sevdeskOrderNumber}.pdf`,
        {
          folderName: FOLDER_NAME,
          linkedOrderId: doku.auftrag.sevdeskOrderId ?? undefined
        }
      );

      const updateData: Record<string, unknown> = {
        sevdeskVoucherId: result.documentId  // Feld behält Namen, speichert jetzt aber DocumentId
      };
      if (doku.status !== DokuStatus.SEVDESK_HOCHGELADEN) {
        updateData.status = DokuStatus.SEVDESK_HOCHGELADEN;
      }
      await fastify.prisma.dokumentation.update({
        where: { id },
        data: updateData
      });

      return {
        success: true,
        documentId: result.documentId,
        folderName: result.folderName,
        folderId: result.folderId,
        linkedOrderId: doku.auftrag.sevdeskOrderId ?? null,
        statusAdvanced: doku.status !== DokuStatus.SEVDESK_HOCHGELADEN,
        uploadedAt: new Date()
      };
    } catch (e) {
      if (e instanceof SevdeskApiError) {
        request.log.error(e);
        return reply.code(502).send({
          error: 'sevdesk-Upload fehlgeschlagen',
          statusCode: e.statusCode,
          url: e.url,
          bodyPreview: e.bodyText.slice(0, 500)
        });
      }
      request.log.error(e);
      return reply.code(500).send({
        error: 'Internal error',
        message: e instanceof Error ? e.message : String(e)
      });
    }
  });

  // Aufräum-Endpoint: einzelnen Voucher in sevdesk löschen (Admin)
  fastify.delete('/sync/sevdesk/voucher/:voucherId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!fastify.requireAdmin(request, reply)) return;
    const { voucherId } = request.params as { voucherId: string };
    try {
      const client = createSevdeskClient();
      await client.deleteVoucher(voucherId);
      return { success: true, message: `Voucher ${voucherId} gelöscht` };
    } catch (e) {
      if (e instanceof SevdeskApiError) {
        return reply.code(502).send({
          error: 'Voucher-Löschung fehlgeschlagen',
          statusCode: e.statusCode,
          bodyPreview: e.bodyText.slice(0, 300)
        });
      }
      return reply.code(500).send({
        error: 'Internal error',
        message: e instanceof Error ? e.message : String(e)
      });
    }
  });
};

export default syncRoutes;