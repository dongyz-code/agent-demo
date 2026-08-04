<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <v-schema-form
      v-model="searchForm"
      class="mb-4 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm"
      mode="search"
      :columns="searchColumns"
      @reset="loadDocuments(true)"
      @submit="loadDocuments(true)"
    />
    <div
      class="flex items-center justify-end rounded-t-xl border border-b-0 border-gray-100 bg-white px-5 py-3 shadow-sm"
    >
      <el-button
        class="rounded-lg"
        type="primary"
        :icon="LucideUpload"
        @click="uploadRef?.open()"
      >
        上传新文档
      </el-button>
    </div>
    <v-table
      class="min-h-0 flex-1 border-x border-gray-100 [--el-table-header-bg-color:#f8fafc] [--el-table-row-hover-bg-color:#f8fafc]"
      :data="documents"
      :rows="rows"
      :loading="loading"
    >
      <template #cover="{ row }">
        <img
          v-if="row.cover"
          class="h-14 w-11 rounded-md object-cover shadow-sm ring-1 ring-black/5"
          :src="row.cover.url"
          :alt="`${row.name} 封面`"
          loading="lazy"
        />
        <div
          v-else
          class="flex h-14 w-11 items-center justify-center rounded-md bg-gray-50 text-xs text-gray-400 ring-1 ring-gray-100"
        >
          无封面
        </div>
      </template>
      <template #name="{ row }">
        <div class="max-w-72 truncate font-medium text-gray-800">
          {{ row.name }}
        </div>
        <div
          v-if="row.activeVersion?.filename !== row.name"
          class="mt-1 max-w-72 truncate text-xs text-gray-400"
        >
          {{ row.activeVersion?.filename }}
        </div>
      </template>
      <template #version="{ row }">
        <div class="flex items-center gap-2 whitespace-nowrap">
          <el-tag size="small" effect="plain">
            V{{ row.activeVersion?.version }}
          </el-tag>
          <span class="text-xs text-gray-500">共 {{ row.versionCount }} 个版本</span>
        </div>
      </template>
      <template #size="{ row }">{{ formatFileSize(row.activeVersion?.size) }}</template>
      <template #preview="{ row }">
        <div class="flex items-center gap-2 whitespace-nowrap">
          <el-tag :type="getPreviewTagType(row.activeVersion?.previewStatus)">
            {{ previewStatusLabels[row.activeVersion?.previewStatus] }}
          </el-tag>
          <span
            v-if="row.activeVersion?.previewPageCount"
            class="text-xs text-gray-500"
          >
            {{ row.activeVersion?.previewPageCount }} 页
          </span>
        </div>
      </template>
      <template #datasets="{ row }">
        <div v-if="row.datasets.length" class="flex flex-wrap gap-1">
          <el-tag
            v-for="dataset in row.datasets"
            :key="dataset.datasetId"
            size="small"
            :type="getRagTagType(dataset.status)"
          >
            {{ dataset.name }} · {{ ragStatusLabels[dataset.status] }}
          </el-tag>
        </div>
        <span v-else class="text-gray-400">未加入知识库</span>
      </template>
      <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      <template #actions="{ row }">
        <v-action-button-group
          :actions="getDocumentActions(row)"
          :max-visible="3"
        />
      </template>
    </v-table>
    <div
      class="rounded-b-xl border border-t-0 border-gray-100 bg-white px-5 shadow-sm"
    >
      <page-component @update:model-value="loadDocuments()" />
    </div>
    <upload-dialog
      ref="uploadRef"
      instance-key="document-new"
      @uploaded="handleUploaded"
    />
    <upload-dialog
      ref="versionUploadRef"
      instance-key="document-version"
      :max-number-of-files="1"
      @uploaded="handleUploaded"
    />
    <document-preview-dialog ref="previewRef" />
    <document-detail-dialog ref="detailRef" @changed="loadDocuments(true)" />
    <document-datasets-dialog ref="datasetsRef" @changed="loadDocuments(true)" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import {
  VSchemaForm,
  VTable,
  usePage,
} from '@repo/ui';

