<template>
  <section class="flex min-h-full flex-col">
    <div class="rounded-b bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        :layout="{ labelWidth: '72px' }"
        @reset="getList(true)"
        @submit="getList(true)"
      />
    </div>

    <div class="mt-2 flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex flex-wrap items-center justify-end gap-3">
        <page-component @update:model-value="getList()" />
      </div>

      <div class="min-h-0 flex-1">
        <v-table
          class="h-full"
          :data="tables"
          :rows="tableRows"
          :loading="loading.list"
          :props="{ height: '100%' }"
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
          <template #latestOperation="{ row }">
            <div v-if="row.latestOperation" class="flex flex-wrap items-center gap-1">
              <span>{{ operationTypeLabel(row.latestOperation.type) }}</span>
              <el-tag
                size="small"
                :type="operationStatusTagType(row.latestOperation.status)"
              >
                {{ operationStatusLabel(row.latestOperation.status) }}
              </el-tag>
            </div>
            <span v-else>-</span>
          </template>
          <template #actions="{ row }">
            <div class="flex flex-wrap justify-center gap-2">
              <el-button link type="primary" @click.stop="selectTable(row)">
                详情
              </el-button>
              <el-button
                link
                type="primary"
                :disabled="!canResetTable"
                @click.stop="openResetDialog(row)"
              >
                重置表结构
              </el-button>
            </div>
          </template>
        </v-table>
      </div>
    </div>

    <detail-dialog
      v-model="detailDialog.visible"
      :detail="detail"
      :operations="operations"
      :loading="loading.detail"
    />
    <reset-dialog ref="resetDialogRef" @applied="handleResetApplied" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';
import { api } from '@/api';
import { useStore } from '@/store';
import DetailDialog from './components/DetailDialog.vue';
import ResetDialog from './components/ResetDialog.vue';
import { adminPermissionKey } from '@repo/shared/permission';
import {
  diffLabel,
  diffTagType,
  operationStatusLabel,
  operationStatusTagType,
  operationTypeLabel,
} from './utils';

import type { ApiSys } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';
import type {
  SysTableDetail,
  SysTableListItem,
  SysTableListResponse,
  SysTableOperation,
} from './types';

type SearchForm = {
  /** 表名或 schema key 搜索关键词。 */
  search?: string;
  /** 物理状态筛选。 */
  physicalStatus?: ApiSys.TablePhysicalStatus;
  /** 差异级别筛选。 */
  diffLevel?: ApiSys.TableDiffLevel;
};

const searchForm = shallowRef<SearchForm>({});
const store = useStore();
const canResetTable = computed(() =>
  store.hasPermission(adminPermissionKey('actions.table.reset')),
);

const searchColumns: SchemaFormColumn<SearchForm>[] = [
  {
    dataIndex: 'search',
    fieldProps: {
      clearable: true,
      placeholder: '表名 / schema key',
    },
    title: '表名',
    valueType: 'text',
  },
  {
    dataIndex: 'physicalStatus',
    fieldProps: {
      clearable: true,
      placeholder: '物理状态',
    },
    title: '物理状态',
    valueEnum: {
      exists: '存在',
      missing: '缺失',
    },
    valueType: 'select',
  },
  {
    dataIndex: 'diffLevel',
    fieldProps: {
      clearable: true,
      placeholder: '差异状态',
    },
    title: '差异状态',
    valueEnum: {
      synced: '一致',
      different: '有差异',
      missing: '缺失',
    },
    valueType: 'select',
  },
];

const loading = reactive({
  list: false,
  detail: false,
});

const tables = shallowRef<SysTableListItem[]>([]);
const detail = shallowRef<SysTableDetail>();
const operations = shallowRef<SysTableOperation[]>([]);
const selectedTable = shallowRef<SysTableListItem>();
const resetDialogRef = ref<InstanceType<typeof ResetDialog>>();

const detailDialog = reactive<{
  /** 详情弹窗是否可见。 */
  visible: boolean;
}>({
  visible: false,
});

/** 表清单分页组件和当前接口查询范围。 */
const { pageComponent, pageRange, setPageData } = usePage({
  props: {
    align: 'center',
  },
  page: {
    size: 10,
  },
});

const tableRows: TableRow[] = [
  { label: 'Key', value: 'table', minWidth: 'normal' },
  { label: '表名', value: 'tableName', minWidth: 'normal' },
  { label: 'Schema', value: 'schemaName', minWidth: 'sm' },
  { label: '物理状态', value: 'physicalStatus', slot: 'physicalStatus', width: 110 },
  { label: '差异', value: 'diffLevel', slot: 'diffLevel', width: 110 },
  { label: '字段数', value: 'columnCount', width: 90 },
  { label: '估算行数', value: 'estimatedRows', width: 110 },
  {
    label: '最近操作',
    value: 'latestOperation',
    slot: 'latestOperation',
    minWidth: 'normal',
  },
  { label: '操作', value: 'actions', slot: 'actions', width: 220, fixed: 'right' },
];

/**
 * 获取表清单，并按当前筛选和分页条件刷新页面。
 *
 * @param withCount 是否重新统计总数，搜索条件变化时需要重置页码和总数。
 */
async function getList(withCount = false) {
  if (withCount) {
    setPageData({ current: 1 });
  }

  loading.list = true;
  try {
    const result = await api('/sys/table/list', {
      search: searchForm.value.search || undefined,
      physicalStatus: searchForm.value.physicalStatus || undefined,
      diffLevel: searchForm.value.diffLevel || undefined,
      limit: pageRange.value,
      withCount,
    });
    const response = result as SysTableListResponse;
    const hasServerCount = typeof response.count === 'number';
    const [start = 0, end = response.list.length] = pageRange.value;
    if (withCount || !hasServerCount) {
      setPageData({ total: response.count ?? response.list.length });
    }
    tables.value = hasServerCount
      ? response.list
      : response.list.slice(start, end);
  } finally {
    loading.list = false;
  }
}

/** 选择表，打开详情弹窗，并加载详情和操作记录。 */
async function selectTable(row: SysTableListItem) {
  selectedTable.value = row;
  detailDialog.visible = true;
  detail.value = undefined;
  operations.value = [];
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

/** 加载当前表的结构操作记录。 */
async function getOperations(table: string) {
  const result = await api('/sys/table/operation-list', {
    table,
    limit: [0, 20],
  });
  operations.value = result.list;
}

/**
 * 打开重置弹窗，复用已经加载的详情以减少重复请求。
 *
 * @param row 当前要重置的表清单行。
 */
function openResetDialog(row: SysTableListItem) {
  resetDialogRef.value?.open(row, detail.value);
}

/** 重置执行完成后刷新列表，并在详情弹窗打开时刷新当前详情。 */
async function handleResetApplied() {
  await getList(true);
  if (detailDialog.visible && selectedTable.value) {
    await selectTable(selectedTable.value);
  }
}

onMounted(() => {
  getList(true);
});
</script>
