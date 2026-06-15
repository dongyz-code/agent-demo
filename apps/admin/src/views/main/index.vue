<template>
  <div>
    <v-header>
      <v-menu :items="menuItems"></v-menu>
    </v-header>
    <v-body></v-body>
  </div>
</template>

<script setup lang="ts">
import { useStore } from '@/store';
import { helperRouterName } from '@/router';
import { computed } from 'vue';

import VMenu from '@/components/menu/index.vue';
import VHeader from '@/components/header/index.vue';
import VBody from './Body.vue';

import MaterialSymbolsNavigationRounded from '~icons/material-symbols/navigation-rounded';
import MajesticonsApplications from '~icons/majesticons/applications';

import type { MenuItem } from '@/components/menu/type';
import type { RouteName } from '@/router';

const _menuItems: MenuItem<RouteName>[] = [
  {
    ...helperRouterName('app.list'),
    icon: MaterialSymbolsNavigationRounded,
  },
  {
    label: '系统管理',
    icon: MajesticonsApplications,
    children: [
      helperRouterName('sys.user'),
      helperRouterName('sys.role'),
      helperRouterName('sys.app'),
      helperRouterName('sys.app-log'),
      helperRouterName('sys.user-log'),
      helperRouterName('sys.task'),
      helperRouterName('sys.table'),
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
