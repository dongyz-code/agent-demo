<template>
  <div v-loading="loading" class="min-h-72">
    <el-result
      v-if="preview && preview.status !== 'ready'"
      :icon="preview.status === 'failed' ? 'error' : 'info'"
      :title="previewStatusLabels[preview.status]"
      :sub-title="preview.status === 'failed' ? '可以重试生成页面，RAG 状态不受影响' : '页面正在由后端生成'"
    >
      <template #extra>
        <el-button v-if="preview.status === 'failed'" type="primary" @click="retry">
          重试预览
        </el-button>
        <el-button v-else @click="load(true)">刷新状态</el-button>
      </template>
    </el-result>
    <template v-else-if="preview">
      <div class="max-h-[70vh] space-y-4 overflow-auto rounded bg-gray-100 p-3">
        <figure
          v-for="page in preview.pages"
          :key="`${page.documentVersionId}-${page.pageNumber}`"
          class="mx-auto max-w-5xl overflow-hidden rounded bg-white shadow"
        >
          <img
            class="block h-auto w-full"
            :src="page.url"
            :alt="`第 ${page.pageNumber} 页`"
            loading="lazy"
          />
          <figcaption class="border-t px-3 py-1 text-center text-xs text-gray-500">
            第 {{ page.pageNumber }} / {{ preview.pageCount }} 页
          </figcaption>
        </figure>
        <div v-if="preview.pages.length < preview.pageCount" class="text-center">
          <el-button :loading="loadingMore" @click="load(false)">加载后续页面</el-button>
        </div>
      </div>
      <div class="mt-3 flex justify-end">
        <el-button type="primary" @click="download">下载该版本原文件</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { ElButton, ElResult } from 'element-plus';

import { api } from '@/utils';

import type {
  DocumentPreviewStatus,
  DocumentPreviewWindow,
} from '@/types';

const props = defineProps<{
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时跟随当前版本。 */
  documentVersionId?: string;
}>();

const previewStatusLabels: Record<DocumentPreviewStatus, string> = {
  pending: '等待生成预览',
  processing: '正在生成预览',
  ready: '预览已就绪',
  failed: '预览生成失败',
};
const preview = shallowRef<DocumentPreviewWindow>();
const loading = shallowRef(false);
const loadingMore = shallowRef(false);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollingAttempts = 0;

/** 按 10 页窗口加载页面；首次和轮询刷新会替换已有页面。 */
async function load(reset: boolean) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const currentPages = reset ? [] : (preview.value?.pages ?? []);
    const result = await api('/documents/document-preview-pages', {
      documentId: props.documentId,
      documentVersionId: props.documentVersionId,
      startPage: currentPages.length + 1,
      pageSize: 10,
    });
    preview.value = {
      ...result,
      pages: reset ? result.pages : [...currentPages, ...result.pages],
    };
    if (
      ['pending', 'processing'].includes(result.status) &&
      pollingAttempts < 30
    ) {
      pollingAttempts++;
      pollTimer = setTimeout(() => void load(true), 2000);
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

/** 为 failed 版本创建唯一预览任务并重新轮询。 */
async function retry() {
  preview.value = await api('/documents/document-preview-retry', {
    documentId: props.documentId,
    documentVersionId: props.documentVersionId,
  });
  pollingAttempts = 0;
  await load(true);
}

/** 下载查看器当前指定的文档版本原文件。 */
async function download() {
  const result = await api('/documents/document-download', {
    documentId: props.documentId,
    documentVersionId: props.documentVersionId,
  });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

watch(
  () => [props.documentId, props.documentVersionId],
  () => {
    pollingAttempts = 0;
    preview.value = undefined;
    void load(true);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>
