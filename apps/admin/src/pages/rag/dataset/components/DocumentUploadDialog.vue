<template>
  <upload-dialog ref="uploadRef" policy-key="rag-document" @uploaded="createDocument" />
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { api } from '@/utils';
import UploadDialog from '@/components/upload/UploadDialog.vue';

import type { StoredFileInfo } from '@/types';

const emit = defineEmits<{ /** RAG 文档创建成功。 */ created: [] }>();
const uploadRef = ref<InstanceType<typeof UploadDialog>>();
let datasetId = '';

/** 打开指定知识库的文档上传流程。 */
function open(nextDatasetId: string) {
  datasetId = nextDatasetId;
  uploadRef.value?.open();
}

/** 通用上传验证成功后先创建文档，再显式加入知识库。 */
async function createDocument(file: StoredFileInfo) {
  const document = await api('/document/create', {
    fileId: file.fileId,
    name: file.filename,
  });
  await api('/rag/dataset-document/add', {
    datasetId,
    documentId: document.documentId,
  });
  emit('created');
}

defineExpose({ open });
</script>
