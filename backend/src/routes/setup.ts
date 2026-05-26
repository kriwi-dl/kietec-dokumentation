import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { config } from '../config';

const initSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(200),
  password: z.string().min(8).max(200),
  setupSecret: z.string().min(8)
});

const setupRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  fastify.post('/setup/init-admin', async (request, reply) => {
    const parsed = initSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    // Schutz 1: SETUP_SECRET muss als Env-Variable gesetzt sein und matchen
    const expectedSecret = process.env.SETUP_SECRET;
    if (!expectedSecret) {
      return reply.code(503).send({
        error: 'Setup deaktiviert',
        message: 'SETUP_SECRET ist nicht gesetzt'
      });
    }
    if (parsed.data.setupSecret !== expectedSecret) {
      return reply.code(401).send({ error: 'Invalid setup secret' });
    }

    // Schutz 2: Nur erlaubt wenn keine User existieren (Erst-Init)
    const userCount = await fastify.prisma.user.count();
    if (userCount > 0) {
      return reply.code(409).send({
        error: 'Setup bereits durchgeführt',
        message: `Es existieren bereits ${userCount} User. Endpoint deaktiviert.`
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const admin = await fastify.prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true
      }
    });

    return reply.code(201).send({
      success: true,
      message: 'Admin-User angelegt. Bitte SETUP_SECRET aus Env-Vars löschen für Sicherheit.',
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  });
};

export default setupRoutes;