<template>
  <section>
    <div class="rounded-b bg-white p-4 shadow">
      <div class="flex flex-wrap items-center gap-3">
        <el-input
          v-model="filters.search"
          class="max-w-70"
          clearable
          placeholder="表名 / schema key"
          @keyup.enter="getList"
        />
        <el-select
          v-model="filters.physicalStatus"
          class="max-w-40"
          clearable
          placeholder="物理状态"
        >
          <el-option label="存在" value="exists" />
          <el-option label="缺失" value="missing" />
        </el-select>
        <el-select
          v-model="filters.diffLevel"
          class="max-w-40"
          clearable
          placeholder="差异状态"
        >
          <el-option label="一致" value="synced" />
          <el-option label="有差异" value="different" />
          <el-option label="缺失" value="missing" />
        </el-select>
        <el-button type="primary" :loading="loading.list" @click="getList">
          搜索
        </el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </div>

    <div class="my-2 rounded bg-white p-4 shadow">
      <v-table
        :data="tableData"
        :rows="tableRows"
        :loading="loading.list"
        @row-click="selectTable"
      >
        <template #physicalStatus="{ row }">
          <el-tag :type="row.physicalStatus === 'exists' ? 'success' : 'danger'">
            {{ row.physicalStatus === 'exists' ? '存在' : '缺失' }}
          </el-tag>
        </template>
        <template #diffLevel="{ row }">
          <el-tag :type="diffTagType(row.diffLevel)">
            {{ diffLabel(row.diffLevel) }}
          </el-tag>
        </template>
        <template #permissions="{ row }">
          <div class="flex flex-wrap gap-1">
            <el-tag
              v-for="permission in row.permissions"
              :key="permission"
              size="small"
              effect="plain"
            >
              {{ permissionLabel(permission) }}
            </el-tag>
          </div>
        </template>
        <template #latestOperation="{ row }">
          <span v-if="row.latestOperation">
            {{ row.latestOperation.type }} / {{ row.latestOperation.status }}
          </span>
          <span v-else>-</span>
        </template>
        <template #actions="{ row }">
          <div class="flex flex-wrap justify-center gap-2">
            <el-button link type="primary" @click.stop="selectTable(row)">
              详情
            </el-button>
            <el-button
              link
              type="warning"
              :disabled="!row.permissions.includes('rename')"
              @click.stop="openPlanDialog('rename', row)"
            >
              重命名
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="!row.permissions.includes('reset')"
              @click.stop="openPlanDialog('reset', row)"
            >
              重置
            </el-button>
          </div>
        </template>
      </v-table>
    </div>

    <div v-if="detail" class="my-2 rounded bg-white p-4 shadow">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold">{{ detail.tableName }}</h2>
          <p class="text-sm text-gray-500">
            {{ detail.schemaName }} / {{ detail.table }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <el-button
            :disabled="!detail.permissions.includes('preview')"
            @click="getPreview"
          >
            读取 Demo 数据
          </el-button>
          <el-button
            type="warning"
            :disabled="!detail.permissions.includes('rename')"
            @click="openPlanDialog('rename', selectedTable)"
          >
            生成重命名计划
          </el-button>
          <el-button
            type="danger"
            :disabled="!detail.permissions.includes('reset')"
            @click="openPlanDialog('reset', selectedTable)"
          >
            生成重置计划
          </el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="结构" name="structure">
          <el-descriptions border :column="3">
            <el-descriptions-item label="物理状态">
              {{ detail.physicalStatus }}
            </el-descriptions-item>
            <el-descriptions-item label="差异状态">
              {{ diffLabel(detail.diffLevel) }}
            </el-descriptions-item>
            <el-descriptions-item label="字段数">
              {{ detail.schemaColumns.length }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="mt-4 grid gap-4 xl:grid-cols-2">
            <div>
              <h3 class="mb-2 font-bold">Drizzle schema</h3>
              <el-table :data="detail.schemaColumns" border size="small">
                <el-table-column prop="name" label="字段" min-width="140" />
                <el-table-column prop="sqlType" label="类型" min-width="160" />
                <el-table-column label="约束" min-width="140">
                  <template #default="{ row }">
                    <div class="flex flex-wrap gap-1">
                      <el-tag v-if="row.primaryKey" size="small">PK</el-tag>
                      <el-tag v-if="row.notNull" size="small" type="warning">
                        NOT NULL
                      </el-tag>
                      <el-tag v-if="row.sensitive" size="small" type="info">
                        脱敏
                      </el-tag>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div>
              <h3 class="mb-2 font-bold">数据库实态</h3>
              <el-table :data="detail.catalogColumns" border size="small">
                <el-table-column prop="name" label="字段" min-width="140" />
                <el-table-column prop="sqlType" label="类型" min-width="160" />
                <el-table-column label="约束" min-width="140">
                  <template #default="{ row }">
                    <div class="flex flex-wrap gap-1">
                      <el-tag v-if="row.primaryKey" size="small">PK</el-tag>
                      <el-tag v-if="row.notNull" size="small" type="warning">
                        NOT NULL
                      </el-tag>
                      <el-tag v-if="row.hasDefault" size="small" type="success">
                        DEFAULT
                      </el-tag>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="差异" name="diff">
          <el-alert
            v-if="!detail.diff.length"
            title="当前结构与 schema 摘要一致"
            type="success"
            :closable="false"
          />
          <div v-else class="space-y-2">
            <el-alert
              v-for="item in detail.diff"
              :key="`${item.scope}-${item.name}-${item.type}`"
              :title="item.message"
              :type="item.type === 'complex' ? 'warning' : 'error'"
              :closable="false"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="Demo 数据" name="preview">
          <div class="mb-3">
            <el-button
              type="primary"
              :loading="loading.preview"
              :disabled="!detail.permissions.includes('preview')"
              @click="getPreview"
            >
              刷新 Demo 数据
            </el-button>
          </div>
          <el-table :data="previewRows" border size="small">
            <el-table-column
              v-for="column in preview?.columns ?? []"
              :key="column.name"
              :prop="column.name"
              :label="column.name"
              min-width="160"
            />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="操作记录" name="operations">
          <el-table :data="operations" border size="small">
            <el-table-column prop="type" label="类型" width="90" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column prop="source_table_name" label="源表" min-width="140" />
            <el-table-column prop="target_table_name" label="目标表" min-width="140" />
            <el-table-column label="创建时间" min-width="160">
              <template #default="{ row }">
                {{ formatTime(row.create_timestamp) }}
              </template>
            </el-table-column>
            <el-table-column prop="backup_table_name" label="备份表" min-width="180" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <v-dialog
      v-model="planDialog.visible"
      width="760px"
      :title="planDialog.type === 'rename' ? '重命名计划' : 'Schema 重置计划'"
    >
      <div class="space-y-4">
        <el-alert
          title="高风险结构操作只会执行服务端生成并保存的计划"
          type="warning"
          :closable="false"
        />
        <template v-if="planDialog.type === 'rename'">
          <el-input
            v-model="planDialog.oldTableName"
            placeholder="旧表名，默认目标表名"
          />
        </template>
        <el-input
          v-model="planDialog.mappings"
          type="textarea"
          :rows="4"
          placeholder="字段映射，每行一个：旧字段:新字段"
        />
        <el-button
          type="primary"
          :loading="loading.plan"
          @click="createPlan"
        >
          生成计划
        </el-button>

        <template v-if="planDialog.plan">
          <div>
            <h3 class="mb-2 font-bold">SQL 摘要</h3>
            <pre class="max-h-48 overflow-auto rounded bg-gray-950 p-3 text-xs text-white">{{ planDialog.plan.sqlPreview.join('\n') }}</pre>
          </div>
          <div v-if="planDialog.plan.warnings.length" class="space-y-2">
            <el-alert
              v-for="warning in planDialog.plan.warnings"
              :key="warning"
              :title="warning"
              type="warning"
              :closable="false"
            />
          </div>
          <div v-if="planDialog.plan.blockers.length" class="space-y-2">
            <el-alert
              v-for="blocker in planDialog.plan.blockers"
              :key="blocker"
              :title="blocker"
              type="error"
              :closable="false"
            />
          </div>
          <el-input
            v-model="planDialog.confirm"
            :placeholder="`输入 ${planDialog.plan.confirmText} 确认执行`"
          />
        </template>
      </div>
      <template #footer>
        <el-button @click="planDialog.visible = false">取消</el-button>
        <el-button
          type="danger"
          :disabled="!canApplyPlan"
          :loading="loading.apply"
          @click="applyPlan"
        >
          执行
        </el-button>
      </template>
    </v-dialog>
  </section>
</template>

<style lang="postcss" scoped></style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { dayJsformat } from '@repo/utils-browser';
import { api } from '@/api';
import { notify } from '@/plugins/notify';
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElInput,
  ElOption,
  ElSelect,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
} from 'element-plus';
import { VDialog, VTable } from '@repo/ui';

import type { ApiSys } from '@/types';
import type { TableRow } from '@repo/ui';

type TableListItem = ApiSys.TableManagementAction['list']['resp']['list'][number];
type TableDetail = ApiSys.TableManagementAction['detail']['resp'];
type TablePreview = ApiSys.TableManagementAction['preview']['resp'];
type TableOperation =
  ApiSys.TableManagementAction['operation-list']['resp']['list'][number];
type TablePlan = ApiSys.TableManagementAction['rename-plan']['resp'];
type PlanType = 'rename' | 'reset';

const filters = reactive<{
  /** 表名或 schema key 搜索关键词。 */
  search: string;
  /** 物理状态筛选。 */
  physicalStatus: '' | ApiSys.TablePhysicalStatus;
  /** 差异级别筛选。 */
  diffLevel: '' | ApiSys.TableDiffLevel;
}>({
  search: '',
  physicalStatus: '',
  diffLevel: '',
});

const loading = reactive({
  list: false,
  detail: false,
  preview: false,
  plan: false,
  apply: false,
});

const tables = shallowRef<TableListItem[]>([]);
const detail = shallowRef<TableDetail>();
const preview = shallowRef<TablePreview>();
const operations = shallowRef<TableOperation[]>([]);
const selectedTable = shallowRef<TableListItem>();
const activeTab = ref('structure');

const planDialog = reactive<{
  /** 弹窗是否可见。 */
  visible: boolean;
  /** 当前计划类型。 */
  type: PlanType;
  /** 目标表。 */
  table?: TableListItem;
  /** rename 使用的旧表名。 */
  oldTableName: string;
  /** 字段映射文本。 */
  mappings: string;
  /** 服务端生成的计划。 */
  plan?: TablePlan;
  /** 二次确认输入。 */
  confirm: string;
}>({
  visible: false,
  type: 'rename',
  oldTableName: '',
  mappings: '',
  confirm: '',
});

const tableRows: TableRow[] = [
  { label: 'Key', value: 'table', minWidth: 'normal' },
  { label: '表名', value: 'tableName', minWidth: 'normal' },
  { label: 'Schema', value: 'schemaName', minWidth: 'sm' },
  { label: '物理状态', value: 'physicalStatus', slot: 'physicalStatus', width: 110 },
  { label: '差异', value: 'diffLevel', slot: 'diffLevel', width: 110 },
  { label: '字段数', value: 'columnCount', width: 90 },
  { label: '估算行数', value: 'estimatedRows', width: 110 },
  { label: '权限', value: 'permissions', slot: 'permissions', minWidth: 'large' },
  {
    label: '最近操作',
    value: 'latestOperation',
    slot: 'latestOperation',
    minWidth: 'normal',
  },
  { label: '操作', value: 'actions', slot: 'actions', width: 220, fixed: 'right' },
];

const tableData = computed(() =>
  tables.value,
);

const previewRows = computed(() => {
  return (preview.value?.rows ?? []).map((row) => {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'object' && value && 'masked' in value
          ? (value as { summary?: string }).summary ?? '已脱敏'
          : value,
      ]),
    );
  });
});

