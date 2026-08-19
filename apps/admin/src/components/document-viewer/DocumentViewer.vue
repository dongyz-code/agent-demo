<template>
  <div v-loading="loading" class="min-h-72">
    <el-result
      v-if="preview && preview.status !== 'ready' && !preview.pages.length"
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
        <el-alert
          v-if="preview.status === 'processing'"
          :closable="false"
          title="正在生成清晰预览，当前显示快速预览"
          type="info"
          show-icon
        />
        <figure
          v-for="page in preview.pages"
          :key="`${page.documentVersionId}-${page.variant}-${page.pageNumber}`"
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
import { ElAlert, ElButton, ElImage, ElResult } from 'element-plus';

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
let pollingStartedAt = 0;
/** 尚无快速页面时的短轮询间隔。 */
const WAITING_POLL_INTERVAL_MS = 2_000;
/** 已显示快速页面后的低频清晰状态轮询间隔。 */
const CLEAR_POLL_INTERVAL_MS = 10_000;
/** 覆盖服务端最长任务窗口，同时防止异常状态永久轮询。 */
const MAX_POLLING_DURATION_MS = 2 * 60 * 60 * 1_000;
/** 签名地址临近失效时才刷新同层级页面，避免每次轮询重复下载图片。 */
const PREVIEW_URL_REFRESH_MARGIN_MS = 5 * 60 * 1_000;

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

/**
 * 判断轮询结果是否仍可复用已经展示的同层级页面与签名地址。
 *
 * @param currentPages 当前已经加载且可能包含后续窗口的页面。
 * @param nextPages 本次状态轮询返回的第一页窗口。
 * @returns 层级未变化且所有现有地址仍有充足有效期时返回 true。
 */
function canReuseLoadedPages(
  currentPages: DocumentPreviewWindow['pages'],
  nextPages: DocumentPreviewWindow['pages'],
): boolean {
  const currentFirstPage = currentPages[0];
  const nextFirstPage = nextPages[0];
  if (!currentFirstPage || !nextFirstPage) return false;
  if (currentFirstPage.documentVersionId !== nextFirstPage.documentVersionId) {
    return false;
  }
  if (currentFirstPage.variant !== nextFirstPage.variant) return false;
  const minimumExpiresAt = Date.now() + PREVIEW_URL_REFRESH_MARGIN_MS;
  return currentPages.every(
    (page) => Date.parse(String(page.expiresAt)) > minimumExpiresAt,
  );
}

/**
 * 按 10 页窗口加载页面；首次和轮询刷新会替换已有页面。
 *
 * @param reset 是否从第一页重新获取当前层级。
 * @returns 页面状态写入本地并安排下一次轮询后结束。
 */
async function load(reset: boolean) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
  if (reset) {
    if (!preview.value) loading.value = true;
  } else {
    loadingMore.value = true;
  }
  try {
    const currentPages = reset ? [] : (preview.value?.pages ?? []);
    const result = await api('/documents/document-preview-pages', {
      documentId: props.documentId,
      documentVersionId: props.documentVersionId,
      startPage: currentPages.length + 1,
      pageSize: 10,
    });
    let nextPages = result.pages;
    if (reset && canReuseLoadedPages(currentPages, result.pages)) {
      nextPages = currentPages;
    }
    if (!reset) nextPages = [...currentPages, ...result.pages];
    preview.value = { ...result, pages: nextPages };
    if (
      ['pending', 'processing'].includes(result.status) &&
      Date.now() - pollingStartedAt < MAX_POLLING_DURATION_MS
    ) {
      let interval = WAITING_POLL_INTERVAL_MS;
      if (result.pages.length) interval = CLEAR_POLL_INTERVAL_MS;
      pollTimer = setTimeout(() => void load(true), interval);
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
  pollingStartedAt = Date.now();
  await load(true);
}

watch(
  () => [props.documentId, props.documentVersionId],
  () => {
    pollingStartedAt = Date.now();
    preview.value = undefined;
    void load(true);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>
