import { helperStatic } from '@repo/ui';

export const { staticMapping, staticOptions } = helperStatic({
  available: [
    [false, '禁用'],
    [true, '启用'],
  ],
  task_status: [
    ['queued', '等待中'],
    ['running', '执行中'],
    ['retrying', '等待重试'],
    ['succeeded', '执行成功'],
    ['failed', '执行失败'],
    ['canceled', '已取消'],
    ['timed_out', '执行超时'],
  ],
  task_update_mode: [
    ['auto', '自动'],
    ['manual', '手动'],
  ],
  interface_mode: [
    ['active', '主动发起'],
    ['passive', '被动接收'],
  ],
  interface_status: [
    ['completed', '成功'],
    ['failed', '失败'],
    ['pending', '进行中'],
  ],
});