const canApplyPlan = computed(() => {
  const plan = planDialog.plan;
  return Boolean(
    plan &&
      !plan.blockers.length &&
      planDialog.confirm === plan.confirmText,
  );
});

/** 获取表清单，并按当前筛选条件刷新页面。 */
async function getList() {
  loading.list = true;
  try {
    const result = await api('/sys/table/list', {
      search: filters.search || undefined,
      physicalStatus: filters.physicalStatus || undefined,
      diffLevel: filters.diffLevel || undefined,
    });
    tables.value = result.list;
  } finally {
    loading.list = false;
  }
}

/** 重置筛选条件并重新加载表清单。 */
function resetFilters() {
  filters.search = '';
  filters.physicalStatus = '';
  filters.diffLevel = '';
  getList();
}

/** 选择表并加载详情、操作记录和可用 demo 数据。 */
async function selectTable(row: TableListItem) {
  selectedTable.value = row;
  activeTab.value = 'structure';
  preview.value = undefined;
  await Promise.all([getDetail(row.table), getOperations(row.table)]);
}

/** 加载单张表的结构详情。 */
async function getDetail(table: string) {
  loading.detail = true;
  try {
    detail.value = await api('/sys/table/detail', { table });
  } finally {
    loading.detail = false;
  }
}

/** 加载当前表的 demo 数据。 */
async function getPreview() {
  const table = selectedTable.value?.table;
  if (!table) {
    return;
  }
  loading.preview = true;
  try {
    preview.value = await api('/sys/table/preview', {
      table,
      limit: 20,
      offset: 0,
    });
    activeTab.value = 'preview';
  } finally {
    loading.preview = false;
  }
}

