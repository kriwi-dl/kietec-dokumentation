import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSevdeskClient, SevdeskApiError } from './sevdesk/client';
import { syncDeliveryNotes } from './sevdesk/sync';

export async function registerAllInlineRoutes(fastify: FastifyInstance) {

  // ============================================================
  // PUBLIC ROUTES
  // ============================================================

  fastify.get('/', async () => ({
    name: 'KieTec Dokumentations-API',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      login: 'POST /auth/login',
      me: 'GET /auth/me (Bearer)',
      users: 'GET /users (Bearer)',
      auftraegeList: 'GET /auftraege (Bearer)',
      auftragDetail: 'GET /auftraege/:id (Bearer)',
      dokuCreate: 'POST /auftraege/:id/dokumentationen (Bearer)',
      dokuList: 'GET /dokumentationen (Bearer)',
      dokuDetail: 'GET /dokumentationen/:id (Bearer)',
      dokuUpdate: 'PATCH /dokumentationen/:id (Bearer)',
      dokuDelete: 'DELETE /dokumentationen/:id (Bearer)',
      positionUpdate: 'PATCH /positionen/:id (Bearer)',
      fotoUpload: 'POST /dokumentationen/:dokuId/fotos (Bearer, multipart)',
      fotoOriginal: 'GET /fotos/:id/file (Bearer)',
      fotoThumb: 'GET /fotos/:id/thumbnail (Bearer)',
      fotoDelete: 'DELETE /fotos/:id (Bearer)',
      sigCreate: 'POST /dokumentationen/:dokuId/unterschriften (Bearer)',
      sigImage: 'GET /unterschriften/:id/image (Bearer)',
      sigDelete: 'DELETE /unterschriften/:id (Bearer)',
      sevdeskTest: 'GET /sync/sevdesk/test (Admin)',
      sevdeskSync: 'POST /sync/sevdesk (Admin)'
    }
  }));

  fastify.get('/health', async () => {
    let dbStatus = 'unknown';
    try { await fastify.prisma.$queryRaw`SELECT 1`; dbStatus = 'connected'; }
    catch { dbStatus = 'error'; }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'kietec-backend',
      version: '0.1.0',
      uptime: process.uptime(),
      database: dbStatus
    };
  });

  // ============================================================
  // SEVDESK SYNC
  // ============================================================

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

  const syncQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(1000).optional()
  });

  fastify.post('/sync/sevdesk', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!fastify.requireAdmin(request, reply)) return;
    const parsed = syncQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues });
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
}