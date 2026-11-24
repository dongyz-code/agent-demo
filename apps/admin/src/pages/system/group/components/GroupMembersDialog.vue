<template>
  <v-dialog v-model="visible" title="组成员" width="640px">
    <div class="mb-3 flex gap-2">
      <el-select
        v-model="selectedUserId"
        class="min-w-0 flex-1"
        filterable
        remote
        :remote-method="searchUsers"
        placeholder="搜索用户"
      >
        <el-option
          v-for="user in users"
          :key="user.userId"
          :label="memberLabel(user)"
          :value="user.userId"
        />
      </el-select>
      <el-button @click="addMember">添加</el-button>
    </div>
    <v-table :data="members" :rows="rows">
      <template #actions="{ row }">
        <el-button link type="danger" @click="removeMember(row.userId)">移除</el-button>
      </template>
    </v-table>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElOption, ElSelect } from 'element-plus';
import { VDialog, VTable } from '@repo/ui';

import { api, notify } from '@/utils';

import type { UserGroupMemberInfo } from '@/types';
import type { TableRow } from '@repo/ui';

const emit = defineEmits<{ saved: [] }>();
const visible = ref(false);
const userGroupId = ref('');
const members = ref<UserGroupMemberInfo[]>([]);
const users = ref<UserGroupMemberInfo[]>([]);
const selectedUserId = ref('');
const rows: TableRow[] = [
  { label: '用户', value: 'nickname', minWidth: 160 },
  { label: '操作', value: 'actions', slot: 'actions', width: 80 },
];

/** 打开成员弹窗。 */
async function open(id: string) {
  userGroupId.value = id;
  selectedUserId.value = '';
  const detail = await api('/sys/group/detail', { userGroupId: id });
  members.value = detail.members;
  visible.value = true;
  void searchUsers('');
}

/** 候选项同时展示昵称和登录名。 */
function memberLabel(user: UserGroupMemberInfo) {
  if (user.username) return `${user.nickname}（${user.username}）`;
  return user.nickname;
}

/** 搜索可加入的用户，匹配昵称或登录名。 */
async function searchUsers(search: string) {
  const result = await api('/sys/group/user-search', { search });
  users.value = result.list;
}

/** 加入待保存成员。 */
function addMember() {
  if (!selectedUserId.value) return;
  if (members.value.some((member) => member.userId === selectedUserId.value)) return;
  const user = users.value.find((item) => item.userId === selectedUserId.value);
  if (!user) return;
  members.value = [...members.value, user];
}

/** 从待保存名单移除。 */
function removeMember(userId: string) {
  members.value = members.value.filter((member) => member.userId !== userId);
}

/** 用当前名单替换组成员。 */
async function save() {
  const detail = await api('/sys/group/member-save', {
    userGroupId: userGroupId.value,
    userIds: members.value.map((member) => member.userId),
  });
  members.value = detail.members;
  notify('success', '成员已保存');
  visible.value = false;
  emit('saved');
}

defineExpose({ open });
</script>
