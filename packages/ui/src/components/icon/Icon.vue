<template>
  <div class="inline-block cursor-pointer align-middle">
    <el-tooltip v-if="tipsProps" v-bind="tipsProps">
      <template #content>
        <slot name="tips" :tips="tipsProps.content">
          {{ tipsProps.content }}
        </slot>
      </template>
      <component class="outline-none select-none" :is="icon"></component>
    </el-tooltip>
    <component class="outline-none select-none" v-else :is="icon"></component>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElTooltip } from 'element-plus';

import type { ElTooltipProps } from 'element-plus';
import type { FunctionalComponent } from 'vue';

type ElTooltipOpts = Partial<ElTooltipProps>;

const props = defineProps<{
  icon: FunctionalComponent;
  tips?: string | ElTooltipOpts;
}>();

const _tipsProps: ElTooltipOpts = {
  hideAfter: 0,
  showAfter: 300,
};

const tipsProps = computed(() => {
  const { tips } = props;
  if (!tips) {
    return null;
  }
  const bind: ElTooltipOpts = {
    ..._tipsProps,
    ...(typeof tips === 'string' ? { content: tips } : tips),
  };
  return bind;
});
</script>
