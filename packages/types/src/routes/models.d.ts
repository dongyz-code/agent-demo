import type { AdminPermissionKey } from '@repo/shared/permission';

export type TaskBaseStatus =
  | 'to-be-started'
  | 'pending'
  | 'completed'
  | 'failed';

export type TaskStatus = TaskBaseStatus | 'deleted' | 'killed';

export type TaskTriggerMethod = 'manual' | 'auto';

/** 统一任务中心使用的任务分类。 */
export type TaskCategory = 'system' | 'file-processing';

/** 统一任务关联的业务对象类型。 */
export type TaskBusinessType = 'file';

/** 文件处理任务当前阶段。 */
export type FileProcessingStage =
  | 'queued'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'segmenting'
  | 'rag-ingestion'
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
  task_id: string;
  task_key: string;
  task_name: string | null;
  search_key: string | null;
  pending_uuid: string | null;
  /** 任务所属租户；历史系统任务允许为空。 */
  tenant_id: string | null;
  /** 任务中心一级分类。 */
  task_category: TaskCategory;
  /** 任务关联的业务对象类型。 */
  business_type: TaskBusinessType | null;
  /** 任务关联的业务对象标识。 */
  business_id: string | null;
  /** 任务当前阶段；系统脚本任务允许为空。 */
  current_stage: string | null;
  /** 任务整数进度，范围为 0 到 100。 */
  progress: number;
  /** 当前任务已经处理的项目数量。 */
  processed_items: number;
  /** 当前任务需要处理的项目总数。 */
  total_items: number;
  /** 对外稳定错误码。 */
  error_code: string | null;
  /** 面向用户的安全错误摘要。 */
  error_message: string | null;
  args: string | null;
  status: TaskStatus;
  execution_user_id: string | null;
  trigger_method: TaskTriggerMethod;
  create_timestamp: Date;
  start_timestamp: Date | null;
  end_timestamp: Date | null;
  logs: BinaryData | null;
  last_update_timestamp: Date | null;
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
  status: 'planned' | 'running' | 'completed' | 'failed' | 'expired' | 'blocked';
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
