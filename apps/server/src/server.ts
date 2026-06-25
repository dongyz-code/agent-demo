import { creatFastify, pickObj } from '@repo/utils-node';
import {
  fastifyLogger,
  logger,
  ROOT_SCHEDULE,
  ROOT,
  PORT,
} from '@/configs/index.js';
import { getRoutes, callback } from '@/router/index.js';

logger.info(
  {
    event: 'server.config_loaded',
    config: pickObj(ROOT, ['MEDO_PROD', 'MEDO_ENV']),
  },
  'server config loaded',
);

async function createServer() {
  await creatFastify({
    fastify: {
      options: {
        loggerInstance: fastifyLogger,
        trustProxy: true,
        bodyLimit: 2 ** 20 * 100, // 100MB
      },
      cors: {
        origin: ROOT.MEDO_PROD ? [] : true,
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
      },
      routes: await getRoutes(),
      callback: callback(),
      cookie: {
        secret: ROOT.authorization.jwt_secret,
      },
    },
    configs: {
      listen: PORT,
      callback({ listen }) {
        logger.info(
          {
            event: 'server.listen',
            url: `http://localhost:${listen}/`,
          },
          'server started',
        );
      },
    },
  });

  ROOT_SCHEDULE.install();
}

createServer();

process.on('uncaughtException', (error) => {
  logger.error({ event: 'process.uncaught_exception', err: error }, 'uncaught exception');
});
process.on('unhandledRejection', (error) => {
  logger.error(
    { event: 'process.unhandled_rejection', err: error },
    'unhandled rejection',
  );
});
process.on('uncaughtExceptionMonitor', (error) => {
  logger.error(
    { event: 'process.uncaught_exception_monitor', err: error },
    'uncaught exception monitor',
  );
});
process.on('exit', (code) => {
  logger.info({ event: 'process.exit', code }, 'process exit');
});
