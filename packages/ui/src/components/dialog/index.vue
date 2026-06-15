<template>
  <component
    class="rounded-lg! bg-white!"
    :is="h(ElDialog, { ...baseAttrs, ...$attrs }, $slots)"
  ></component>
</template>

<script setup lang="ts">
import { ElDialog } from 'element-plus';
import { h } from 'vue';

import type { DialogProps } from 'element-plus';
import type { ComponentInstance } from 'vue';

const baseAttrs: Partial<DialogProps> = {
  width: '50%',
  closeOnClickModal: true,
  bodyClass: 'text-inherit! text-base!',
  headerClass: 'text-inherit! text-base!',
  footerClass: 'text-inherit! text-base!',
};

defineExpose({} as ComponentInstance<typeof ElDialog>);
</script>

<style lang="postcss">
/* align-center: 内部滚动（一页展示） */
.is-align-center {
  margin-block: auto;

  .el-dialog__body {
    max-height: calc(100vh - 240px);
    overflow: auto;
  }
}
</style>
