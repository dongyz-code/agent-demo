<template>
  <div
    class="pagination flex items-center"
    :style="{ height }"
    :class="[
      align === 'center'
        ? 'justify-center'
        : align === 'left'
          ? ''
          : 'justify-end',
    ]"
  >
    <el-pagination
      background
      :size="size"
      :total="pageData.total"
      :layout="pageData.layout.join()"
      :page-size="pageData.size"
      :current-page="pageData.current"
      :page-sizes="pageData.sizes"
      :pager-count="pageData.pagerCount"
      @update:page-size="update({ size: $event })"
      @update:current-page="update({ current: $event })"
    >
      <template #default>
        <span
          style="
            font-size: var(--el-pagination-font-size);
            color: var(--el-text-color-regular);
            margin-right: 16px;
          "
          >共 {{ totalLimit.value }} 条
          <span class="text-tcolor text-xs" v-if="totalLimit.over"
            >(查询上限: {{ totalLimit.over }})</span
          >
        </span>
      </template>
    </el-pagination>
  </div>
</template>

<script setup lang="ts">
import { ElPagination } from 'element-plus';
import { computed } from 'vue';
import { numSplit } from '@repo/utils-browser';
import { defaultPageData } from './type';

import type { PageData, Props } from './type';

const props = withDefaults(defineProps<Props>(), {
  align: 'center',
  height: '56px',
  size: 'default',
});

const emits = defineEmits<{
  'update:modelValue': [val: PageData];
}>();

const pageData = computed(() => {
  return {
    ...defaultPageData,
    ...props.modelValue,
  };
});

function update(data: Partial<PageData> = {}) {
  emits('update:modelValue', {
    ...pageData.value,
    ...data,
  });
}

const totalLimit = computed(() => {
  const { total, realCount } = pageData.value;
  const over = realCount
    ? realCount > total
      ? numSplit(total, 3)
      : false
    : false;

  return {
    value: numSplit(realCount ?? total, 3),
    over,
  };
});
</script>
