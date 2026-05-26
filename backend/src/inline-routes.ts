import { FastifyInstance } from 'fastify';
import {
  UserRole, DokuStatus, FotoKategorie, UnterschriftTyp
} from '@prisma/client';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { config } from './config';
import { FINAL_DOKU_STATUSES } from './lib/dokuStatus';
import { createSevdeskClient, SevdeskApiError } from './sevdesk/client';
import { syncDeliveryNotes } from './sevdesk/sync';
import {
  ensureDokuDirs, generateFilename, originalPath, thumbnailPath, deleteFotoFiles
} from './lib/fileStorage';
import { processImage } from './lib/imageProcessor';

const FINAL_STATUSES = FINAL_DOKU_STATUSES;

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
  // FOTOS
  // ============================================================

  fastify.post('/dokumentationen/:dokuId/fotos', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { dokuId } = request.params as { dokuId: string };
    const doku = await fastify.prisma.dokumentation.findUnique({ where: { id: dokuId } });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });
    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_STATUSES.includes(doku.status)) {
      return reply.code(400).send({ error: `Doku ist ${doku.status} - keine Foto-Uploads mehr möglich` });
    }

    let fileBuffer: Buffer | null = null;
    let originalFilename = 'upload.jpg';
    let kategorie: FotoKategorie = FotoKategorie.FORTSCHRITT;
    let beschreibung: string | undefined;
    let positionId: string | undefined;

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (!part.mimetype.startsWith('image/')) {
            return reply.code(400).send({ error: `Datei ist kein Bild (mimetype: ${part.mimetype})` });
          }
          fileBuffer = await part.toBuffer();
          originalFilename = part.filename ?? 'upload.jpg';
        } else {
          const value = String(part.value);
          if (part.fieldname === 'kategorie' && Object.values(FotoKategorie).includes(value as FotoKategorie)) {
            kategorie = value as FotoKategorie;
          } else if (part.fieldname === 'beschreibung') beschreibung = value;
          else if (part.fieldname === 'positionId') positionId = value;
        }
      }
    } catch (e) {
      return reply.code(400).send({
        error: 'Multipart-Parsing fehlgeschlagen',
        message: e instanceof Error ? e.message : String(e)
      });
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'Keine Datei im Upload gefunden (Feldname muss "file" sein)' });
    }

    if (positionId) {
      const pos = await fastify.prisma.position.findFirst({
        where: { id: positionId, auftragId: doku.auftragId }
      });
      if (!pos) return reply.code(400).send({ error: 'Position gehört nicht zu diesem Auftrag' });
    }

    await ensureDokuDirs(dokuId);
    const filename = generateFilename();
    const origPath = originalPath(dokuId, filename);
    const thumbPath = thumbnailPath(dokuId, filename);

    let meta;
    try { meta = await processImage(fileBuffer, origPath, thumbPath); }
    catch (e) {
      await deleteFotoFiles(dokuId, filename);
      return reply.code(500).send({
        error: 'Bildverarbeitung fehlgeschlagen',
        message: e instanceof Error ? e.message : String(e)
      });
    }

    const foto = await fastify.prisma.foto.create({
      data: {
        dokumentationId: dokuId,
        positionId: positionId ?? null,
        filename,
        originalFilename,
        mimeType: 'image/jpeg',
        fileSize: meta.fileSize,
        width: meta.width,
        height: meta.height,
        kategorie,
        beschreibung,
        latitude: meta.latitude ?? null,
        longitude: meta.longitude ?? null,
        takenAt: meta.takenAt ?? null
      }
    });

    if (doku.status === DokuStatus.ENTWURF) {
      await fastify.prisma.dokumentation.update({
        where: { id: dokuId }, data: { status: DokuStatus.IN_ARBEIT }
      });
    }

    return reply.code(201).send({
      foto,
      urls: {
        original: `/fotos/${foto.id}/file`,
        thumbnail: `/fotos/${foto.id}/thumbnail`
      }
    });
  });

  fastify.get('/fotos/:id/file', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const foto = await fastify.prisma.foto.findUnique({ where: { id } });
    if (!foto) return reply.code(404).send({ error: 'Foto not found' });
    try {
      const data = await fs.readFile(originalPath(foto.dokumentationId, foto.filename));
      return reply.type(foto.mimeType).send(data);
    } catch { return reply.code(404).send({ error: 'File not found on disk' }); }
  });

  fastify.get('/fotos/:id/thumbnail', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const foto = await fastify.prisma.foto.findUnique({ where: { id } });
    if (!foto) return reply.code(404).send({ error: 'Foto not found' });
    try {
      const data = await fs.readFile(thumbnailPath(foto.dokumentationId, foto.filename));
      return reply.type('image/jpeg').send(data);
    } catch { return reply.code(404).send({ error: 'Thumbnail not found on disk' }); }
  });

  fastify.delete('/fotos/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const foto = await fastify.prisma.foto.findUnique({
      where: { id }, include: { dokumentation: true }
    });
    if (!foto) return reply.code(404).send({ error: 'Foto not found' });
    if (foto.dokumentation.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_STATUSES.includes(foto.dokumentation.status)) {
      return reply.code(400).send({
        error: `Doku ist bereits ${foto.dokumentation.status} - Foto kann nicht gelöscht werden`
      });
    }
    await deleteFotoFiles(foto.dokumentationId, foto.filename);
    await fastify.prisma.foto.delete({ where: { id } });
    return { success: true, message: 'Foto gelöscht' };
  });

  // ============================================================
  // UNTERSCHRIFTEN
  // ============================================================

  const createSignatureSchema = z.object({
    typ: z.nativeEnum(UnterschriftTyp),
    signerName: z.string().min(1).max(200),
    signatureData: z.string().min(20).max(700_000)
  });

  fastify.post('/dokumentationen/:dokuId/unterschriften', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { dokuId } = request.params as { dokuId: string };
    const parsed = createSignatureSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });

    const doku = await fastify.prisma.dokumentation.findUnique({
      where: { id: dokuId },
      include: { unterschriften: { select: { typ: true } } }
    });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });

    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_STATUSES.includes(doku.status)) {
      return reply.code(400).send({
        error: `Doku ist ${doku.status} - keine Unterschriften mehr möglich`
      });
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
    if (FINAL_STATUSES.includes(sig.dokumentation.status)) {
      return reply.code(400).send({
        error: `Doku ist bereits ${sig.dokumentation.status} - Unterschrift kann nicht gelöscht werden`
      });
    }
    await fastify.prisma.unterschrift.delete({ where: { id } });
    return { success: true, message: 'Unterschrift gelöscht' };
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