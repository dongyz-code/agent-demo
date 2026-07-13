<template>
  <section class="flex min-h-0 flex-1 flex-col gap-3">
    <v-schema-form
      v-model="searchForm"
      mode="search"
      :columns="searchColumns"
      @reset="loadFiles(true)"
      @submit="loadFiles(true)"
    />
    <div class="flex items-center justify-between">
      <el-button type="primary" @click="uploadRef?.open()">上传文件</el-button>
      <page-component @update:model-value="loadFiles()" />
    </div>
    <v-table class="min-h-0 flex-1" :data="files" :rows="rows" :loading="loading">
      <template #size="{ row }">{{ formatFileSize(row.size) }}</template>
      <template #status="{ row }">
        <el-tag :type="row.status === 'verified' ? 'success' : row.status === 'rejected' ? 'danger' : 'info'">
          {{ fileStatusLabels[row.status] }}
        </el-tag>
      </template>
      <template #processing="{ row }">
        <div v-if="row.latestTask" class="space-y-1">
          <el-tag :type="getTaskTagType(row.latestTask.status)">
            {{ processingStatusLabels[row.latestTask.status] }}
          </el-tag>
          <div class="text-xs text-gray-500">
            {{ processingStageLabels[row.latestTask.stage] }} · {{ row.latestTask.progress }}%
          </div>
        </div>
        <span v-else class="text-gray-400">未处理</span>
      </template>
      <template #datasets="{ row }">
        {{ row.datasets.map((dataset) => dataset.name).join('、') || '-' }}
      </template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      <template #actions="{ row }">
        <el-button link @click="previewRef?.open(row.fileId)">预览</el-button>
        <el-button
          link
          :disabled="row.status !== 'verified' || Boolean(row.activeTask)"
          @click="processingRef?.open(row)"
        >
          {{ row.executionCount ? '重新执行' : 'RAG 接入' }}
        </el-button>
        <el-button v-if="row.executionCount" link @click="viewTasks(row.fileId)">任务</el-button>
        <el-button link :disabled="row.status !== 'verified'" @click="download(row.fileId)">下载</el-button>
        <el-button link type="danger" @click="remove(row.fileId)">删除</el-button>
      </template>
    </v-table>
    <upload-dialog
      ref="uploadRef"
      policy-key="rag-document"
      enable-rag
      @uploaded="handleUploaded"
    />
    <file-processing-dialog ref="processingRef" @submitted="loadFiles(true)" />
    <file-preview-dialog ref="previewRef" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import UploadDialog from '@/components/upload/UploadDialog.vue';
import FilePreviewDialog from '@/components/file-viewer/FilePreviewDialog.vue';
import FileProcessingDialog from './FileProcessingDialog.vue';
import { routerInstance } from '@/router/router';
import { api, confirm, notify } from '@/utils';
import {
  fileStatusLabels,
  formatDateTime,
  formatFileSize,
  processingStageLabels,
  processingStatusLabels,
} from '../utils';

import type {
  ManagedFileInfo,
  StoredFileStatus,
  TaskStatus,
} from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

type SearchForm = {
  /** 文件名关键词。 */
  search?: string;
  /** 文件可信状态。 */
  status?: StoredFileStatus;
  /** 文件处理任务状态。 */
  processingStatus?: TaskStatus;
  /** 目标知识库。 */
  datasetId?: string;
  /** 文件创建时间范围。 */
  createdAt?: (Date | null)[];
};

type FileRow = ManagedFileInfo & Record<string, unknown>;

const searchForm = ref<SearchForm>({});
const files = shallowRef<FileRow[]>([]);
const datasets = ref<{ datasetId: string; name: string }[]>([]);
const loading = ref(false);
const uploadRef = ref<InstanceType<typeof UploadDialog>>();
const previewRef = ref<InstanceType<typeof FilePreviewDialog>>();
const processingRef = ref<InstanceType<typeof FileProcessingDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({ page: { size: 20 } });

const searchColumns = computed<SchemaFormColumn<SearchForm>[]>(() => [
  { dataIndex: 'search', title: '文件名', valueType: 'text', fieldProps: { clearable: true } },
  { dataIndex: 'status', title: '文件状态', valueType: 'select', valueEnum: fileStatusLabels, fieldProps: { clearable: true } },
  { dataIndex: 'processingStatus', title: '处理状态', valueType: 'select', valueEnum: processingStatusLabels, fieldProps: { clearable: true } },
  {
    dataIndex: 'datasetId',
    title: '知识库',
    valueType: 'select',
    valueEnum: Object.fromEntries(datasets.value.map((dataset) => [dataset.datasetId, dataset.name])),
    fieldProps: { clearable: true },
  },
  { dataIndex: 'createdAt', title: '上传时间', valueType: 'dateRange' },
]);

const rows: TableRow[] = [
  { label: '文件名', value: 'filename', minWidth: 'normal' },
  { label: '类型', value: 'contentType', minWidth: 'sm' },
  { label: '大小', value: 'size', slot: 'size', width: 110 },
  { label: '文件状态', value: 'status', slot: 'status', width: 100 },
  { label: 'RAG 状态', value: 'processing', slot: 'processing', width: 150 },
  { label: '执行次数', value: 'executionCount', width: 90 },
  { label: '知识库', value: 'datasets', slot: 'datasets', minWidth: 140 },
  { label: '创建时间', value: 'createdAt', slot: 'createdAt', width: 180 },
  { label: '操作', value: 'actions', slot: 'actions', width: 320, fixed: 'right' },
];

/** 分页加载当前用户拥有的文件及任务摘要。 */
async function loadFiles(withCount = false) {
  if (withCount) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/documents/file-list', {
      search: searchForm.value.search || undefined,
      status: searchForm.value.status ? [searchForm.value.status] : undefined,
      processingStatus: searchForm.value.processingStatus
        ? [searchForm.value.processingStatus]
        : undefined,
      datasetId: searchForm.value.datasetId,
      createdAt: searchForm.value.createdAt,
      limit: pageRange.value,
      withCount,
    });
    files.value = result.list.map((file) => ({ ...file }));
    if (withCount) setPageData({ total: result.count });
  } finally {
    loading.value = false;
  }
}

/** 上传完成后刷新文件任务状态。 */
async function handleUploaded() {
  notify('success', '文件上传并验证成功，已按选择创建处理任务');
  await loadFiles(true);
}

/** 跳转统一任务中心并筛选当前文件。 */
async function viewTasks(fileId: string) {
  await routerInstance.push({
    name: 'system.task',
    query: { category: 'file-processing', fileId },
  });
}

/** 获取短期下载地址并打开新窗口。 */
async function download(fileId: string) {
  const result = await api('/documents/file-download', { fileId });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/** 删除未被业务引用的文件。 */
async function remove(fileId: string) {
  await confirm({
    title: '确认删除该文件？',
    async confirmCallback() {
      await api('/documents/file-remove', { fileId });
      await loadFiles(true);
    },
  });
}

/** 返回任务状态对应的 Element Plus 标签类型。 */
function getTaskTagType(status: TaskStatus) {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'pending') return 'warning';
  return 'info';
}

onMounted(async () => {
  const options = await api('/documents/file-processing-options', {});
  datasets.value = options.datasets;
  await loadFiles(true);
});
</script>
