<template>
  <v-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    width="50%"
  >
    <v-schema-form
      class="mb-4 w-full"
      :columns="formColumns"
      v-model="form"
    />

    <div class="mb-3">
      <el-input
        v-model="filterText"
        clearable
        placeholder="搜索权限名称或 key"
      />
    </div>

    <div class="max-h-[50vh] overflow-y-auto border-b last:border-none">
      <el-tree
        ref="treeRef"
        :data="tree"
        node-key="key"
        show-checkbox
        default-expand-all
        :expand-on-click-node="false"
        :filter-node-method="filterNode"
        :props="treeProps"
        :check-on-click-node="canEditPermission"
        @check="syncCheckedKeys"
      />
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
