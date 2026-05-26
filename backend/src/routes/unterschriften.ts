import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UserRole, DokuStatus, UnterschriftTyp } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { FINAL_DOKU_STATUSES } from '../lib/dokuStatus';

const createSignatureSchema = z.object({
  typ: z.nativeEnum(UnterschriftTyp),
  signerName: z.string().min(1).max(200),
  signatureData: z.string().min(20).max(700_000)
});

const unterschriftenRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // CREATE
  fastify.post('/dokumentationen/:dokuId/unterschriften', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { dokuId } = request.params as { dokuId: string };
    const parsed = createSignatureSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id: dokuId },
      include: { unterschriften: { select: { typ: true } } }
    });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });
    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_DOKU_STATUSES.includes(doku.status)) {
      return reply.code(400).send({
        error: `Doku ist ${doku.status} - keine Unterschriften mehr möglich`
      });
    }

    // Data-URL-Prefix entfernen falls vorhanden
    let sigBase64 = parsed.data.signatureData;
    const dataUrlMatch = sigBase64.match(/^data:image\/png;base64,(.+)$/);
    if (dataUrlMatch) sigBase64 = dataUrlMatch[1];

    let binary: Buffer;
    try { binary = Buffer.from(sigBase64, 'base64'); }
    catch { return reply.code(400).send({ error: 'signatureData ist kein gültiges Base64' }); }

    if (binary.length < 8 ||
        binary[0] !== 0x89 || binary[1] !== 0x50 ||
        binary[2] !== 0x4E || binary[3] !== 0x47) {
      return reply.code(400).send({
        error: 'signatureData ist kein PNG (PNG-Header fehlt)'
      });
    }

    if (binary.length > config.upload.maxSignatureBytes) {
      return reply.code(400).send({
        error: `signatureData zu groß: ${Math.round(binary.length / 1024)} KB (max ${config.upload.maxSignatureBytes / 1024} KB)`
      });
    }

    const signature = await fastify.prisma.unterschrift.create({
      data: {
        dokumentationId: dokuId,
        typ: parsed.data.typ,
        signerName: parsed.data.signerName.trim(),
        signatureData: sigBase64,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 500) ?? null
      }
    });

    // Auto-Statuswechsel: MONTEUR + KUNDE vorhanden → UNTERSCHRIEBEN
    const allTypen = new Set<string>([
      ...doku.unterschriften.map(u => u.typ),
      parsed.data.typ
    ]);
    const hasMonteurAndKunde =
      allTypen.has(UnterschriftTyp.MONTEUR) && allTypen.has(UnterschriftTyp.KUNDE);

    let statusAdvanced = false;
    if (hasMonteurAndKunde &&
        (doku.status === DokuStatus.IN_ARBEIT || doku.status === DokuStatus.ZUR_UNTERSCHRIFT)) {
      if (doku.status === DokuStatus.IN_ARBEIT) {
        await fastify.prisma.dokumentation.update({
          where: { id: dokuId }, data: { status: DokuStatus.ZUR_UNTERSCHRIFT }
        });
      }
      await fastify.prisma.dokumentation.update({
        where: { id: dokuId },
        data: { status: DokuStatus.UNTERSCHRIEBEN, completedAt: new Date() }
      });
      statusAdvanced = true;
    }

    return reply.code(201).send({
      signature: {
        id: signature.id,
        typ: signature.typ,
        signerName: signature.signerName,
        signedAt: signature.signedAt,
        ipAddress: signature.ipAddress
      },
      url: `/unterschriften/${signature.id}/image`,
      statusAdvanced
    });
  });

  // GET IMAGE
  fastify.get('/unterschriften/:id/image', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sig = await fastify.prisma.unterschrift.findUnique({ where: { id } });
    if (!sig) return reply.code(404).send({ error: 'Unterschrift not found' });
    const binary = Buffer.from(sig.signatureData, 'base64');
    return reply.type('image/png').send(binary);
  });

  // DELETE
  fastify.delete('/unterschriften/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sig = await fastify.prisma.unterschrift.findUnique({
      where: { id }, include: { dokumentation: true }
    });
    if (!sig) return reply.code(404).send({ error: 'Unterschrift not found' });
    if (sig.dokumentation.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_DOKU_STATUSES.includes(sig.dokumentation.status)) {
      return reply.code(400).send({
        error: `Doku ist bereits ${sig.dokumentation.status} - Unterschrift kann nicht gelöscht werden`
      });
    }
    await fastify.prisma.unterschrift.delete({ where: { id } });
    return { success: true, message: 'Unterschrift gelöscht' };
  });
};

export default unterschriftenRoutes;