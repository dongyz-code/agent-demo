<template>
  <v-dialog v-model="visible" title="后端服务部署要求" width="80%">
    <div class="flex flex-col gap-3">
      <div class="flex justify-end">
        <el-button type="primary" :loading="copyLoading" @click="copyAll">
          复制全文
        </el-button>
      </div>
      <pre
        class="m-0 rounded-md bg-gray-50 p-4 font-mono text-sm leading-relaxed wrap-break-word whitespace-pre-wrap"
        >{{ markdownSource }}</pre
      >
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { copyText } from '@repo/utils-browser';
import { VDialog } from '@repo/ui';
import { notify } from '@/plugins/notify';
import { ElButton } from 'element-plus';

import markdownSource from '../content/deploy-requirement.md?raw';

const visible = shallowRef(false);
const copyLoading = ref(false);

function open() {
  visible.value = true;
}

defineExpose({ open });

async function copyAll() {
  copyLoading.value = true;
  try {
    await copyText(markdownSource);
    notify('success', '已复制到剪贴板');
  } finally {
    copyLoading.value = false;
  }
}
</script>
