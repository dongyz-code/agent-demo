<template>
  <v-dialog v-model="visible" title="重新处理文档">
    <p class="text-sm text-gray-600">将保留旧处理版本，并为当前文档版本创建新的处理任务。</p>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">确认重新处理</el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElButton } from 'element-plus';
import { VDialog } from '@repo/ui';
import { api } from '@/utils';

const emit = defineEmits<{
  /** 新处理任务创建成功。 */
  submitted: [jobId: string, documentId: string];
}>();
const visible = ref(false);
const submitting = ref(false);
let documentId = '';

/** 打开指定文档的重新处理确认弹窗。 */
function open(nextDocumentId: string) {
  documentId = nextDocumentId;
  visible.value = true;
}

/** 创建新的文档处理任务。 */
async function submit() {
  submitting.value = true;
  try {
    const result = await api('/document/reprocess', { documentId });
    visible.value = false;
    emit('submitted', result.jobId, documentId);
  } finally {
    submitting.value = false;
  }
}

defineExpose({ open });
</script>
