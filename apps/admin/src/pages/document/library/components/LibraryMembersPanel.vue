<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-600">{{ accessHint }}</p>
      <div v-if="canManage" class="flex items-center gap-2">
        <el-button
          v-if="selected.length"
          :disabled="saving"
          @click="removeSelected"
          >取消所选授权（{{ selected.length }}）</el-button
        >
        <el-button
          type="primary"
          :disabled="loading || saving || failed"
          @click="addVisible = true"
          >新增授权</el-button
        >
      </div>
    </div>
    <v-schema-form
      v-model="searchForm"
      mode="search"
      :columns="searchColumns"
      @submit="applySearch"
      @reset="applySearch"
    />
    <el-result v-if="failed" icon="warning" title="授权名单加载失败"
      ><template #extra
        ><el-button @click="loadGrants">重新加载</el-button></template
      ></el-result
    >
    <v-table
      v-else
      :key="tableKey"
      :data="shownGrants"
      :rows="columns"
      :loading="loading || saving"
      :props="{ emptyText: '没有符合条件的授权' }"
      row-key="libraryGrantId"
      @selection-change="selectGrants"
    >
      <template #subjectName="{ row }">{{ grantLabel(row) }}</template>
      <template #subjectType="{ row }">{{
        row.subjectType === 'group' ? '用户组' : '用户'
      }}</template>
      <template #role="{ row }">
        <el-select
          v-if="canManage"
          :model-value="row.role"
          :disabled="saving || isLastManager(row)"
          :title="isLastManager(row) ? '至少保留一名管理员' : '修改库内身份'"
          class="w-32"
          @change="setRole(row, $event)"
        >
          <el-option label="使用者" value="user" />
          <el-option label="管理员" value="manager" />
        </el-select>
        <span v-else>{{ libraryRoleLabels[row.role] }}</span>
      </template>
      <template #actions="{ row }"
        ><el-button
          link
          type="danger"
          :disabled="saving || isLastManager(row)"
          :title="isLastManager(row) ? '至少保留一名管理员' : '取消此项授权'"
          @click="removeGrants([row])"
          >取消授权</el-button
        ></template
      >
    </v-table>
    <grant-add-dialog
      :visible="addVisible"
      :library-id="library.libraryId"
      :grants="grants"
      @close="addVisible = false"
      @saved="acceptGrants"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElButton, ElOption, ElResult, ElSelect } from 'element-plus';
import { VSchemaForm, VTable } from '@repo/ui';

import { useStore } from '@/models';
import { api, confirm, notify } from '@/utils';
import GrantAddDialog from './GrantAddDialog.vue';
import {
  grantKey,
  grantLabel,
  libraryRoleLabels,
  toGrantInputs,
} from '../utils';

import type {
  LibraryGrantInfo,
  LibraryGrantInput,
  LibraryGrantRole,
  LibraryInfo,
} from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';

/** 名单筛选仅影响展示，提交时始终保留完整授权。 */
interface GrantSearchForm extends Record<string, unknown> {
  /** 用户或用户组名称关键词。 */
  search?: string;
  /** 仅展示指定的库内身份。 */
  role?: LibraryGrantRole;
}
const props = defineProps<{
  /** 当前资料库的身份和可见范围。 */
  library: LibraryInfo;
}>();
const emit = defineEmits<{
  /** 保存后刷新资料库当前身份和统计。 */
  changed: [];
}>();
const store = useStore();
const grants = ref<(LibraryGrantInfo & Record<string, unknown>)[]>([]);
const selected = ref<LibraryGrantInfo[]>([]);
const searchForm = ref<GrantSearchForm>({});
const appliedSearch = ref<GrantSearchForm>({});
const loading = ref(false);
const failed = ref(false);
const saving = ref(false);
const addVisible = ref(false);
const tableKey = ref(0);
const canManage = computed(
  () =>
    props.library.myRole === 'manager' &&
    store.hasPermission('actions.documents.library-grant'),
);
const managerCount = computed(
  () => grants.value.filter((grant) => grant.role === 'manager').length,
);
const accessHint = computed(() => {
  if (props.library.visibility === 'published')
    return '全员可使用；以下为单独授权，取消后仍可能拥有全员使用权限。';
  return '使用者可查阅和检索，管理员可维护文档与授权，具体操作受账号权限限制。';
});
/** 成员搜索沿用后台统一 schema-form 交互。 */
const searchColumns: SchemaFormColumn<GrantSearchForm>[] = [
  {
    dataIndex: 'search',
    title: '成员名称',
    valueType: 'text',
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'role',
    title: '身份',
    valueType: 'select',
    valueEnum: libraryRoleLabels,
    fieldProps: { clearable: true },
  },
];
const columns = computed<TableRow[]>(() => {
  const result: TableRow[] = [];
  if (canManage.value)
    result.push({
      type: 'selection',
      value: 'selection',
      width: 44,
      selectable: canSelectGrant,
    });
  result.push(
    { label: '成员', value: 'subjectName', slot: 'subjectName', minWidth: 34 },
    { label: '类型', value: 'subjectType', slot: 'subjectType', minWidth: 16 },
    { label: '库内身份', value: 'role', slot: 'role', minWidth: 28 },
  );
  if (canManage.value)
    result.push({
      label: '操作',
      value: 'actions',
      slot: 'actions',
      minWidth: 22,
    });
  return result;
});
const shownGrants = computed(() =>
  grants.value.filter((grant) => {
    const keyword = appliedSearch.value.search?.trim().toLocaleLowerCase();
    if (keyword && !grantLabel(grant).toLocaleLowerCase().includes(keyword))
      return false;
    if (appliedSearch.value.role && grant.role !== appliedSearch.value.role)
      return false;
    return true;
  }),
);

