<template>
  <div class="inline-flex items-center">
    <el-tooltip v-if="tips" :content="tips" raw-content placement="top">
      <IconParkOutlineTipsOne />
    </el-tooltip>
    {{ title }}
  </div>
</template>

<script setup lang="ts">
import { ElTooltip } from 'element-plus';
import IconParkOutlineTipsOne from '~icons/icon-park-outline/tips-one';

defineProps<{
  title: string;
  tips?: string;
}>();
</script>
