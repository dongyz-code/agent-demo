import pino from 'pino';
import pretty from 'pino-pretty';
import { join } from 'node:path';
import {
  cleanupOldLogDirs,
  formatLogDate,
  getNextLocalMidnightTime,
  writeFallback,
} from './utils.js';

import type {
  LoggerRole,
  LogWriter,
  PinoLogLevel,
  SystemLogger,
} from './types.js';

/** 创建单个角色的 Pino logger，并绑定 stdout 和文件输出目标。 */
export function createRoleLogger({
  role,
  level,
  customOptions,
  stdoutDestination,
  fileDestination,
}: {
  /** 日志角色，用于写入 base.role 并区分日志文件。 */
  role: LoggerRole;
  /** 当前角色的日志级别。 */
  level: PinoLogLevel;
  /** 调用方追加的 Pino 原生配置。 */
  customOptions?: pino.LoggerOptions;
  /** stdout 输出目标；未传时不写 stdout。 */
  stdoutDestination?: pino.DestinationStream;
  /** 文件输出目标。 */
  fileDestination: LogWriter;
}) {
  return pino(
    createLoggerOptions(role, level, customOptions),
    createRoleDestination(stdoutDestination, fileDestination),
  );
}

/** 给系统 logger 追加 console 风格 log 别名。 */
export function createSystemLogger(logger: pino.Logger) {
  return Object.assign(logger, {
    log: logger.info.bind(logger),
  }) as SystemLogger;
}

/** 创建 stdout 输出目标；开发环境可输出更易读的文本，生产保持 JSON。 */
export function createStdoutDestination(prettyOutput: boolean): LogWriter {
  if (!prettyOutput) {
    return {
      write(line) {
        process.stdout.write(line);
      },
    };
  }

  return pretty({
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
  });
}

/** 创建本地文件输出目标，文件内容始终保持 Pino JSON 行。 */
export function createFileDestination(file: string): LogWriter {
  const destination = pino.destination({
    dest: file,
    mkdir: true,
    sync: false,
  });
  return {
    file,
    write(line) {
      destination.write(line);
    },
    flush() {
      destination.flush?.();
    },
    end() {
      destination.end?.();
    },
  };
}

/** 创建按本地日期懒轮换的文件输出目标，作为 pino.multistream 中稳定的文件输出目标。 */
export function createDailyFileDestination({
  enabled,
  logDir,
  role,
  retentionDays,
}: {
  /** 是否启用本地文件日志。 */
  enabled: boolean;
  /** 本地日志根目录。 */
  logDir?: string;
  /** 日志角色，用于决定文件名。 */
  role: LoggerRole;
  /** 日期日志目录保留天数；小于等于 0 时不清理。 */
  retentionDays: number;
}): LogWriter {
  let fileWriter: LogWriter | undefined;
  let nextRotateAt = 0;

  function ensureFileWriter() {
    if (!enabled || !logDir) {
      if (fileWriter) {
        closeWriter(fileWriter);
        fileWriter = undefined;
      }
      return;
    }

    const nowTime = Date.now();
    if (fileWriter && nowTime < nextRotateAt) {
      return;
    }

    const now = new Date(nowTime);
    const directory = join(logDir, formatLogDate(now));
    closeWriter(fileWriter);
    fileWriter = createFileDestination(join(directory, `${role}.log`));
    nextRotateAt = getNextLocalMidnightTime(now);
    cleanupOldLogDirs(logDir, retentionDays, now);
  }

  return {
    write(line: string) {
      ensureFileWriter();
      fileWriter?.write(line);
    },
    flush() {
      fileWriter?.flush?.();
    },
    end() {
      closeWriter(fileWriter);
      fileWriter = undefined;
    },
  };
}

/** 使用 pino.multistream 组装单个角色的输出目标，避免手写双路分发。 */
function createRoleDestination(
  stdoutDestination: pino.DestinationStream | undefined,
  fileDestination: pino.DestinationStream,
) {
  const streams: pino.StreamEntry[] = [];
  if (stdoutDestination) {
    streams.push({ stream: stdoutDestination });
  }
  streams.push({ stream: fileDestination });

  return pino.multistream(streams, { dedupe: false });
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

/** 安静关闭 writer，避免日志降级路径再次依赖 logger。 */
function closeWriter(writer: LogWriter | undefined) {
  if (!writer) {
    return;
  }
  try {
    writer.flush?.();
    writer.end?.();
  } catch (error) {
    writeFallback(error);
  }
}
