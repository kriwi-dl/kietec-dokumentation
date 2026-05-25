import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import 'dotenv/config';

// ENV-Check
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const fastify = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' }
});

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// TypeScript Type-Augmentation
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

// Plugins
await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  credentials: true
});
await fastify.register(jwt, { secret: JWT_SECRET });

// Auth-Decorator
fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
  }
});

// === Public Routes ===

fastify.get('/', async () => ({
  name: 'KieTec Dokumentations-API',
  status: 'running',
  endpoints: {
    health: 'GET /health',
    login: 'POST /auth/login',
    me: 'GET /auth/me (requires Bearer token)',
    users: 'GET /users (requires Bearer token)'
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

// === Auth Routes ===

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

fastify.post('/auth/login', async (request, reply) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'Invalid input',
      details: parsed.error.issues
    });
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
  if (!user) {
    return reply.code(404).send({ error: 'User not found' });
  }
  return user;
});

// === Protected Routes ===

fastify.get('/users', { onRequest: [fastify.authenticate] }, async () => {
  const users = await fastify.prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }
  });
  return { count: users.length, users };
});

// === Lifecycle ===

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