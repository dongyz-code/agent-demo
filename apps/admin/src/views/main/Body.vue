<template>
  <div
    class="admin-container h-body w-full overflow-auto"
    :class="[meta.box === false ? '' : 'p-2']"
  >
    <div :class="[meta.box === false ? '' : 'min-h-full rounded']">
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
