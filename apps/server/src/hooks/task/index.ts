import { helperScript, InitTaskRun } from './lib.js';
import { schema } from '@/database/index.js';

import type { TableDownload } from './list/table-download/type.js';

const tableDownload = helperScript<[TableDownload]>({
  group: '数据表格导出',
  role: 'node',
  dir: new URL('./list/table-download', import.meta.url).pathname,
  filename: 'index',
  allowFrontendSubmit: true,
  argsMode: [
    {
      key: 0,
      comment: '对象参数',
      type: 'object',
      required: true,
      properties: [
        {
          key: 'table',
          comment: '表格名称',
          type: 'select',
          options: Object.keys(schema.managedTableRegistry),
          required: true,
        },
      ],
    },
  ],
});

const scripts = {
  // tableDownload,
};

export const tasksRun = new InitTaskRun({
  scripts,
});

/** 任务添加辅助函数, 返回 task_id + promise , 需要自行 await */
export async function taskAddHelper(...items: Parameters<typeof tasksRun.add>) {
  const resp = await tasksRun.add(...items);
  if (!resp) {
    throw new Error('任务添加失败');
  }
  return resp;
}
