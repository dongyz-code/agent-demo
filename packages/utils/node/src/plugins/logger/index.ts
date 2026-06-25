import pino from 'pino';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { formatLogDate, isLogDateDir } from './date.js';
import {
  createFileWriter,
  createRoleSink,
  createStdoutWriter,
} from './sink.js';

import type {
  InitPinoLoggerOptions,
  InitPinoLoggerResult,
  LoggerRole,
  PinoLogLevel,
  SystemLogger,
} from './types.js';

export type {
  InitPinoFileOptions,
  InitPinoLoggerOptions,
  InitPinoLoggerResult,
  InitPinoSchedule,
  LoggerRole,
  PinoLogLevel,
  SystemLogger,
} from './types.js';

const LOGGER_ROLES: LoggerRole[] = ['fastify', 'system'];

/** 初始化 Pino 本地日志，提供 Fastify/system 双 logger 和按天文件轮换。 */
export function initPinoLogger({
  customOptions = {},
  devPretty = false,
  fastifyLevel = devPretty ? 'debug' : 'info',
  file,
  logDir,
  rotationCron = '1 0 0 * * *',
  schedule,
  scheduleName = '日志轮换',
  stdout = true,
  systemLevel = devPretty ? 'debug' : 'error',
}: InitPinoLoggerOptions): InitPinoLoggerResult {
  const fileEnabled = Boolean(logDir && (file?.enabled ?? true));
  const retentionDays = file?.retentionDays ?? 30;
  const stdoutWriter = stdout ? createStdoutWriter(devPretty) : undefined;
  const sinks = {
    fastify: createRoleSink(stdoutWriter),
    system: createRoleSink(stdoutWriter),
  } satisfies Record<LoggerRole, ReturnType<typeof createRoleSink>>;
  let activeDate = '';
  let fallbackTimer: NodeJS.Timeout | undefined;

  const fastifyLogger = pino(
    createLoggerOptions('fastify', fastifyLevel, customOptions.fastify),
    sinks.fastify as pino.DestinationStream,
  );
  const systemPinoLogger = pino(
    createLoggerOptions('system', systemLevel, customOptions.system),
    sinks.system as pino.DestinationStream,
  );
  const logger = Object.assign(systemPinoLogger, {
    log: systemPinoLogger.info.bind(systemPinoLogger),
  }) as SystemLogger;

  /** 按日期切换本地文件输出目标，Pino logger 本身保持稳定。 */
  function rotate(now = new Date()) {
    const date = formatLogDate(now);
    activeDate = date;

    if (!fileEnabled || !logDir) {
      LOGGER_ROLES.forEach((role) => sinks[role].setFile());
      return;
    }

    const directory = join(logDir, date);
    try {
      mkdirSync(directory, { recursive: true });
      LOGGER_ROLES.forEach((role) => {
        sinks[role].setFile(createFileWriter(join(directory, `${role}.log`)));
      });
      cleanupOldLogDirs(logDir, retentionDays, now);
    } catch (error) {
      LOGGER_ROLES.forEach((role) => sinks[role].setFile());
      writeFallback(error);
    }
  }

  /** 未接入项目调度器时，兜底检查自然日变化。 */
  function startFallbackTimer() {
    if (!fileEnabled) {
      return;
    }
    fallbackTimer = setInterval(() => {
      if (formatLogDate() !== activeDate) {
        rotate();
      }
    }, 60_000);
    fallbackTimer.unref();
  }

  rotate();

  if (fileEnabled) {
    if (schedule) {
      schedule.add({
        name: scheduleName,
        cron: rotationCron,
        event: () => rotate(),
      });
    } else {
      startFallbackTimer();
    }
  }

  return {
    logger,
    fastifyLogger,
    rotate,
    close() {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
      }
      LOGGER_ROLES.forEach((role) => sinks[role].close());
    },
    getLogFiles() {
      return Object.fromEntries(
        LOGGER_ROLES.flatMap((role) => {
          const file = sinks[role].getFile();
          return file ? [[role, file]] : [];
        }),
      );
    },
  };
}

/** 创建单个角色的 Pino 配置，开发和生产均保持同一结构字段。 */
function createLoggerOptions(
  role: LoggerRole,
  level: PinoLogLevel,
  customOptions: pino.LoggerOptions | undefined,
) {
  return {
    base: { role },
    level,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    ...customOptions,
  } satisfies pino.LoggerOptions;
}

/** 清理超过保留天数的日期目录；失败时降级到 stderr，不影响主流程。 */
function cleanupOldLogDirs(logDir: string, retentionDays: number, now: Date) {
  if (retentionDays <= 0) {
    return;
  }

  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffDate = formatLogDate(cutoff);

    readdirSync(logDir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory() || !isLogDateDir(entry.name)) {
        return;
      }
      if (entry.name >= cutoffDate) {
        return;
      }
      rmSync(join(logDir, entry.name), { recursive: true, force: true });
    });
  } catch (error) {
    writeFallback(error);
  }
}

/** stderr 兜底输出，避免 logger 初始化失败时递归调用自身。 */
function writeFallback(error: unknown) {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
