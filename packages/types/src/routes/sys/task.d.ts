import type { ApiMultAction } from '../../common/index.js';
import type {
  TaskAttemptItem,
  TaskItem,
  TaskLogItem,
  TaskStatus,
} from '../models.js';

/** 通用任务中心过滤条件。 */
export type TaskSqlFilter = {
  /** 任务标识精确过滤。 */
  task_id?: string;
  /** 一个或多个稳定任务名称。 */
  name?: string | string[];
  /** 一个或多个生命周期状态。 */
  status?: TaskStatus | TaskStatus[];
  /** 当前业务阶段。 */
  current_stage?: string | string[];
  /** 任务名称模糊匹配。 */
  search?: string;
  /** 创建时间闭区间。 */
  create_timestamp?: (Date | null)[];
};

/** 任务详情包含不可覆盖的全部执行尝试。 */
export type TaskDetail = TaskItem & {
  /** 按 attempt 升序排列的执行记录。 */
  attempts: TaskAttemptItem[];
};

/** 任务中心 HTTP 接口集合。 */
export type TaskAction = ApiMultAction<{
  /** 查询通用任务详情与全部 attempt。 */
  detail: {
    req: { task_id: string };
    resp: TaskDetail | null;
  };
  /** 按过滤条件统计状态数量。 */
  counts: {
    req: { form?: TaskSqlFilter };
    resp: { status: TaskStatus; count: number }[];
  };
  /** 查询结构化持久日志。 */
  logs: {
    req: { task_id: string; attempt?: number };
    resp: TaskLogItem[];
  };
  /** 分页查询通用任务。 */
  list: {
    req: {
      form?: TaskSqlFilter;
      limit?: number[];
      withCount?: boolean;
    };
    resp: { list: TaskItem[]; count: number };
  };
  /** ---------- 定时任务相关 ---------- */
  'schedule-list': {
    req: Record<string, never>;
    resp: { name: string; cron: string; status: boolean }[];
  };
  'schedule-pause': {
    req: { name: string };
  };
  'schedule-resume': {
    req: { name: string };
  };
}>;
