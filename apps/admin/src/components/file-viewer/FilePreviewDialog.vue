<template>
  <v-dialog v-model="visible" title="文件预览" width="900px">
    <file-viewer v-if="fileId" :key="fileId" :file-id="fileId" />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { VDialog } from '@repo/ui';

import FileViewer from './FileViewer.vue';

const visible = ref(false);
const fileId = ref('');

/** 打开指定通用文件的查看器。 */
function open(nextFileId: string) {
  fileId.value = nextFileId;
  visible.value = true;
}

defineExpose({ open });
</script>
