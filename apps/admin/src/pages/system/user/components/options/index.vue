<template>
  <v-dialog :title="title" v-model="visible" width="min(92vw, 560px)">
    <v-schema-form
      ref="formRef"
      class="w-full"
      :columns="formColumns"
      :layout="{ labelWidth: '72px' }"
      v-model="form"
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
