import type { ApiMultAction } from '../../common/index.js';
import type { TaskItem, TaskLogItem } from '../models.js';

/** 允许管理员选择的代码处理器，执行入口不可由请求指定。 */
export interface ScheduleHandlerInfo {
  /** 稳定代码标识。 */
  key: string;
  /** 面向运维的名称。 */
  label: string;
  /** 执行用途及影响。 */
  description: string;
  /** 参数示例；服务端按处理器校验。 */
  defaultParams: Record<string, unknown>;
  /** 固定超时时间，毫秒。 */
  timeoutMs: number;
  /** 固定自动重试次数。 */
  retries: number;
}

/** 持久化的定时计划编辑数据。 */
export interface ScheduleInput {
  /** 修改时传入，创建时省略。 */
  id?: string;
  /** 管理员定义的展示名称。 */
  name: string;
  /** 代码处理器标识。 */
  handler: string;
  /** 五段或六段 Cron。 */
  cron: string;
  /** IANA 时区。 */
  timezone: string;
  /** 是否参与自动调度。 */
  enabled: boolean;
  /** 通过处理器校验的业务参数。 */
  params: Record<string, unknown>;
  /** 运维说明。 */
  description: string;
}

/** 列表中的定时计划，配置与执行状态分别展示。 */
export interface ScheduleInfo extends ScheduleInput {
  /** 持久化计划标识。 */
  id: string;
  /** 处理器展示名称。 */
  handlerLabel: string;
  /** 下一次计划时间，暂停时为空。 */
  nextRunAt: string | null;
  /** 当前有排队、运行或重试中的任务。 */
  active: boolean;
  /** 最近一次触发及对应执行状态。 */
  lastRun: ScheduleRunInfo | null;
}

/** 一次触发记录；执行详情关联现有任务中心。 */
export interface ScheduleRunInfo {
  /** 触发标识。 */
  id: string;
  /** 所属计划，删除计划后仍保留。 */
  scheduleId: string;
  /** 触发时的名称快照。 */
  scheduleName: string;
  /** 自动或人工触发。 */
  trigger: 'scheduled' | 'manual';
  /** 实际计划时间。 */
  plannedAt: string;
  /** 关联任务，跳过时为空。 */
  taskId: string | null;
  /** 入队后的状态来自任务中心；跳过有独立原因。 */
  status: TaskItem['status'] | 'skipped';
  /** 跳过说明或任务错误摘要。 */
  message: string | null;
  /** 首次开始时间。 */
  startedAt: string | null;
  /** 最终结束时间。 */
  finishedAt: string | null;
  /** 已产生的执行尝试次数。 */
  attempts: number;
}

/** 调度管理接口，配置和记录在 PostgreSQL 中持久化。 */
export type ScheduleManagementAction = ApiMultAction<{
  /** 分页查询计划并返回全局摘要。 */
  list: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 按展示名称或业务键匹配的字面关键字。 */
      search?: string; /** 持久化自动调度状态筛选或变更值。 */
      enabled?: boolean; /** 分页半开区间 [起点, 终点)，服务端限制单页数量。 */
      limit?: number[];
    };
    /** 管理端直接使用的响应数据。 */
    resp: {
      /** 当前页或当前扫描批次的数据。 */
      list: ScheduleInfo[];
      /** 数据库过滤后的匹配记录数量。 */
      count: number;
      /** 跨分页的全局计划运行摘要。 */
      summary: {
        /** 尚未删除的计划总数。 */
        total: number;
        /** 持久化自动调度状态筛选或变更值。 */
        enabled: number;
        /** 拥有排队、运行或重试任务的计划数量。 */
        active: number;
        /** 最近 24 小时内以失败或超时结束的任务数。 */
        failed24h: number;
      };
    };
  };
  /** 查询代码处理器及固定策略。 */
  handlers: {
    /** 通过后端 schema 验证的请求数据。 */
    req: Record<string, never>; /** 管理端直接使用的响应数据。 */
    resp: ScheduleHandlerInfo[];
  };
  /** 创建或覆盖修改一个计划。 */
  save: {
    /** 通过后端 schema 验证的请求数据。 */
    req: ScheduleInput; /** 管理端直接使用的响应数据。 */
    resp: {
      /** 持久化资源标识，不接受任意任务脚本入口。 */
      id: string;
    };
  };
  /** 持久化启停意愿，不中断已提交的任务。 */
  toggle: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 持久化资源标识，不接受任意任务脚本入口。 */
      id: string; /** 持久化自动调度状态筛选或变更值。 */
      enabled: boolean;
    }; /** 管理端直接使用的响应数据。 */
    resp: 'ok';
  };
  /** 删除计划但保留执行记录。 */
  remove: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 持久化资源标识，不接受任意任务脚本入口。 */
      id: string;
    }; /** 管理端直接使用的响应数据。 */
    resp: 'ok';
  };
  /** 人工触发；requestId 供同一请求重试去重。 */
  run: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 持久化资源标识，不接受任意任务脚本入口。 */
      id: string; /** 单次人工操作标识，相同标识重试返回原任务。 */
      requestId: string;
    }; /** 管理端直接使用的响应数据。 */
    resp: {
      /** 统一任务中心创建的任务标识。 */
      taskId: string;
    };
  };
  /** 服务端校验表达式并预览未来五次触发。 */
  preview: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 服务端使用 Croner 解析的五段或六段表达式。 */
      cron: string; /** 用于计算触发时间的 IANA 时区。 */
      timezone: string;
    }; /** 管理端直接使用的响应数据。 */
    resp: string[];
  };
  /** 定时任务记录抽屉的分页查询。 */
  runs: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 仅查询指定计划的触发历史，删除计划后仍可查询。 */
      scheduleId?: string;
      /** 按展示名称或业务键匹配的字面关键字。 */
      search?: string;
      /** 按任务生命周期或 skipped 状态精确过滤。 */
      status?: string;
      /** 限定 scheduled 自动触发或 manual 人工触发。 */
      trigger?: string;
      /** 计划时间范围起点，ISO 日期时间。 */
      from?: string;
      /** 计划时间范围终点，ISO 日期时间。 */
      to?: string;
      /** 分页半开区间 [起点, 终点)，服务端限制单页数量。 */
      limit?: number[];
    };
    /** 管理端直接使用的响应数据。 */
    resp: {
      /** 当前页或当前扫描批次的数据。 */
      list: ScheduleRunInfo[]; /** 数据库过滤后的匹配记录数量。 */
      count: number;
    };
  };
  /** 仅查看定时触发所关联任务的详情和日志。 */
  detail: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 持久化资源标识，不接受任意任务脚本入口。 */
      id: string;
    };
    /** 管理端直接使用的响应数据。 */
    resp: {
      /** 触发台账及关联任务的实际状态。 */
      run: ScheduleRunInfo;
      /** 触发关联的任务详情，未入队时为空。 */
      task: (TaskItem & { data: unknown }) | null;
      /** 统一任务中心持久化的结构化执行日志。 */
      logs: TaskLogItem[];
    };
  };
}>;

