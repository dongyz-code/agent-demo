<template>
  <v-dialog :title="title" v-model="visible" width="50%">
    <v-form-items
      class="w-full gap-4"
      :options="formOptions"
      :model-value="form"
      @update:model-value="changeForm"
    />
    <template #footer>
      <el-button type="danger" @click="visible = false" class="mr-2">
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
