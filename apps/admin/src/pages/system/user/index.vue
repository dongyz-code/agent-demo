<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="form"
        mode="search"
        :columns="formColumns"
        :layout="{ labelWidth: '96px' }"
        @reset="reset"
        @submit="getUserList(true)"
      />
    </div>

    <v-options
      v-model:visible="optionsData.visible"
      :data="optionsData.data"
      :fields="optionsData.fields"
      title="编辑账户"
      @form="getForm"
    />

    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex flex-wrap justify-end gap-2">
        <el-button
          plain
          @click="item.method"
          v-for="item in actions"
          :key="item.action"
        >
          {{ item.label }}
        </el-button>
      </div>
      <v-table
        class="min-h-0 flex-1"
        :data="cUsers"
        :rows="rows"
        @selection-change="select"
      >
        <template #edit="scope">
          <div class="flex items-center gap-2">
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

        <template #user_type="scope">
          <el-tag>{{ scope.row.user_type }}</el-tag>
        </template>

        <template #department="scope">
          <span
            class="m-1 inline-block max-w-full overflow-hidden rounded border border-gray-200 bg-gray-100 px-1 align-top text-[0.9em] text-ellipsis whitespace-nowrap"
            v-for="e in scope.row.department"
            :key="e.value"
            :title="e.label"
          >
            {{ e.label }}
          </span>
        </template>

        <template #roles="scope">
          <el-tag v-for="item in scope.row.roles" class="mr-2 last:mr-0">
            {{ item.label }}
          </el-tag>
        </template>

        <template #available="scope">
          <div class="flex items-center">
            <el-switch
              :model-value="scope.row.available"
              @update:model-value="changeLogin($event, scope.row.self.user_id)"
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
        @update:model-value="getUserList"
      ></component>
    </div>
  </section>
</template>

<style lang="postcss" scoped></style>

<script lang="ts">
import { setup } from '.';
export default setup;
</script>
