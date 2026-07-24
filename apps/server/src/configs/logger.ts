import { initPinoLogger, type PinoLogLevel } from '@repo/utils-node';
import { DIRS } from './dirs.js';
import { ROOT } from './env.js';

/**
 * 日志配置切片（conf.json `logging` 节点）。
 *
 * `ROOT` 仅保证基础设施连接契约，日志配置由 logger 自管：按 conf.json 约定从 `ROOT`
 * 读取，未配置字段走安全默认。
 */
interface LoggingConf {
  /** 全局运行日志级别，作为 fastify/system 未单独配置时的兜底。 */
  level?: PinoLogLevel;
  /** Fastify 请求日志级别，用于控制接口耗时和错误摘要输出。 */
  fastifyLevel?: PinoLogLevel;
  /** 系统日志级别，用于控制启动、任务、异常和外部调用日志输出。 */
  systemLevel?: PinoLogLevel;
  /** 是否输出到 stdout；生产默认在文件日志开启时关闭，避免默认双写。 */
  stdout?: boolean;
  /** 本地文件日志配置，作为 stdout 之外的短期兜底。 */
  file?: {
    /** 是否启用本地文件日志，默认启用。 */
    enabled?: boolean;
    /** 本地日期日志目录保留天数，默认 30 天。 */
    retentionDays?: number;
  };
}

const LOGGING = (ROOT as { logging?: LoggingConf }).logging ?? {};
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
