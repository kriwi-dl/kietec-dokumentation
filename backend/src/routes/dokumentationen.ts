import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UserRole, AuftragStatus, DokuStatus } from '@prisma/client';
import { z } from 'zod';
import {
  FINAL_DOKU_STATUSES,
  isValidDokuStatusTransition
} from '../lib/dokuStatus';

const createDokuSchema = z.object({
  wetter: z.string().max(200).optional(),
  bemerkung: z.string().max(5000).optional()
});

const dokuListQuerySchema = z.object({
  status: z.nativeEnum(DokuStatus).optional(),
  auftragId: z.string().optional(),
  mine: z.enum(['true', 'false']).optional()
});

const updateDokuSchema = z.object({
  wetter: z.string().max(200).optional(),
  bemerkung: z.string().max(5000).optional(),
  arbeitsstunden: z.number().nonnegative().max(24).optional(),
  status: z.nativeEnum(DokuStatus).optional()
});

const dokumentationenRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // CREATE
  fastify.post('/auftraege/:id/dokumentationen', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createDokuSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const auftrag = await fastify.prisma.auftrag.findUnique({ where: { id } });
    if (!auftrag) return reply.code(404).send({ error: 'Auftrag not found' });
    if (auftrag.status === AuftragStatus.ABGESCHLOSSEN || auftrag.status === AuftragStatus.STORNIERT) {
      return reply.code(400).send({
        error: `Auftrag hat Status ${auftrag.status} - keine neue Dokumentation möglich`
      });
    }
    const dokumentation = await fastify.prisma.dokumentation.create({
      data: {
        auftragId: id,
        vorarbeiterId: request.user.id,
        wetter: parsed.data.wetter,
        bemerkung: parsed.data.bemerkung,
        status: DokuStatus.ENTWURF
      },
      include: { vorarbeiter: { select: { id: true, name: true, email: true } } }
    });
    if (auftrag.status === AuftragStatus.OFFEN || auftrag.status === AuftragStatus.ZUGEWIESEN) {
      await fastify.prisma.auftrag.update({
        where: { id },
        data: { status: AuftragStatus.IN_BEARBEITUNG }
      });
    }
    return reply.code(201).send(dokumentation);
  });

  // LIST
  fastify.get('/dokumentationen', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = dokuListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues });
    }
    const where: Record<string, unknown> = {};
    if (parsed.data.status) where.status = parsed.data.status;
    if (parsed.data.auftragId) where.auftragId = parsed.data.auftragId;
    if (parsed.data.mine === 'true') where.vorarbeiterId = request.user.id;
    const dokumentationen = await fastify.prisma.dokumentation.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        vorarbeiter: { select: { id: true, name: true } },
        auftrag: { select: { id: true, sevdeskOrderNumber: true, customerName: true } },
        _count: { select: { fotos: true, unterschriften: true } }
      }
    });
    return { count: dokumentationen.length, dokumentationen };
  });

  // DETAIL
  fastify.get('/dokumentationen/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const dokumentation = await fastify.prisma.dokumentation.findUnique({
      where: { id },
      include: {
        vorarbeiter: { select: { id: true, name: true, email: true } },
        auftrag: {
          include: {
            positions: {
              orderBy: { sevdeskPosNumber: 'asc' },
              include: { verbautVon: { select: { id: true, name: true } } }
            }
          }
        },
        fotos: { orderBy: { uploadedAt: 'desc' } },
        unterschriften: {
          orderBy: { signedAt: 'asc' },
          select: {
            id: true, typ: true, signerName: true, signedAt: true,
            ipAddress: true, userAgent: true
          }
        }
      }
    });
    if (!dokumentation) return reply.code(404).send({ error: 'Dokumentation not found' });
    return dokumentation;
  });

  // UPDATE
  fastify.patch('/dokumentationen/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateDokuSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }
    const existing = await fastify.prisma.dokumentation.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Dokumentation not found' });
    if (existing.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden – nicht eigene Doku und nicht Admin' });
    }
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status && parsed.data.status !== existing.status) {
      if (!isValidDokuStatusTransition(existing.status, parsed.data.status)) {
        return reply.code(400).send({
          error: `Status-Übergang von ${existing.status} → ${parsed.data.status} nicht erlaubt`
        });
      }
      if (FINAL_DOKU_STATUSES.includes(parsed.data.status) && !existing.completedAt) {
        data.completedAt = new Date();
      }
    }
    const updated = await fastify.prisma.dokumentation.update({
      where: { id }, data,
      include: { vorarbeiter: { select: { id: true, name: true, email: true } } }
    });
    return updated;
  });

  // DELETE
  fastify.delete('/dokumentationen/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await fastify.prisma.dokumentation.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Dokumentation not found' });
    if (existing.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (existing.status !== DokuStatus.ENTWURF && existing.status !== DokuStatus.IN_ARBEIT) {
      return reply.code(400).send({
        error: `Dokumentation kann nur im Status ENTWURF/IN_ARBEIT gelöscht werden (aktuell: ${existing.status})`
      });
    }
    await fastify.prisma.dokumentation.delete({ where: { id } });
    return { success: true, message: 'Dokumentation gelöscht' };
  });
};

export default dokumentationenRoutes;