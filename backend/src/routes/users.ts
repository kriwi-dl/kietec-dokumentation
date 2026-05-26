import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const usersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.get('/users', { onRequest: [fastify.authenticate] }, async () => {
    const users = await fastify.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });
    return { count: users.length, users };
  });
};

export default usersRoutes;