import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient({ log: ['warn', 'error'] });

  await prisma.$connect();
  fastify.log.info('Prisma connected');

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    fastify.log.info('Prisma disconnected');
  });
};

// fastify-plugin wrapping macht den Decorator (fastify.prisma) auch außerhalb sichtbar
export default fp(prismaPlugin, { name: 'prisma' });