/** 明确注册的应用缓存空间。 */
export interface CacheInfo {
  /** 空间稳定名称。 */
  name: string;
  /** 展示名称。 */
  label: string;
  /** 用途及失效行为。 */
  description: string;
  /** 默认存活时间，秒。 */
  ttl: number;
  /** 是否允许单独授权后查看安全值。 */
  inspectable: boolean;
}

/** Redis 单键元信息，不在列表返回值。 */
export interface CacheEntryInfo {
  /** 不带应用前缀的业务键。 */
  key: string;
  /** Redis 实际数据类型。 */
  type: string;
  /** 剩余存活秒数，-1 为无过期，-2 为已过期。 */
  ttl: number;
}

/** 仅用于判断业务缓存是否可用，不采集实例运行指标。 */
export interface RedisStatus {
  /** 是否连接成功。 */
  connected: boolean;
  /** 安全错误提示，不包含连接凭据。 */
  error: string | null;
}

/** Redis 缓存管理只接受已注册空间及当前应用前缀。 */
export type CacheManagementAction = ApiMultAction<{
  /** 查询空间目录，与 Redis 连接状态独立。 */
  list: {
    /** 通过后端 schema 验证的请求数据。 */
    req: Record<string, never>; /** 管理端直接使用的响应数据。 */
    resp: CacheInfo[];
  };
  /** 通过 PING 检查业务缓存连接。 */
  status: {
    /** 通过后端 schema 验证的请求数据。 */
    req: Record<string, never>; /** 管理端直接使用的响应数据。 */
    resp: RedisStatus;
  };
  /** 有扫描预算的游标分页，不承诺匹配总数。 */
  entries: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 显式注册的缓存空间名称，禁止任意前缀。 */
      name: string; /** 按展示名称或业务键匹配的字面关键字。 */
      search?: string; /** Redis 返回的扫描游标，字符串 0 表示一轮结束。 */
      cursor?: string;
    };
    /** 管理端直接使用的响应数据。 */
    resp: {
      /** 当前页或当前扫描批次的数据。 */
      list: CacheEntryInfo[]; /** Redis 返回的扫描游标，字符串 0 表示一轮结束。 */
      cursor: string; /** 当前批次扫描返回的空间键数，不代表键总数。 */
      scanned: number;
    };
  };
  /** 仅返回被允许查看且大小受限的 JSON。 */
  value: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 显式注册的缓存空间名称，禁止任意前缀。 */
      name: string; /** 空间内的业务键，不含应用前缀。 */
      key: string;
    };
    /** 管理端直接使用的响应数据。 */
    resp: {
      /** 空间允许查看后返回的脱敏且大小受限的 JSON。 */
      value: unknown; /** 剩余存活秒数，负数沿用 Redis 的过期语义。 */
      ttl: number;
    };
  };
  /** 清理一个键或分批清理空间，空间清理可重复调用直到游标归零。 */
  clear: {
    /** 通过后端 schema 验证的请求数据。 */
    req: {
      /** 显式注册的缓存空间名称，禁止任意前缀。 */
      name: string; /** 空间内的业务键，不含应用前缀。 */
      key?: string; /** Redis 返回的扫描游标，字符串 0 表示一轮结束。 */
      cursor?: string;
    };
    /** 管理端直接使用的响应数据。 */
    resp: {
      /** 本次实际移除的键数，重复清理不重复计数。 */
      removed: number; /** Redis 返回的扫描游标，字符串 0 表示一轮结束。 */
      cursor: string;
    };
  };
}>;
