import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createSevdeskClient, SevdeskApiError } from '../sevdesk/client';
import { syncDeliveryNotes } from '../sevdesk/sync';

const syncQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional()
});

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
          success: false,
          statusCode: e.statusCode,
          url: e.url,
          bodyPreview: e.bodyText.slice(0, 300)
        });
      }
      return reply.code(500).send({
        success: false,
        message: e instanceof Error ? e.message : String(e)
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
          error: 'sevdesk API error',
          statusCode: e.statusCode,
          url: e.url,
          bodyPreview: e.bodyText.slice(0, 300)
        });
      }
      request.log.error(e);
      return reply.code(500).send({
        error: 'Internal error',
        message: e instanceof Error ? e.message : String(e)
      });
    }
  });
};

export default syncRoutes;