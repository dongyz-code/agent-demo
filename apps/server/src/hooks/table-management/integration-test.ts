import { randomUUID } from 'node:crypto';
import { ROOT } from '@/configs/index.js';
import { db, pool, schema, sql } from '@/database/index.js';
import {
  applyRenamePlan,
  applyResetPlan,
  createRenamePlan,
  createResetPlan,
  getAuthorizedTableState,
  getTableCatalog,
  getTablePreview,
  getVisibleTableDetail,
  listVisibleTables,
} from './index.js';

/** 集成验证使用当前数据库连接配置中的 PostgreSQL schema。 */
const testTableSchema = ROOT.pg.path?.trim() || 'public';

/** 断言集成验证条件成立，失败时让验证进程退出非 0。 */
function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

/** 插入普通用户、角色和一行 demo 数据，用于验证权限差异和脱敏预览。 */
async function seedPermissionData() {
  const now = new Date();
  const user_id = randomUUID();
  const role_id = randomUUID();

  await db.insert(schema.user).values({
    user_id,
    username: `table_test_${Date.now()}`,
    password: 'plain-secret',
    nickname: 'Table Test',
    email: 'table-test@example.com',
    available: true,
    last_login_timestamp: null,
    extra: null,
    create_user_id: '-',
    create_timestamp: now,
    last_update_user_id: '-',
    last_update_timestamp: now,
  });
  await db.insert(schema.role).values({
    role_id,
    name: `table-test-${Date.now()}`,
    desc: null,
    available: true,
    permission: JSON.stringify([
      'pages.sys.sys.table',
      'actions.table.view',
      'actions.table.user.preview',
    ]),
    create_user_id: '-',
    create_timestamp: now,
    last_update_user_id: '-',
    last_update_timestamp: now,
  });
  await db.insert(schema.user_role).values({
    user_id,
    role_id,
    last_update_user_id: '-',
    last_update_timestamp: now,
  });

  return user_id;
}

/** 验证表清单、详情和 demo 数据预览的权限差异。 */
async function verifyPermissionAndPreview() {
  const user_id = await seedPermissionData();
  const list = await listVisibleTables({ user_id });
  assert(list.some((item) => item.table === 'user'), '普通用户应能看到 user 表');
  assert(
    list.every((item) => item.table !== 'table_structure_ops'),
    '审计表不应出现在可管理表清单中',
  );

  const detail = await getVisibleTableDetail({ user_id, table: 'user' });
  assert(detail.tableName === 'user', 'user 表详情应可读取');

  const { schemaTable, catalogTable } = await getAuthorizedTableState({
    user_id,
    table: 'user',
    action: 'preview',
  });
  const preview = await getTablePreview({ schemaTable, catalogTable, limit: 5 });
  const passwordValue = preview.rows.find((row) => row.password)?.password;
  assert(
    typeof passwordValue === 'object' &&
      passwordValue !== null &&
      'masked' in passwordValue,
    'password 字段应被脱敏',
  );

  let denied = false;
  try {
    await getAuthorizedTableState({
      user_id,
      table: 'role',
      action: 'preview',
    });
  } catch {
    denied = true;
  }
  assert(denied, '缺少 role.preview 权限时必须拒绝');
}

/** 验证 rename plan/apply 能把旧物理表名改回 Drizzle schema 目标表名。 */
async function verifyRenameApply() {
  await db.execute(sql`alter table "apps" rename to "apps_old"`);
  const plan = await createRenamePlan({
    user_id: '-',
    table: 'apps',
    oldTableName: 'apps_old',
  });
  assert(!plan.blockers.length, 'rename plan 不应产生阻塞项');
  await applyRenamePlan({
    user_id: '-',
    op_id: plan.op_id,
    confirm: plan.confirmText,
  });
  const catalog = await getTableCatalog({
    schemaName: testTableSchema,
    tableName: 'apps',
  });
  assert(catalog.exists, 'rename apply 后目标表应存在');
}

