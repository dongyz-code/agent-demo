import {
  createDailyFileDestination,
  createRoleLogger,
  createStdoutDestination,
  createSystemLogger,
} from './destinations.js';

import type {
  InitPinoLoggerOptions,
  InitPinoLoggerResult,
  LoggerRole,
} from './types.js';

export type {
  InitPinoFileOptions,
  InitPinoLoggerOptions,
  InitPinoLoggerResult,
  LoggerRole,
  LogWriter,
  PinoLogLevel,
  SystemLogger,
} from './types.js';

/** 初始化 Pino 本地日志，提供 Fastify/system 双 logger 和按天文件轮换。 */
export function initPinoLogger({
  customOptions = {},
  devPretty = false,
  fastifyLevel = devPretty ? 'debug' : 'info',
  file,
  logDir,
  stdout = true,
  systemLevel = devPretty ? 'debug' : 'error',
}: InitPinoLoggerOptions): InitPinoLoggerResult {
  const fileEnabled = Boolean(logDir && (file?.enabled ?? true));
  const retentionDays = file?.retentionDays ?? 30;
  const stdoutDestination = stdout ? createStdoutDestination(devPretty) : undefined;
  const fileDestinations = {
    fastify: createDailyFileDestination({
      enabled: fileEnabled,
      logDir,
      role: 'fastify',
      retentionDays,
    }),
    system: createDailyFileDestination({
      enabled: fileEnabled,
      logDir,
      role: 'system',
      retentionDays,
    }),
  } satisfies Record<LoggerRole, ReturnType<typeof createDailyFileDestination>>;

  const fastifyLogger = createRoleLogger({
    role: 'fastify',
    level: fastifyLevel,
    customOptions: customOptions.fastify,
    stdoutDestination,
    fileDestination: fileDestinations.fastify,
  });
  const logger = createSystemLogger(
    createRoleLogger({
      role: 'system',
      level: systemLevel,
      customOptions: customOptions.system,
      stdoutDestination,
      fileDestination: fileDestinations.system,
    }),
  );
  return {
    logger,
    fastifyLogger,
  };
}
