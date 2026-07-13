import type { ApiMultAction } from '../../common/index.js';
import type { TaskItem } from '../models.js';

export type TaskSqlFilter = {
  /** 统一任务分类。 */
  category?: TaskItem['task_category'] | TaskItem['task_category'][];
  key?: string | string[];
  status?: TaskItem['status'] | TaskItem['status'][];
  trigger_method?: TaskItem['trigger_method'];
  /** 当前执行阶段。 */
  current_stage?: string | string[];
  /** 关联业务对象标识。 */
  business_id?: string;
  /** 文件显示名称。 */
  file_name?: string;
  /** 目标知识库标识。 */
  dataset_id?: string;
  /** 任务发起用户。 */
  execution_user_id?: string;
  search?: string;
  create_timestamp?: (Date | null)[];
};

/** 顶层是数组，对象模式下是 key */
export type TaskArgItem<
  T extends { optionKey: string } = { optionKey: string },
> = {
  /** 参数名(数字为数组下标, 字符串为对象属性名) */
  key: number | string;
  /** 参数说明 */
  comment: string;
  /** 是否必填(默认必填) */
  required: boolean;
} & (
  | {
      /** 值为布尔类型 前端使用 switch */
      type: 'boolean';
    }
  | {
      /** 值为数字类型 前端使用 input-number */
      type: 'number';
    }
  | {
      /** 值为数字类型 前端使用 input-number */
      type: 'string';
    }
  | {
      /** 选项，默认使用 el-select */
      type: 'select';
      /** 是否多选（string | string[]） */
      multiple?: boolean;
      /** 选项列表 */
      options:
        | T['optionKey'][]
        | {
            label: string;
            value: T['optionKey'];
          }[];
    }
  | {
      /** 对象模式，识别为对象的 key */
      type: 'object';
      /** 对象属性 */
      properties: TaskArgItem<T>[];
    }
);

export type TaskAction = ApiMultAction<{
  /** 添加任务 */
  add: {
    req:
      | {
          key: string;
          args: unknown[];
          trigger_method: TaskItem['trigger_method'];
        }
      | {
          history_task_id: string;
        };
    resp: {
      task_id: string;
    };
  };
  /** 获取所有任务类型 */
  types: {
    req: {};
    resp: {
      key: string;
      name: string;
      /** 参数模式 */
      argsMode?: TaskArgItem[];
      /** 是否允许前端添加任务 */
      allowFrontendSubmit?: boolean;
    }[];
  };
  /** 杀死任务 */
  kill: {
    req: {
      task_id: string | string[];
    };
  };
  /** 数据库操作: 状态计数 */
  counts: {
    req: {
      form?: TaskSqlFilter;
    };
    resp: {
      status: TaskItem['status'];
      count: number;
    }[];
  };
  /** 数据库操作: 日志 */
  logs: {
    req: {
      task_id: string;
    };
    resp: string[];
  };
  /** 数据库操作: 查询列表 */
  list: {
    req: {
      form?: TaskSqlFilter;
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      list: (Omit<TaskItem, 'logs' | 'args'> & {
        /** 是否正在运行(如果任务状态是 pending 且 running 为 false, 则表示任务已经过期了) */
        running?: boolean;
        /** 文件任务专属摘要；系统任务为空。 */
        file_task?: {
          file_id: string;
          filename: string;
          dataset_id: string | null;
          dataset_name: string | null;
          execution_no: number;
          trigger_source: import('../models.js').FileProcessingTriggerSource;
          processing_config_version: string;
        } | null;
      })[];
      count: number;
    };
  };
  /** ---------- 定时任务相关 ---------- */
  'schedule-list': {
    req: {};
    resp: { name: string; cron: string; status: boolean }[];
  };
  'schedule-pause': {
    req: { name: string };
  };
  'schedule-resume': {
    req: { name: string };
  };
}>;
