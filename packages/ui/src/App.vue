<template>
  <div class="h-body bg-white">
    <button @click="visible = true">123</button>

    <div class="bg-background grid w-[--min-body-width] grid-cols-18 font-bold">
      123
    </div>
    <!-- 
    <v-dialog v-model="visible" top="10px">
      <template #header> header </template>
      <div>//</div>
      <template #footer> footer </template>
    </v-dialog> -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
// import VDialog from './components/dialog/index.vue';

const visible = ref(false);
</script>
