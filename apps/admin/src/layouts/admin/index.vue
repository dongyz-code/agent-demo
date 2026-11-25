<template>
  <div class="bg-background flex h-svh overflow-hidden" :style="shellStyle">
    <aside
      class="flex h-full w-[var(--menu-width)] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200"
    >
      <div
        class="flex h-14 shrink-0 items-center border-b border-gray-100"
        :class="collapsed ? 'justify-center px-2' : 'gap-2 px-4'"
      >
        <img :src="logo" alt="Admin Console" class="h-8 w-auto rounded-lg" />
        <span
          v-if="!collapsed"
          class="text-tcolor-dark truncate text-base font-semibold"
        >
          Admin Console
        </span>
      </div>
      <v-menu class="min-h-0 flex-1" :items="menuItems"></v-menu>
    </aside>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <v-header></v-header>
      <v-body></v-body>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStore } from '@/models';
import { computed } from 'vue';

import VMenu from '@/layouts/admin/components/AdminMenu.vue';
import VHeader from '@/layouts/admin/components/AdminHeader.vue';
import VBody from './AdminBody.vue';
import { adminMenu } from './menu';

import logo from '@/assets/logo-small.png';

import type { MenuItem } from '@/layouts/admin/types';

const store = useStore();

function filter(items: MenuItem[], limit: Set<string>): MenuItem[] {
  const list: MenuItem[] = [];

  for (const item of items) {
    if ('children' in item) {
      const children = filter(item.children, limit);
      if (children.length) {
        list.push({
          ...item,
          children,
        });
      }
    } else if (limit.has(item.value)) {
      list.push(item);
    }
  }

  return list;
}

const menuItems = computed(() => {
  return filter(adminMenu, store.userPage);
});
const collapsed = computed(() => store.NAV_COLLAPSE);
/** 侧栏展开 220px，收起后只留图标宽度。 */
const shellStyle = computed(() => {
  let menuWidth = '220px';
  if (collapsed.value) menuWidth = '64px';
  return {
    '--menu-width': menuWidth,
    '--header-height': '56px',
  };
});
</script>
