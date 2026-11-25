<template>
  <section class="min-h-full rounded bg-white p-4 shadow">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold">缓存监控</h2>
        <p class="mt-1 text-sm text-gray-600">
          检查 Redis 运行状态，按业务空间定位和清理应用缓存。
        </p>
      </div>
      <el-button :loading="loading" @click="load">刷新概览</el-button>
    </div>
    <el-alert
      v-if="failed"
      class="mb-4"
      type="error"
      :closable="false"
      title="缓存概览请求失败，请刷新重试。"
    />
    <el-alert
      v-if="overview && !overview.connected"
      class="mb-4"
      type="warning"
      :closable="false"
      :title="overview.error ?? 'Redis 暂不可用'"
    />
    <el-tabs v-model="tab">
      <el-tab-pane label="Redis 概览" name="overview">
        <template v-if="overview">
          <div class="my-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <el-tag v-if="overview.connected" type="success">连接正常</el-tag>
            <el-tag v-else type="danger">连接异常</el-tag>
            <span class="text-sm text-gray-600">
              采集于 {{ monitorTime(overview.collectedAt) }}
            </span>
          </div>
          <dl class="grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="metric in metrics"
              :key="metric.label"
              class="border-b border-gray-100 py-5"
            >
              <dt class="text-sm text-gray-600">{{ metric.label }}</dt>
              <dd class="mt-2 text-xl font-medium tabular-nums">
                {{ metric.value }}
              </dd>
            </div>
          </dl>
          <div class="mt-6 space-y-2 text-sm text-gray-600">
            <p>
              以上指标属于整个 Redis
              实例；实例共享时包含其他应用流量，命中率不是本应用命中率。
            </p>
            <p>
              当前应用前缀：
              <code class="break-all">{{ overview.prefix }}</code>
            </p>
            <p>应用缓存键请进入“缓存管理”按空间扫描；不会扫描其他应用的键。</p>
          </div>
        </template>
        <div v-else-if="loading" class="py-12 text-center text-gray-600">
          正在读取 Redis 状态…
        </div>
      </el-tab-pane>
      <el-tab-pane label="缓存管理" name="browser" lazy>
        <cache-browser :spaces="spaces" />
      </el-tab-pane>
    </el-tabs>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { ElAlert, ElButton, ElTabPane, ElTabs, ElTag } from 'element-plus';
import { api } from '@/utils';
import { monitorTime } from '../utils';
import CacheBrowser from './components/CacheBrowser.vue';
import type { CacheInfo, RedisOverview } from '@/types';

const tab = ref('overview');
const loading = ref(false);
const failed = ref(false);
const overview = shallowRef<RedisOverview>();
const spaces = shallowRef<CacheInfo[]>([]);
/** 离开页面或新请求开始后丢弃旧结果。 */
let sequence = 0;
/** 概览只展示真实 INFO 指标，离线时不把上次数据显示成当前健康值。 */
const metrics = computed(() => {
  const info = overview.value;
  const fields = info?.metrics ?? {};
  const read = (key: string): string => {
    if (!info?.connected) return '—';
    return fields[key] ?? '—';
  };
  let hitRate = '—';
  const hits = Number(fields.keyspace_hits ?? 0);
  const misses = Number(fields.keyspace_misses ?? 0);
  if (info?.connected && hits + misses > 0)
    hitRate = `${((hits / (hits + misses)) * 100).toFixed(1)}%`;
  let uptime = '—';
  if (info?.connected)
    uptime = `${Math.floor(Number(fields.uptime_in_seconds ?? 0) / 86400)} 天 ${Math.floor((Number(fields.uptime_in_seconds ?? 0) % 86400) / 3600)} 小时`;
  let maxmemory = read('maxmemory_human');
  if (info?.connected && fields.maxmemory === '0') maxmemory = '未设置上限';
  return [
    { label: 'Redis 版本', value: read('redis_version') },
    { label: '运行时长', value: uptime },
    { label: '连接客户端', value: read('connected_clients') },
    { label: '已用内存', value: read('used_memory_human') },
    { label: '内存上限', value: maxmemory },
    { label: '当前命令 / 秒', value: read('instantaneous_ops_per_sec') },
    { label: '实例命中率', value: hitRate },
    {
      label: '实例命中 / 未命中',
      value: `${read('keyspace_hits')} / ${read('keyspace_misses')}`,
    },
    {
      label: '实例淘汰 / 过期',
      value: `${read('evicted_keys')} / ${read('expired_keys')}`,
    },
  ];
});
/** 并行读取空间目录和 Redis 状态。 */
async function load(): Promise<void> {
  const current = ++sequence;
  loading.value = true;
  try {
    const [info, list] = await Promise.all([
      api('/sys/cache/overview', {}),
      api('/sys/cache/list', {}),
    ]);
    if (current === sequence) {
      overview.value = info;
      spaces.value = list;
      failed.value = false;
    }
  } catch {
    if (current === sequence) failed.value = true;
  } finally {
    if (current === sequence) loading.value = false;
  }
}
onMounted(() => {
  void load();
});
onBeforeUnmount(() => {
  sequence += 1;
});
</script>
