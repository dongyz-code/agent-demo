<template>
  <div
    class="admin-container min-h-0 w-full flex-1 overflow-hidden"
    :class="[meta.box === false ? '' : 'p-2']"
  >
    <div class="h-full overflow-auto">
      <router-view v-slot="{ Component }">
        <transition name="fade">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { computed } from 'vue';

import type { Meta } from '@/router';

const route = useRoute();

const meta = computed(() => {
  const meta = route.meta as Meta;
  return meta;
});
</script>
