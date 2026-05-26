import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { promises as fs } from 'node:fs';
import { UserRole, DokuStatus } from '@prisma/client';
import { ensurePdfDir, pdfPath, deletePdfFile } from '../lib/fileStorage';
import { generatePdf, PdfData } from '../lib/pdfGenerator';

const ALLOWED_STATUSES = [
  DokuStatus.UNTERSCHRIEBEN,
  DokuStatus.VERSENDET,
  DokuStatus.SEVDESK_HOCHGELADEN
];

const pdfRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // POST: PDF (neu) generieren
  fastify.post('/dokumentationen/:id/pdf', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id },
      include: {
        vorarbeiter: { select: { name: true, email: true } },
        auftrag: {
          include: {
            positions: {
              orderBy: { sevdeskPosNumber: 'asc' },
              include: {
                verbautVon: { select: { name: true } },
                abnahmen: {
                  orderBy: { signedAt: 'asc' },
                  select: { signerName: true, signedAt: true, typ: true }
                }
              }
            }
          }
        },
        fotos: { orderBy: { uploadedAt: 'asc' } },
        unterschriften: { orderBy: { signedAt: 'asc' } }
      }
    });

    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });

    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!ALLOWED_STATUSES.includes(doku.status)) {
      return reply.code(400).send({
        error: `Doku muss im Status UNTERSCHRIEBEN (oder später) sein. Aktuell: ${doku.status}`
      });
    }

    await ensurePdfDir();
    const outputPath = pdfPath(id);

    try {
      await generatePdf(doku as unknown as PdfData, outputPath);
    } catch (e) {
      request.log.error(e);
      return reply.code(500).send({
        error: 'PDF-Generierung fehlgeschlagen',
        message: e instanceof Error ? e.message : String(e)
      });
    }

    await fastify.prisma.dokumentation.update({
      where: { id },
      data: { pdfPath: outputPath }
    });

    const stat = await fs.stat(outputPath);
    return {
      success: true,
      url: `/dokumentationen/${id}/pdf`,
      sizeKb: Math.round(stat.size / 1024),
      generatedAt: new Date()
    };
  });

  // GET: PDF herunterladen
  fastify.get('/dokumentationen/:id/pdf', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id },
      select: { pdfPath: true, vorarbeiterId: true, auftrag: { select: { sevdeskOrderNumber: true } } }
    });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });

    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!doku.pdfPath) {
      return reply.code(404).send({
        error: 'PDF noch nicht generiert. POST auf denselben Endpoint zum Erzeugen.'
      });
    }

    try {
      const data = await fs.readFile(doku.pdfPath);
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `inline; filename="Lieferschein_${doku.auftrag.sevdeskOrderNumber}.pdf"`)
        .send(data);
    } catch {
      return reply.code(404).send({ error: 'PDF-Datei nicht auf Disk vorhanden' });
    }
  });

  // DELETE: PDF entfernen
  fastify.delete('/dokumentationen/:id/pdf', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const doku = await fastify.prisma.dokumentation.findUnique({ where: { id } });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });

    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    await deletePdfFile(id);
    await fastify.prisma.dokumentation.update({
      where: { id }, data: { pdfPath: null }
    });

    return { success: true, message: 'PDF gelöscht' };
  });
};

export default pdfRoutes;