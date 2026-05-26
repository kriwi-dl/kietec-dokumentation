import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { PrismaClient, UserRole, AuftragStatus, DokuStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import 'dotenv/config';
import { createSevdeskClient, SevdeskApiError } from './sevdesk/client';
import { syncDeliveryNotes } from './sevdesk/sync';

// ============================================================
// SETUP
// ============================================================

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' }
});

const prisma = new PrismaClient({ log: ['warn', 'error'] });

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: UserRole };
    user: { id: string; email: string; role: UserRole };
  }
}

fastify.decorate('prisma', prisma);

// ============================================================
// PLUGINS
// ============================================================

await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  credentials: true
});
await fastify.register(jwt, { secret: JWT_SECRET });

fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
  }
});

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.role !== UserRole.ADMIN) {
    reply.code(403).send({ error: 'Forbidden', message: 'Admin role required' });
    return false;
  }
  return true;
}

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
    sevdeskTest: 'GET /sync/sevdesk/test (Admin)',
    sevdeskSync: 'POST /sync/sevdesk (Admin)'
  }
}));

fastify.get('/health', async () => {
  let dbStatus = 'unknown';
  try {
    await fastify.prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }
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
// AUTH
// ============================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

fastify.post('/auth/login', async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
  }
  const { email, password } = parsed.data;
  const user = await fastify.prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }
  const token = fastify.jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    { expiresIn: '8h' }
  );
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  };
});

fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  const user = await fastify.prisma.user.findUnique({
    where: { id: request.user.id },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }
  });
  if (!user) return reply.code(404).send({ error: 'User not found' });
  return user;
});

// ============================================================
// USERS
// ============================================================

fastify.get('/users', { onRequest: [fastify.authenticate] }, async () => {
  const users = await fastify.prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  return { count: users.length, users };
});

// ============================================================
// AUFTRAEGE
// ============================================================

const auftragQuerySchema = z.object({
  status: z.nativeEnum(AuftragStatus).optional()
});

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

// ============================================================
// DOKUMENTATIONEN
// ============================================================

// Erlaubte Status-Übergänge
function isValidStatusTransition(from: DokuStatus, to: DokuStatus): boolean {
  const transitions: Record<DokuStatus, DokuStatus[]> = {
    ENTWURF:             [DokuStatus.IN_ARBEIT],
    IN_ARBEIT:           [DokuStatus.ZUR_UNTERSCHRIFT],
    ZUR_UNTERSCHRIFT:    [DokuStatus.IN_ARBEIT, DokuStatus.UNTERSCHRIEBEN],
    UNTERSCHRIEBEN:      [DokuStatus.VERSENDET],
    VERSENDET:           [DokuStatus.SEVDESK_HOCHGELADEN],
    SEVDESK_HOCHGELADEN: []
  };
  return transitions[from]?.includes(to) ?? false;
}

const createDokuSchema = z.object({
  wetter: z.string().max(200).optional(),
  bemerkung: z.string().max(5000).optional()
});

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
    include: {
      vorarbeiter: { select: { id: true, name: true, email: true } }
    }
  });

  // Auftrag-Status hochsetzen
  if (auftrag.status === AuftragStatus.OFFEN || auftrag.status === AuftragStatus.ZUGEWIESEN) {
    await fastify.prisma.auftrag.update({
      where: { id },
      data: { status: AuftragStatus.IN_BEARBEITUNG }
    });
  }

  return reply.code(201).send(dokumentation);
});

const dokuListQuerySchema = z.object({
  status: z.nativeEnum(DokuStatus).optional(),
  auftragId: z.string().optional(),
  mine: z.enum(['true', 'false']).optional()
});

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
      unterschriften: { orderBy: { signedAt: 'asc' } }
    }
  });
  if (!dokumentation) return reply.code(404).send({ error: 'Dokumentation not found' });
  return dokumentation;
});

const updateDokuSchema = z.object({
  wetter: z.string().max(200).optional(),
  bemerkung: z.string().max(5000).optional(),
  arbeitsstunden: z.number().nonnegative().max(24).optional(),
  status: z.nativeEnum(DokuStatus).optional()
});

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

  // Bei Status-Update: Übergang validieren
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status && parsed.data.status !== existing.status) {
    if (!isValidStatusTransition(existing.status, parsed.data.status)) {
      return reply.code(400).send({
        error: `Status-Übergang von ${existing.status} → ${parsed.data.status} nicht erlaubt`
      });
    }
    // Bei finalen Status: completedAt setzen
    if ([DokuStatus.UNTERSCHRIEBEN, DokuStatus.VERSENDET, DokuStatus.SEVDESK_HOCHGELADEN].includes(parsed.data.status)) {
      if (!existing.completedAt) data.completedAt = new Date();
    }
  }

  const updated = await fastify.prisma.dokumentation.update({
    where: { id },
    data,
    include: {
      vorarbeiter: { select: { id: true, name: true, email: true } }
    }
  });

  return updated;
});

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

// ============================================================
// POSITIONEN
// ============================================================

const updatePositionSchema = z.object({
  verbaut: z.boolean().optional(),
  serialNumber: z.string().max(200).optional().nullable(),
  bemerkung: z.string().max(2000).optional().nullable()
});

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

  if (position.auftrag.status === AuftragStatus.ABGESCHLOSSEN ||
      position.auftrag.status === AuftragStatus.STORNIERT) {
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
      // Übergang false → true: Zeit + User setzen
      data.verbautAm = new Date();
      data.verbautVonId = request.user.id;
    } else if (parsed.data.verbaut === false) {
      // Zurücksetzen
      data.verbautAm = null;
      data.verbautVonId = null;
    }
  }

  const updated = await fastify.prisma.position.update({
    where: { id },
    data,
    include: {
      verbautVon: { select: { id: true, name: true } }
    }
  });

  return updated;
});

// ============================================================
// SEVDESK SYNC
// ============================================================

fastify.get('/sync/sevdesk/test', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
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

const syncQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional()
});

fastify.post('/sync/sevdesk', { onRequest: [fastify.authenticate] }, async (request, reply) => {
  if (!requireAdmin(request, reply)) return;
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

// ============================================================
// LIFECYCLE
// ============================================================

const closeGracefully = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down...`);
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await prisma.$connect();
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`KieTec Backend bereit auf http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}