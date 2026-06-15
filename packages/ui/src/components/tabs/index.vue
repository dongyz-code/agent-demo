<template>
  <el-segmented
    v-if="options.length"
    :options="options"
    :model-value="modelValue?.value"
    @update:model-value="update"
    class="segmented select-none"
    :class="[size === 'large' ? 'text-base!' : '', size]"
  >
    <template #default="{ item }">
      <div class="flex items-center gap-1">
        <component v-if="(item as T).icon" :is="(item as T).icon" />
        {{ (item as T).label }}
      </div>
    </template>
  </el-segmented>
</template>

<script setup lang="ts" generic="T extends TabItem">
import { ElSegmented } from 'element-plus';

import type { TabItem } from './type';

const props = defineProps<{
  options: T[];
  modelValue?: T;
  size?: 'default' | 'large';
}>();

const emits = defineEmits<{
  'update:modelValue': [T];
}>();

function update(val: T['value']) {
  const item = props.options.find((x) => x.value === val);
  if (item) {
    emits('update:modelValue', item);
  }
}
</script>

<style lang="postcss" scoped>
.segmented {
  :deep(.el-segmented__item-selected) {
    border-radius: 0.25rem;
  }
  :deep(.el-segmented__item-selected.is-disabled) {
    background-color: var(--color-primary);
  }
  &.large {
    :deep(.el-segmented__item) {
      padding: 0.25rem 0.75rem;
    }
  }
}
</style>
