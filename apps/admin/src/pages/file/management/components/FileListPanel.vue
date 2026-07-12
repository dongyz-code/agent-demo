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
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      <template #actions="{ row }">
        <el-button link @click="previewRef?.open(row.fileId)">预览</el-button>
        <el-button link :disabled="row.status !== 'verified'" @click="download(row.fileId)">下载</el-button>
        <el-button link type="danger" @click="remove(row.fileId)">删除</el-button>
      </template>
    </v-table>
    <upload-dialog ref="uploadRef" @uploaded="handleUploaded" />
    <file-preview-dialog ref="previewRef" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import UploadDialog from '@/components/upload/UploadDialog.vue';
import FilePreviewDialog from '@/components/file-viewer/FilePreviewDialog.vue';
import { api, confirm, notify } from '@/utils';
import { fileStatusLabels, formatDateTime, formatFileSize } from '../utils';

import type { StoredFileInfo, StoredFileStatus } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

type SearchForm = {
  /** 文件名关键词。 */
  search?: string;
  /** 文件可信状态。 */
  status?: StoredFileStatus;
};

type FileRow = StoredFileInfo & Record<string, unknown>;

const searchForm = ref<SearchForm>({});
const files = shallowRef<FileRow[]>([]);
const loading = ref(false);
const uploadRef = ref<InstanceType<typeof UploadDialog>>();
const previewRef = ref<InstanceType<typeof FilePreviewDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({ page: { size: 20 } });

const searchColumns: SchemaFormColumn<SearchForm>[] = [
  { dataIndex: 'search', title: '文件名', valueType: 'text', fieldProps: { clearable: true } },
  { dataIndex: 'status', title: '状态', valueType: 'select', valueEnum: fileStatusLabels, fieldProps: { clearable: true } },
];

const rows: TableRow[] = [
  { label: '文件名', value: 'filename', minWidth: 'normal' },
  { label: '类型', value: 'contentType', minWidth: 'sm' },
  { label: '大小', value: 'size', slot: 'size', width: 110 },
  { label: '状态', value: 'status', slot: 'status', width: 100 },
  { label: '创建时间', value: 'createdAt', slot: 'createdAt', width: 180 },
  { label: '操作', value: 'actions', slot: 'actions', width: 190, fixed: 'right' },
];

/** 分页加载当前用户拥有的通用文件。 */
async function loadFiles(withCount = false) {
  if (withCount) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/file/list', {
      search: searchForm.value.search || undefined,
      status: searchForm.value.status ? [searchForm.value.status] : undefined,
      limit: pageRange.value,
      withCount,
    });
    files.value = result.list.map((file) => ({ ...file }));
    if (withCount) setPageData({ total: result.count });
  } finally {
    loading.value = false;
  }
}

/** 上传完成后刷新第一页文件并提示结果。 */
async function handleUploaded() {
  notify('success', '文件上传并验证成功');
  await loadFiles(true);
}

/** 获取短期下载地址并打开新窗口。 */
async function download(fileId: string) {
  const result = await api('/file/download', { fileId });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/** 删除未被业务引用的通用文件。 */
async function remove(fileId: string) {
  await confirm({
    title: '确认删除该文件？',
    async confirmCallback() {
      await api('/file/remove', { fileId });
      await loadFiles(true);
    },
  });
}

onMounted(() => loadFiles(true));
</script>
