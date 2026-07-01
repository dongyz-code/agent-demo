import type { ApiMultAction } from '../../common/index.js';
import type { TableStructureOpItem } from '../models.js';

/** 表结构操作类型，用于区分重命名和按 schema 重置两类高风险动作。 */
export type TableStructureOpType = 'rename' | 'reset';

/** 表结构操作状态，用于前后端展示计划、执行和失败恢复进度。 */
export type TableStructureOpStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'blocked';

/** 表在数据库中的物理状态，用于提示 schema 注册表和真实数据库是否一致。 */
export type TablePhysicalStatus = 'exists' | 'missing';

/** 表结构差异级别，用于管理端快速筛选需要处理的表。 */
export type TableDiffLevel = 'synced' | 'different' | 'missing';

/** 表管理页面中的字段描述，来自 Drizzle schema 或 Postgres catalog。 */
export type TableColumnInfo = {
  /** 字段名，对应数据库列名。 */
  name: string;
  /** TypeScript schema 字段 key，catalog 来源字段没有该值。 */
  key?: string;
  /** Drizzle 字段类型标识，用于展示和兼容性判断。 */
  dataType?: string;
  /** PostgreSQL SQL 类型文本。 */
  sqlType: string;
  /** 是否不允许为空。 */
  notNull: boolean;
  /** 是否拥有默认值。 */
  hasDefault: boolean;
  /** 默认值表达式，来自数据库 catalog 时才返回。 */
  defaultValue?: string | null;
  /** 是否主键字段。 */
  primaryKey: boolean;
  /** 是否被判定为敏感字段，预览数据会脱敏。 */
  sensitive?: boolean;
};

/** 表索引摘要，用于结构详情和差异展示。 */
export type TableIndexInfo = {
  /** 索引名称。 */
  name: string;
  /** 索引覆盖的字段名列表；表达式索引会放入表达式文本。 */
  columns: string[];
  /** 是否唯一索引。 */
  unique: boolean;
  /** 是否表达式或其他复杂索引，复杂索引首版会阻塞 reset。 */
  complex?: boolean;
};

/** 表约束摘要，用于结构详情和重置安全判断。 */
export type TableConstraintInfo = {
  /** 约束名称。 */
  name: string;
  /** 约束类型，例如 PRIMARY KEY、UNIQUE、FOREIGN KEY、CHECK。 */
  type: string;
  /** 约束涉及的字段名列表。 */
  columns: string[];
  /** 约束定义文本，来自数据库 catalog。 */
  definition?: string;
  /** 是否属于首版无法安全自动重建的复杂约束。 */
  complex?: boolean;
};

/** 单张表在列表中的摘要信息。 */
export type TableListItem = {
  /** schemaTables 中的表 key。 */
  table: string;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** Drizzle schema 中的目标表名。 */
  tableName: string;
  /** 数据库物理状态。 */
  physicalStatus: TablePhysicalStatus;
  /** schema 差异级别。 */
  diffLevel: TableDiffLevel;
  /** Drizzle schema 字段数量。 */
  columnCount: number;
  /** 数据库估算行数，表不存在时为空。 */
  estimatedRows: number | null;
  /** 最近一次结构操作记录。 */
  latestOperation?: Pick<
    TableStructureOpItem,
    'op_id' | 'type' | 'status' | 'create_timestamp' | 'end_timestamp'
  > | null;
};

/** 表结构详情，合并目标 schema、数据库实态和差异结果。 */
export type TableDetail = {
  /** schemaTables 中的表 key。 */
  table: string;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** Drizzle schema 中的目标表名。 */
  tableName: string;
  /** 数据库物理状态。 */
  physicalStatus: TablePhysicalStatus;
  /** schema 差异级别。 */
  diffLevel: TableDiffLevel;
  /** 目标字段列表。 */
  schemaColumns: TableColumnInfo[];
  /** 数据库真实字段列表。 */
  catalogColumns: TableColumnInfo[];
  /** 目标索引列表。 */
  schemaIndexes: TableIndexInfo[];
  /** 数据库真实索引列表。 */
  catalogIndexes: TableIndexInfo[];
  /** 数据库真实约束列表。 */
  catalogConstraints: TableConstraintInfo[];
  /** 差异摘要，供页面直接展示。 */
  diff: TableDiffSummary[];
};

/** 表结构差异摘要项，用于列表和详情页提示风险。 */
export type TableDiffSummary = {
  /** 差异对象类型。 */
  scope: 'table' | 'column' | 'index' | 'constraint';
  /** 差异动作类型。 */
  type: 'missing' | 'extra' | 'changed' | 'complex';
  /** 差异对象名称。 */
  name: string;
  /** 面向管理员的差异说明。 */
  message: string;
};

/** 数据预览字段描述，用于管理端渲染表头和脱敏状态。 */
export type TablePreviewColumn = {
  /** 字段名。 */
  name: string;
  /** PostgreSQL SQL 类型文本。 */
  sqlType: string;
  /** 是否已脱敏。 */
  masked: boolean;
};

