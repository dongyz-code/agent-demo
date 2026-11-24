<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="form"
        mode="search"
        :columns="formColumns"
        :layout="{ labelWidth: '96px' }"
        @reset="reset"
        @submit="getRoleList(true)"
      />
    </div>

    <v-options
      v-model="optionsData.visible"
      :data="optionsData.data"
      :formKey="optionsData.formKey"
      :title="dialogTitle"
      :can-edit-base="access.editBase"
      :can-edit-permission="access.assignPermission"
      @form="submitRoleForm"
    />

    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex flex-wrap justify-end gap-2">
        <el-button
          @click="item.method"
          v-for="item in actions"
          :key="item.action"
        >
          {{ item.label }}
        </el-button>
      </div>
      <v-table class="min-h-0 flex-1" :data="cRoles" :rows="rows">
        <template #edit="scope">
          <div class="flex items-center gap-4">
            <v-icon
              v-for="(item, index) in tableEditBtns"
              :key="index"
              :icon="item.icon"
              :tips="item.tips"
              class="hover:text-primary"
              @click="item.method(scope.row.self)"
            />
          </div>
        </template>

        <template #role_type="scope">
          <el-tag>{{ scope.row.role_type }}</el-tag>
        </template>

        <template #available="scope">
          <div class="flex items-center">
            <el-switch
              :model-value="scope.row.available"
              :disabled="!access.toggle"
              @update:model-value="
                toggleRoleStatus($event, scope.row.self.role_id)
              "
              active-text="启用"
              inactive-text="禁用"
              inline-prompt
            />
          </div>
        </template>
      </v-table>
      <component
        :is="pageComponent"
        class="mt-4"
        @update:model-value="getRoleListDebounce"
      ></component>
    </div>
  </section>
</template>

<style lang="postcss" scoped></style>

<script lang="ts">
import { setup } from '.';
export default setup;
</script>
