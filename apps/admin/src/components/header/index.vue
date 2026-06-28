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
          @click="routerGoLogin"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStore } from '@/store';
import { VIcon } from '@repo/ui';
import { routerGoLogin } from '@/router';

import logo from '@/assets/logo-small.png';

import MaterialSymbolsLogout from '~icons/material-symbols/logout';

const store = useStore();

function logoClickHandler() {
  // store.stateSet({
  //   NAV_MODE: store.NAV_MODE === 'horizontal' ? 'vertical' : 'horizontal',
  // });
}
</script>
