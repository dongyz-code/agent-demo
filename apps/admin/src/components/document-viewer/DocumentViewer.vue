<template>
  <div v-loading="loading" class="min-h-72">
    <el-result
      v-if="preview && preview.status !== 'ready'"
      :icon="preview.status === 'failed' ? 'error' : 'info'"
      :title="getPendingTitle(preview.status)"
      :sub-title="
        preview.status === 'failed'
          ? '页面生成失败，RAG 状态不受影响'
          : undefined
      "
    >
      <template #extra>
        <el-button
          v-if="preview.status === 'failed'"
          type="primary"
          @click="retry"
        >
          重新生成
        </el-button>
        <el-button v-else @click="load(true)">刷新状态</el-button>
      </template>
    </el-result>
    <template v-else-if="preview">
      <div class="h-full space-y-4 overflow-auto rounded bg-gray-100 p-3">
        <figure
          v-for="page in preview.pages"
          :key="`${page.documentVersionId}-${page.pageNumber}`"
          class="mx-auto w-fit max-w-full overflow-hidden rounded bg-white shadow"
        >
          <el-image
            class="block h-auto max-w-full cursor-zoom-in"
            :src="page.url"
            :alt="`第 ${page.pageNumber} 页`"
            :preview-src-list="previewUrls"
            :initial-index="getPreviewIndex(page.pageNumber)"
            :infinite="false"
            :min-scale="0.2"
            :max-scale="8"
            :zoom-rate="1.2"
            fit="contain"
            preview-teleported
            show-progress
            loading="lazy"
          />
          <figcaption
            v-if="preview.pageCount > 1"
            class="border-t px-3 py-1 text-center text-xs text-gray-500"
          >
            第 {{ page.pageNumber }} / {{ preview.pageCount }} 页
          </figcaption>
        </figure>
        <div
          v-if="preview.pages.length < preview.pageCount"
          class="text-center"
        >
          <el-button :loading="loadingMore" @click="load(false)"
            >加载后续页面</el-button
          >
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import { ElButton, ElImage, ElResult } from 'element-plus';

import { api } from '@/utils';

import type { DocumentPreviewStatus, DocumentPreviewWindow } from '@/types';

const props = defineProps<{
  /** 文档稳定标识。 */
  documentId: string;
  /** 可选历史版本；为空时跟随当前版本。 */
  documentVersionId?: string;
}>();

const preview = shallowRef<DocumentPreviewWindow>();
const loading = shallowRef(false);
const loadingMore = shallowRef(false);
const previewUrls = computed(
  () => preview.value?.pages.map((page) => page.url) ?? [],
);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollingAttempts = 0;

/** 返回页面尚未就绪时的简短状态文案。 */
function getPendingTitle(status: DocumentPreviewStatus): string {
  if (status === 'pending') return '等待生成页面';
  if (status === 'processing') return '正在生成页面';
  return '页面生成失败';
}

/** 返回当前页面在已加载页面中的索引，供全屏查看器定位。 */
function getPreviewIndex(pageNumber: number): number {
  const index =
    preview.value?.pages.findIndex((page) => page.pageNumber === pageNumber) ??
    0;
  return Math.max(0, index);
}

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
async function retry(): Promise<void> {
  preview.value = await api('/documents/document-preview-retry', {
    documentId: props.documentId,
    documentVersionId: props.documentVersionId,
  });
  pollingAttempts = 0;
  await load(true);
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
