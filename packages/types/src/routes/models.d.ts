import type { AdminPermissionKey } from '@repo/shared/permission';

export type TaskBaseStatus =
  | 'to-be-started'
  | 'pending'
  | 'completed'
  | 'failed';

/** 通用后台任务生命周期状态。 */
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'timed_out';

/** 单次任务执行尝试的终态或运行状态。 */
export type TaskAttemptStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'timed_out'
  | 'interrupted';

/** 任务持久日志支持的级别。 */
export type TaskLogLevel = 'debug' | 'info' | 'error';

export type TaskTriggerMethod = 'manual' | 'auto';

/** 文档处理阶段单次执行状态。 */
export type FileProcessingStageRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'interrupted';

/** 文档后台任务可选择执行的版本处理操作。 */
export type DocumentTaskOperation = 'preview' | 'rag';

/** 文件处理任务当前阶段。 */
export type FileProcessingStage =
  | 'queued'
  | 'rag'
  | 'rag-completed'
  | 'preview'
  | 'preview-completed'
  | 'completed';

/** 文件处理任务的创建来源。 */
export type FileProcessingTriggerSource =
  | 'upload'
  | 'manual'
  | 'retry'
  | 'rerun';

export type InterfaceMode = 'active' | 'passive';

export type InterfaceStatus = Extract<
  TaskBaseStatus,
  'pending' | 'completed' | 'failed'
>;

export type BinaryData = Uint8Array;

export type BaseCols = {
  create_user_id: string;
  create_timestamp: Date;
  last_update_user_id: string;
  last_update_timestamp: Date;
};

export type SysConfItem = {
  id: number;
  data: string;
  last_update_timestamp: Date;
};

export type UserItem = BaseCols & {
  user_id: string;
  username: string;
  password: string | null;
  nickname: string;
  email: string | null;
  available: boolean;
  last_login_timestamp: Date | null;
  extra: string | null;
};

export type RoleItem = BaseCols & {
  role_id: string;
  name: string;
  desc: string | null;
  available: boolean;
  permission: AdminPermissionKey[] | null;
};

export type UserRoleItem = {
  role_id: string;
  user_id: string;
  last_update_user_id: string;
  last_update_timestamp: Date;
};

export type AppItem = BaseCols & {
  id: number;
  name: string;
  desc: string | null;
  available: boolean;
  client_id: string;
  client_secret: string;
  last_login_timestamp: Date | null;
};

export type TaskItem = {
  /** 通用任务标识。 */
  task_id: string;
  /** 稳定任务名称。 */
  task_name: string;
  /** 面向任务中心展示的业务名称。 */
  display_name: string;
  /** 任务脚本报告的当前业务阶段。 */
  current_stage: string | null;
  /** 整数进度，范围为 0 到 100。 */
  progress: number;
  /** 已处理项目数量。 */
  processed_items: number;
  /** 待处理项目总数。 */
  total_items: number;
  /** 任务脚本成功返回的可序列化结果。 */
  result: unknown;
  /** 已创建的执行尝试数量。 */
  attempt_count: number;
  /** 首次执行以外允许的最大重试次数。 */
  max_retries: number;
  /** 固定重试间隔，单位毫秒。 */
  retry_delay_ms: number;
  /** 单次执行超时，单位毫秒。 */
  timeout_ms: number;
  /** 单实例同名任务并发上限。 */
  concurrency: number;
  /** retrying 状态的下次可领取时间。 */
  next_run_at: Date | null;
  /** 对外稳定错误码。 */
  error_code: string | null;
  /** 面向用户的安全错误摘要。 */
  error_message: string | null;
  /** 当前生命周期状态。 */
  status: TaskStatus;
  /** 入队时间。 */
  create_timestamp: Date;
  /** 首次开始执行时间。 */
  start_timestamp: Date | null;
  /** 最终完成时间。 */
  end_timestamp: Date | null;
  /** 最近状态、进度或 heartbeat 更新时间。 */
  last_update_timestamp: Date;
};

/** 单次任务执行尝试摘要。 */
export type TaskAttemptItem = {
  /** attempt 标识。 */
  attempt_id: string;
  /** 所属通用任务。 */
  task_id: string;
  /** 从 1 开始的执行序号。 */
  attempt: number;
  /** 当前或最终执行状态。 */
  status: TaskAttemptStatus;
  /** 领取任务的服务实例。 */
  worker_id: string;
  /** 子进程 PID，启动前允许为空。 */
  process_id: number | null;
  /** 稳定错误码。 */
  error_code: string | null;
  /** 安全错误摘要。 */
  error_message: string | null;
  /** 本次成功执行返回的可序列化结果。 */
  result: unknown;
  /** 本次执行开始时间。 */
  start_timestamp: Date;
  /** 本次执行结束时间。 */
  end_timestamp: Date | null;
};

/** 单条结构化任务日志。 */
export type TaskLogItem = {
  /** 日志标识。 */
  log_id: string;
  /** 所属通用任务。 */
  task_id: string;
  /** 产生该日志的 attempt，入队日志使用 0。 */
  attempt: number;
  /** 日志级别。 */
  level: TaskLogLevel;
  /** 已脱敏日志消息。 */
  message: string;
  /** 日志产生时间。 */
  create_timestamp: Date;
};

export type ApiLogItem = {
  id: string;
  mode: InterfaceMode;
  client_id: string | null;
  client_mark: string | null;
  url: string | null;
  status: InterfaceStatus | null;
  ip: string | null;
  user_id: string | null;
  search_key: string | null;
  detail: string | null;
  start_timestamp: Date;
  end_timestamp: Date | null;
  duration: number | null;
};

export type UserLogItem = {
  id: string;
  user_id: string | null;
  key: string;
  ip: string;
  search_key: string | null;
  detail: string | null;
  timestamp: Date;
};

export type TableStructureOpItem = {
  /** 操作记录 ID */
  op_id: string;
  /** 操作类型：schema 重置或索引/触发器同步 */
  type: 'reset' | 'sync';
  /** 操作状态 */
  status:
    | 'planned'
    | 'running'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'blocked';
  /** schemaTables 中的表 key */
  table_key: string;
  /** PostgreSQL schema 名称 */
  table_schema: string;
  /** Drizzle schema 中的目标表名 */
  target_table_name: string;
  /** 数据库中的源表名 */
  source_table_name: string;
  /** 计划内容 JSON */
  plan: string;
  /** SQL 摘要 JSON */
  sql_preview: string;
  /** 风险提示 JSON */
  warnings: string | null;
  /** 阻塞项 JSON */
  blockers: string | null;
  /** reset 操作保留的备份表名 */
  backup_table_name: string | null;
  /** 执行失败时的错误信息 */
  error: string | null;
  /** 计划创建用户 ID */
  create_user_id: string;
  /** 计划创建时间 */
  create_timestamp: Date;
  /** 计划过期时间 */
  expire_timestamp: Date;
  /** 执行用户 ID */
  apply_user_id: string | null;
  /** 执行开始时间 */
  start_timestamp: Date | null;
  /** 执行结束时间 */
  end_timestamp: Date | null;
};
