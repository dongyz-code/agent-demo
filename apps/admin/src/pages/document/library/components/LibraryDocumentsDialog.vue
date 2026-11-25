<template>
  <v-dialog
    v-model="visible"
    :title="title"
    width="min(1180px, 92vw)"
    top="5vh"
    append-to-body
    destroy-on-close
    body-class="max-h-[78vh] overflow-auto text-inherit! text-base!"
  >
    <div v-loading="loading" class="min-h-40">
      <template v-if="library">
        <p class="mb-3 text-sm text-gray-600">
          {{ libraryVisibilityLabels[library.visibility] }} ·
          {{ libraryRoleLabels[library.myRole] }} ·
          {{ library.documentCount }} 份文档
        </p>
        <el-alert
          v-if="library.status === 'archived'"
          class="mb-3"
          title="资料库已归档，文档和授权仍保留。使用者无法访问，问答不再检索此库。"
          type="info"
          show-icon
          :closable="false"
        />
        <document-list-panel embedded :library="library" @changed="refresh" />
      </template>
      <el-empty v-else-if="!loading" description="资料库不存在或你已无权访问" />
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { ElAlert, ElEmpty } from 'element-plus';
import { VDialog } from '@repo/ui';

import DocumentListPanel from '@/pages/document/components/DocumentListPanel.vue';
import { api } from '@/utils';
import { libraryRoleLabels, libraryVisibilityLabels } from '../utils';

import type { LibraryInfo } from '@/types';

const emit = defineEmits<{
  /** 库内文档数量或所属关系变化后，刷新资料库列表。 */
  changed: [];
}>();

const visible = ref(false);
const loading = ref(false);
const libraryId = ref('');
const library = shallowRef<LibraryInfo>();
/** 连续打开不同资料库时，只展示最后一次详情。 */
let requestSequence = 0;
const title = computed(() => library.value?.name || '库内文档');

/**
 * 打开某个资料库的文档列表。
 * @param id 资料库标识。
 */
async function open(id: string) {
  libraryId.value = id;
  library.value = undefined;
  visible.value = true;
  await load(false);
}

/**
 * 读取资料库摘要，供上传资格和归档提示使用。
 * @param quiet 文档变更后的刷新不遮住已经打开的列表。
 */
async function load(quiet: boolean) {
  const id = libraryId.value;
  const sequence = ++requestSequence;
  if (!quiet) loading.value = true;
  try {
    const result = await api('/documents/library-detail', { libraryId: id });
    if (sequence !== requestSequence) return;
    library.value = result;
  } catch {
    if (sequence === requestSequence && !quiet) library.value = undefined;
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

/** 文档变化后更新摘要，并通知列表刷新数量。 */
async function refresh() {
  await load(true);
  emit('changed');
}

defineExpose({ open });
</script>
