import { initPinoLogger } from '@repo/utils-node';
import { DIRS } from './dirs.js';
import { ROOT } from './env.js';

const LOGGING = ROOT.logging ?? {};
const LOGGING_FILE = LOGGING.file ?? {};
const fileEnabled = LOGGING_FILE.enabled ?? true;

/** 服务端本地日志实例和 Fastify logger。 */
export const { logger, fastifyLogger } = initPinoLogger({
  devPretty: !ROOT.APP_PROD,
  fastifyLevel:
    LOGGING.fastifyLevel ?? (ROOT.APP_PROD ? 'warn' : LOGGING.level ?? 'info'),
  file: {
    enabled: fileEnabled,
    retentionDays: LOGGING_FILE.retentionDays ?? 30,
  },
  logDir: DIRS.LOG,
  stdout: LOGGING.stdout ?? (!ROOT.APP_PROD || !fileEnabled),
  systemLevel:
    LOGGING.systemLevel ?? LOGGING.level ?? (ROOT.APP_PROD ? 'error' : 'debug'),
});