import DocumentPreviewDialog from '@/components/document-viewer/DocumentPreviewDialog.vue';
import UploadDialog from '@/components/upload/UploadDialog.vue';
import VActionButtonGroup from '@/components/action-button-group/VActionButtonGroup.vue';
import type { ActionButtonItem } from '@/components/action-button-group/types';
import { api, confirm, notify } from '@/utils';
import DocumentDatasetsDialog from './DocumentDatasetsDialog.vue';
import DocumentDetailDialog from './DocumentDetailDialog.vue';
import { formatDateTime, formatFileSize } from '../utils';

import LucideDatabase from '~icons/lucide/database';
import LucideDownload from '~icons/lucide/download';
import LucideEye from '~icons/lucide/eye';
import LucideHistory from '~icons/lucide/history';
import LucideRefreshCw from '~icons/lucide/refresh-cw';
import LucideTrash2 from '~icons/lucide/trash-2';
import LucideUpload from '~icons/lucide/upload';

import type {
  DocumentInfo,
  DocumentPreviewStatus,
  RagDatasetDocumentStatus,
} from '@/types';
import type {
  SchemaFormColumn,
  TableRow,
} from '@repo/ui';

/** 文档列表搜索表单。 */
interface SearchForm extends Record<string, unknown> {
  /** 文档名或当前源文件名关键词。 */
  search?: string;
  /** 当前版本预览状态。 */
  previewStatus?: DocumentPreviewStatus;
  /** 关联知识库。 */
  datasetId?: string;
  /** 文档创建时间范围。 */
  createdAt?: (Date | null)[];
}

/** VTable 使用的文档聚合行。 */
type DocumentRow = DocumentInfo & Record<string, unknown>;

const previewStatusLabels: Record<DocumentPreviewStatus, string> = {
  pending: '等待中',
  processing: '生成中',
  ready: '已就绪',
  failed: '失败',
};
const ragStatusLabels: Record<RagDatasetDocumentStatus, string> = {
  pending: '等待中',
  processing: '处理中',
  ready: '已生效',
  failed: '失败',
};
const searchForm = ref<SearchForm>({});
const documents = shallowRef<DocumentRow[]>([]);
const datasets = ref<{ datasetId: string; name: string }[]>([]);
const loading = ref(false);
const uploadRef = ref<InstanceType<typeof UploadDialog>>();
const versionUploadRef = ref<InstanceType<typeof UploadDialog>>();
const previewRef = ref<InstanceType<typeof DocumentPreviewDialog>>();
const detailRef = ref<InstanceType<typeof DocumentDetailDialog>>();
const datasetsRef = ref<InstanceType<typeof DocumentDatasetsDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({ page: { size: 20 } });

const searchColumns = computed<SchemaFormColumn<SearchForm>[]>(() => [
  {
    dataIndex: 'search',
    title: '文档名称',
    valueType: 'text',
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'previewStatus',
    title: '预览状态',
    valueType: 'select',
    valueEnum: previewStatusLabels,
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'datasetId',
    title: '知识库',
    valueType: 'select',
    valueEnum: Object.fromEntries(
      datasets.value.map((dataset) => [dataset.datasetId, dataset.name]),
    ),
    fieldProps: { clearable: true },
  },
  { dataIndex: 'createdAt', title: '创建时间', valueType: 'dateRange' },
]);

const rows: TableRow[] = [
  { label: '封面', value: 'cover', slot: 'cover', width: 76 },
  { label: '文档名称', value: 'name', slot: 'name', minWidth: 240 },
  { label: '版本', value: 'activeVersion', slot: 'version', width: 170 },
  { label: '大小', value: 'size', slot: 'size', width: 110 },
  { label: '预览', value: 'preview', slot: 'preview', width: 160 },
  { label: '知识库 / RAG', value: 'datasets', slot: 'datasets', minWidth: 230 },
  { label: '创建时间', value: 'createdAt', slot: 'createdAt', width: 180 },
  { label: '操作', value: 'actions', slot: 'actions', width: 350, fixed: 'right' },
];

/**
 * 生成单行文档操作配置，前三项直接展示，其余由按钮组收纳。
 *
 * @param document 当前文档聚合行。
 * @returns 按使用频率排列的操作配置。
 */
