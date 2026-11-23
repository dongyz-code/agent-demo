<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="searchColumns"
        @reset="loadGroups(true)"
        @submit="loadGroups(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex justify-between">
        <strong>用户组</strong>
        <el-button
          v-if="store.hasPermission('actions.group.create')"
          type="primary"
          @click="dialogRef?.open()"
        >
          新建用户组
        </el-button>
      </div>
      <v-table class="min-h-0 flex-1" :data="groups" :rows="rows" :loading="loading">
        <template #actions="{ row }">
          <el-button
            v-if="store.hasPermission('actions.group.member')"
            link
            @click="memberRef?.open(row.userGroupId)"
          >
            成员
          </el-button>
          <el-button
            v-if="store.hasPermission('actions.group.update')"
            link
            @click="dialogRef?.open(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="store.hasPermission('actions.group.delete')"
            link
            type="danger"
            @click="removeGroup(row)"
          >
            删除
          </el-button>
        </template>
      </v-table>
      <page-component @update:model-value="loadGroups()" />
    </div>
    <group-dialog ref="dialogRef" @saved="loadGroups(true)" />
    <group-members-dialog ref="memberRef" @saved="loadGroups()" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { ElButton } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import { useStore } from '@/models';
import { api, confirm } from '@/utils';
import GroupDialog from './components/GroupDialog.vue';
import GroupMembersDialog from './components/GroupMembersDialog.vue';

import type { UserGroupInfo } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

const store = useStore();
const searchForm = ref<{ search?: string }>({});
const groups = shallowRef<(UserGroupInfo & Record<string, unknown>)[]>([]);
const loading = ref(false);
const dialogRef = ref<InstanceType<typeof GroupDialog>>();
const memberRef = ref<InstanceType<typeof GroupMembersDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({ page: { size: 20 } });

const searchColumns: SchemaFormColumn<{ search?: string }>[] = [
  { dataIndex: 'search', title: '名称', valueType: 'text', fieldProps: { clearable: true } },
];
const rows: TableRow[] = [
  { label: '名称', value: 'name', minWidth: 'normal' },
  { label: '人数', value: 'memberCount', width: 100 },
  { label: '说明', value: 'description', minWidth: 240 },
  { label: '操作', value: 'actions', slot: 'actions', width: 180, fixed: 'right' },
];

/** 分页加载用户组。 */
async function loadGroups(withCount = false) {
  if (withCount) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/sys/group/list', {
      search: searchForm.value.search,
      limit: pageRange.value,
      withCount,
    });
    groups.value = result.list.map((group) => ({ ...group }));
    if (withCount) setPageData({ total: result.count });
  } finally {
    loading.value = false;
  }
}

/** 删除用户组。 */
async function removeGroup(group: UserGroupInfo) {
  await confirm({
    title: '确认删除该用户组？',
    async confirmCallback() {
      await api('/sys/group/remove', { userGroupId: group.userGroupId });
      await loadGroups(true);
    },
  });
}

onMounted(() => {
  void loadGroups(true);
});
</script>
