<template>
  <upload-dialog
    v-if="target"
    :key="instanceKey"
    ref="dialogRef"
    :instance-key="instanceKey"
    :max-number-of-files="maxFiles"
    @uploaded="emit('uploaded', $event)"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue';

import UploadDialog from './UploadDialog.vue';

import type { DocumentUploadResult } from '@/types';
import type { DocumentUploadTarget } from './types';

const emit = defineEmits<{
  /** 文件完成验证和版本绑定后，通知业务页面刷新。 */
  uploaded: [result: DocumentUploadResult];
}>();
const target = shallowRef<DocumentUploadTarget>();
const dialogRef = ref<InstanceType<typeof UploadDialog>>();
const opening = ref(false);
const instanceKey = computed(() => {
  if (target.value?.documentId)
    return `document-version-${target.value.documentId}`;
  return 'document-new';
});
const maxFiles = computed(() => {
  if (target.value?.documentId) return 1;
  return undefined;
});

/**
 * 延迟创建一个上传实例，新文档与各文档版本队列按业务目标隔离。
 * @param options 上传目标；不传文档标识时进入新文档流程。
 * @returns 弹窗完成上下文准备后结束，不等待文件上传完成。
 */
async function open(options: DocumentUploadTarget = {}) {
  if (opening.value) return;
  opening.value = true;
  try {
    target.value = { ...options };
    await nextTick();
    await dialogRef.value?.open(options);
  } catch {
    // 上下文准备失败时不打开上传界面，公共请求层负责错误提示。
  } finally {
    opening.value = false;
  }
}

defineExpose({ open });
</script>
