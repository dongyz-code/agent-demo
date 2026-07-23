<template>
  <v-dialog v-model="visible" title="文档预览" width="1000px">
    <document-viewer
      v-if="documentId"
      :key="`${documentId}-${documentVersionId ?? 'active'}`"
      :document-id="documentId"
      :document-version-id="documentVersionId"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { VDialog } from '@repo/ui';

import DocumentViewer from './DocumentViewer.vue';

const visible = ref(false);
const documentId = ref('');
const documentVersionId = ref<string>();

/** 打开文档当前版本或指定历史版本的统一页面查看器。 */
function open(nextDocumentId: string, nextDocumentVersionId?: string) {
  documentId.value = nextDocumentId;
  documentVersionId.value = nextDocumentVersionId;
  visible.value = true;
}

defineExpose({ open });
</script>
