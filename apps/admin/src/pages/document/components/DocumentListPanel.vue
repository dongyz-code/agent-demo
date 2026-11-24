<template>
  <section :class="pageClass">
    <div :class="searchClass">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        @reset="loadDocuments(true)"
        @submit="loadDocuments(true)"
      />
    </div>
    <div :class="tableClass">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <strong v-if="!embedded">文档</strong>
        <div class="ml-auto flex items-center gap-2">
          <template v-if="selected.length">
            <span class="text-sm text-gray-600">已选 {{ selected.length }} 份</span>
            <el-button @click="moveSelected">移动到资料库</el-button>
          </template>
          <el-button v-if="canUpload" type="primary" @click="openUpload">
            上传文档
          </el-button>
        </div>
      </div>
      <el-result v-if="failed" icon="warning" title="文档加载失败">
        <template #extra>
          <el-button @click="loadDocuments(true)">重新加载</el-button>
        </template>
      </el-result>
      <v-table
        v-else
        :class="tableBodyClass"
        :data="documents"
        :rows="columns"
        :loading="loading"
        :props="{ emptyText }"
        row-key="documentId"
        @selection-change="selectDocuments"
      >
        <template #name="{ row }">
          <div class="flex min-w-0 items-center gap-3 py-1">
            <img
              v-if="row.cover"
              class="h-11 w-8 shrink-0 rounded object-cover"
              :src="row.cover.url"
              alt=""
              loading="lazy"
            />
            <lucide-file-text
              v-else
              class="size-8 shrink-0 text-gray-400"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <p class="truncate text-gray-900">{{ row.name }}</p>
              <p class="mt-1 truncate text-xs text-gray-500">
                {{ row.activeVersion.extension.toUpperCase() }} ·
                {{ formatFileSize(row.activeVersion.size) }}
              </p>
            </div>
          </div>
        </template>
        <template #library="{ row }">
          <span v-if="row.libraryId" class="block truncate" :title="row.libraryName">{{
            row.libraryName
          }}</span>
          <span v-else class="text-gray-500">未归库</span>
        </template>
        <template #version="{ row }">
          <span>V{{ row.activeVersion.version }}</span>
          <p class="mt-1 text-xs text-gray-500">共 {{ row.versionCount }} 个版本</p>
        </template>
        <template #preview="{ row }">
          <el-tag
            size="small"
            :type="getPreviewTagType(row.activeVersion.previewStatus)"
          >
            {{ previewStatusLabels[row.activeVersion.previewStatus] }}
          </el-tag>
        </template>
        <template #retrieval="{ row }">
          <el-tag size="small" :type="getRetrievalTagType(row)">
            {{ getRetrievalLabel(row) }}
          </el-tag>
        </template>
        <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        <template #actions="{ row }">
          <v-action-button-group :actions="getActions(row)" :max-visible="3" />
        </template>
      </v-table>
      <page-component v-if="!failed" @update:model-value="loadDocuments()" />
    </div>
    <document-uploader ref="uploaderRef" @uploaded="handleUploaded" />
    <document-move-dialog ref="moveDialogRef" @changed="refreshDocuments" />
    <document-version-dialog
      ref="versionDialogRef"
      @changed="refreshDocuments"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElResult, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import VActionButtonGroup from '@/components/action-button-group/VActionButtonGroup.vue';
import DocumentUploader from '@/components/upload/DocumentUploader.vue';
import { useStore } from '@/models';
import { routerGo } from '@/router';
import { api, confirm, notify } from '@/utils';
import DocumentMoveDialog from './DocumentMoveDialog.vue';
import DocumentVersionDialog from './DocumentVersionDialog.vue';
import {
  formatDateTime,
  formatFileSize,
  getDocumentCapabilities,
  getDocumentColumns,
  getDocumentSearchColumns,
  getPreviewTagType,
  getRetrievalLabel,
  getRetrievalTagType,
  previewStatusLabels,
} from '../utils';

import LucideDownload from '~icons/lucide/download';
import LucideEye from '~icons/lucide/eye';
import LucideFileText from '~icons/lucide/file-text';
import LucideFolderInput from '~icons/lucide/folder-input';
import LucideHistory from '~icons/lucide/history';
import LucideRefreshCw from '~icons/lucide/refresh-cw';
import LucideTrash2 from '~icons/lucide/trash-2';
import LucideUpload from '~icons/lucide/upload';

import type { ActionButtonItem } from '@/components/action-button-group/types';
import type { DocumentInfo, DocumentUploadResult, LibraryInfo } from '@/types';
import type { DocumentRow, DocumentSearchForm } from '../types';