function getDocumentActions(document: DocumentInfo): ActionButtonItem[] {
  return [
    {
      key: 'preview',
      label: '预览',
      icon: LucideEye,
      disabled: document.activeVersion?.previewStatus !== 'ready',
      handler: () =>
        previewRef.value?.open(
          document.documentId,
          document.activeVersion?.documentVersionId,
        ),
    },
    {
      key: 'detail',
      label: '详情/版本',
      icon: LucideHistory,
      handler: () => detailRef.value?.open(document.documentId),
    },
    {
      key: 'reprocess',
      label: '重新处理',
      icon: LucideRefreshCw,
      isShow:
        document.activeVersion?.previewStatus !== 'pending' &&
        document.activeVersion?.previewStatus !== 'processing',
      handler: () => reprocessPreview(document),
    },
    {
      key: 'upload-version',
      label: '上传新版本',
      icon: LucideUpload,
      handler: () => uploadVersion(document),
    },
    {
      key: 'datasets',
      label: '知识库',
      icon: LucideDatabase,
      handler: () => datasetsRef.value?.open(document),
    },
    {
      key: 'download',
      label: '下载',
      icon: LucideDownload,
      handler: () => download(document.documentId),
    },
    {
      key: 'remove',
      label: '删除',
      icon: LucideTrash2,
      type: 'danger',
      handler: () => remove(document.documentId),
    },
  ];
}

/** 分页加载 Document 聚合列表。 */
async function loadDocuments(withCount = false) {
  if (withCount) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/documents/document-search', {
      search: searchForm.value.search || undefined,
      previewStatus: searchForm.value.previewStatus
        ? [searchForm.value.previewStatus]
        : undefined,
      datasetId: searchForm.value.datasetId,
      createdAt: searchForm.value.createdAt,
      limit: pageRange.value,
      withCount,
    });
    documents.value = result.list.map((document) => ({ ...document }));
    if (withCount) setPageData({ total: result.count });
  } finally {
    loading.value = false;
  }
}

/** 上传完成后提示具体版本并刷新文档聚合。 */
async function handleUploaded(result: {
  /** 文档稳定标识。 */
  documentId: string;
  /** 新建或复用的版本标识。 */
  documentVersionId: string;
  /** 文档内递增版本号。 */
  version: number;
  /** 本次是否创建了版本。 */
  created: boolean;
}) {
  notify(
    'success',
    result.created ? `文档 V${result.version} 上传成功` : `文档 V${result.version} 已存在`,
  );
  await loadDocuments(true);
}

/** 打开单文件的新版本上传流程，知识库关系在文档入库后独立管理。 */
async function uploadVersion(document: DocumentInfo) {
  await versionUploadRef.value?.open({
    documentId: document.documentId,
  });
}

/**
 * 为当前文档版本提交一次新的预览处理任务。
 *
 * @param document 当前文档聚合信息。
 */
async function reprocessPreview(document: DocumentInfo): Promise<void> {
  if (!document.activeVersion) return;
  await api('/documents/document-preview-retry', {
    documentId: document.documentId,
    documentVersionId: document.activeVersion.documentVersionId,
  });
  notify('success', '已提交重新处理任务');
  await loadDocuments();
}

/** 下载文档当前版本。 */
async function download(documentId: string) {
  const result = await api('/documents/document-download', { documentId });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/** 逻辑删除整个文档，不单独删除历史版本。 */
async function remove(documentId: string) {
  await confirm({
    title: '确认删除整个文档及全部历史版本？',
    async confirmCallback() {
      await api('/documents/document-remove', { documentId });
      await loadDocuments(true);
    },
  });
}

/** 返回预览状态对应的 Element Plus 标签类型。 */
function getPreviewTagType(status: DocumentPreviewStatus) {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warning';
  return 'info';
}

/** 返回知识库关系状态对应的 Element Plus 标签类型。 */
function getRagTagType(status: RagDatasetDocumentStatus) {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warning';
  return 'info';
}

onMounted(async () => {
  const result = await api('/documents/dataset-list', {
    status: ['active'],
    limit: [0, 1000],
  });
  datasets.value = result.list;
  await loadDocuments(true);
});
</script>
