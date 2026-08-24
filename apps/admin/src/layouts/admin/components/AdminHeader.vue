<template>
  <div
    class="h-header flex items-center justify-between gap-4 bg-white px-2 shadow-sm"
  >
    <div
      class="flex h-full shrink-0 cursor-pointer items-center gap-2 py-2"
      @click="logoClickHandler"
    >
      <img
        :src="logo"
        alt="Admin Console"
        class="h-full w-auto rounded-lg"
      />
      <span class="whitespace-nowrap text-base font-semibold text-tcolor-dark">
        Admin Console
      </span>
    </div>
    <slot></slot>
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
import { useStore } from '@/models';
import { VIcon } from '@repo/ui';
import { routerGoLogin } from '@/router';
import { api } from '@/utils';
import { logoutHandle } from '@/pages/login/login';
import { ref } from 'vue';

import logo from '@/assets/logo-small.png';

import MaterialSymbolsLogout from '~icons/material-symbols/logout';

const store = useStore();
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

function logoClickHandler() {
  // store.stateSet({
  //   NAV_MODE: store.NAV_MODE === 'horizontal' ? 'vertical' : 'horizontal',
  // });
}
</script>
