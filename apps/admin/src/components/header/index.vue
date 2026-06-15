<template>
  <div
    class="h-header flex items-center justify-between gap-4 bg-white px-2 shadow-sm"
  >
    <div class="h-full shrink-0 cursor-pointer py-2">
      <img
        :src="logo"
        alt="logo"
        class="max-h-full"
        @click="logoClickHandler"
      />
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

import logo from '@/assets/logo.png';

import MaterialSymbolsLogout from '~icons/material-symbols/logout';

const store = useStore();

function logoClickHandler() {
  // store.stateSet({
  //   NAV_MODE: store.NAV_MODE === 'horizontal' ? 'vertical' : 'horizontal',
  // });
}
</script>
