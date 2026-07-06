<template>
  <div>
    <v-header>
      <v-menu :items="menuItems"></v-menu>
    </v-header>
    <v-body></v-body>
  </div>
</template>

<script setup lang="ts">
import { useStore } from '@/models';
import { helperRouterName } from '@/router';
import { computed } from 'vue';

import VMenu from '@/layouts/admin/components/AdminMenu.vue';
import VHeader from '@/layouts/admin/components/AdminHeader.vue';
import VBody from './AdminBody.vue';

import MajesticonsApplications from '~icons/majesticons/applications';

import type { MenuItem } from '@/layouts/admin/types';
import type { RouteName } from '@/router';

const _menuItems: MenuItem<RouteName>[] = [
  {
    label: '系统管理',
    icon: MajesticonsApplications,
    children: [
      helperRouterName('system.user'),
      helperRouterName('system.role'),
      helperRouterName('system.app'),
      helperRouterName('system.app-log'),
      helperRouterName('system.user-log'),
      helperRouterName('system.task'),
      helperRouterName('system.table'),
    ],
  },
];

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
  return filter(_menuItems, store.userPage);
});
</script>
