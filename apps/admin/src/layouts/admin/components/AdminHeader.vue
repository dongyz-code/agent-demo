<template>
  <div
    class="h-header flex shrink-0 items-center justify-between gap-4 bg-white px-2 shadow-sm"
  >
    <div class="flex min-w-0 flex-1 items-center gap-6 px-2">
      <v-icon
        :icon="menuIcon"
        :tips="menuTips"
        class="text-black/65"
        @click="toggleMenu"
      />
      <admin-breadcrumb />
    </div>
    <div class="flex shrink-0 items-center gap-4">
      <div class="flex items-center gap-2">
        {{ store.$state.user?.nickname }}
        <v-icon
          :icon="MaterialSymbolsLogout"
          tips="登出"
          class="hover:text-danger"
          @click="logout"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import AdminBreadcrumb from './AdminBreadcrumb.vue';
import { useStore } from '@/models';
import { VIcon } from '@repo/ui';
import { routerGoLogin } from '@/router';
import { api } from '@/utils';
import { logoutHandle } from '@/pages/login/login';

import LucidePanelLeftClose from '~icons/lucide/panel-left-close';
import LucidePanelLeftOpen from '~icons/lucide/panel-left-open';
import MaterialSymbolsLogout from '~icons/material-symbols/logout';

const store = useStore();
const menuIcon = computed(() => {
  if (store.NAV_COLLAPSE) return LucidePanelLeftOpen;
  return LucidePanelLeftClose;
});
const menuTips = computed(() => {
  if (store.NAV_COLLAPSE) return '展开菜单';
  return '收起菜单';
});

/** 切换左侧菜单的展开和收起。 */
function toggleMenu() {
  store.NAV_COLLAPSE = !store.NAV_COLLAPSE;
}
const loggingOut = ref(false);

/**
 * 调用服务端清除认证 Cookie，并清理管理端本地会话后替换到登录页。
 * 服务端请求失败时仍清理本地状态，避免当前页面继续使用旧会话。
 *
 * @returns 登出请求和登录页跳转完成后结束。
 */
async function logout() {
  if (loggingOut.value) {
    return;
  }

  loggingOut.value = true;
  try {
    await api('/login/logout', {});
  } catch {
    // API 拦截器会负责提示错误；本地会话仍必须清理。
  } finally {
    logoutHandle();
    await routerGoLogin();
    loggingOut.value = false;
  }
}
</script>
