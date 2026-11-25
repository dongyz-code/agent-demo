<template>
  <v-dialog v-model="visible" title="缓存值" width="min(800px, 94vw)">
    <p class="mb-3 text-sm break-all text-gray-600">
      {{ key }} · {{ ttlText(ttl) }}
    </p>
    <el-alert
      v-if="failed"
      type="error"
      :closable="false"
      title="缓存值读取失败或已过期，请重新打开。"
    />
    <pre
      v-loading="loading"
      class="max-h-[65vh] min-h-24 overflow-auto rounded bg-gray-50 p-4 text-sm whitespace-pre-wrap"
      v-text="text"
    />
  </v-dialog>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { ElAlert } from 'element-plus';
import { VDialog } from '@repo/ui';
import { api } from '@/utils';
import { ttlText } from '../../utils';

const visible = ref(false);
const key = ref('');
const ttl = ref(-2);
const loading = ref(false);
const failed = ref(false);
const text = ref('');
/** 每次打开生成独立请求，旧响应不能覆盖新键。 */
let sequence = 0;
/**
 * 只查询允许检查的空间；最终权限、类型、脱敏和大小由服务端执行。
 * @param name 空间标识。
 * @param entryKey 业务键。
 */
async function open(name: string, entryKey: string): Promise<void> {
  const current = ++sequence;
  key.value = entryKey;
  text.value = '';
  ttl.value = -2;
  failed.value = false;
  visible.value = true;
  loading.value = true;
  try {
    const result = await api('/sys/cache/value', { name, key: entryKey });
    if (current === sequence) {
      text.value = JSON.stringify(result.value, null, 2);
      ttl.value = result.ttl;
    }
  } catch {
    if (current === sequence) failed.value = true;
  } finally {
    if (current === sequence) loading.value = false;
  }
}
defineExpose({ open });
</script>