/** 应用本地筛选并重置实际表格选择，避免误操作隐藏成员。 */
function applySearch() {
  appliedSearch.value = { ...searchForm.value };
  selected.value = [];
  tableKey.value += 1;
}

/**
 * 判断当前对象是否是完整名单里的最后一名管理员。
 * @param grant 当前授权行。
 * @returns 是否必须禁用降级和取消操作。
 */
function isLastManager(grant: LibraryGrantInfo) {
  return grant.role === 'manager' && managerCount.value <= 1;
}

/**
 * 为表格选择列提供最后一名管理员保护。
 * @param row 表格当前行。
 * @returns 是否允许勾选。
 */
function canSelectGrant(row: Record<string, unknown>) {
  return !isLastManager(row as unknown as LibraryGrantInfo);
}

/**
 * 记录当前可见行的选择。
 * @param rows 勾选的授权行。
 */
function selectGrants(rows: LibraryGrantInfo[]) {
  selected.value = rows;
}

/**
 * 接收服务端确认后的完整名单，再刷新父页身份和统计。
 * @param next 保存接口或新增弹窗返回的实际授权。
 */
function acceptGrants(next: LibraryGrantInfo[]) {
  grants.value = next.map((grant) => ({ ...grant }));
  selected.value = [];
  tableKey.value += 1;
  addVisible.value = false;
  emit('changed');
}

/** 加载失败时禁止新增，避免以空名单覆盖尚未读取的授权。 */
async function loadGrants() {
  loading.value = true;
  failed.value = false;
  try {
    const result = await api('/documents/library-grant-list', {
      libraryId: props.library.libraryId,
    });
    grants.value = result.list.map((grant) => ({ ...grant }));
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

/**
 * 保存完整名单，服务器确认前不改变界面或成员权限。
 * @param next 要保留的完整授权。
 */
async function persist(next: LibraryGrantInput[]) {
  if (!canManage.value || saving.value) return;
  saving.value = true;
  try {
    const result = await api('/documents/library-grant-save', {
      libraryId: props.library.libraryId,
      grants: toGrantInputs(next),
    });
    acceptGrants(result.list);
    notify('success', '授权已更新');
  } catch {
    // 保存失败保留服务器上次确认的名单，不把失败变更显示为已生效。
  } finally {
    saving.value = false;
  }
}

/**
 * 确认后变更一条授权身份，取消或失败均不修改原有身份。
 * @param grant 准备变更的授权。
 * @param role 目标库内身份。
 */
async function setRole(grant: LibraryGrantInfo, role: LibraryGrantRole) {
  if (isLastManager(grant) || role === grant.role) return;
  await confirm({
    title: `将“${grantLabel(grant)}”设为${libraryRoleLabels[role]}？`,
    message: '此修改立即生效。如果修改自己的身份，你也可能失去管理权限。',
    opt: { confirmButtonText: '变更身份' },
    async confirmCallback() {
      await persist(
        grants.value.map((item) => {
          if (grantKey(item) === grantKey(grant)) return { ...item, role };
          return item;
        }),
      );
    },
  });
}

/** 将当前表格选择交给与单条操作共用的取消流程。 */
function removeSelected() {
  void removeGrants(selected.value);
}

/**
 * 校验最终名单后确认取消授权，禁止批量取消全部管理员。
 * @param targets 需要取消的完整授权行。
 */
async function removeGrants(targets: LibraryGrantInfo[]) {
  const keys = new Set(targets.map(grantKey));
  const next = grants.value.filter((grant) => !keys.has(grantKey(grant)));
  if (!next.some((grant) => grant.role === 'manager')) {
    notify('warning', '至少保留一名管理员，请取消勾选一名管理员后重试');
    return;
  }
  await confirm({
    title: `取消 ${targets.length} 项授权？`,
    message:
      '其他用户组、单独授权和全员使用权限仍可能让这些成员继续访问。取消自己的授权可能使你失去访问权限。',
    opt: { confirmButtonText: '取消授权' },
    async confirmCallback() {
      await persist(next);
    },
  });
}

onMounted(() => {
  void loadGrants();
});
</script>
