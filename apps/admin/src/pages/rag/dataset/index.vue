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
    <div class="grid min-h-0 flex-1 grid-cols-2 gap-3">
      <div class="flex min-h-0 flex-col rounded bg-white p-4 shadow">
        <div class="mb-3 flex justify-between">
          <strong>知识库</strong>
          <el-button type="primary" @click="datasetDialogRef?.open()">新建知识库</el-button>
        </div>
        <v-table class="min-h-0 flex-1" :data="datasets" :rows="datasetRows" @row-click="selectDataset">
          <template #status="{ row }"><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status }}</el-tag></template>
          <template #actions="{ row }">
            <el-button link @click.stop="datasetDialogRef?.open(row)">编辑</el-button>
            <el-button v-if="row.status === 'active'" link type="danger" @click.stop="disableDataset(row.datasetId)">停用</el-button>
          </template>
        </v-table>
        <dataset-page @update:model-value="loadDatasets()" />
      </div>
      <div class="flex min-h-0 flex-col rounded bg-white p-4 shadow">
        <div class="mb-3 flex justify-between">
          <strong>{{ selectedDataset ? `${selectedDataset.name} / 文档` : '请选择知识库' }}</strong>
          <el-button :disabled="!selectedDataset || selectedDataset.status !== 'active'" type="primary" @click="openUpload">上传文档</el-button>
        </div>
        <v-table class="min-h-0 flex-1" :data="documents" :rows="documentRows">
          <template #status="{ row }"><el-tag>{{ row.status }}</el-tag></template>
          <template #actions="{ row }">
            <el-button link @click="previewRef?.open(row.sourceFileId)">预览</el-button>
            <el-button link @click="processingRef?.open(row.documentId)">任务</el-button>
            <el-button link @click="reprocessRef?.open(row.documentId)">重新处理</el-button>
            <el-button link type="danger" @click="removeDocument(row.documentId)">移出</el-button>
          </template>
        </v-table>
        <document-page @update:model-value="loadDocuments()" />
      </div>
    </div>
    <dataset-dialog ref="datasetDialogRef" @saved="loadDatasets(true)" />
    <document-upload-dialog ref="uploadDialogRef" @created="loadDocuments(true)" />
    <file-preview-dialog ref="previewRef" />
    <document-processing-drawer ref="processingRef" />
    <reprocess-dialog ref="reprocessRef" @submitted="handleReprocessed" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import { api, confirm } from '@/utils';
import DatasetDialog from './components/DatasetDialog.vue';
import DocumentUploadDialog from './components/DocumentUploadDialog.vue';
import FilePreviewDialog from '@/components/file-viewer/FilePreviewDialog.vue';
import DocumentProcessingDrawer from './components/DocumentProcessingDrawer.vue';
import ReprocessDialog from './components/ReprocessDialog.vue';

import type { DocumentInfo, RagDatasetInfo, RagDatasetStatus } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

type SearchForm = { /** 名称关键词。 */ search?: string; /** 知识库状态。 */ status?: RagDatasetStatus };

const searchForm = ref<SearchForm>({});
const datasets = ref<RagDatasetInfo[]>([]);
const documents = ref<DocumentInfo[]>([]);
const selectedDataset = ref<RagDatasetInfo>();
const datasetDialogRef = ref<InstanceType<typeof DatasetDialog>>();
const uploadDialogRef = ref<InstanceType<typeof DocumentUploadDialog>>();
const previewRef = ref<InstanceType<typeof FilePreviewDialog>>();
const processingRef = ref<InstanceType<typeof DocumentProcessingDrawer>>();
const reprocessRef = ref<InstanceType<typeof ReprocessDialog>>();

const searchColumns: SchemaFormColumn<SearchForm>[] = [
  { dataIndex: 'search', title: '名称', valueType: 'text', fieldProps: { clearable: true } },
  { dataIndex: 'status', title: '状态', valueType: 'select', valueEnum: { active: '启用', disabled: '停用' }, fieldProps: { clearable: true } },
];
const datasetRows: TableRow[] = [
  { label: '名称', value: 'name', minWidth: 'normal' },
  { label: '状态', value: 'status', slot: 'status', width: 90 },
  { label: '操作', value: 'actions', slot: 'actions', width: 130 },
];
const documentRows: TableRow[] = [
  { label: '名称', value: 'name', minWidth: 'normal' },
  { label: '状态', value: 'status', slot: 'status', width: 100 },
  { label: '版本', value: 'version', width: 70 },
  { label: '操作', value: 'actions', slot: 'actions', width: 260 },
];

const { pageComponent: datasetPage, pageRange, setPageData } = usePage({ page: { size: 20 } });
const {
  pageComponent: documentPage,
  pageRange: documentPageRange,
  setPageData: setDocumentPageData,
} = usePage({ page: { size: 20 } });

/** 加载知识库列表。 */
async function loadDatasets(withCount = false) {
  const result = await api('/rag/dataset/list', {
    search: searchForm.value.search,
    status: searchForm.value.status ? [searchForm.value.status] : undefined,
    limit: pageRange.value,
    withCount,
  });
  datasets.value = result.list;
  if (withCount) setPageData({ total: result.count });
}

/** 选择知识库并加载其文档。 */
async function selectDataset(dataset: RagDatasetInfo) {
  selectedDataset.value = dataset;
  setDocumentPageData({ current: 1 });
  await loadDocuments(true);
}

/** 加载当前知识库文档。 */
async function loadDocuments(withCount = false) {
  if (!selectedDataset.value) return;
  if (withCount) setDocumentPageData({ current: 1 });
  const result = await api('/rag/dataset-document/list', {
    datasetId: selectedDataset.value.datasetId,
    limit: documentPageRange.value,
    withCount,
  });
  documents.value = result.list;
  if (withCount) setDocumentPageData({ total: result.count });
}

/** 打开显式上传并创建 RAG 文档流程。 */
function openUpload() {
  if (selectedDataset.value) uploadDialogRef.value?.open(selectedDataset.value.datasetId);
}

/** 停用知识库。 */
async function disableDataset(datasetId: string) {
  await confirm({
    title: '确认停用该知识库？',
    async confirmCallback() {
      await api('/rag/dataset/disable', { datasetId });
      await loadDatasets(true);
    },
  });
}

/** 从当前知识库移除文档关联，不删除通用文档。 */
async function removeDocument(documentId: string) {
  await confirm({
    title: '确认将该文档移出当前知识库？',
    async confirmCallback() {
      if (!selectedDataset.value) return;
      await api('/rag/dataset-document/remove', {
        datasetId: selectedDataset.value.datasetId,
        documentId,
      });
      await loadDocuments(true);
    },
  });
}

/** 重新处理成功后刷新文档并打开任务抽屉。 */
async function handleReprocessed(_jobId: string, documentId: string) {
  await loadDocuments();
  await processingRef.value?.open(documentId);
}

onMounted(() => loadDatasets(true));
</script>
