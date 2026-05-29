import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UserRole, DokuStatus, UnterschriftTyp, AuftragStatus } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { FINAL_DOKU_STATUSES } from '../lib/dokuStatus';

const createSignatureSchema = z.object({
  typ: z.nativeEnum(UnterschriftTyp),
  signerName: z.string().min(1).max(200),
  signatureData: z.string().min(20).max(700_000),
  positionId: z.string().optional()
});

const unterschriftenRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.post('/dokumentationen/:dokuId/unterschriften', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { dokuId } = request.params as { dokuId: string };
    const parsed = createSignatureSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id: dokuId },
      include: { unterschriften: { select: { typ: true, positionId: true } } }
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

    if (parsed.data.positionId) {
      const pos = await fastify.prisma.position.findFirst({
        where: { id: parsed.data.positionId, auftragId: doku.auftragId }
      });
      if (!pos) {
        return reply.code(400).send({ error: 'Position gehört nicht zu diesem Auftrag' });
      }
    }

    let sigBase64 = parsed.data.signatureData;
    const dataUrlMatch = sigBase64.match(/^data:image\/png;base64,(.+)$/);
    if (dataUrlMatch) sigBase64 = dataUrlMatch[1];

    let binary: Buffer;
    try { binary = Buffer.from(sigBase64, 'base64'); }
    catch { return reply.code(400).send({ error: 'signatureData ist kein gültiges Base64' }); }

    if (binary.length < 8 ||
        binary[0] !== 0x89 || binary[1] !== 0x50 ||
        binary[2] !== 0x4E || binary[3] !== 0x47) {
      return reply.code(400).send({ error: 'signatureData ist kein PNG (PNG-Header fehlt)' });
    }
    if (binary.length > config.upload.maxSignatureBytes) {
      return reply.code(400).send({
        error: `signatureData zu groß: ${Math.round(binary.length / 1024)} KB (max ${config.upload.maxSignatureBytes / 1024} KB)`
      });
    }

    const signature = await fastify.prisma.unterschrift.create({
      data: {
        dokumentationId: dokuId,
        positionId: parsed.data.positionId ?? null,
        typ: parsed.data.typ,
        signerName: parsed.data.signerName.trim(),
        signatureData: sigBase64,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 500) ?? null
      }
    });

    const isTeilabnahme = !!parsed.data.positionId;
    let statusAdvanced = false;

    // Schluss-Status-Logik: MONTEUR + KUNDE auf Doku-Level → Doku UNTERSCHRIEBEN
    // Funktioniert aus jedem nicht-finalen Status (ENTWURF, IN_ARBEIT, ZUR_UNTERSCHRIFT)
    if (!isTeilabnahme && !FINAL_DOKU_STATUSES.includes(doku.status)) {
      const docLevelTypen = new Set<string>([
        ...doku.unterschriften.filter(u => u.positionId === null).map(u => u.typ),
        parsed.data.typ
      ]);
      const hasMonteurAndKunde =
        docLevelTypen.has(UnterschriftTyp.MONTEUR) && docLevelTypen.has(UnterschriftTyp.KUNDE);

      if (hasMonteurAndKunde) {
        await fastify.prisma.dokumentation.update({
          where: { id: dokuId },
          data: { status: DokuStatus.UNTERSCHRIEBEN, completedAt: new Date() }
        });
        // Auftrag auf DOKUMENTIERT ("Fertig") setzen – nur aus aktiven Status,
        // damit ABGESCHLOSSEN/STORNIERT nicht zurückgesetzt werden
        await fastify.prisma.auftrag.updateMany({
          where: {
            id: doku.auftragId,
            status: { in: [AuftragStatus.OFFEN, AuftragStatus.ZUGEWIESEN, AuftragStatus.IN_BEARBEITUNG] }
          },
          data: { status: AuftragStatus.DOKUMENTIERT }
        });
        statusAdvanced = true;
      }
    }

    return reply.code(201).send({
      signature: {
        id: signature.id,
        typ: signature.typ,
        signerName: signature.signerName,
        signedAt: signature.signedAt,
        ipAddress: signature.ipAddress,
        positionId: signature.positionId,
        isTeilabnahme
      },
      url: `/unterschriften/${signature.id}/image`,
      statusAdvanced
    });
  });

  fastify.get('/unterschriften/:id/image', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sig = await fastify.prisma.unterschrift.findUnique({ where: { id } });
    if (!sig) return reply.code(404).send({ error: 'Unterschrift not found' });
    const binary = Buffer.from(sig.signatureData, 'base64');
    return reply.type('image/png').send(binary);
  });

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