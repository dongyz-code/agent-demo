import { helperStatic } from '@repo/ui';

export const { staticMapping, staticOptions } = helperStatic({
  available: [
    [false, '禁用'],
    [true, '启用'],
  ],
  task_status: [
    ['to-be-started', '待开始'],
    ['pending', '执行中'],
    ['completed', '已完成'],
    ['failed', '执行失败'],
    ['killed', '已停止'],
    ['deleted', '已删除'],
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
