import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

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
      { expiresIn: config.jwt.expiresIn }
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
};

export default authRoutes;