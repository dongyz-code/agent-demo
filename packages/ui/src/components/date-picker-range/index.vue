<template>
  <component :is="h(ElDatePicker, { ...baseAttrs, ...$attrs }, $slots)" />
</template>

<script setup lang="ts">
import { ElDatePicker } from 'element-plus';
import { shortcuts } from './static';
import { h } from 'vue';

import type { DatePickerProps } from 'element-plus';
import type { ComponentInstance } from 'vue';

const baseAttrs: Partial<DatePickerProps> = {
  type: 'datetimerange',
  shortcuts,
  startPlaceholder: '开始日期',
  endPlaceholder: '结束日期',
};

defineExpose({} as ComponentInstance<typeof ElDatePicker>);
</script>