const props = defineProps<{
  /** 省略时展示全部可访问文档；传入时固定库内范围和身份。 */
  library?: LibraryInfo;
  /** 放进资料库弹窗时去掉页面卡片，避免弹窗里再套一层列表页。 */
  embedded?: boolean;
}>();
const emit = defineEmits<{
  /** 文档数量或所属库改变，父级需要刷新资料库摘要。 */
  changed: [];
}>();
const store = useStore();
const searchForm = ref<DocumentSearchForm>({});
const documents = shallowRef<DocumentRow[]>([]);
const libraries = shallowRef<LibraryInfo[]>([]);
const selected = ref<DocumentRow[]>([]);
const loading = ref(false);
const failed = ref(false);
const uploaderRef = ref<InstanceType<typeof DocumentUploader>>();
const moveDialogRef = ref<InstanceType<typeof DocumentMoveDialog>>();
const versionDialogRef = ref<InstanceType<typeof DocumentVersionDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20 },
});
/** 防止搜索或分页较快时，较早响应覆盖最新查询结果。 */
let requestSequence = 0;
const pageClass = computed(() => {
  if (props.embedded) return 'flex flex-col gap-3';
  return 'flex min-h-full flex-col gap-3';
});
const searchClass = computed(() => {
  if (props.embedded) return '';
  return 'rounded bg-white p-4 shadow';
});
const tableClass = computed(() => {
  if (props.embedded) return 'flex flex-col';
  return 'flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow';
});
const tableBodyClass = computed(() => {
  if (props.embedded) return '';
  return 'min-h-0 flex-1';
});
const canSelect = computed(() => {
  if (!store.hasPermission('actions.documents.upload')) return false;
  if (props.library) return props.library.myRole === 'manager';
  return libraries.value.some((library) => library.myRole === 'manager');
});
const canUpload = computed(() => {
  if (!store.hasPermission('actions.documents.upload')) return false;
  if (props.library) {
    return props.library.myRole === 'manager' && props.library.status === 'active';
  }
  return libraries.value.some(
    (library) => library.myRole === 'manager' && library.status === 'active',
  );
});
const searchColumns = computed(() =>
  getDocumentSearchColumns(libraries.value, Boolean(props.library)),
);
const columns = computed(() =>
  getDocumentColumns(Boolean(props.library), canSelect.value),
);
const emptyText = computed(() => {
  if (Object.values(searchForm.value).some(Boolean)) {
    return '没有符合条件的文档，请调整筛选';
  }
  if (canUpload.value) return '暂无文档，点击“上传文档”添加';
  return '暂无可预览的文档';
});

/**
 * 当前用户能否维护这份文档的版本和所属库。
 * @param document 当前文档行。
 * @returns 是否展示上传新版本和移动。
 */
function canUpdate(document: DocumentInfo) {
  return getDocumentCapabilities(document, store.hasPermission).canUpdate;
}

/**
 * 预览不在排队或生成中时，允许重新处理当前版本。
 * @param document 当前文档行。
 * @returns 是否展示重新生成预览。
 */
function canRegenerate(document: DocumentInfo) {
  const capabilities = getDocumentCapabilities(document, store.hasPermission);
  if (!capabilities.canProcess) return false;
  return !['pending', 'processing'].includes(
    document.activeVersion.previewStatus,
  );
}

/**
 * 当前用户能否删除这份文档。
 * @param document 当前文档行。
 * @returns 是否展示删除。
 */
function canDelete(document: DocumentInfo) {
  return getDocumentCapabilities(document, store.hasPermission).canDelete;
}

/**
 * 外面固定预览、下载、删除，其余维护动作收进更多。
 * @param document 当前文档行。
 * @returns 按展示顺序排列的操作。
 */
function getActions(document: DocumentInfo): ActionButtonItem[] {
  return [
    {
      key: 'preview',
      label: '预览',
      icon: LucideEye,
      handler: () => openDocument(document),
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
      isShow: canDelete(document),
      handler: () => removeDocument(document),
    },
    {
      key: 'versions',
      label: '版本',
      icon: LucideHistory,
      handler: () => openVersions(document),
    },
    {
      key: 'upload',
      label: '上传新版本',
      icon: LucideUpload,
      isShow: canUpdate(document),
      handler: () => uploadVersion(document),
    },
    {
      key: 'move',
      label: '移动到资料库',
      icon: LucideFolderInput,
      isShow: canUpdate(document),
      handler: () => moveDocument(document),
    },
    {
      key: 'retry',
      label: '重新处理',
      icon: LucideRefreshCw,
      isShow: canRegenerate(document),
      handler: () => retryPreview(document),
    },
  ];
}