/** 加载当前表的结构操作记录。 */
async function getOperations(table: string) {
  const result = await api('/sys/table/operation-list', {
    table,
    limit: [0, 20],
  });
  operations.value = result.list;
}

/** 打开重命名或 reset 计划弹窗。 */
function openPlanDialog(type: PlanType, row?: TableListItem) {
  if (!row) {
    return;
  }
  planDialog.visible = true;
  planDialog.type = type;
  planDialog.table = row;
  planDialog.oldTableName = row.tableName;
  planDialog.mappings = '';
  planDialog.plan = undefined;
  planDialog.confirm = '';
}

/** 请求服务端生成结构操作计划。 */
async function createPlan() {
  const table = planDialog.table?.table;
  if (!table) {
    return;
  }
  loading.plan = true;
  try {
    const columnMappings = parseMappings(planDialog.mappings);
    planDialog.plan =
      planDialog.type === 'rename'
        ? await api('/sys/table/rename-plan', {
            table,
            oldTableName: planDialog.oldTableName || undefined,
            columnMappings,
          })
        : await api('/sys/table/reset-plan', {
            table,
            columnMappings,
          });
    planDialog.confirm = '';
  } finally {
    loading.plan = false;
  }
}

/** 执行当前已经生成的结构操作计划。 */
async function applyPlan() {
  const plan = planDialog.plan;
  if (!plan || !canApplyPlan.value) {
    return;
  }
  loading.apply = true;
  try {
    if (planDialog.type === 'rename') {
      await api('/sys/table/rename-apply', {
        op_id: plan.op_id,
        confirm: planDialog.confirm,
      });
    } else {
      await api('/sys/table/reset-apply', {
        op_id: plan.op_id,
        confirm: planDialog.confirm,
      });
    }
    notify('success', '执行完成');
    planDialog.visible = false;
    await getList();
    if (selectedTable.value) {
      await selectTable(selectedTable.value);
    }
  } finally {
    loading.apply = false;
  }
}

