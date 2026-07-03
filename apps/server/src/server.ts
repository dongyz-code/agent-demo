import { createFastify, pickObj } from '@repo/utils-node';
import {
  fastifyLogger,
  logger,
  ROOT_SCHEDULE,
  ROOT,
  PORT,
} from '@/configs/index.js';
import { startupSchemaSync } from '@/database/introspection/index.js';
import { getRoutes, callback } from '@/router/index.js';

logger.info(
  {
    event: 'server.config_loaded',
    config: pickObj(ROOT, ['APP_PROD']),
  },
  'server config loaded',
);

async function createServer() {
  // 启动期自检：缺失表自动建，字段漂移只打印不改，不阻塞启动。
  await startupSchemaSync();
  await createFastify({
    fastify: {
      options: {
        loggerInstance: fastifyLogger,
        trustProxy: true,
        bodyLimit: 2 ** 20 * 100, // 100MB
      },
      cors: {
        origin: ROOT.APP_PROD ? [] : true,
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
