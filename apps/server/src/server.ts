import { createFastify, pickObj } from '@repo/utils-node';
import {
  fastifyLogger,
  logger,
  ROOT_SCHEDULE,
  ROOT,
  PORT,
} from '@/configs/index.js';
import { startupTableStructureSync } from '@/database/structure/index.js';
import { ensureDocumentSegmentsCollection } from '@/vector/client.js';
import { getRoutes, callback } from '@/router/index.js';
import { checkUploadBucket } from '@/hooks/documents/file/objects.js';
import { startFileProcessingWorker } from '@/hooks/documents/tasks/worker.js';

logger.info(
  {
    event: 'server.config_loaded',
    config: pickObj(ROOT, ['APP_PROD']),
  },
  'server config loaded',
);

async function createServer() {
  await checkUploadBucket();
  // 启动期自检：缺失表自动建，字段漂移只打印不改，不阻塞启动。
  await startupTableStructureSync();
  // 启动期确保 Qdrant document_segments 集合就绪；Qdrant 不可用时仅告警，不阻塞启动（任务级重试兜底）。
  try {
    await ensureDocumentSegmentsCollection();
  } catch (error) {
    logger.warn(
      { event: 'qdrant.not_ready', err: error },
      'Qdrant 不可用，服务继续启动但 RAG 索引将失败重试',
    );
  }
  try {
    await startFileProcessingWorker();
  } catch (error) {
    logger.error(
      {
        event: 'file.processing.schema_not_ready',
        err: error,
      },
      '文件任务表结构尚未完成 reset，服务继续启动但暂不执行文件任务',
    );
  }
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