/** 解析字段映射文本，格式为每行一个 `旧字段:新字段`。 */
function parseMappings(text: string) {
  return text
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [from, to] = line.split(':').map((item) => item.trim());
      return { from, to };
    })
    .filter((item): item is { from: string; to: string } =>
      Boolean(item.from && item.to),
    );
}

/** 返回差异状态的中文标签。 */
function diffLabel(level: ApiSys.TableDiffLevel) {
  return {
    synced: '一致',
    different: '有差异',
    missing: '缺失',
  }[level];
}

/** 返回差异状态对应的 Element Plus tag 类型。 */
function diffTagType(level: ApiSys.TableDiffLevel) {
  return {
    synced: 'success',
    different: 'warning',
    missing: 'danger',
  }[level] as 'success' | 'warning' | 'danger';
}

/** 返回表管理权限动作的中文标签。 */
function permissionLabel(permission: ApiSys.TablePermissionAction) {
  return {
    view: '查看',
    preview: 'Demo',
    rename: '重命名',
    reset: '重置',
  }[permission];
}

/** 格式化接口返回的时间。 */
function formatTime(value: Date | string | null) {
  return value ? dayJsformat(value, 'YYYY-MM-DD HH:mm:ss') : '-';
}

onMounted(() => {
  getList();
});
</script>
