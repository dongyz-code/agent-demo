<template>
  <div class="grid gap-6" :class="[handleOptions.grid]">
    <v-form-item
      v-for="{ item, key, itemClass } in handleOptions.list"
      :key="key"
      :options="item"
      :class="itemClass"
      :model-value="modelValue[item.key as keyof typeof modelValue]"
      :form="modelValue"
      @update:model-value="update(item.key, $event)"
    >
    </v-form-item>
  </div>
</template>

<style lang="postcss" scoped></style>

<script setup lang="ts" generic="T">
import VFormItem from '../form-item/index.vue';

import { computed } from 'vue';
import { arrConcatSet, arrUnique } from '@repo/utils-browser';
import { tailwindcssStatic, MAXCOLS } from '../../static/tailwindcss';
import { getTextWidthDOM } from './utils';

import type { FormItem } from '../form-item/type';
import type { Props } from './props';

const props = defineProps<Props<T>>();

const emits = defineEmits<{
  'update:modelValue': [val: T];
}>();

function update(key: string, value: unknown) {
  const vals = { ...props.modelValue, [key]: value };
  emits('update:modelValue', vals);
}

const labelWidth = computed(() => {
  if (props.labelWidth !== undefined) {
    return props.labelWidth;
  }
  const list = arrUnique(
    arrConcatSet(
      props.options.map((items) =>
        items.map((x) => (!x.labelWrap ? (x.label ?? '') : '')),
      ),
    ),
  );
  let max = Math.max(...list.map((x) => getTextWidthDOM(x)));
  if (props.options.some((x) => x.some((x) => x.required))) {
    max += 20;
  }
  return Math.min(max, 200);
});

const handleOptions = computed(() => {
  const { options } = props;

  const counts: number[] = [];
  const list: {
    item: FormItem;
    grid: number[];
    onlyOne?: boolean;
  }[] = [];

  options.forEach((items) => {
    let end = 0;
    const onlyOne = items.length === 1;
    items.forEach((item) => {
      const range = item.range ?? [0, 1];
      const [offset, scale] = typeof range === 'number' ? [0, range] : range;
      const start = end + offset;
      end = start + scale;
      list.push({
        item,
        grid: [start + 1, end + 1],
        onlyOne: onlyOne && !item.range,
      });
    });
    counts.push(end);
  });

  const max = Math.max(...counts);

  if (max > MAXCOLS) throw new Error(`grid 最大值为 ${MAXCOLS}`);

  list.forEach((item) => {
    if (item.onlyOne) {
      item.grid = [1, max + 1];
    }
  });

  const main = list.map(({ grid: [start, end], ...rest }) => ({
    ...rest,
    itemClass: `${tailwindcssStatic.colStart[start!]} ${tailwindcssStatic.colEnd[end!]}`,
  }));

  return {
    grid: tailwindcssStatic.grid[props.gridMaxCols ?? max],
    list: main.map(({ item, itemClass }, index) => {
      return {
        item: {
          labelWidth: labelWidth.value,
          labelAlign: props.labelAlign,
          labelWrap: props.labelWrap,
          labelClass: props.labelClass,
          valueClass: props.valueClass,
          ...item,
        },
        itemClass,
        key: item.key + index,
      };
    }),
  };
});
</script>
