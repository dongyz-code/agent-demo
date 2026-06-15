<template>
  <div :class="{ 'ml-8': depth }">
    <div
      :class="[e.type === 'action' ? 'mr-3 inline-block last:mr-0' : 'py-2']"
      v-for="e in data"
      :key="e.key"
    >
      <div>
        <el-checkbox
          :model-value="checkVal[e.key]"
          @update:model-value="change(e, $event)"
        >
          <span :class="[e.type !== 'action' ? 'font-bold' : 'opacity-90']">
            {{ e.label }}
          </span>
        </el-checkbox>
      </div>
      <template v-if="e.childs?.length">
        <v-check-box
          @node-check="nodeCheck"
          :data="e.childs"
          :checkVal="checkVal"
          :depth="depth + 1"
        ></v-check-box>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { setup } from '.';
export default setup;
</script>
