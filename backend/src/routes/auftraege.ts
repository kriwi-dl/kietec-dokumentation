import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuftragStatus } from '@prisma/client';
import { z } from 'zod';

const auftragQuerySchema = z.object({
  status: z.nativeEnum(AuftragStatus).optional()
});

const auftraegeRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.get('/auftraege', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = auftragQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues });
    }
    const where = parsed.data.status ? { status: parsed.data.status } : {};
    const auftraege = await fastify.prisma.auftrag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { positions: true, dokumentationen: true } } }
    });
    return { count: auftraege.length, auftraege };
  });

  fastify.get('/auftraege/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const auftrag = await fastify.prisma.auftrag.findUnique({
      where: { id },
      include: {
        positions: { orderBy: { sevdeskPosNumber: 'asc' } },
        dokumentationen: {
          orderBy: { startedAt: 'desc' },
          include: {
            vorarbeiter: { select: { id: true, name: true, email: true } },
            _count: { select: { fotos: true, unterschriften: true } }
          }
        }
      }
    });
    if (!auftrag) return reply.code(404).send({ error: 'Auftrag not found' });
    return auftrag;
  });
};

export default auftraegeRoutes;