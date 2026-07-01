<template>
  <v-dialog
    v-model="visible"
    width="min(1180px, 92vw)"
    title="表结构详情"
    top="5vh"
    body-class="h-[68vh] overflow-auto text-inherit! text-base!"
  >
    <div v-loading="loading" class="min-h-40">
      <template v-if="detail">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold">{{ detail.tableName }}</h2>
            <p class="text-sm text-gray-500">
              {{ detail.schemaName }} / {{ detail.table }}
            </p>
          </div>
        </div>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="结构" name="structure">
            <el-descriptions border :column="3">
              <el-descriptions-item label="物理状态">
                {{ detail.physicalStatus }}
              </el-descriptions-item>
              <el-descriptions-item label="差异状态">
                {{ diffLabel(detail.diffLevel) }}
              </el-descriptions-item>
              <el-descriptions-item label="字段数">
                {{ detail.schemaColumns.length }}
              </el-descriptions-item>
            </el-descriptions>

            <div class="mt-4 grid gap-4 xl:grid-cols-2">
              <div>
                <h3 class="mb-2 font-bold">Drizzle schema</h3>
                <el-table :data="detail.schemaColumns" border size="small">
                  <el-table-column prop="name" label="字段" min-width="140" />
                  <el-table-column prop="sqlType" label="类型" min-width="160" />
                  <el-table-column label="约束" min-width="140">
                    <template #default="{ row }">
                      <div class="flex flex-wrap gap-1">
                        <el-tag v-if="row.primaryKey" size="small">PK</el-tag>
                        <el-tag v-if="row.notNull" size="small" type="warning">
                          NOT NULL
                        </el-tag>
                        <el-tag v-if="row.sensitive" size="small" type="info">
                          脱敏
                        </el-tag>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
              <div>
                <h3 class="mb-2 font-bold">数据库实态</h3>
                <el-table :data="detail.catalogColumns" border size="small">
                  <el-table-column prop="name" label="字段" min-width="140" />
                  <el-table-column prop="sqlType" label="类型" min-width="160" />
                  <el-table-column label="约束" min-width="140">
                    <template #default="{ row }">
                      <div class="flex flex-wrap gap-1">
                        <el-tag v-if="row.primaryKey" size="small">PK</el-tag>
                        <el-tag v-if="row.notNull" size="small" type="warning">
                          NOT NULL
                        </el-tag>
                        <el-tag v-if="row.hasDefault" size="small" type="success">
                          DEFAULT
                        </el-tag>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="差异" name="diff">
            <el-alert
              v-if="!detail.diff.length"
              title="当前结构与 schema 摘要一致"
              type="success"
              :closable="false"
            />
            <div v-else class="space-y-2">
              <el-alert
                v-for="item in detail.diff"
                :key="`${item.scope}-${item.name}-${item.type}`"
                :title="item.message"
                :type="item.type === 'complex' ? 'warning' : 'error'"
                :closable="false"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane label="数据预览" name="preview">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <el-button
                type="primary"
                :loading="loadingPreview"
                :disabled="!canPreviewTable"
                @click="getPreview(true)"
              >
                刷新数据
              </el-button>
              <preview-page-component
                v-if="preview"
                @update:model-value="getPreview()"
              />
            </div>
            <el-table
              v-loading="loadingPreview"
              :data="previewRows"
              border
              size="small"
            >
              <el-table-column
                v-for="column in preview?.columns ?? []"
                :key="column.name"
                :prop="column.name"
                :label="column.name"
                min-width="160"
              />
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="操作记录" name="operations">
            <el-table :data="operations" border size="small">
              <el-table-column label="类型" width="110">
                <template #default="{ row }">
                  {{ operationTypeLabel(row.type) }}
                </template>
              </el-table-column>
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="operationStatusTagType(row.status)">
                    {{ operationStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column
                prop="source_table_name"
                label="源表"
                min-width="140"
              />
              <el-table-column
                prop="target_table_name"
                label="目标表"
                min-width="140"
              />
              <el-table-column label="创建时间" min-width="160">
                <template #default="{ row }">
                  {{ formatTime(row.create_timestamp) }}
                </template>
              </el-table-column>
              <el-table-column
                prop="backup_table_name"
                label="备份表"
                min-width="180"
              />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
} from 'element-plus';
import { VDialog, usePage } from '@repo/ui';
import { api } from '@/api';
import { useStore } from '@/store';
import { adminPermissionKey } from '@repo/shared/permission';
import {
  diffLabel,
  formatTime,
  operationStatusLabel,
  operationStatusTagType,
  operationTypeLabel,
} from '../utils';

import type {
  SysTableDetail,
  SysTableOperation,
  SysTablePreview,
} from '../types';

const props = defineProps<{
  /** 弹窗是否可见，由父页面控制打开和关闭。 */
  modelValue: boolean;
  /** 当前选中表的结构详情，加载完成后渲染结构和差异。 */
  detail?: SysTableDetail;
  /** 当前选中表的结构操作记录。 */
  operations: SysTableOperation[];
  /** 表结构详情是否仍在加载。 */
  loading: boolean;
}>();

const emit = defineEmits<{
  /** 同步详情弹窗显示状态。 */
  'update:modelValue': [value: boolean];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const store = useStore();
const canPreviewTable = computed(() =>
  store.hasPermission(adminPermissionKey('actions.table.preview')),
);

const activeTab = ref('structure');
const preview = shallowRef<SysTablePreview>();
const loadingPreview = ref(false);

/** 数据预览分页组件和当前接口查询范围。 */
const {
  pageComponent: previewPageComponent,
  pageRange: previewPageRange,
  setPageData: setPreviewPageData,
} = usePage({
  props: {
    align: 'right',
    size: 'small',
  },
  page: {
    size: 20,
  },
});

const previewRows = computed(() => {
  return (preview.value?.rows ?? []).map((row) => {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'object' && value && 'masked' in value
          ? (value as { summary?: string }).summary ?? '已脱敏'
          : value,
      ]),
    );
  });
});

watch(
  () => [props.modelValue, props.detail?.table] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return;
    }
    activeTab.value = 'structure';
    preview.value = undefined;
    setPreviewPageData({ current: 1, total: 0 });
  },
);

/**
 * 加载当前表的数据预览。
 *
 * @param resetPage 是否回到第一页，首次打开或手动刷新时需要重置页码。
 */
async function getPreview(resetPage = false) {
  const table = props.detail?.table;
  if (!table) {
    return;
  }
  if (resetPage) {
    setPreviewPageData({ current: 1 });
  }
  const [offset = 0, end = 20] = previewPageRange.value;
  loadingPreview.value = true;
  try {
    const result = await api('/sys/table/preview', {
      table,
      limit: end - offset,
      offset,
    });
    if (props.detail?.table !== table) {
      return;
    }
    preview.value = result;
    setPreviewPageData({ total: result.count });
    activeTab.value = 'preview';
  } finally {
    loadingPreview.value = false;
  }
}
</script>
