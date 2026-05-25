import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import 'dotenv/config';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info'
  }
});

// Security & CORS
await fastify.register(helmet, {
  contentSecurityPolicy: false
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  credentials: true
});

// Routes
fastify.get('/', async () => ({
  name: 'KieTec Dokumentations-API',
  status: 'running',
  endpoints: {
    health: '/health'
  }
}));

fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  service: 'kietec-backend',
  version: '0.1.0',
  uptime: process.uptime()
}));

// Start server
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`🚀 KieTec Backend bereit auf http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}