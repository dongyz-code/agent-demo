<template>
  <v-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    width="50%"
  >
    <v-form-items
      class="mb-4 w-full"
      :options="formOptions"
      v-model="form"
    ></v-form-items>

    <div class="max-h-[50vh] overflow-y-auto border-b last:border-none">
      <v-check-box
        :checkVal="checkVal"
        :data="tree"
        @node-check="nodeCheck"
      ></v-check-box>
    </div>

    <template #footer>
      <el-button
        @click="emit('update:modelValue', false)"
        class="mr-2"
        type="danger"
      >
        取消
      </el-button>
      <el-button type="primary" @click="submit">确认</el-button>
    </template>
  </v-dialog>
</template>

<style lang="postcss" scoped></style>

<script lang="ts">
import { setup } from '.';
export default setup;
</script>