/** 数据预览结果，支持分页并只包含注册字段。 */
export type TablePreview = {
  /** schemaTables 中的表 key。 */
  table: string;
  /** 返回字段列表。 */
  columns: TablePreviewColumn[];
  /** 返回数据行。 */
  rows: Record<string, unknown>[];
  /** 预览表的总行数，用于管理端分页读取全部数据。 */
  count: number;
  /** 本次请求 offset。 */
  offset: number;
  /** 本次请求 limit。 */
  limit: number;
};

/** 字段重命名或复制映射，用于 rename/reset plan。 */
export type TableColumnMapping = {
  /** 旧字段名。 */
  from: string;
  /** 新字段名。 */
  to: string;
};

/** 结构操作计划返回值，apply 阶段只允许使用该计划 ID。 */
export type TableOperationPlan = {
  /** 操作记录 ID。 */
  op_id: string;
  /** 操作类型。 */
  type: TableStructureOpType;
  /** 操作状态。 */
  status: TableStructureOpStatus;
  /** schemaTables 中的表 key。 */
  table: string;
  /** 目标表名。 */
  tableName: string;
  /** SQL 摘要，仅用于展示和审计，不允许前端修改后执行。 */
  sqlPreview: string[];
  /** 风险提示。 */
  warnings: string[];
  /** 阻塞项；非空时 apply 必须拒绝执行。 */
  blockers: string[];
  /** 备份表名，reset 操作会返回。 */
  backupTableName?: string | null;
  /** apply 时必须输入的二次确认文本。 */
  confirmText: string;
  /** 计划过期时间。 */
  expire_timestamp: Date;
};

/** 结构操作执行结果。 */
export type TableOperationApplyResult = {
  /** 操作记录 ID。 */
  op_id: string;
  /** 操作状态。 */
  status: TableStructureOpStatus;
  /** 备份表名，reset 完成时返回。 */
  backupTableName?: string | null;
};

/** 表管理 API 动作集合。 */
export type TableManagementAction = ApiMultAction<{
  list: {
    req: {
      /** 表名或 schema key 搜索关键词。 */
      search?: string;
      /** 物理状态筛选。 */
      physicalStatus?: TablePhysicalStatus;
      /** 差异级别筛选。 */
      diffLevel?: TableDiffLevel;
      /** 分页范围，格式为 [起始偏移, 结束偏移)。 */
      limit?: number[];
      /** 是否返回过滤后的总数，筛选条件变化时传 true。 */
      withCount?: boolean;
    };
    resp: {
      /** 当前用户可见表列表。 */
      list: TableListItem[];
      /** 过滤后的表总数。 */
      count: number;
    };
  };
  detail: {
    req: {
      /** schemaTables 中的表 key。 */
      table: string;
    };
    resp: TableDetail;
  };
  preview: {
    req: {
      /** schemaTables 中的表 key。 */
      table: string;
      /** 起始行偏移。 */
      offset?: number;
      /** 返回行数，上限由服务端限制为 100。 */
      limit?: number;
    };
    resp: TablePreview;
  };
  'operation-list': {
    req: {
      /** 表 key 筛选。 */
      table?: string;
      /** 操作类型筛选。 */
      type?: TableStructureOpType;
      /** 操作状态筛选。 */
      status?: TableStructureOpStatus;
      /** 分页范围。 */
      limit?: number[];
      /** 是否返回总数。 */
      withCount?: boolean;
    };
    resp: {
      /** 操作记录列表。 */
      list: Omit<TableStructureOpItem, 'plan' | 'sql_preview'>[];
      /** 总数。 */
      count: number;
    };
  };
  'operation-detail': {
    req: {
      /** 操作记录 ID 列表。 */
      ids: string[];
    };
    resp: TableStructureOpItem[];
  };
  'rename-plan': {
    req: {
      /** schemaTables 中的目标表 key。 */
      table: string;
      /** 数据库中的旧表名，不传则默认使用目标表名。 */
      oldTableName?: string;
      /** 字段重命名映射。 */
      columnMappings?: TableColumnMapping[];
    };
    resp: TableOperationPlan;
  };
  'rename-apply': {
    req: {
      /** 操作记录 ID。 */
      op_id: string;
      /** 二次确认文本，必须与服务端要求一致。 */
      confirm: string;
    };
    resp: TableOperationApplyResult;
  };
  'reset-plan': {
    req: {
      /** schemaTables 中的目标表 key。 */
      table: string;
      /** 字段复制映射，用于旧字段名到新字段名。 */
      columnMappings?: TableColumnMapping[];
    };
    resp: TableOperationPlan;
  };
  'reset-apply': {
    req: {
      /** 操作记录 ID。 */
      op_id: string;
      /** 二次确认文本，必须与服务端要求一致。 */
      confirm: string;
    };
    resp: TableOperationApplyResult;
  };
}>;
