import { buildApp } from './app';
import { config } from './config';

async function start() {
  const fastify = await buildApp();

  const closeGracefully = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    process.exit(0);
  };
  process.on('SIGINT', () => closeGracefully('SIGINT'));
  process.on('SIGTERM', () => closeGracefully('SIGTERM'));

  try {
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`KieTec Backend bereit auf http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();