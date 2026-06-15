import { creatFastify, pickObj } from '@repo/utils-node';
import { fastifyLogger, ROOT_SCHEDULE, ROOT, PORT } from '@/configs/index.js';
import { getRoutes, callback } from '@/router/index.js';

console.log('CONF:', pickObj(ROOT, ['MEDO_PROD', 'MEDO_ENV']));

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
        console.log('server:', `http://localhost:${listen}/`);
      },
    },
  });

  ROOT_SCHEDULE.install();
}

createServer();

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtExceptionMonitor', console.error);
process.on('exit', (code) => console.log('exit', code));
