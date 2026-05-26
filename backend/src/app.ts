import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { config } from './config';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';

export interface BuildAppOptions {
  /** Wenn true, wird Prisma nicht geladen (für isolierte Tests). Default: false. */
  skipPrisma?: boolean;
}

/**
 * Baut eine Fastify-Instanz mit allen Plugins und Routes.
 * Startet sie aber nicht – das macht `index.ts`.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.upload.bodyLimit
  });

  // Plugins
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

  // Routes (kommen in den nächsten Refactor-Schritten als eigene Plugins)
  await registerInlineRoutes(fastify);

  return fastify;
}

/**
 * TEMPORÄR: Alle Routes inline registrieren.
 * In den nächsten Refactor-Schritten splitten wir das in routes/auth.ts, routes/auftraege.ts etc.
 * Diese Funktion wird dann Stück für Stück leerer, bis sie verschwindet.
 */
async function registerInlineRoutes(fastify: FastifyInstance) {
  // Wird durch import aus inline-routes.ts gefüllt
  const { registerAllInlineRoutes } = await import('./inline-routes');
  await registerAllInlineRoutes(fastify);
}