<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-sm">
      <el-button link :icon="LucideArrowLeft" @click="goBack">
        返回文档管理
      </el-button>
      <div class="h-5 w-px bg-gray-200"></div>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-semibold text-gray-900">
          {{ document?.name ?? '文档详情' }}
        </h1>
      </div>
    </div>

    <div v-loading="loading" class="min-h-0 flex-1">
      <div
        v-if="document"
        class="grid min-h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div class="min-h-[620px] rounded-xl bg-white p-4 shadow-sm">
          <document-viewer
            v-if="selectedVersion"
            :key="`${document.documentId}-${selectedVersion.documentVersionId}`"
            class="h-[calc(100vh-260px)] min-h-[520px]"
            :document-id="document.documentId"
            :document-version-id="selectedVersion.documentVersionId"
          />
        </div>

        <aside class="flex min-h-0 flex-col gap-4">
          <div class="rounded-xl bg-white p-4 shadow-sm">
            <h2 class="mb-3 font-medium text-gray-900">文档信息</h2>
            <dl class="space-y-3 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-gray-500">默认 RAG</dt>
                <dd class="text-gray-900">
                  {{ document.ragEnabled ? '开启' : '关闭' }}
                </dd>
              </div>
              <div>
                <dt class="mb-2 text-gray-500">知识库</dt>
                <dd v-if="document.datasets.length" class="flex flex-wrap gap-1">
                  <el-tag
                    v-for="dataset in document.datasets"
                    :key="dataset.datasetId"
                    size="small"
                    effect="plain"
                  >
                    {{ dataset.name }} · {{ ragStatusLabels[dataset.status] }}
                  </el-tag>
                </dd>
                <dd v-else class="text-gray-400">未加入知识库</dd>
              </div>
            </dl>
          </div>

          <div class="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-4 shadow-sm">
            <h2 class="mb-3 font-medium text-gray-900">版本历史</h2>
            <div class="min-h-0 flex-1 space-y-2 overflow-auto">
              <div
                v-for="version in document.versions"
                :key="version.documentVersionId"
                class="w-full rounded-lg border p-3 text-left transition-colors"
                :class="getVersionButtonClass(version.documentVersionId)"
                @click="selectVersion(version.documentVersionId)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium text-gray-900">V{{ version.version }}</span>
                  <el-tag
                    v-if="
                      version.documentVersionId ===
                      document.activeVersion.documentVersionId
                    "
                    size="small"
                    type="success"
                  >
                    当前版本
                  </el-tag>
                </div>
                <div class="mt-1 truncate text-xs text-gray-500">
                  {{ version.filename }}
                </div>
                <div class="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>{{ formatFileSize(version.size) }}</span>
                  <span>{{ formatDateTime(version.createdAt) }}</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <el-button
                    link
                    size="small"
                    @click.stop="downloadVersion(version.documentVersionId)"
                  >
                    下载
                  </el-button>
                  <el-button
                    v-if="
                      version.documentVersionId !==
                      document.activeVersion.documentVersionId
                    "
                    link
                    size="small"
                    type="primary"
                    @click.stop="setActive(version.documentVersionId)"
                  >
                    设为当前
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <el-empty v-else-if="!loading" description="文档不存在或已被删除" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import { ElButton, ElEmpty, ElTag } from 'element-plus';

import DocumentViewer from '@/components/document-viewer/DocumentViewer.vue';
import { routerGo } from '@/router';
import { api, notify } from '@/utils';
import { formatDateTime, formatFileSize } from './utils';

import LucideArrowLeft from '~icons/lucide/arrow-left';

import type {
  DocumentDetail,
  RagDatasetDocumentStatus,
} from '@/types';

const route = useRoute();
const document = shallowRef<DocumentDetail>();
const selectedVersionId = ref('');
const loading = ref(false);

const documentId = computed(() => {
  const value = route.params.documentId;
  if (typeof value !== 'string') return '';
  return value;
});

const selectedVersion = computed(() => {
  if (!document.value) return undefined;
  const selected = document.value.versions.find(
    (version) => version.documentVersionId === selectedVersionId.value,
  );
  if (selected) return selected;
  return document.value.activeVersion;
});

const ragStatusLabels: Record<RagDatasetDocumentStatus, string> = {
  pending: '等待中',
  processing: '处理中',
  ready: '已生效',
  failed: '失败',
};

/** 查询当前文档及其全部历史版本。 */
async function loadDocument(): Promise<void> {
  if (!documentId.value) return;
  loading.value = true;
  try {
    const result = await api('/documents/document-detail', {
      documentId: documentId.value,
    });
    document.value = result;
    if (!selectedVersionId.value) {
      selectedVersionId.value = result.activeVersion.documentVersionId;
    }
  } finally {
    loading.value = false;
  }
}

/** 返回文档管理列表，详情页不保留额外弹窗状态。 */
async function goBack(): Promise<void> {
  await routerGo('documents.management');
}

/** 切换详情页当前查看的文档版本。 */
function selectVersion(documentVersionId: string): void {
  selectedVersionId.value = documentVersionId;
}

/** 返回版本卡片选中或普通状态的样式。 */
function getVersionButtonClass(documentVersionId: string): string {
  if (selectedVersionId.value === documentVersionId) {
    return 'border-primary bg-primary/5';
  }
  return 'border-gray-100 hover:border-gray-300 hover:bg-gray-50';
}

/** 把指定历史版本设置为文档当前版本。 */
async function setActive(documentVersionId: string): Promise<void> {
  if (!document.value) return;
  document.value = await api('/documents/document-version-set-active', {
    documentId: document.value.documentId,
    documentVersionId,
  });
  selectedVersionId.value = documentVersionId;
  notify('success', '当前版本已切换，知识库将按各自状态重新处理');
}

/** 下载指定版本源文件。 */
async function downloadVersion(documentVersionId: string): Promise<void> {
  if (!document.value) return;
  const result = await api('/documents/document-download', {
    documentId: document.value.documentId,
    documentVersionId,
  });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

onMounted(loadDocument);
</script>
