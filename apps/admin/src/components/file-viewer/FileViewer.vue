<template>
  <div v-loading="loading" class="min-h-60">
    <template v-if="state">
      <pdf-viewer v-if="isPdf && state.preview.url" :url="state.preview.url" />
      <image-viewer v-else-if="isImage && state.preview.url" :url="state.preview.url" />
      <media-viewer
        v-else-if="isMedia && state.preview.url && state.preview.contentType"
        :url="state.preview.url"
        :content-type="state.preview.contentType"
      />
      <text-viewer v-else-if="state.preview.mode === 'text' && state.preview.text" :html="state.preview.text" />
      <preview-pending
        v-else-if="state.preview.mode === 'pending'"
        :reason="state.preview.reason"
        :stopped="pollingStopped"
        @refresh="refreshPreview"
      />
      <el-result
        v-else
        :icon="state.preview.mode === 'failed' ? 'error' : 'info'"
        :title="state.preview.mode === 'failed' ? '预览生成失败' : '暂不支持在线预览'"
        :sub-title="state.preview.reason || state.file.filename"
      />
      <div class="mt-3 flex justify-end">
        <el-button type="primary" @click="download">下载原文件</el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { ElButton, ElResult } from 'element-plus';

import { api } from '@/utils';
import PdfViewer from './PdfViewer.vue';
import ImageViewer from './ImageViewer.vue';
import MediaViewer from './MediaViewer.vue';
import TextViewer from './TextViewer.vue';
import PreviewPending from './PreviewPending.vue';

import type { FileViewerState } from './types';

const props = defineProps<{
  /** 需要查看的通用文件标识。 */
  fileId: string;
}>();

const loading = shallowRef(false);
const state = shallowRef<FileViewerState>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollingAttempts = 0;
const pollingStopped = shallowRef(false);
const maxPollingAttempts = 15;

const contentType = computed(() => state.value?.preview.contentType ?? '');
const isPdf = computed(() => contentType.value === 'application/pdf');
const isImage = computed(() => contentType.value.startsWith('image/'));
const isMedia = computed(() => /^(audio|video)\//.test(contentType.value));

/** 加载文件详情和预览描述，pending 时有限轮询。 */
async function load() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
  loading.value = true;
  try {
    const [file, preview] = await Promise.all([
      api('/documents/file-detail', { fileId: props.fileId }),
      api('/documents/file-preview', { fileId: props.fileId }),
    ]);
    state.value = { file, preview };
    if (preview.mode === 'pending' && pollingAttempts < maxPollingAttempts) {
      pollingAttempts += 1;
      pollTimer = setTimeout(load, 2000);
    } else if (preview.mode === 'pending') {
      pollingStopped.value = true;
    } else {
      pollingStopped.value = false;
    }
  } finally {
    loading.value = false;
  }
}

/** 重置轮询计数并由用户主动检查预览状态。 */
async function refreshPreview() {
  pollingAttempts = 0;
  pollingStopped.value = false;
  await load();
}

/** 获取权限受控下载地址并立即打开。 */
async function download() {
  const result = await api('/documents/file-download', { fileId: props.fileId });
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

onMounted(load);
onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});
</script>
