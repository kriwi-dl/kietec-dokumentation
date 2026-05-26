import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuftragStatus } from '@prisma/client';
import { z } from 'zod';

const updatePositionSchema = z.object({
  verbaut: z.boolean().optional(),
  serialNumbers: z.array(z.string().max(200)).max(500).optional(),
  bemerkung: z.string().max(2000).optional().nullable()
});

const positionenRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.patch('/positionen/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updatePositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const position = await fastify.prisma.position.findUnique({
      where: { id },
      include: { auftrag: true }
    });
    if (!position) return reply.code(404).send({ error: 'Position not found' });
    if (position.auftrag.status === AuftragStatus.ABGESCHLOSSEN || position.auftrag.status === AuftragStatus.STORNIERT) {
      return reply.code(400).send({
        error: `Auftrag ist ${position.auftrag.status} - keine Änderung möglich`
      });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.serialNumber !== undefined) data.serialNumber = parsed.data.serialNumber;
    if (parsed.data.bemerkung !== undefined) data.bemerkung = parsed.data.bemerkung;
    if (parsed.data.verbaut !== undefined) {
      data.verbaut = parsed.data.verbaut;
      if (parsed.data.verbaut === true && !position.verbaut) {
        data.verbautAm = new Date();
        data.verbautVonId = request.user.id;
      } else if (parsed.data.verbaut === false) {
        data.verbautAm = null;
        data.verbautVonId = null;
      }
    }
    const updated = await fastify.prisma.position.update({
      where: { id }, data,
      include: { verbautVon: { select: { id: true, name: true } } }
    });
    return updated;
  });
};

export default positionenRoutes;