<template>
  <section v-loading="loading" class="flex min-h-full flex-col">
    <div class="flex min-h-0 flex-1 flex-col rounded bg-white p-4 shadow">
      <div
        v-if="document && document.versions.length > 1"
        class="mb-3 flex justify-end"
      >
        <el-select v-model="selectedVersionId" size="small" class="w-[88px]">
          <el-option
            v-for="version in document.versions"
            :key="version.documentVersionId"
            :label="`V${version.version}`"
            :value="version.documentVersionId"
          />
        </el-select>
      </div>
      <document-viewer
        v-if="document && selectedVersionId"
        :key="`${document.documentId}-${selectedVersionId}`"
        :document-id="document.documentId"
        :document-version-id="selectedVersionId"
      />
      <el-empty v-else-if="!loading" description="文档不存在或你已无权访问" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElEmpty, ElOption, ElSelect } from 'element-plus';

import DocumentViewer from '@/components/document-viewer/DocumentViewer.vue';
import { setBreadcrumbLeaf } from '@/layouts/admin/breadcrumb';
import { api } from '@/utils';

import type { DocumentDetail } from '@/types';

const route = useRoute();
const document = shallowRef<DocumentDetail>();
const selectedVersionId = ref('');
const loading = ref(false);
/** 路由切换时只接受最新一次详情。 */
let requestSequence = 0;
const documentId = computed(() => {
  if (typeof route.params.documentId === 'string') return route.params.documentId;
  return '';
});
/** 读取文档并默认预览主版本。切换版本只改本页画面。 */
async function loadDocument() {
  const sequence = ++requestSequence;
  const id = documentId.value;
  document.value = undefined;
  selectedVersionId.value = '';
  setBreadcrumbLeaf('');
  if (!id) return;
  loading.value = true;
  try {
    const result = await api('/documents/document-detail', { documentId: id });
    if (sequence !== requestSequence) return;
    document.value = result;
    selectedVersionId.value = result.activeVersion.documentVersionId;
    setBreadcrumbLeaf(result.name);
  } catch {
    // 请求层提示错误，页面保持不可访问状态。
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

watch(documentId, loadDocument, { immediate: true });
onBeforeUnmount(() => {
  setBreadcrumbLeaf('');
});
</script>
