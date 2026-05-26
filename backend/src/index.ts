import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { PrismaClient, UserRole, AuftragStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import 'dotenv/config';
import {
  createSevdeskClient,
  SevdeskApiError
} from './sevdesk/client';
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

// Helper für Admin-only-Routen
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