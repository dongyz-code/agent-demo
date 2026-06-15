<template>
  <VNotFound :back-to-home="routerGoHome" />
</template>

<script setup lang="ts">
import { VNotFound } from '@repo/ui';
import { routerGoHome } from '@/router';
</script>
