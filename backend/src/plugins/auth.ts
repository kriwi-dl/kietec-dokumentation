import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { UserRole } from '@prisma/client';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: UserRole };
    user: { id: string; email: string; role: UserRole };
  }
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(jwt, { secret: config.jwtSecret });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
    }
  });

  fastify.decorate('requireAdmin', (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (request.user.role !== UserRole.ADMIN) {
      reply.code(403).send({ error: 'Forbidden', message: 'Admin role required' });
      return false;
    }
    return true;
  });
};

export default fp(authPlugin, { name: 'auth', dependencies: [] });