import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const systemRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

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
      dokuCreate: 'POST /auftraege/:id/dokumentationen (Bearer)',
      dokuList: 'GET /dokumentationen (Bearer)',
      dokuDetail: 'GET /dokumentationen/:id (Bearer)',
      dokuUpdate: 'PATCH /dokumentationen/:id (Bearer)',
      dokuDelete: 'DELETE /dokumentationen/:id (Bearer)',
      positionUpdate: 'PATCH /positionen/:id (Bearer)',
      fotoUpload: 'POST /dokumentationen/:dokuId/fotos (Bearer, multipart)',
      fotoOriginal: 'GET /fotos/:id/file (Bearer)',
      fotoThumb: 'GET /fotos/:id/thumbnail (Bearer)',
      fotoDelete: 'DELETE /fotos/:id (Bearer)',
      sigCreate: 'POST /dokumentationen/:dokuId/unterschriften (Bearer)',
      sigImage: 'GET /unterschriften/:id/image (Bearer)',
      sigDelete: 'DELETE /unterschriften/:id (Bearer)',
      emailSend: 'POST /dokumentationen/:id/email (Bearer)',
      emailTest: 'GET /email/test (Admin)',
      sevdeskTest: 'GET /sync/sevdesk/test (Admin)',
      sevdeskSync: 'POST /sync/sevdesk (Admin)',
      sevdeskUpload: 'POST /dokumentationen/:id/sevdesk-upload (Bearer)'
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
};

export default systemRoutes;