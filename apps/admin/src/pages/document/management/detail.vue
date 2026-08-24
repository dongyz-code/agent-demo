<template>
  <section class="flex min-h-full flex-col">
    <div
      v-loading="loading"
      class="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-6xl flex-1 flex-col rounded-xl bg-white p-4 shadow-sm"
    >
      <template v-if="document">
        <div
          class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-gray-100 pb-4"
        >
          <el-button link :icon="LucideArrowLeft" @click="goBack">
            返回文档管理
          </el-button>
          <div class="h-5 w-px bg-gray-200"></div>
          <h1 class="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900">
            {{ document.name }}
          </h1>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-500">默认 RAG</span>
            <el-tag size="small" :type="document.ragEnabled ? 'success' : 'info'">
              {{ document.ragEnabled ? '开启' : '关闭' }}
            </el-tag>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-gray-500">知识库</span>
            <div v-if="document.datasets.length" class="flex flex-wrap gap-1">
              <el-tag
                v-for="dataset in document.datasets"
                :key="dataset.datasetId"
                size="small"
                effect="plain"
              >
                {{ dataset.name }} · {{ ragStatusLabels[dataset.status] }}
              </el-tag>
            </div>
            <span v-else class="text-gray-400">未加入</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">版本</span>
            <el-select v-model="selectedVersionId" size="small" class="w-56">
              <el-option
                v-for="version in document.versions"
                :key="version.documentVersionId"
                :label="`V${version.version} · ${version.filename}`"
                :value="version.documentVersionId"
              />
            </el-select>
            <el-button
              link
              size="small"
              @click="downloadVersion(selectedVersion?.documentVersionId ?? '')"
            >
              下载
            </el-button>
            <el-button
              v-if="
                selectedVersion &&
                selectedVersion.documentVersionId !==
                  document.activeVersion.documentVersionId
              "
              link
              size="small"
              type="primary"
              @click="setActive(selectedVersion?.documentVersionId ?? '')"
            >
              设为当前
            </el-button>
          </div>
        </div>

        <div class="mx-auto min-h-0 w-full max-w-5xl flex-1 pt-4">
          <document-viewer
            v-if="selectedVersion"
            :key="`${document.documentId}-${selectedVersion.documentVersionId}`"
            class="h-full min-h-[520px]"
            :document-id="document.documentId"
            :document-version-id="selectedVersion.documentVersionId"
          />
        </div>
      </template>
      <el-empty v-else-if="!loading" description="文档不存在或已被删除" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import {
  ElButton,
  ElEmpty,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus';

import DocumentViewer from '@/components/document-viewer/DocumentViewer.vue';
import { routerGo } from '@/router';
import { api, notify } from '@/utils';

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
