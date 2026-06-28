<template>
  <v-dialog
    v-model="visible"
    width="760px"
    top="5vh"
    body-class="h-[68vh] overflow-auto text-inherit! text-base!"
    :title="dialogMeta.title"
  >
    <div v-loading="loading.detail || loading.plan" class="space-y-4">
      <div class="rounded border border-amber-200 bg-amber-50 p-4">
        <h3 class="mb-2 font-medium text-amber-900">重置说明</h3>
        <div class="space-y-1 text-sm text-amber-800">
          <p>系统会按当前 schema 创建新表并回填数据，原表会改名为备份表。</p>
          <p>字段改名通过下方“复制来源字段”选择完成，不需要手写 SQL。</p>
          <p>如果有字段将从正式表移除，必须先勾选允许移除；数据仍保留在备份表中。</p>
        </div>
      </div>

      <div v-if="dialog.detail" class="rounded border border-gray-200 p-3">
        <div class="mb-3">
          <h3 class="font-medium">变更摘要</h3>
          <p class="text-sm text-gray-500">
            这里会说明正式表重置后每个字段的变化；SQL 只作为后端生成的只读预览。
          </p>
        </div>
        <el-alert
          v-if="!hasSchemaChanges"
          title="当前数据库结构与 schema 一致，无需重置。"
          type="success"
          :closable="false"
        />
        <div v-else class="grid gap-3 md:grid-cols-2">
          <div
            v-for="group in schemaChangeGroups"
            :key="group.title"
            class="rounded border border-gray-100 bg-gray-50 p-3"
          >
            <div class="mb-2 font-medium">{{ group.title }}</div>
            <div class="space-y-1 text-sm text-gray-600">
              <div v-for="item in group.items" :key="item">
                {{ item }}
              </div>
            </div>
          </div>
        </div>
        <el-checkbox
          v-if="removedCatalogColumns.length"
          v-model="dialog.allowDropColumns"
          class="mt-3"
          @change="invalidatePlan"
        >
          允许从正式表移除这些字段，数据仍保留在备份表中
        </el-checkbox>
      </div>

      <div v-if="dialog.detail" class="rounded border border-gray-200 p-3">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-medium">{{ dialogMeta.mappingTitle }}</h3>
            <p class="text-sm text-gray-500">
              同名字段会自动匹配；类型不一致会在预览中阻塞。改名字段只从候选字段里选择来源。
            </p>
          </div>
          <el-button link type="primary" @click="resetColumnMappings">
            恢复自动匹配
          </el-button>
        </div>

        <el-table
          :data="dialog.columnMappings"
          border
          max-height="260"
          size="small"
        >
          <el-table-column label="目标字段" min-width="170">
            <template #default="{ row }">
              <div class="space-y-1">
                <div class="font-medium">{{ row.target }}</div>
                <div class="text-xs text-gray-500">{{ row.targetSqlType }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="dialogMeta.sourceColumnLabel" min-width="240">
            <template #default="{ row }">
              <el-select
                v-model="row.source"
                :clearable="!hasSameNameSource(row)"
                filterable
                class="w-full"
                placeholder="无可用来源"
                @change="invalidatePlan"
              >
                <el-option
                  v-for="column in sourceColumnOptions(row)"
                  :key="column.name"
                  :disabled="column.disabled"
                  :label="column.label"
                  :value="column.name"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="结果" min-width="180">
            <template #default="{ row }">
              <el-tag :type="mappingTagType(row)" effect="plain">
                {{ mappingLabel(row) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="rounded border border-gray-200 p-3">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-medium">安全预览</h3>
            <p class="text-sm text-gray-500">
              预览由后端生成并保存；执行时只提交计划 ID 和确认文本。
            </p>
          </div>
          <el-button
            type="primary"
            :disabled="Boolean(createDisabledReason)"
            :loading="loading.plan"
            @click="createPlan"
          >
            {{ dialogMeta.createText }}
          </el-button>
        </div>
        <el-alert
          v-if="createDisabledReason"
          :title="createDisabledReason"
          type="info"
          :closable="false"
        />
      </div>

      <template v-if="dialog.plan">
        <el-descriptions border :column="2" size="small">
          <el-descriptions-item label="计划类型">
            {{ operationTypeLabel(dialog.plan.type) }}
          </el-descriptions-item>
          <el-descriptions-item label="计划状态">
            <el-tag :type="operationStatusTagType(dialog.plan.status)">
              {{ operationStatusLabel(dialog.plan.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="计划 ID">
            {{ dialog.plan.op_id }}
          </el-descriptions-item>
          <el-descriptions-item label="目标表">
            {{ dialog.plan.tableName }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="dialog.plan.backupTableName"
            label="备份表"
            :span="2"
          >
            {{ dialog.plan.backupTableName }}
          </el-descriptions-item>
        </el-descriptions>
        <details class="rounded border border-gray-200 p-3">
          <summary class="cursor-pointer font-medium">
            {{ dialogMeta.previewTitle }}
          </summary>
          <pre class="max-h-48 overflow-auto rounded bg-gray-950 p-3 text-xs text-white">{{ dialog.plan.sqlPreview.join('\n') }}</pre>
        </details>
        <div v-if="dialog.plan.warnings.length" class="space-y-2">
          <el-alert
            v-for="warning in dialog.plan.warnings"
            :key="warning"
            :title="warning"
            type="warning"
            :closable="false"
          />
        </div>
        <div v-if="dialog.plan.blockers.length" class="space-y-2">
          <el-alert
            v-for="blocker in dialog.plan.blockers"
            :key="blocker"
            :title="blocker"
            type="error"
            :closable="false"
          />
        </div>
        <div class="rounded border border-gray-200 p-3">
          <label class="mb-2 block text-sm font-medium">
            确认执行请输入：{{ dialog.plan.confirmText }}
          </label>
          <el-input
            v-model="dialog.confirm"
            :placeholder="`完整输入 ${dialog.plan.confirmText} 后可以执行`"
          />
        </div>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span class="text-left text-sm text-gray-500">
          {{ applyDisabledReason || '已满足执行条件，请再次确认风险后执行。' }}
        </span>
        <div class="flex justify-end gap-2">
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="danger"
            :disabled="!canApplyPlan"
            :loading="loading.apply"
            @click="applyPlan"
          >
            {{ dialogMeta.applyText }}
          </el-button>
        </div>
      </div>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDescriptions,
  ElDescriptionsItem,
  ElInput,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { VDialog } from '@repo/ui';
import { api } from '@/api';
import { notify } from '@/plugins/notify';
import {
  operationStatusLabel,
  operationStatusTagType,
  operationTypeLabel,
} from '../utils';

import type { ApiSys } from '@/types';
import type { SysTableDetail, SysTableListItem, SysTablePlan } from '../types';

/** 计划弹窗中的字段对应关系行，只允许从后端返回的字段候选中选择来源。 */
type PlanColumnMappingRow = {
  /** schema 目标字段名。 */
  target: string;
  /** schema 目标字段 SQL 类型。 */
  targetSqlType: string;
  /** 目标字段是否必须有可复制来源。 */
  required: boolean;
  /** 当前选择的数据库来源字段名，空值表示不复制该字段。 */
  source: string;
};

/** 字段来源下拉选项，类型不兼容时置灰但仍可展示原因。 */
type SourceColumnOption = {
  /** 数据库实态字段名。 */
  name: string;
  /** 下拉中展示的字段名和类型。 */
  label: string;
  /** 是否禁止选择。 */
  disabled: boolean;
};

/** 重置摘要分组，用于解释字段将如何变化。 */
type SchemaChangeGroup = {
  /** 分组标题。 */
  title: string;
  /** 分组内展示的字段变化说明。 */
  items: string[];
};

const emit = defineEmits<{
  /** 通知父页面重置已完成，需要刷新列表或当前详情。 */
  applied: [];
}>();

const visible = ref(false);
const requestId = ref(0);

const loading = reactive({
  detail: false,
  plan: false,
  apply: false,
});

const dialog = reactive<{
  /** 目标表。 */
  table?: SysTableListItem;
  /** 操作弹窗专用的表结构详情。 */
  detail?: SysTableDetail;
  /** 字段对应关系，只能从服务端返回字段中选择来源。 */
  columnMappings: PlanColumnMappingRow[];
  /** 是否允许重置后从正式表移除 schema 中不存在的字段。 */
  allowDropColumns: boolean;
  /** 服务端生成的计划。 */
  plan?: SysTablePlan;
  /** 二次确认输入。 */
  confirm: string;
}>({
  columnMappings: [],
  allowDropColumns: false,
  confirm: '',
});

const dialogMeta = {
  title: '重置表结构',
  mappingTitle: '数据复制对应关系',
  sourceColumnLabel: '复制来源字段',
  createText: '生成重置预览',
  previewTitle: '重置 SQL 预览',
  applyText: '执行重置',
};

const changedColumnMappings = computed(() => getChangedColumnMappings());

const usedSourceColumns = computed(
  () =>
    new Set(
      dialog.columnMappings
        .map((item) => item.source)
        .filter(Boolean),
    ),
);

const removedCatalogColumns = computed(() => {
  return (dialog.detail?.catalogColumns ?? []).filter(
    (column) => !usedSourceColumns.value.has(column.name),
  );
});

const hasSchemaChanges = computed(() => {
  if (!dialog.detail) {
    return false;
  }
  return Boolean(
    dialog.detail.diffLevel !== 'synced' ||
      changedColumnMappings.value.length ||
      removedCatalogColumns.value.length ||
      dialog.columnMappings.some((item) => !item.source),
  );
});

const schemaChangeGroups = computed<SchemaChangeGroup[]>(() => {
  const keepItems = dialog.columnMappings
    .filter((item) => item.source && item.source === item.target)
    .map((item) => `${item.target} 保持不变`);
  const mappedItems = dialog.columnMappings
    .filter((item) => item.source && item.source !== item.target)
    .map((item) => `${item.source} -> ${item.target}`);
  const addedItems = dialog.columnMappings
    .filter((item) => !item.source)
    .map((item) =>
      item.required
        ? `${item.target} 新增，但缺少可复制来源`
        : `${item.target} 新增，使用默认值或空值`,
    );
  const removedItems = removedCatalogColumns.value.map(
    (column) => `${column.name} 从正式表移除，保留在备份表`,
  );

  return [
    { title: '保留字段', items: keepItems },
    { title: '字段映射', items: mappedItems },
    { title: '新增字段', items: addedItems },
    { title: '移除字段', items: removedItems },
  ].filter((group) => group.items.length);
});

const createDisabledReason = computed(() => {
  if (loading.detail) {
    return '正在读取表结构，请稍后';
  }
  if (!dialog.table || !dialog.detail) {
    return '请先选择要处理的表';
  }
  if (dialog.detail.physicalStatus === 'missing') {
    return '数据库中没有目标表，暂时无法重置；需要先创建表或恢复源表';
  }
  if (!hasSchemaChanges.value) {
    return '当前结构一致，无需重置';
  }
  if (removedCatalogColumns.value.length && !dialog.allowDropColumns) {
    return '存在将从正式表移除的字段，请先确认允许移除';
  }
  return '';
});

const applyDisabledReason = computed(() => {
  const plan = dialog.plan;
  if (!plan) {
    return createDisabledReason.value || '请先生成安全预览';
  }
  if (plan.status !== 'planned') {
    return `当前计划状态为${operationStatusLabel(plan.status)}，不能执行`;
  }
  if (plan.blockers.length) {
    return '预览存在阻塞项，不能执行';
  }
  if (dialog.confirm !== plan.confirmText) {
    return `完整输入 ${plan.confirmText} 后可以执行`;
  }
  return '';
});

const canApplyPlan = computed(() => !applyDisabledReason.value);

/**
 * 打开重置弹窗，并加载当前表结构候选信息。
 *
 * @param row 当前要重置的表清单行。
 * @param currentDetail 父页面已经加载过的表详情，可用于减少一次请求。
 */
async function open(row: SysTableListItem, currentDetail?: SysTableDetail) {
  const currentRequestId = requestId.value + 1;
  requestId.value = currentRequestId;
  resetDialogState(row);
  visible.value = true;

  try {
    const tableDetail =
      currentDetail?.table === row.table
        ? currentDetail
        : await api('/sys/table/detail', { table: row.table });
    if (
      currentRequestId !== requestId.value ||
      !visible.value ||
      dialog.table?.table !== row.table
    ) {
      return;
    }
    dialog.detail = tableDetail;
    setColumnMappings(tableDetail);
  } finally {
    if (currentRequestId === requestId.value) {
      loading.detail = false;
    }
  }
}

defineExpose({ open });

/**
 * 重置弹窗内部状态，为下一次打开准备干净的计划上下文。
 *
 * @param row 当前要重置的表清单行。
 */
function resetDialogState(row: SysTableListItem) {
  loading.plan = false;
  loading.apply = false;
  loading.detail = true;
  dialog.table = row;
  dialog.detail = undefined;
  dialog.columnMappings = [];
  dialog.allowDropColumns = false;
  dialog.plan = undefined;
  dialog.confirm = '';
}

/** 请求服务端生成结构重置计划。 */
async function createPlan() {
  const table = dialog.table?.table;
  if (!table || createDisabledReason.value) {
    return;
  }
  const currentRequestId = requestId.value + 1;
  requestId.value = currentRequestId;
  loading.plan = true;
  try {
    const columnMappings = changedColumnMappings.value;
    const plan = await api('/sys/table/reset-plan', {
      table,
      columnMappings,
    });
    if (
      currentRequestId !== requestId.value ||
      !visible.value ||
      dialog.table?.table !== table
    ) {
      return;
    }
    dialog.plan = plan;
    dialog.confirm = '';
  } finally {
    if (currentRequestId === requestId.value) {
      loading.plan = false;
    }
  }
}

/** 执行当前已经生成的结构重置计划。 */
async function applyPlan() {
  const plan = dialog.plan;
  if (!plan || !canApplyPlan.value) {
    return;
  }
  loading.apply = true;
  try {
    await api('/sys/table/reset-apply', {
      op_id: plan.op_id,
      confirm: dialog.confirm,
    });
    notify('success', '重置执行完成');
    visible.value = false;
    emit('applied');
  } finally {
    loading.apply = false;
  }
}

/** 当前输入变化后让已生成计划失效，避免执行旧预览。 */
function invalidatePlan() {
  requestId.value += 1;
  loading.plan = false;
  dialog.plan = undefined;
  dialog.confirm = '';
}

/**
 * 根据表结构详情初始化字段对应关系。
 *
 * @param tableDetail 后端返回的目标 schema 和数据库实态。
 */
function setColumnMappings(tableDetail: SysTableDetail) {
  dialog.columnMappings = tableDetail.schemaColumns.map((column) => ({
    target: column.name,
    targetSqlType: column.sqlType,
    required: column.notNull && !column.hasDefault,
    source: chooseAutoSource(column, tableDetail.catalogColumns),
  }));
}

/** 恢复字段自动匹配，并清空已经生成的预览。 */
function resetColumnMappings() {
  if (!dialog.detail) {
    return;
  }
  setColumnMappings(dialog.detail);
  invalidatePlan();
}

/**
 * 返回当前需要显式提交给后端的字段映射。
 *
 * @returns 只包含改名字段的安全映射；同名字段由后端自动处理。
 */
function getChangedColumnMappings(): ApiSys.TableColumnMapping[] {
  return dialog.columnMappings
    .filter((item) => item.source && item.source !== item.target)
    .map(({ source, target }) => ({
      from: source,
      to: target,
    }));
}

/**
 * 返回字段来源下拉选项。
 *
 * @param row 当前目标字段对应关系。
 * @returns 数据库实态字段候选，类型不兼容的字段会置灰。
 */
function sourceColumnOptions(row: PlanColumnMappingRow): SourceColumnOption[] {
  return (dialog.detail?.catalogColumns ?? []).map((column) => {
    const compatible = isCompatibleColumn(column.sqlType, row.targetSqlType);
    return {
      name: column.name,
      label: `${column.name} / ${column.sqlType}`,
      disabled: !compatible && column.name !== row.source,
    };
  });
}

/**
 * 判断目标字段是否存在同名来源字段。
 *
 * @param row 当前目标字段对应关系。
 * @returns 同名字段存在时返回 true，此类字段由后端自动匹配。
 */
function hasSameNameSource(row: PlanColumnMappingRow) {
  return Boolean(
    dialog.detail?.catalogColumns.some((column) => column.name === row.target),
  );
}

/**
 * 返回字段映射结果说明。
 *
 * @param row 当前目标字段对应关系。
 * @returns 面向管理员的结果文本。
 */
function mappingLabel(row: PlanColumnMappingRow) {
  const sourceColumn = dialog.detail?.catalogColumns.find(
    (column) => column.name === row.source,
  );
  if (!row.source) {
    return row.required ? '缺少来源' : '使用默认值';
  }
  if (
    sourceColumn &&
    !isCompatibleColumn(sourceColumn.sqlType, row.targetSqlType)
  ) {
    return '类型不兼容';
  }
  if (row.source === row.target) {
    return '自动复制';
  }
  return '来源映射';
}

/**
 * 返回字段映射结果标签颜色。
 *
 * @param row 当前目标字段对应关系。
 * @returns Element Plus tag 类型。
 */
function mappingTagType(row: PlanColumnMappingRow) {
  const sourceColumn = dialog.detail?.catalogColumns.find(
    (column) => column.name === row.source,
  );
  if (!row.source) {
    return row.required ? 'danger' : 'info';
  }
  if (
    sourceColumn &&
    !isCompatibleColumn(sourceColumn.sqlType, row.targetSqlType)
  ) {
    return 'danger';
  }
  return row.source === row.target ? 'success' : 'warning';
}

/**
 * 自动选择同名来源字段，保持和后端默认映射一致。
 *
 * @param targetColumn schema 目标字段。
 * @param catalogColumns 数据库实态字段。
 * @returns 同名来源字段名；不存在时返回空字符串。
 */
function chooseAutoSource(
  targetColumn: SysTableDetail['schemaColumns'][number],
  catalogColumns: SysTableDetail['catalogColumns'],
) {
  return catalogColumns.some((column) => column.name === targetColumn.name)
    ? targetColumn.name
    : '';
}

/**
 * 判断两个 SQL 类型是否可直接映射。
 *
 * @param sourceSqlType 数据库实态字段类型。
 * @param targetSqlType schema 目标字段类型。
 * @returns 标准化类型一致时返回 true。
 */
function isCompatibleColumn(sourceSqlType: string, targetSqlType: string) {
  return normalizeSqlType(sourceSqlType) === normalizeSqlType(targetSqlType);
}

/**
 * 标准化 SQL 类型文本，保持前端提示和后端校验口径一致。
 *
 * @param type SQL 类型文本。
 * @returns 标准化后的类型文本。
 */
function normalizeSqlType(type: string) {
  return type
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^character varying/, 'varchar')
    .replace('timestamp(6)', 'timestamp (6)');
}
</script>
