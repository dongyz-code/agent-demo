<template>
  <v-dialog
    :model-value="visible"
    title="新增授权"
    width="640px"
    append-to-body
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @close="emit('close')"
  >
    <el-form label-width="72px" :disabled="saving" @submit.prevent="search">
      <el-form-item label="对象类型">
        <el-radio-group v-model="subjectType" @change="changeType">
          <el-radio-button value="user">用户</el-radio-button>
          <el-radio-button value="group">用户组</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="搜索名称">
        <el-input
          v-model="keyword"
          clearable
          :placeholder="
            subjectType === 'group' ? '搜索用户组名称' : '搜索昵称或用户名'
          "
          @input="search"
        />
      </el-form-item>
    </el-form>
    <v-table
      :data="subjects"
      :rows="columns"
      :loading="loading"
      :props="{ emptyText: emptyLabel }"
      row-key="id"
      max-height="280"
    >
      <template #selected="{ row }">
        <el-checkbox
          :model-value="selected.some((item) => item.id === row.id)"
          :aria-label="`选择${row.name}`"
          :disabled="saving"
          @change="toggle(row)"
        />
      </template>
    </v-table>
    <p class="mt-2 text-xs text-gray-600">
      最多显示 20 个匹配对象，可输入名称缩小范围。已授权的对象不再显示。
    </p>
    <div v-if="selected.length" class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-sm text-gray-600">已选 {{ selected.length }} 个</span>
      <el-tag
        v-for="subject in selected"
        :key="subject.id"
        :closable="!saving"
        @close="toggle(subject)"
      >
        {{ subject.name }}
      </el-tag>
    </div>
    <el-form label-width="72px" class="mt-4" :disabled="saving">
      <el-form-item label="分配身份">
        <el-radio-group v-model="role">
          <el-radio value="user">使用者</el-radio>
          <el-radio value="manager">管理员</el-radio>
        </el-radio-group>
      </el-form-item>
      <p class="ml-[72px] text-sm text-gray-600">
        {{
          role === 'manager'
            ? '可维护文档与授权，具体操作受账号权限限制。'
            : '可查看、下载和检索文档，不可修改文档或授权。'
        }}
      </p>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="emit('close')">取消</el-button>
      <el-button
        type="primary"
        :disabled="!selected.length"
        :loading="saving"
        @click="confirm"
      >
        确认授权
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ElButton,
  ElCheckbox,
  ElForm,
  ElFormItem,
  ElInput,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElTag,
} from 'element-plus';
import { VDialog, VTable } from '@repo/ui';

import { api, notify } from '@/utils';
import { mergeGrantSelection } from '../utils';

import type {
  LibraryGrantInfo,
  LibraryGrantRole,
  LibraryGrantSubjectType,
} from '@/types';
import type { TableRow } from '@repo/ui';
import type { GrantSubject } from '../types';

const props = defineProps<{
  /** 弹窗是否显示；每次打开都会重置搜索和选择。 */
  visible: boolean;
  /** 搜索候选项时服务端复核管理权限的资料库标识。 */
  libraryId: string;
  /** 完整授权名单，按主体类型和标识组合排除已授权对象。 */
  grants: LibraryGrantInfo[];
}>();
const emit = defineEmits<{
  /** 用户取消或关闭弹窗，不写入授权。 */
  close: [];
  /** 自己完成保存后交回完整授权，由父页更新名单和统计。 */
  saved: [grants: LibraryGrantInfo[]];
}>();
const subjectType = ref<LibraryGrantSubjectType>('user');
const keyword = ref('');
const role = ref<LibraryGrantRole>('user');
const subjects = ref<(GrantSubject & Record<string, unknown>)[]>([]);
const selected = ref<GrantSubject[]>([]);
const loading = ref(false);
const saving = ref(false);
const failed = ref(false);
const matchedCount = ref(0);
/** 搜索可并发返回，只接受最后一次请求且仍处于当前打开周期的结果。 */
let searchSequence = 0;
/** 搜索结果使用独立复选框，跨关键词搜索时不会丢失已经勾选的对象。 */
const columns: TableRow[] = [
  { label: '选择', value: 'selected', slot: 'selected', width: 64 },
  { label: '名称', value: 'name', minWidth: 200 },
];
const emptyLabel = computed(() => {
  if (failed.value) return '搜索失败，请修改关键词重试';
  if (loading.value) return '正在查找可授权对象';
  if (matchedCount.value > 0) return '匹配对象均已授权，请更换关键词';
  if (keyword.value.trim()) return '没有匹配结果，请更换关键词';
  if (subjectType.value === 'group') return '暂无可添加的用户组';
  return '暂无可添加的用户';
});

watch(
  () => props.visible,
  (opened) => {
    searchSequence += 1;
    if (!opened) return;
    subjectType.value = 'user';
    keyword.value = '';
    role.value = 'user';
    selected.value = [];
    subjects.value = [];
    void search();
  },
);

/** 切换对象类型时重置搜索和选择，避免把用户标识当成用户组提交。 */
async function changeType() {
  selected.value = [];
  keyword.value = '';
  subjects.value = [];
  await search();
}

/** 搜索可授权对象，丢弃过期响应并保留其他关键词下的勾选。 */
async function search() {
  const sequence = ++searchSequence;
  loading.value = true;
  failed.value = false;
  try {
    const result = await api('/documents/library-subject-search', {
      libraryId: props.libraryId,
      subjectType: subjectType.value,
      search: keyword.value,
    });
    if (sequence !== searchSequence) return;
    matchedCount.value = result.list.length;
    const taken = new Set(
      props.grants
        .filter((grant) => grant.subjectType === subjectType.value)
        .map((grant) => grant.subjectId),
    );
    subjects.value = result.list
      .filter((item) => !taken.has(item.id))
      .map((item) => ({ ...item }));
  } catch {
    if (sequence !== searchSequence) return;
    subjects.value = [];
    failed.value = true;
  } finally {
    if (sequence === searchSequence) loading.value = false;
  }
}

/**
 * 切换一个候选项的勾选，搜索结果替换时继续保留其展示名。
 * @param subject 当前类型下的候选对象。
 */
function toggle(subject: GrantSubject) {
  if (saving.value) return;
  if (selected.value.some((item) => item.id === subject.id)) {
    selected.value = selected.value.filter((item) => item.id !== subject.id);
    return;
  }
  selected.value = [...selected.value, subject];
}

/** 新增授权自行完成提交，失败保留选择；父页只接收服务端确认后的结果。 */
async function confirm() {
  if (!selected.value.length || saving.value) return;
  saving.value = true;
  try {
    const next = mergeGrantSelection(props.grants, {
      subjectType: subjectType.value,
      subjects: selected.value,
      role: role.value,
    });
    const result = await api('/documents/library-grant-save', {
      libraryId: props.libraryId,
      grants: next,
    });
    emit('saved', result.list);
    notify('success', '授权已添加');
  } catch {
    // 请求层已提示错误；保留选择和原名单，便于重试。
  } finally {
    saving.value = false;
  }
}
</script>
