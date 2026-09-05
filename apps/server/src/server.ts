import { createFastify, pickObj } from '@repo/utils-node';
import {
  fastifyLogger,
  logger,
  ROOT_SCHEDULE,
  ROOT,
  PORT,
} from '@/configs/index.js';
import { startupTableStructureSync } from '@/database/postgres/structure/index.js';
import { ensureDocumentSegmentsCollection } from '@/database/vector/client.js';
import { getRoutes, callback } from '@/router/index.js';
import { documentFile } from '@/hooks/documents/file/index.js';
import { task } from '@/hooks/tasks/task.js';

logger.info(
  {
    event: 'server.config_loaded',
    config: pickObj(ROOT, ['APP_PROD']),
  },
  'server config loaded',
);

async function createServer() {
  await documentFile.checkBucket();
  // 启动期自检：缺失表自动建，字段漂移只打印不改，不阻塞启动。
  await startupTableStructureSync();
  // 启动接流量前将历史明文密码迁移为 Argon2id，迁移失败会阻止服务启动。
  // 启动期确保 Qdrant document_segments 集合就绪；Qdrant 不可用时仅告警，不阻塞启动（任务级重试兜底）。
  try {
    await ensureDocumentSegmentsCollection();
  } catch (error) {
    logger.warn(
      { event: 'qdrant.not_ready', err: error },
      'Qdrant 不可用，服务继续启动但 RAG 索引将失败重试',
    );
  }
  // 任务持久化结构错误或启动恢复失败都必须阻止服务接流量。
  await task.start();
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
  logger.error(
    { event: 'process.uncaught_exception', err: error },
    'uncaught exception',
  );
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
