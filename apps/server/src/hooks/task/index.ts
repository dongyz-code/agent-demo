import { helperScript, InitTaskRun } from './lib.js';
import { schema } from '@/database/index.js';
import { join } from 'node:path';

import type { TableDownload } from './list/table-download/type.js';
import type { DeployParams } from '../app-build-deploy/type.js';

const __dirname = import.meta.dirname;
const SRC_DIR = join(__dirname, '../../');

const tableDownload = helperScript<[TableDownload]>({
  group: '数据表格导出',
  role: 'node',
  dir: join(__dirname, 'list/table-download'),
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
          options: Object.keys(schema.schemaTables),
          required: true,
        },
      ],
    },
  ],
});

const appBuildDeploy = helperScript<[DeployParams]>({
  group: '应用构建部署',
  role: 'node',
  dir: join(SRC_DIR, 'hooks/app-build-deploy'),
  filename: 'worker',
  allowFrontendSubmit: false,
  /** 别改这里，已经作为任务查询标识了 */
  pending_uuid_make({ args: [{ id }] }) {
    return id;
  },
  task_name({ args: [{ id, purpose, name }] }) {
    return `${id} - ${name} - ${purpose}`;
  },
});

const scripts = {
  // tableDownload,
  appBuildDeploy,
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
