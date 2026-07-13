<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        @reset="loadDatasets(true)"
        @submit="loadDatasets(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex justify-between">
        <strong>知识库配置</strong>
        <el-button type="primary" @click="datasetDialogRef?.open()">新建知识库</el-button>
      </div>
      <v-table class="min-h-0 flex-1" :data="datasets" :rows="rows" :loading="loading">
        <template #status="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </el-tag>
        </template>
        <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        <template #actions="{ row }">
          <el-button link @click="datasetDialogRef?.open(row)">编辑</el-button>
          <el-button
            v-if="row.status === 'active'"
            link
            type="danger"
            @click="disableDataset(row.datasetId)"
          >
            停用
          </el-button>
        </template>
      </v-table>
      <page-component @update:model-value="loadDatasets()" />
    </div>
    <dataset-dialog ref="datasetDialogRef" @saved="loadDatasets(true)" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import { api, confirm } from '@/utils';
import DatasetDialog from './components/DatasetDialog.vue';

import type { RagDatasetInfo, RagDatasetStatus } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

type SearchForm = {
  /** 知识库名称关键词。 */
  search?: string;
  /** 知识库启停状态。 */
  status?: RagDatasetStatus;
};

type DatasetRow = RagDatasetInfo & Record<string, unknown>;

const searchForm = ref<SearchForm>({});
const datasets = shallowRef<DatasetRow[]>([]);
const loading = ref(false);
const datasetDialogRef = ref<InstanceType<typeof DatasetDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({ page: { size: 20 } });

const searchColumns: SchemaFormColumn<SearchForm>[] = [
  { dataIndex: 'search', title: '名称', valueType: 'text', fieldProps: { clearable: true } },
  {
    dataIndex: 'status',
    title: '状态',
    valueType: 'select',
    valueEnum: { active: '启用', disabled: '停用' },
    fieldProps: { clearable: true },
  },
];

const rows: TableRow[] = [
  { label: '名称', value: 'name', minWidth: 'normal' },
  { label: '说明', value: 'description', minWidth: 240 },
  { label: '状态', value: 'status', slot: 'status', width: 100 },
  { label: '创建时间', value: 'createdAt', slot: 'createdAt', width: 180 },
  { label: '操作', value: 'actions', slot: 'actions', width: 140, fixed: 'right' },
];

/** 分页加载知识库配置。 */
async function loadDatasets(withCount = false) {
  if (withCount) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/documents/dataset-list', {
      search: searchForm.value.search,
      status: searchForm.value.status ? [searchForm.value.status] : undefined,
      limit: pageRange.value,
      withCount,
    });
    datasets.value = result.list.map((dataset) => ({ ...dataset }));
    if (withCount) setPageData({ total: result.count });
  } finally {
    loading.value = false;
  }
}

/** 停用知识库，已完成文件任务历史不受影响。 */
async function disableDataset(datasetId: string) {
  await confirm({
    title: '确认停用该知识库？',
    async confirmCallback() {
      await api('/documents/dataset-disable', { datasetId });
      await loadDatasets(true);
    },
  });
}

/** 将接口日期转换为本地时间文案。 */
function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString();
}

onMounted(() => loadDatasets(true));
</script>