/** 验证 rename apply 事务失败时不会留下半完成的表名修改。 */
async function verifyRenameRollback() {
  await db.execute(sql`alter table "apps" rename to "apps_backup"`);
  await db.execute(sql`
    create table "apps_tx_old" (
      "id" integer primary key not null,
      "name" varchar(255) not null,
      "old_name" varchar(255) not null,
      "desc" text,
      "available" boolean not null,
      "client_id" uuid not null,
      "client_secret" varchar(255) not null,
      "last_login_timestamp" timestamp (6) with time zone,
      "create_user_id" varchar(255) not null,
      "create_timestamp" timestamp (6) with time zone not null,
      "last_update_user_id" varchar(255) not null,
      "last_update_timestamp" timestamp (6) with time zone not null
    )
  `);

  const plan = await createRenamePlan({
    user_id: '-',
    table: 'apps',
    oldTableName: 'apps_tx_old',
    columnMappings: [{ from: 'old_name', to: 'name' }],
  });
  assert(!plan.blockers.length, 'rollback rename plan 不应在预演阶段阻塞');

  let failed = false;
  try {
    await applyRenamePlan({
      user_id: '-',
      op_id: plan.op_id,
      confirm: plan.confirmText,
    });
  } catch {
    failed = true;
  }
  assert(failed, '重复字段名应导致 rename apply 失败');

  const sourceCatalog = await getTableCatalog({
    schemaName: testTableSchema,
    tableName: 'apps_tx_old',
  });
  const targetCatalog = await getTableCatalog({
    schemaName: testTableSchema,
    tableName: 'apps',
  });
  assert(sourceCatalog.exists, '事务失败后源表名应保持不变');
  assert(!targetCatalog.exists, '事务失败后不应留下半完成目标表');

  await db.execute(sql`drop table "apps_tx_old"`);
  await db.execute(sql`alter table "apps_backup" rename to "apps"`);
}

/** 插入 apps 表测试数据，并人为制造多余字段用于 reset 验证。 */
async function seedResetData() {
  const now = new Date();
  await db.insert(schema.apps).values({
    id: 1,
    name: 'Reset Test',
    desc: null,
    available: true,
    client_id: randomUUID(),
    client_secret: 'secret',
    last_login_timestamp: null,
    create_user_id: '-',
    create_timestamp: now,
    last_update_user_id: '-',
    last_update_timestamp: now,
  });
  await db.execute(sql`alter table "apps" add column "obsolete_column" text`);
}

/** 验证 reset plan/apply 会复制数据、保留备份表并恢复 Drizzle schema 字段。 */
async function verifyResetApply() {
  await seedResetData();
  const plan = await createResetPlan({
    user_id: '-',
    table: 'apps',
  });
  assert(!plan.blockers.length, 'reset plan 不应产生阻塞项');
  const result = await applyResetPlan({
    user_id: '-',
    op_id: plan.op_id,
    confirm: plan.confirmText,
  });
  assert(result.backupTableName, 'reset apply 应返回备份表名');

  const rows = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from "apps"`,
  );
  assert(rows.rows[0]?.count === 1, 'reset 后目标表行数应保持一致');

  const backup = await getTableCatalog({
    schemaName: testTableSchema,
    tableName: result.backupTableName!,
  });
  assert(backup.exists, 'reset 后备份表应保留');

  const target = await getTableCatalog({
    schemaName: testTableSchema,
    tableName: 'apps',
  });
  assert(
    target.columns.every((column) => column.name !== 'obsolete_column'),
    'reset 后目标表不应保留多余字段',
  );
}

/** 执行表管理集成验证，会修改当前连接的测试数据库。 */
export async function runTableManagementIntegrationTest() {
  await verifyPermissionAndPreview();
  await verifyRenameApply();
  await verifyRenameRollback();
  await verifyResetApply();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runTableManagementIntegrationTest();
  console.log('table-management integration-test passed');
  await pool.end();
}
