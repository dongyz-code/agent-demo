<template>
  <v-table
    :data="tableData"
    :rows="tableRows"
    scrollbar-always-on
    :max-height="maxHeight"
    stripe
  >
    <template #domain="{ row }">
      <a :href="row.domainOrigin" target="_blank" class="font-bold underline">{{
        row.domain
      }}</a>
    </template>

    <template #deploy_status="{ row }">
      <template v-if="row.deploy_status">
        <el-tag
          :type="deployStatusMeta[row.deploy_status]?.type ?? 'info'"
          size="small"
        >
          {{ deployStatusMeta[row.deploy_status]?.label ?? row.deploy_status }}
        </el-tag>
      </template>
      <span v-else class="text-gray-400">—</span>
    </template>

    <template #available="{ row }">
      <el-switch
        :loading="toggleAvailableLoading && toggleAvailableId === row.id"
        :model-value="row.available"
        @update:model-value="toggleAvailableWrap(row.self)"
      />
    </template>

    <template #edit="{ row }">
      <div class="flex flex-wrap items-center gap-4 text-lg">
        <v-icon
          v-for="{ label, method, icon } in actions"
          :key="label"
          :icon="icon"
          @click="method(row)"
          :tips="{ content: label, placement: 'left' }"
        />
      </div>
    </template>
  </v-table>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { VTable, VIcon, loadingFunc } from '@repo/ui';
import { httpCache } from '@/cache';
import { dayJsformat } from '@repo/utils-browser';
import { api } from '@/api';
import { notify } from '@/plugins/notify';
import { aiAppEvent } from '../event';

import { ElSwitch, ElTag } from 'element-plus';

import IconParkOutlineEditTwo from '~icons/icon-park-outline/edit-two';
import IconParkOutlineTime from '~icons/icon-park-outline/time';
import IconParkOutlineUpload from '~icons/icon-park-outline/upload';

import type { AiAppItem } from '../type';
import type { TableRow, IconType } from '@repo/ui';

/** 与 tables `task.status` 一致 */
const deployStatusMeta: Record<
  NonNullable<AiAppItem['deploy_status']>,
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' }
> = {
  'to-be-started': { label: '待开始', type: 'info' },
  pending: { label: '进行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  deleted: { label: '已删除', type: 'info' },
  killed: { label: '已停止', type: 'info' },
};

const props = defineProps<{
  data: AiAppItem[];
  maxHeight: string;
}>();

const tableData = computed(() => {
  const userMap = httpCache.user.mapping.value;
  const data = props.data;

  return data.map((self) => {
    const {
      create_timestamp,
      last_update_timestamp,
      create_user_id,
      domain,
      ...rest
    } = self;

    const domainFull = `${domain}.app.example.com`;
    const domainOrigin = `https://${domainFull}`;

    return {
      self,
      create_timestamp: dayJsformat(create_timestamp, 'YYYY-MM-DD HH:mm:ss'),
      last_update_timestamp: dayJsformat(
        last_update_timestamp,
        'YYYY-MM-DD HH:mm:ss',
      ),
      create_user: userMap[create_user_id]?.nickname ?? create_user_id,
      ...rest,
      domain,
      domainFull,
      domainOrigin,
    };
  });
});

const tableRows: TableRow<keyof (typeof tableData.value)[number] | 'edit'>[] = [
  {
    value: 'id',
    label: '应用ID',
    minWidth: 120,
    fixed: 'left',
  },
  {
    value: 'name',
    label: '应用名称',
    minWidth: 120,
    fixed: 'left',
  },
  {
    slot: 'domain',
    label: '域名',
    width: 120,
  },
  {
    value: 'desc',
    label: '简介',
    minWidth: 200,
  },
  {
    value: 'create_user',
    label: '创建人',
    width: 150,
  },
  {
    value: 'create_timestamp',
    label: '创建时间',
    width: 180,
  },
  {
    value: 'last_update_timestamp',
    label: '更新时间',
    width: 180,
  },
  {
    slot: 'deploy_status',
    label: '最新部署状态',
    width: 120,
  },
  {
    slot: 'available',
    label: '状态',
    width: 80,
  },
  {
    label: '操作',
    slot: 'edit',
    width: 130,
    fixed: 'right',
  },
];

function updateCache(id: string, update: Partial<AiAppItem>) {
  const cur = {
    ...httpCache.aiAppDetail.mapping.value[id]!,
    ...update,
    last_update_timestamp: new Date(),
  };

  httpCache.aiAppDetail.setMapping([cur]);
}

const actions: {
  label: string;
  icon: IconType;
  method: (row: (typeof tableData.value)[number]) => void | Promise<void>;
}[] = [
  {
    label: '编辑',
    icon: IconParkOutlineEditTwo,
    method: (row) => {
      aiAppEvent.dispatch('edit', {
        role: 'update',
        id: row.id,
        form: {
          name: row.name,
          desc: row.desc,
          domain: row.domain,
        },
        callback({ name, desc, domain }) {
          updateCache(row.id, { name, desc, domain });
        },
      });
    },
  },
  {
    label: '版本历史',
    icon: IconParkOutlineTime,
    method: (row) => {
      aiAppEvent.dispatch('history', {
        id: row.id,
      });
    },
  },
  {
    label: '上传',
    icon: IconParkOutlineUpload,
    method: (row) => {
      aiAppEvent.dispatch('upload', {
        id: row.id,
        async callback() {
          await httpCache.aiAppVersion.get({ ids: [row.id], refresh: true });
        },
      });
    },
  },
];

const toggleAvailableId = ref('');

const { toggleAvailable, toggleAvailableLoading } = loadingFunc({
  funcs: {
    async toggleAvailable(row: AiAppItem) {
      toggleAvailableId.value = row.id;

      await api('/main/app-update', {
        id: row.id,
        update: {
          available: !row.available,
        },
      });
    },
  },
  minDuration: 100,
});

async function toggleAvailableWrap(row: AiAppItem) {
  await toggleAvailable(row);

  updateCache(row.id, { available: !row.available });

  notify('success', '已提交更新任务');
}
</script>
