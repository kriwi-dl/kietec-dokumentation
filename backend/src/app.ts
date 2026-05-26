import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { config } from './config';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import auftraegeRoutes from './routes/auftraege';
import dokumentationenRoutes from './routes/dokumentationen';
import positionenRoutes from './routes/positionen';

export interface BuildAppOptions {
  skipPrisma?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.upload.bodyLimit
  });

  if (!options.skipPrisma) {
    await fastify.register(prismaPlugin);
  }
  await fastify.register(authPlugin);
  await fastify.register(helmet, { contentSecurityPolicy: false });
  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true
  });
  await fastify.register(multipart, {
    limits: { fileSize: config.upload.maxFileSize, files: 1 }
  });

  // Route-Module
  await fastify.register(authRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(auftraegeRoutes);
  await fastify.register(dokumentationenRoutes);
  await fastify.register(positionenRoutes);

  // Verbleibende inline-Routes: Health/Root, Fotos, Unterschriften, Sync
  await registerInlineRoutes(fastify);

  return fastify;
}

async function registerInlineRoutes(fastify: FastifyInstance) {
  const { registerAllInlineRoutes } = await import('./inline-routes');
  await registerAllInlineRoutes(fastify);
}