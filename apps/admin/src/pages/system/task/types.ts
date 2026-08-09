import type { ApiSys } from '@/types';

type TaskAllAction = ApiSys.TaskAction;

type ApiListReq = TaskAllAction['list']['req'];

/** 任务列表检索表单 */
export type SearchForm = NonNullable<ApiListReq['form']>;

/** 任务 Item */
export type TaskItem = TaskAllAction['list']['resp']['list'][number];

/** 通用任务详情及全部 attempt。 */
export type TaskDetail = NonNullable<TaskAllAction['detail']['resp']>;

/** 单条结构化任务日志。 */
export type TaskLogItem = TaskAllAction['logs']['resp'][number];
