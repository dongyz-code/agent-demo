<template>
  <el-breadcrumb
    v-if="items.length"
    class="text-sm leading-[22px] [&_.el-breadcrumb__inner]:font-normal [&_.el-breadcrumb__inner]:text-inherit [&_.el-breadcrumb__separator]:mx-2 [&_.el-breadcrumb__separator]:text-black/45"
    separator="/"
  >
    <el-breadcrumb-item
      v-for="item in items"
      :key="`${item.to ?? ''}-${item.label}`"
    >
      <button
        v-if="item.to"
        type="button"
        class="hover:text-primary cursor-pointer text-black/88"
        @click="open(item.to)"
      >
        {{ item.label }}
      </button>
      <span
        v-else
        class="inline-block max-w-md truncate align-bottom text-black/45"
      >
        {{ item.label }}
      </span>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElBreadcrumb, ElBreadcrumbItem } from 'element-plus';

import { routerGo } from '@/router';
import { buildBreadcrumb, useBreadcrumbLeaf } from '../breadcrumb';

import type { RouteName } from '@/router/types';

const route = useRoute();
const leafLabel = useBreadcrumbLeaf();
const items = computed(() => {
  leafLabel.value;
  const name = typeof route.name === 'string' ? route.name : '';
  return buildBreadcrumb(name);
});

/**
 * 点前面的层级回到对应列表。
 * @param name 面包屑上的页面路由名。
 */
function open(name: RouteName) {
  void routerGo(name);
}
</script>
