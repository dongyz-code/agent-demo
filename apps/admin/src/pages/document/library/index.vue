<template>
  <section class="flex min-h-full flex-col gap-3">
    <div class="rounded bg-white p-4 shadow">
      <v-schema-form
        v-model="searchForm"
        mode="search"
        :columns="librarySearchColumns"
        @reset="loadLibraries(true)"
        @submit="loadLibraries(true)"
      />
    </div>
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div class="mb-3 flex items-center justify-between gap-3">
        <strong>资料库</strong>
        <el-button
          v-if="store.hasPermission('actions.documents.library-create')"
          type="primary"
          @click="libraryDialogRef?.open()"
        >
          新建资料库
        </el-button>
      </div>
      <v-table
        class="min-h-0 flex-1"
        :data="libraries"
        :rows="libraryColumns"
        :loading="loading"
        :props="{ emptyText: '暂无符合条件的资料库' }"
      >
        <template #name="{ row }">
          <p class="truncate text-gray-900">{{ row.name }}</p>
          <p v-if="row.description" class="mt-1 truncate text-xs text-gray-500">
            {{ row.description }}
          </p>
        </template>
        <template #visibility="{ row }">
          {{ libraryVisibilityLabels[row.visibility] }}
        </template>
        <template #myRole="{ row }">{{ libraryRoleLabels[row.myRole] }}</template>
        <template #status="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ libraryStatusLabels[row.status] }}
          </el-tag>
        </template>
        <template #createdAt="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        <template #actions="{ row }">
          <div class="whitespace-nowrap">
            <el-button link @click="openDocuments(row)">文档</el-button>
            <el-button
              v-if="row.myRole === 'manager'"
              link
              @click="openMembers(row)"
            >
              授权
            </el-button>
            <el-button v-if="canEdit(row)" link @click="libraryDialogRef?.open(row)">
              编辑
            </el-button>
            <el-button
              v-if="canArchive(row)"
              link
              :type="archiveButtonType(row)"
              @click="toggleStatus(row)"
            >
              {{ archiveLabel(row) }}
            </el-button>
          </div>
        </template>
      </v-table>
      <page-component @update:model-value="loadLibraries()" />
    </div>
    <library-dialog ref="libraryDialogRef" @saved="loadLibraries(true)" />
    <library-documents-dialog
      ref="documentsDialogRef"
      @changed="loadLibraries()"
    />
    <library-members-dialog ref="membersDialogRef" @changed="loadLibraries()" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { VSchemaForm, VTable, usePage } from '@repo/ui';

import { useStore } from '@/models';
import { api, confirm } from '@/utils';
import { formatDateTime } from '../utils';
import LibraryDialog from './components/LibraryDialog.vue';
import LibraryDocumentsDialog from './components/LibraryDocumentsDialog.vue';
import LibraryMembersDialog from './components/LibraryMembersDialog.vue';
import {
  libraryColumns,
  libraryRoleLabels,
  librarySearchColumns,
  libraryStatusLabels,
  libraryVisibilityLabels,
} from './utils';

import type { LibraryInfo, LibraryStatus } from '@/types';
import type { LibrarySearchForm } from './types';

const store = useStore();
const searchForm = ref<LibrarySearchForm>({ status: 'active' });
const libraries = shallowRef<(LibraryInfo & Record<string, unknown>)[]>([]);
const loading = ref(false);
const libraryDialogRef = ref<InstanceType<typeof LibraryDialog>>();
const documentsDialogRef = ref<InstanceType<typeof LibraryDocumentsDialog>>();
const membersDialogRef = ref<InstanceType<typeof LibraryMembersDialog>>();
const { pageComponent, pageRange, setPageData } = usePage({
  page: { size: 20 },
});
/** 筛选请求只允许最新响应更新页面，防止较慢请求覆盖新筛选。 */
let requestSequence = 0;

/**
 * 判断是否同时具备库管理员身份和编辑权限。
 * @param library 当前资料库行。
 * @returns 是否展示编辑。
 */
function canEdit(library: LibraryInfo) {
  return (
    library.myRole === 'manager' &&
    store.hasPermission('actions.documents.library-update')
  );
}

/**
 * 判断是否允许归档或恢复当前资料库。
 * @param library 当前资料库行。
 * @returns 是否展示生命周期操作。
 */
function canArchive(library: LibraryInfo) {
  return (
    library.myRole === 'manager' &&
    store.hasPermission('actions.documents.library-archive')
  );
}

/**
 * 返回状态下拉和标签使用的颜色。
 * @param status 资料库生命周期。
 * @returns Element Plus 标签类型。
 */
function statusTagType(status: LibraryStatus) {
  if (status === 'active') return 'success';
  return 'info';
}

/**
 * 归档与恢复共用一个按钮，文案随当前状态变化。
 * @param library 当前资料库行。
 * @returns 按钮文案。
 */
function archiveLabel(library: LibraryInfo) {
  if (library.status === 'active') return '归档';
  return '恢复';
}

/**
 * 归档使用危险色，恢复使用主色。
 * @param library 当前资料库行。
 * @returns 按钮类型。
 */
function archiveButtonType(library: LibraryInfo) {
  if (library.status === 'active') return 'danger' as const;
  return 'primary' as const;
}

/**
 * 在弹窗中管理库内文档。
 * @param library 当前资料库行。
 */
function openDocuments(library: LibraryInfo) {
  void documentsDialogRef.value?.open(library.libraryId);
}

/**
 * 在弹窗中管理授权。使用者不显示这个入口。
 * @param library 当前资料库行。
 */
function openMembers(library: LibraryInfo) {
  void membersDialogRef.value?.open(library.libraryId);
}

/**
 * 按筛选读取当前页资料库。
 * @param reset 是否回到第一页并重新统计总数。
 */
async function loadLibraries(reset = false) {
  const sequence = ++requestSequence;
  if (reset) setPageData({ current: 1 });
  loading.value = true;
  try {
    const result = await api('/documents/library-list', {
      search: searchForm.value.search?.trim(),
      scope: searchForm.value.scope,
      status: [searchForm.value.status || 'active'],
      limit: pageRange.value,
      withCount: reset,
    });
    if (sequence !== requestSequence) return;
    libraries.value = result.list.map((library) => ({ ...library }));
    if (reset) setPageData({ total: result.count });
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

/**
 * 确认后切换归档状态。资料库和文档都不会删除。
 * @param library 待归档或恢复的资料库。
 */
async function toggleStatus(library: LibraryInfo) {
  const archiving = library.status === 'active';
  let title = `恢复“${library.name}”？`;
  let message = '原有授权重新生效，使用者可继续查看和检索库内文档。';
  let action = '恢复资料库';
  if (archiving) {
    title = `归档“${library.name}”？`;
    message = '使用者将无法访问，问答不再检索此库。文档和授权保留，可随时恢复。';
    action = '归档资料库';
  }
  await confirm({
    title,
    message,
    opt: { confirmButtonText: action },
    async confirmCallback() {
      if (archiving) {
        await api('/documents/library-archive', {
          libraryId: library.libraryId,
        });
      } else {
        await api('/documents/library-restore', {
          libraryId: library.libraryId,
        });
      }
      await loadLibraries(true);
    },
  });
}

onMounted(() => {
  void loadLibraries(true);
});
</script>
