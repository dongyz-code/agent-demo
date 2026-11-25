<template>
  <el-drawer
    v-model="visible"
    :title="title"
    size="min(620px, 100vw)"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @closed="previewDates = []"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="88px"
      :disabled="saving"
    >
      <el-form-item label="任务名称" prop="name">
        <el-input v-model="form.name" maxlength="120" />
      </el-form-item>
      <el-form-item label="处理器" prop="handler">
        <el-select
          v-model="form.handler"
          class="w-full"
          @change="changeHandler"
        >
          <el-option
            v-for="handler in handlers"
            :key="handler.key"
            :label="handler.label"
            :value="handler.key"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="执行周期" prop="cron">
        <div class="w-full space-y-2">
          <el-select v-model="preset" class="w-full" @change="selectPreset">
            <el-option
              v-for="option in cronPresets"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
            <el-option label="自定义 Cron" value="custom" />
          </el-select>
          <el-input
            v-if="preset === 'custom'"
            v-model="form.cron"
            placeholder="例如：*/10 * * * *"
            @input="previewDates = []"
          />
        </div>
      </el-form-item>
      <el-form-item label="时区" prop="timezone">
        <el-select
          v-model="form.timezone"
          class="w-full"
          filterable
          allow-create
          default-first-option
          @change="previewDates = []"
        >
          <el-option label="北京时间 · Asia/Shanghai" value="Asia/Shanghai" />
          <el-option label="协调世界时 · UTC" value="UTC" />
          <el-option
            label="洛杉矶 · America/Los_Angeles"
            value="America/Los_Angeles"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="执行时间">
        <div class="w-full">
          <el-button :loading="previewing" @click="preview">预览</el-button>
          <ol
            v-if="previewDates.length"
            class="mt-3 space-y-2 text-sm tabular-nums"
          >
            <li v-for="date in previewDates" :key="date">
              {{ previewTime(date) }}
            </li>
          </ol>
        </div>
      </el-form-item>
      <el-form-item label="参数">
        <el-input
          v-model="paramsText"
          type="textarea"
          :rows="4"
          spellcheck="false"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          maxlength="2000"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-switch
          v-model="form.enabled"
          active-text="启用"
          inactive-text="暂停"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ElButton,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElSwitch,
} from 'element-plus';
import { api, notify } from '@/utils';
import { cronPresets } from '../../utils';
import type { FormInstance, FormRules } from 'element-plus';
import type { ScheduleHandlerInfo, ScheduleInfo, ScheduleInput } from '@/types';

const emit = defineEmits<{ /** 配置持久化后刷新计划页。 */ saved: [] }>();
const visible = ref(false);
const saving = ref(false);
const previewing = ref(false);
const title = ref('新建任务');
const formRef = ref<FormInstance>();
const handlers = ref<ScheduleHandlerInfo[]>([]);
const form = ref<ScheduleInput>(emptyForm());
const paramsText = ref('{}');
const previewDates = ref<string[]>([]);
const selectedHandler = computed(() =>
  handlers.value.find((item) => item.key === form.value.handler),
);
/** 自定义选项单独保留，允许从预设切换后继续编辑原表达式。 */
const preset = ref('*/10 * * * *');
/** 必填字段先在客户端提示，表达式与参数以服务端校验为准。 */
const rules: FormRules = {
  name: [
    {
      required: true,
      whitespace: true,
      message: '请输入任务名称',
      trigger: 'blur',
    },
  ],
  handler: [{ required: true, message: '请选择处理器' }],
  cron: [{ required: true, message: '请输入 Cron 表达式' }],
  timezone: [{ required: true, message: '请选择时区' }],
};
/**
 * 创建与编辑共用完整表单默认值。
 * @returns 新表单对象。
 */
function emptyForm(): ScheduleInput {
  return {
    name: '',
    handler: '',
    cron: '*/10 * * * *',
    timezone: 'Asia/Shanghai',
    params: {},
    description: '',
    enabled: true,
  };
}
/**
 * 打开配置抽屉并加载代码处理器。
 * @param plan 编辑对象，缺省时创建。
 */
async function open(plan?: ScheduleInfo): Promise<void> {
  form.value = emptyForm();
  title.value = '新建任务';
  if (plan) {
    form.value = {
      id: plan.id,
      name: plan.name,
      handler: plan.handler,
      cron: plan.cron,
      timezone: plan.timezone,
      enabled: plan.enabled,
      params: plan.params,
      description: plan.description,
    };
    title.value = '编辑任务';
  }
  paramsText.value = JSON.stringify(form.value.params, null, 2);
  preset.value =
    cronPresets.find((item) => item.value === form.value.cron)?.value ??
    'custom';
  previewDates.value = [];
  handlers.value = await api('/sys/schedule/handlers', {});
  if (!plan && handlers.value[0]) {
    form.value.handler = handlers.value[0].key;
    changeHandler();
  }
  visible.value = true;
  formRef.value?.clearValidate();
}
/** 切换处理器时使用该处理器参数示例，避免保留其他处理器的输入。 */
function changeHandler(): void {
  paramsText.value = JSON.stringify(
    selectedHandler.value?.defaultParams ?? {},
    null,
    2,
  );
}
/**
 * 应用常用周期，自定义模式保留当前文本。
 * @param value 周期表达式或自定义标识。
 */
function selectPreset(value: string): void {
  if (value !== 'custom') form.value.cron = value;
  previewDates.value = [];
}
/** 预览服务端计算结果；不在客户端复制 Cron 解析器。 */
async function preview(): Promise<void> {
  previewing.value = true;
  try {
    const cron = form.value.cron;
    const timezone = form.value.timezone;
    const dates = await api('/sys/schedule/preview', { cron, timezone });
    if (cron !== form.value.cron || timezone !== form.value.timezone) return;
    previewDates.value = dates;
  } finally {
    previewing.value = false;
  }
}
/**
 * 明确按计划时区展示预览，方便核对跨时区执行。
 * @param value ISO 时间。
 * @returns 带时区的可读时间。
 */
function previewTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: form.value.timezone,
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(new Date(value));
}
/** 校验 JSON 和表单，提交完整计划配置。 */
async function save(): Promise<void> {
  if (saving.value || !(await formRef.value?.validate().catch(() => false)))
    return;
  let params: unknown;
  try {
    params = JSON.parse(paramsText.value);
  } catch {
    notify('error', '参数不是有效 JSON');
    return;
  }
  if (!params || Array.isArray(params) || typeof params !== 'object') {
    notify('error', '参数必须是 JSON 对象');
    return;
  }
  saving.value = true;
  try {
    // 业务参数名与请求工具的路径 params 同名，显式指定 body 避免被识别成路径参数。
    await api('/sys/schedule/save', {
      body: {
        ...form.value,
        params: params as Record<string, unknown>,
      },
    });
    notify('success', '保存成功');
    visible.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
defineExpose({ open });
</script>
