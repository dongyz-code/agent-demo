import type pino from 'pino';

/** Pino 标准日志级别，保持和 Fastify loggerInstance 兼容。 */
export type PinoLogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal';

/** 本地运行日志角色，分别对应 Fastify 日志和系统日志文件。 */
export type LoggerRole = 'fastify' | 'system';

/** Pino 写入目标的最小接口，便于 stdout、文件和轮换代理使用同一出口。 */
export type LogWriter = {
  /** 写入单行 Pino JSON 日志。 */
  write: (line: string) => void;
  /** 刷新底层缓冲区，文件流可选实现。 */
  flush?: () => void;
  /** 关闭底层资源，stdout 不应关闭。 */
  end?: () => void;
  /** 当前写入的文件路径，stdout 没有该字段。 */
  file?: string;
};

/** 本地文件日志配置。 */
export type InitPinoFileOptions = {
  /** 是否启用本地文件落地，默认跟随 logDir 是否存在。 */
  enabled?: boolean;
  /** 本地日期目录保留天数，默认 30 天；小于等于 0 时不清理。 */
  retentionDays?: number;
};

/** 初始化本地 Pino 日志的配置项。 */
export type InitPinoLoggerOptions = {
  /** 本地日志根目录，开启文件落地时会在其下创建日期目录。 */
  logDir?: string;
  /** 开发环境标记；开启后 stdout 使用可读文本，文件仍保持 JSON。 */
  devPretty?: boolean;
  /** Fastify 日志级别。 */
  fastifyLevel?: PinoLogLevel;
  /** 系统日志级别。 */
  systemLevel?: PinoLogLevel;
  /** 是否输出到 stdout，默认开启。 */
  stdout?: boolean;
  /** 本地文件日志选项。 */
  file?: InitPinoFileOptions;
  /** 按角色追加 Pino 原生配置。 */
  customOptions?: Partial<Record<LoggerRole, pino.LoggerOptions>>;
};

/** 系统 logger 暴露给调用方代码使用的日志方法集合。 */
export type SystemLogger = pino.Logger & {
  /** console 风格别名，内部委托给 info。 */
  log: pino.Logger['info'];
};

/** initPinoLogger 返回值，保持 Fastify 接入简单，并提供必要生命周期方法。 */
export type InitPinoLoggerResult = {
  /** 供项目系统代码使用的 logger。 */
  logger: SystemLogger;
  /** 供 Fastify loggerInstance 使用的真实 Pino logger。 */
  fastifyLogger: pino.Logger;
};