/**
 * 打开全部上传版本，并在其中切换当前展示版本。
 * @param document 当前文档行。
 */
function openVersions(document: DocumentInfo) {
  void versionDialogRef.value?.open(document.documentId);
}

/**
 * 为当前展示版本上传新文件，不在列表里改所属资料库。
 * @param document 当前文档行。
 */
function uploadVersion(document: DocumentInfo) {
  void uploaderRef.value?.open({
    documentId: document.documentId,
    libraryId: document.libraryId,
  });
}

/**
 * 打开单份文档的移动弹窗。
 * @param document 当前文档行。
 */
function moveDocument(document: DocumentInfo) {
  void moveDialogRef.value?.open(document);
}

/**
 * 重新处理当前展示版本的预览和问答索引。
 * @param document 当前文档行。
 */
async function retryPreview(document: DocumentInfo) {
  await api('/documents/document-preview-retry', {
    documentId: document.documentId,
    documentVersionId: document.activeVersion.documentVersionId,
  });
  notify('success', '已提交重新处理');
  await loadDocuments();
}

/** 打开新文档上传。所选筛选库只作为默认值，弹窗会复核写入资格。 */
function openUpload() {
  void uploaderRef.value?.open({
    libraryId: props.library?.libraryId || searchForm.value.libraryId,
  });
}

/**
 * 记录当前表格勾选，供批量移动使用。
 * @param rows 表格选中的文档。
 */
function selectDocuments(rows: DocumentRow[]) {
  selected.value = rows;
}

/** 把勾选文档交给移动弹窗，页面不维护目标库表单。 */
function moveSelected() {
  void moveDialogRef.value?.open(selected.value);
}

/**
 * 打开只含预览的文档页，版本切换留在该页的小选择器里。
 * @param document 用户要预览的文档。
 */
function openDocument(document: DocumentInfo) {
  void routerGo('documents.detail', {
    params: { documentId: document.documentId },
  });
}

/**
 * 读取当前范围文档。切换筛选后从第一页重新计数，并忽略过期响应。
 * @param reset 是否从第一页重新计算总数。
 */
async function loadDocuments(reset = false) {
  const sequence = ++requestSequence;
  if (reset) setPageData({ current: 1 });
  loading.value = true;
  failed.value = false;
  selected.value = [];
  try {
    let previewStatus: DocumentInfo['activeVersion']['previewStatus'][] | undefined;
    if (searchForm.value.previewStatus) {
      previewStatus = [searchForm.value.previewStatus];
    }
    const result = await api('/documents/document-search', {
      search: searchForm.value.search?.trim() || undefined,
      libraryId: props.library?.libraryId || searchForm.value.libraryId,
      previewStatus,
      createdAt: searchForm.value.createdAt,
      limit: pageRange.value,
      withCount: reset,
    });
    if (sequence !== requestSequence) return;
    documents.value = result.list.map((document) => ({ ...document }));
    if (reset) setPageData({ total: result.count });
  } catch {
    if (sequence === requestSequence) failed.value = true;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

/** 文档新增、移动或删除后刷新当前范围，并通知父级更新统计。 */
async function refreshDocuments() {
  await loadDocuments(true);
  emit('changed');
}

/**
 * 上传完成后提示结果并刷新列表。
 * @param result 上传流程返回的新建或已存在版本。
 */
async function handleUploaded(result: DocumentUploadResult) {
  let message = `文档 V${result.version} 上传成功`;
  if (!result.created) message = `文档 V${result.version} 已存在`;
  notify('success', message);
  await refreshDocuments();
}

/**
 * 下载当前展示版本的源文件。
 * @param documentId 待下载的文档标识。
 */
async function download(documentId: string) {
  const result = await api('/documents/document-download', { documentId });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

/**
 * 确认后删除整个文档及版本历史。
 * @param document 待删除的文档，用于确认具体对象。
 */
async function removeDocument(document: DocumentInfo) {
  await confirm({
    title: `删除“${document.name}”？`,
    message: '全部历史版本也会删除，问答将不再检索此文档。',
    opt: { confirmButtonText: '删除文档' },
    async confirmCallback() {
      await api('/documents/document-remove', {
        documentId: document.documentId,
      });
      await refreshDocuments();
    },
  });
}

/** 全局列表加载资料库筛选项。选项失败不阻断文档列表。 */
async function loadLibraryOptions() {
  if (props.library) return;
  const result = await api('/documents/library-list', {
    status: ['active', 'archived'],
    limit: [0, 200],
  });
  libraries.value = result.list;
}

onMounted(() => {
  void loadDocuments(true);
  void loadLibraryOptions();
});
</script>
