import { initPinoLogger } from '@repo/utils-node';
import { DIRS } from './dirs.js';
import { ROOT } from './env.js';
import { ROOT_SCHEDULE } from './schedule.js';

const LOGGING = ROOT.logging ?? {};
const LOGGING_FILE = LOGGING.file ?? {};

/** 服务端本地日志实例和 Fastify logger。 */
export const { logger, fastifyLogger } = initPinoLogger({
  devPretty: !ROOT.MEDO_PROD,
  fastifyLevel: LOGGING.fastifyLevel ?? LOGGING.level ?? 'info',
  file: {
    enabled: LOGGING_FILE.enabled ?? true,
    retentionDays: LOGGING_FILE.retentionDays ?? 30,
  },
  logDir: DIRS.LOG,
  schedule: ROOT_SCHEDULE,
  systemLevel:
    LOGGING.systemLevel ?? LOGGING.level ?? (ROOT.MEDO_PROD ? 'error' : 'debug'),
});
