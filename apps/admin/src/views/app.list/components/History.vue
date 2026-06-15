<template>
  <v-dialog v-model="dialogVisible" title="版本历史" width="80%">
    <div v-loading="getHistoryLoading">
      <v-table
        v-if="historyTableData.length"
        :rows="columns"
        :data="historyTableData"
      >
        <template #hash="{ row }">
          <div class="flex items-center gap-2">
            <IconParkOutlineCopy
              class="hover:text-primary shrink-0 cursor-pointer"
              @click="copyHash(row.hash)"
            />
            <span
              class="line-clamp-1"
              :class="row._isCurrentDeploy ? 'text-primary font-bold' : ''"
            >
              {{ row.hash }}
            </span>
          </div>
        </template>
        <template #create_timestamp="{ row }">
          <div class="flex items-center gap-2">
            <IconParkOutlineTime />
            {{ dayJsformat(row.create_timestamp, 'YYYY-MM-DD HH:mm:ss') }}
          </div>
        </template>
        <template #size="{ row }">
          {{ byteConversion(+row.size) }}
        </template>
        <template #edit="{ row }">
          <ElButton type="primary" @click="onDeployClick(row.hash)">
            部署
          </ElButton>
        </template>
      </v-table>
      <div v-else>暂无版本历史</div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { byteConversion, dayJsformat, copyText } from '@repo/utils-browser';
import { loadingFunc, VDialog } from '@repo/ui';
import { aiAppEvent } from '../event';
import { httpCache } from '@/cache';
import { api } from '@/api';
import { notify, confirm } from '@/plugins/notify';

import { VTable, type TableRow } from '@repo/ui';
import { ElButton } from 'element-plus';

import IconParkOutlineTime from '~icons/icon-park-outline/time';
import IconParkOutlineCopy from '~icons/icon-park-outline/copy';

import type { ApiMain } from '@/types';

const dialogVisible = shallowRef(false);

const historyList =
  shallowRef<ApiMain.AiAppAction['version']['resp'][number]>();

type VersionRow =
  ApiMain.AiAppAction['version']['resp'][number]['list'][number];

const historyTableData = computed(() => {
  const item = historyList.value;
  if (!item?.list?.length) {
    return [] as (VersionRow & { _isCurrentDeploy: boolean })[];
  }
  const deployed =
    httpCache.aiAppDetail.mapping.value[item.id]?.deploy_hash ?? null;
  return item.list.map((row) => ({
    ...row,
    _isCurrentDeploy: Boolean(deployed && row.hash === deployed),
  }));
});

const { getHistory, getHistoryLoading } = loadingFunc({
  funcs: {
    async getHistory(id: string) {
      const [item] = await httpCache.aiAppVersion.get({ ids: [id] });
      historyList.value = item;
    },
  },
});

aiAppEvent.add('history', ({ detail }) => {
  dialogVisible.value = true;
  getHistory(detail.id);
});

const columns: TableRow<keyof VersionRow | 'edit'>[] = [
  {
    label: 'hash',
    slot: 'hash',
    minWidth: 200,
  },
  {
    label: '名称',
    value: 'name',
    minWidth: 100,
  },
  {
    label: '时间',
    slot: 'create_timestamp',
    width: 180,
  },

  {
    label: '大小',
    slot: 'size',
    width: 120,
  },

  {
    label: '操作',
    slot: 'edit',
    width: 120,
  },
];

async function copyHash(hash: string) {
  await copyText(hash);
  notify('success', '复制成功');
}

function onDeployClick(hash: string) {
  const id = historyList.value?.id;
  if (!id) {
    return;
  }
  void deploy({ id, hash });
}

async function deploy(item: { id: string; hash: string }) {
  const { isConfirmed } = await confirm({
    title: '确定部署当前版本吗?',
  });

  if (!isConfirmed) {
    return;
  }

  await api('/main/app-deploy', item);

  const cur = { ...httpCache.aiAppDetail.mapping.value[item.id]! };
  cur.deploy_hash = item.hash;
  cur.available = true;
  cur.deploy_status = 'to-be-started';
  httpCache.aiAppDetail.setMapping([cur]);

  notify('success', '已提交部署任务');
}
</script>
