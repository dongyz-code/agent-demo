<template>
  <v-dialog
    v-model="visible"
    width="640px"
    top="10vh"
    body-class="max-h-[78vh] overflow-auto text-inherit! text-base!"
    title="同步索引/触发器"
  >
    <div v-loading="loading.plan" class="space-y-4">
      <div class="rounded border border-sky-200 bg-sky-50 p-4">
        <h3 class="mb-2 font-medium text-sky-900">同步说明</h3>
        <div class="space-y-1 text-sm text-sky-800">
          <p>对已有表幂等补建 schema 声明但 DB 缺失的索引（create index if not exists）。</p>
          <p>同步 trigger 函数体与绑定（create or replace function + 重建 trigger）。</p>
          <p>不重建表、不复制数据、不生成备份；列结构变更请用“重置表结构”。</p>
        </div>
      </div>

      <div v-if="dialog.table" class="rounded border border-gray-200 p-3">
        <div class="mb-2 font-medium">目标表</div>
        <div class="text-sm text-gray-600">
          {{ dialog.table.tableName }}
          <span class="text-gray-400">（{{ dialog.table.table }}）</span>
        </div>
      </div>

      <div class="rounded border border-gray-200 p-3">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-medium">安全预览</h3>
            <p class="text-sm text-gray-500">
              预览由后端生成并保存；执行时只提交计划 ID 和确认文本。
            </p>
          </div>
          <el-button
            type="primary"
            :disabled="Boolean(createDisabledReason)"
            :loading="loading.plan"
            @click="createPlan"
          >
            生成同步预览
          </el-button>
        </div>
        <el-alert
          v-if="createDisabledReason"
          :title="createDisabledReason"
          type="info"
          :closable="false"
        />
      </div>

      <template v-if="dialog.plan">
        <el-descriptions border :column="2" size="small">
          <el-descriptions-item label="计划类型">
            {{ operationTypeLabel(dialog.plan.type) }}
          </el-descriptions-item>
          <el-descriptions-item label="计划状态">
            <el-tag :type="operationStatusTagType(dialog.plan.status)">
              {{ operationStatusLabel(dialog.plan.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="计划 ID">
            {{ dialog.plan.op_id }}
          </el-descriptions-item>
          <el-descriptions-item label="目标表">
            {{ dialog.plan.tableName }}
          </el-descriptions-item>
        </el-descriptions>
        <details class="rounded border border-gray-200 p-3">
          <summary class="cursor-pointer font-medium">同步 SQL 预览</summary>
          <pre class="max-h-48 overflow-auto rounded bg-gray-950 p-3 text-xs text-white">{{ dialog.plan.sqlPreview.join('\n') }}</pre>
        </details>
        <div v-if="dialog.plan.warnings.length" class="space-y-2">
          <el-alert
            v-for="warning in dialog.plan.warnings"
            :key="warning"
            :title="warning"
            type="warning"
            :closable="false"
          />
        </div>
        <div v-if="dialog.plan.blockers.length" class="space-y-2">
          <el-alert
            v-for="blocker in dialog.plan.blockers"
            :key="blocker"
            :title="blocker"
            type="error"
            :closable="false"
          />
        </div>
        <div class="rounded border border-gray-200 p-3">
          <label class="mb-2 block text-sm font-medium">
            确认执行请输入：{{ dialog.plan.confirmText }}
          </label>
          <el-input
            v-model="dialog.confirm"
            :placeholder="`完整输入 ${dialog.plan.confirmText} 后可以执行`"
          />
        </div>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span class="text-left text-sm text-gray-500">
          {{ applyDisabledReason || '已满足执行条件，请再次确认后执行。' }}
        </span>
        <div class="flex justify-end gap-2">
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="!canApplyPlan"
            :loading="loading.apply"
            @click="applyPlan"
          >
            执行同步
          </el-button>
        </div>
      </div>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
  ElInput,
  ElTag,
} from 'element-plus';
import { VDialog } from '@repo/ui';
import { api, notify } from '@/utils';
import {
  operationStatusLabel,
  operationStatusTagType,
  operationTypeLabel,
} from '../utils';

import type { SysSyncPlan, SysTableListItem } from '../types';

const emit = defineEmits<{
  /** 通知父页面同步已完成，需要刷新列表或当前详情。 */
  applied: [];
}>();

const visible = ref(false);
const requestId = ref(0);

const loading = reactive({
  plan: false,
  apply: false,
});

const dialog = reactive<{
  /** 目标表。 */
  table?: SysTableListItem;
  /** 服务端生成的同步计划。 */
  plan?: SysSyncPlan;
  /** 二次确认输入。 */
  confirm: string;
}>({
  confirm: '',
});

const createDisabledReason = computed(() => {
  if (!dialog.table) {
    return '请先选择要处理的表';
  }
  if (dialog.table.physicalStatus === 'missing') {
    return '数据库中没有目标表；缺失表由启动时自动创建，无需同步';
  }
  return '';
});

const applyDisabledReason = computed(() => {
  const plan = dialog.plan;
  if (!plan) {
    return createDisabledReason.value || '请先生成安全预览';
  }
  if (plan.status !== 'planned') {
    return `当前计划状态为${operationStatusLabel(plan.status)}，不能执行`;
  }
  if (plan.blockers.length) {
    return '预览存在阻塞项，不能执行';
  }
  if (dialog.confirm !== plan.confirmText) {
    return `完整输入 ${plan.confirmText} 后可以执行`;
  }
  return '';
});

const canApplyPlan = computed(() => !applyDisabledReason.value);

/**
 * 打开同步弹窗。
 *
 * @param row 当前要同步的表清单行。
 */
function open(row: SysTableListItem) {
  const currentRequestId = requestId.value + 1;
  requestId.value = currentRequestId;
  loading.plan = false;
  loading.apply = false;
  dialog.table = row;
  dialog.plan = undefined;
  dialog.confirm = '';
  visible.value = true;
}

defineExpose({ open });

/** 请求服务端生成同步计划。 */
async function createPlan() {
  const table = dialog.table?.table;
  if (!table || createDisabledReason.value) {
    return;
  }
  const currentRequestId = requestId.value + 1;
  requestId.value = currentRequestId;
  loading.plan = true;
  try {
    const plan = await api('/sys/table/sync-plan', { table });
    if (
      currentRequestId !== requestId.value ||
      !visible.value ||
      dialog.table?.table !== table
    ) {
      return;
    }
    dialog.plan = plan;
    dialog.confirm = '';
  } finally {
    if (currentRequestId === requestId.value) {
      loading.plan = false;
    }
  }
}

/** 执行当前已经生成的同步计划。 */
async function applyPlan() {
  const plan = dialog.plan;
  if (!plan || !canApplyPlan.value) {
    return;
  }
  loading.apply = true;
  try {
    await api('/sys/table/sync-apply', {
      op_id: plan.op_id,
      confirm: dialog.confirm,
    });
    notify('success', '同步执行完成');
    visible.value = false;
    emit('applied');
  } finally {
    loading.apply = false;
  }
}
</script>
