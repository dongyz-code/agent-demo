<template>
  <v-dialog
    v-model="visible"
    :title="title"
    width="min(920px, 92vw)"
    top="5vh"
    append-to-body
    destroy-on-close
    body-class="max-h-[78vh] overflow-auto text-inherit! text-base!"
  >
    <div v-loading="loading" class="min-h-40">
      <library-members-panel
        v-if="library"
        :library="library"
        @changed="refresh"
      />
      <el-empty v-else-if="!loading" description="资料库不存在或你已无权访问" />
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { ElEmpty } from 'element-plus';
import { VDialog } from '@repo/ui';

import { api } from '@/utils';
import LibraryMembersPanel from './LibraryMembersPanel.vue';

import type { LibraryInfo } from '@/types';

const emit = defineEmits<{
  /** 授权变化可能改变当前身份，列表需要刷新。 */
  changed: [];
}>();

const visible = ref(false);
const loading = ref(false);
const libraryId = ref('');
const library = shallowRef<LibraryInfo>();
/** 连续打开不同资料库时，只展示最后一次授权上下文。 */
let requestSequence = 0;
const title = computed(() => {
  if (!library.value) return '授权';
  return `${library.value.name}的授权`;
});

/**
 * 打开资料库授权弹窗。
 * @param id 资料库标识。
 */
async function open(id: string) {
  libraryId.value = id;
  library.value = undefined;
  visible.value = true;
  await load(false);
}

/**
 * 读取资料库身份和可见范围，授权名单由面板自己加载。
 * @param quiet 保存后的刷新不把名单替换成加载态。
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

/** 授权保存后同步资料库身份，并通知列表刷新。 */
async function refresh() {
  await load(true);
  emit('changed');
}

defineExpose({ open });
</script>
