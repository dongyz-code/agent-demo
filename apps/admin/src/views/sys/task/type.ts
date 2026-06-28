import type { ApiSys } from '@/types';

type TaskAllAction = ApiSys.TaskAction;

type ApiListReq = TaskAllAction['list']['req'];

/** 任务列表检索表单 */
export type SearchForm = NonNullable<ApiListReq['form']>;

/** 任务 Item */
export type TaskItem = TaskAllAction['list']['resp']['list'][number];

/** 创建任务表单 */
export type CreateTaskForm = Extract<
  TaskAllAction['add']['req'],
  { key: string }
>;

/** 任务分类 */
export type TaskType = TaskAllAction['types']['resp'][number];
