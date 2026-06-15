<template>
  <el-button type="primary" @click="open">定时任务</el-button>
  <v-dialog v-model="visible" width="80%" title="定时任务">
    <div class="grid grid-cols-4 gap-8 p-8" v-loading="openLoading">
      <div
        v-for="item in scheduleList"
        :key="item.name"
        class="relative flex aspect-16/10 cursor-pointer flex-col justify-between rounded-lg bg-white p-4 shadow"
      >
        <div class="font-bold">
          {{ item.name }}
        </div>
        <div>
          {{ item.cron }}
        </div>
        <el-switch
          :model-value="item.status"
          @update:model-value="toggleSchedule(item.name, $event)"
          :loading="toggleScheduleLoading"
          size="large"
        />
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue';
import { api } from '@/api';
import { notify } from '@/plugins/notify';
import { loadingFunc, VDialog } from '@repo/ui';
import { ElButton, ElSwitch } from 'element-plus';

import type { ApiSys } from '@/types';

const visible = shallowRef(false);

const scheduleList = shallowRef<ApiSys.TaskAction['schedule-list']['resp']>([]);

async function getScheduleList() {
  const list = await api('/sys/task/schedule-list', {});
  scheduleList.value = list;
}

const { toggleSchedule, toggleScheduleLoading, open, openLoading } =
  loadingFunc({
    funcs: {
      async toggleSchedule(name: string, status: any) {
        const apiName = status
          ? '/sys/task/schedule-resume'
          : '/sys/task/schedule-pause';
        await api(apiName, { name });
        await getScheduleList();
        notify('success', '操作成功');
      },
      async open() {
        visible.value = true;
        await getScheduleList();
      },
    },
  });
</script>
