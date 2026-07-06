<template>
  <div class="w-full space-y-2">
    <div
      v-for="(item, i) in argsNext"
      :key="i"
      class="flex items-center gap-4 border-b py-2 last:border-none"
    >
      <div class="w-37.5 shrink-0">
        <div>
          {{ getLabel(i, item.comment) }}
          <span v-if="item.required" class="text-danger">(必填)</span>
        </div>
        <div v-if="errors[item.key]" class="text-danger text-xs font-bold">
          {{ errors[item.key] }}
        </div>
      </div>
      <el-switch
        v-if="item.type === 'boolean'"
        :model-value="getModelValue(i, item.key)"
        @update:model-value="updateModelValue(i, item.key, $event)"
      />
      <template v-else-if="item.type === 'select'">
        <el-select
          v-if="item.options.length > 30"
          filterable
          :multiple="item.multiple"
          :model-value="getModelValue(i, item.key)"
          @update:model-value="updateModelValue(i, item.key, $event)"
          :options="item.options"
        />
        <el-radio-group
          v-else-if="!item.multiple"
          :model-value="getModelValue(i, item.key)"
          @update:model-value="updateModelValue(i, item.key, $event)"
          :options="item.options"
        />
        <el-checkbox-group
          v-else
          :model-value="getModelValue(i, item.key)"
          @update:model-value="updateModelValue(i, item.key, $event)"
          :options="item.options"
        />
      </template>

      <Args
        v-else-if="item.type === 'object'"
        ref="elementRef"
        mode="object"
        :args="item.properties"
        :depth="depth + 1"
        :prefix="`${i + 1}.`"
        :model-value="getModelValue(i, item.key)"
        @update:model-value="updateModelValue(i, item.key, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';

import {
  ElSelect,
  ElSwitch,
  ElRadioGroup,
  ElCheckboxGroup,
} from 'element-plus';

import type { TaskType } from '../types';

const props = withDefaults(
  defineProps<{
    args: NonNullable<TaskType['argsMode']>;
    depth?: number;
    mode?: 'object' | 'array';
    modelValue?: any;
    prefix?: string;
  }>(),
  {
    depth: 0,
    mode: 'array',
    prefix: '',
  },
);

const emits = defineEmits<{
  'update:modelValue': [any];
}>();

const argsNext = computed(() => {
  return props.args.map((item) =>
    'options' in item
      ? {
          ...item,
          options: item.options.map((option) =>
            typeof option === 'string'
              ? { label: option, value: option }
              : option,
          ),
        }
      : item,
  );
});

const elementRef = useTemplateRef('elementRef');

const modelValueNext = computed(() => {
  return props.modelValue ?? (props.mode === 'object' ? {} : []);
});

const getLabel = (i: number, comment: string) => {
  const index = `${props.prefix}${i + 1}`;
  return comment ? `${comment}(${index})` : index;
};

function getModelValue(i: number, key: string | number) {
  if (props.mode === 'object') {
    return modelValueNext.value[key];
  }
  return modelValueNext.value[i];
}

function updateModelValue(i: number, key: string | number, value: any) {
  let next: any;

  if (props.mode === 'object') {
    next = { ...modelValueNext.value, [key]: value };
  } else {
    next = [...modelValueNext.value];
    next[i] = value;
  }

  // console.log({ next });
  emits('update:modelValue', next);
}

const errors = ref<Record<string, string>>({});

function check(): { msg: string; key: string | number }[] {
  const list = Array.isArray(elementRef.value)
    ? elementRef.value.map((item) => (item as any)?.check() ?? []).flat()
    : ((elementRef.value as any)?.check() ?? []);

  props.args.forEach(({ key, required }) => {
    if (required && modelValueNext.value[key] === undefined) {
      errors.value[key] = '此处必填';
      list.push({ msg: '此处必填', key });
    }
  });

  return list;
}

defineExpose({
  check,
});
</script>
