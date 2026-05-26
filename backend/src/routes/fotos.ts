import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UserRole, DokuStatus, FotoKategorie } from '@prisma/client';
import { promises as fs } from 'node:fs';
import { FINAL_DOKU_STATUSES } from '../lib/dokuStatus';
import {
  ensureDokuDirs,
  generateFilename,
  originalPath,
  thumbnailPath,
  deleteFotoFiles
} from '../lib/fileStorage';
import { processImage } from '../lib/imageProcessor';

const fotosRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // UPLOAD
  fastify.post('/dokumentationen/:dokuId/fotos', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { dokuId } = request.params as { dokuId: string };
    const doku = await fastify.prisma.dokumentation.findUnique({ where: { id: dokuId } });
    if (!doku) return reply.code(404).send({ error: 'Dokumentation not found' });
    if (doku.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_DOKU_STATUSES.includes(doku.status)) {
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

  // GET ORIGINAL
  fastify.get('/fotos/:id/file', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const foto = await fastify.prisma.foto.findUnique({ where: { id } });
    if (!foto) return reply.code(404).send({ error: 'Foto not found' });
    try {
      const data = await fs.readFile(originalPath(foto.dokumentationId, foto.filename));
      return reply.type(foto.mimeType).send(data);
    } catch { return reply.code(404).send({ error: 'File not found on disk' }); }
  });

  // GET THUMBNAIL
  fastify.get('/fotos/:id/thumbnail', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const foto = await fastify.prisma.foto.findUnique({ where: { id } });
    if (!foto) return reply.code(404).send({ error: 'Foto not found' });
    try {
      const data = await fs.readFile(thumbnailPath(foto.dokumentationId, foto.filename));
      return reply.type('image/jpeg').send(data);
    } catch { return reply.code(404).send({ error: 'Thumbnail not found on disk' }); }
  });

  // DELETE
  fastify.delete('/fotos/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const foto = await fastify.prisma.foto.findUnique({
      where: { id }, include: { dokumentation: true }
    });
    if (!foto) return reply.code(404).send({ error: 'Foto not found' });
    if (foto.dokumentation.vorarbeiterId !== request.user.id && request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (FINAL_DOKU_STATUSES.includes(foto.dokumentation.status)) {
      return reply.code(400).send({
        error: `Doku ist bereits ${foto.dokumentation.status} - Foto kann nicht gelöscht werden`
      });
    }
    await deleteFotoFiles(foto.dokumentationId, foto.filename);
    await fastify.prisma.foto.delete({ where: { id } });
    return { success: true, message: 'Foto gelöscht' };
  });
};

export default fotosRoutes;