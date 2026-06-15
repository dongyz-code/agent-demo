import { diffManagedTable } from './diff.js';
import { hasTablePermission } from './permission-utils.js';
import { maskPreviewValue } from './sensitive.js';
import {
  buildRenameColumnSourceMap,
  buildResetColumnSourceMap,
} from './plan-utils.js';

import type { ManagedTableCatalog, ManagedTableSchema } from './types.js';

/** 断言条件成立，失败时抛出错误并让自检进程退出非 0。 */
function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const schemaTable: ManagedTableSchema = {
  table: 'demo',
  drizzleTable: {} as ManagedTableSchema['drizzleTable'],
  schemaName: 'public',
  tableName: 'demo',
  columns: [
    {
      name: 'id',
      key: 'id',
      dataType: 'string',
      sqlType: 'uuid',
      notNull: true,
      hasDefault: false,
      primaryKey: true,
    },
    {
      name: 'name',
      key: 'name',
      dataType: 'string',
      sqlType: 'varchar(255)',
      notNull: true,
      hasDefault: false,
      primaryKey: false,
    },
  ],
  indexes: [],
};

const catalogTable: ManagedTableCatalog = {
  schemaName: 'public',
  tableName: 'demo_old',
  exists: true,
  estimatedRows: 2,
  columns: [
    {
      name: 'id',
      sqlType: 'uuid',
      notNull: true,
      hasDefault: false,
      primaryKey: true,
    },
    {
      name: 'old_name',
      sqlType: 'varchar(255)',
      notNull: true,
      hasDefault: false,
      primaryKey: false,
    },
  ],
  indexes: [],
  constraints: [],
};

/** 验证表管理权限 helper 的页面权限、全局动作权限和表范围权限判断。 */
function testPermissions() {
  const context = {
    user_id: 'u1',
    sys_admin: false,
    permissions: new Set([
      'pages.sys.sys.table',
      'actions.table.view',
      'actions.table.demo.preview',
    ]),
  };

  assert(
    hasTablePermission({ context, table: 'demo', action: 'view' }),
    '全局 view 权限应允许查看 demo 表',
  );
  assert(
    hasTablePermission({ context, table: 'demo', action: 'preview' }),
    '表范围 preview 权限应允许查看 demo 数据',
  );
  assert(
    !hasTablePermission({ context, table: 'demo', action: 'reset' }),
    '缺少 reset 权限时必须拒绝',
  );
}

/** 验证敏感字段和二进制字段会被脱敏。 */
function testMasking() {
  const masked = maskPreviewValue({
    name: 'password',
    sqlType: 'varchar(255)',
    value: 'secret-value',
  });
  assert(
    typeof masked === 'object' && masked !== null && 'masked' in masked,
    'password 字段应返回脱敏对象',
  );
}

/** 验证 schema diff 能识别字段缺失。 */
function testDiff() {
  const result = diffManagedTable({ schemaTable, catalogTable });
  assert(result.level === 'different', '字段名不一致时应标记为 different');
  assert(
    result.diff.some((item) => item.name === 'name' && item.type === 'missing'),
    'schema 字段 name 缺失时应生成 missing diff',
  );
}

/** 验证 rename/reset 计划的字段映射和阻塞项判断。 */
function testPlanMappings() {
  const renameBlockers: string[] = [];
  const renameMap = buildRenameColumnSourceMap({
    schemaTable,
    catalogTable,
    columnMappings: [{ from: 'old_name', to: 'name' }],
    blockers: renameBlockers,
  });
  assert(!renameBlockers.length, '合法 rename 映射不应产生阻塞项');
  assert(renameMap.name === 'old_name', 'rename 映射应将目标 name 指向 old_name');

  const resetBlockers: string[] = [];
  const resetMap = buildResetColumnSourceMap({
    schemaTable,
    catalogTable,
    columnMappings: [{ from: 'old_name', to: 'name' }],
    blockers: resetBlockers,
  });
  assert(!resetBlockers.length, '合法 reset 映射不应产生阻塞项');
  assert(resetMap.name === 'old_name', 'reset 映射应将目标 name 指向 old_name');
}

/** 执行表管理纯函数自检。 */
export function runTableManagementSelfTest() {
  testPermissions();
  testMasking();
  testDiff();
  testPlanMappings();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTableManagementSelfTest();
  console.log('table-management self-test passed');
}
