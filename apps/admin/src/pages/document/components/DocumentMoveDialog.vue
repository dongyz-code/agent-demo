<template>
  <v-dialog
    v-model="visible"
    title="移动到资料库"
    width="480px"
    append-to-body
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <p class="mb-4 text-sm text-gray-600">
      移动
      {{ targets.length }} 份文档，版本和处理结果保留，访问权限随目标库变化。
    </p>
    <el-alert
      v-if="!loading && !libraries.length"
      title="没有可用的目标资料库"
      description="只能移入你管理的正常资料库，请先创建资料库或联系管理员授权。"
      type="info"
      :closable="false"
      class="mb-4"
    />
    <el-form label-width="72px">
      <el-form-item label="目标库" required>
        <el-select
          v-model="libraryId"
          class="w-full"
          placeholder="选择你管理的资料库"
          :loading="loading"
          :disabled="saving || loading"
          filterable
        >
          <el-option
            v-for="library in libraries"
            :key="library.libraryId"
            :label="library.name"
            :value="library.libraryId"
            :disabled="
              targets.every((target) => target.libraryId === library.libraryId)
            "
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="saving"
        @click="submit"
      >
        移动文档
      </el-button>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElOption,
  ElSelect,
} from 'element-plus';
import { VDialog } from '@repo/ui';

import { api, notify } from '@/utils';

import type { DocumentDetail, LibraryInfo } from '@/types';
import type { DocumentMoveTarget } from '../types';

const emit = defineEmits<{
  /** 保存完成。只编辑一份时带回文档详情。 */
  changed: [document: DocumentDetail | undefined];
}>();

const visible = ref(false);
const loading = ref(false);
const saving = ref(false);
const libraryId = ref('');
const targets = ref<DocumentMoveTarget[]>([]);
const libraries = ref<LibraryInfo[]>([]);

const canSubmit = computed(() => {
  if (loading.value || saving.value) return false;
  if (!libraries.value.some((library) => library.libraryId === libraryId.value))
    return false;
  return targets.value.some((target) => target.libraryId !== libraryId.value);
});

/**
 * 打开移动弹窗，只允许选择当前用户管理的正常资料库。
 * @param next 单份或批量移动的文档及其当前所属库。
 */
async function open(next: DocumentMoveTarget | DocumentMoveTarget[]) {
  if (saving.value) return;
  targets.value = Array.isArray(next) ? next : [next];
  libraryId.value = '';
  libraries.value = [];
  visible.value = true;
  loading.value = true;
  try {
    const result = await api('/documents/library-list', {
      status: ['active'],
      limit: [0, 200],
    });
    libraries.value = result.list.filter(
      (library) => library.myRole === 'manager',
    );
  } catch {
    // 未取得目标库时退出本次打开，避免把请求失败误报为没有可用资料库。
    visible.value = false;
  } finally {
    loading.value = false;
  }
}

/** 移动到目标库；批量请求中途失败时只保留尚未完成的文档供重试。 */
async function submit() {
  if (!canSubmit.value) return;
  saving.value = true;
  const pending = targets.value.filter(
    (target) => target.libraryId !== libraryId.value,
  );
  const single = targets.value.length === 1;
  let moved = 0;
  let document: DocumentDetail | undefined;
  try {
    for (const target of pending) {
      document = await api('/documents/document-move', {
        documentId: target.documentId,
        libraryId: libraryId.value,
      });
      moved += 1;
    }
    visible.value = false;
    notify('success', `已移动 ${moved} 份文档`);
  } catch {
    targets.value = pending.slice(moved);
    if (moved)
      notify(
        'warning',
        `已移动 ${moved} 份文档，其余 ${targets.value.length} 份未完成，可重试`,
      );
  } finally {
    saving.value = false;
    if (moved) emit('changed', single ? document : undefined);
  }
}

defineExpose({ open });
</script>
