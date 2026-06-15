<template>
  <div
    :class="[
      options.labelWrap ? '' : 'flex flex-row flex-nowrap items-center',
      realHidden ? 'hidden' : '',
    ]"
  >
    <div
      :class="[
        'mr-4 flex items-center text-sm text-gray-600',
        options.labelWrap ? 'mb-2' : '',
        options.labelAlign === 'right' ? 'justify-end' : '',
        options.labelClass,
      ]"
      v-if="options.label"
      :style="{
        minWidth: options.labelWidth + 'px',
      }"
    >
      <el-tooltip v-if="options.labelTips?.trim()" raw-content placement="top">
        <IconParkOutlineTipsOne />
        <template #content>
          <pre>{{ options.labelTips.trim() }}</pre>
        </template>
      </el-tooltip>

      <span class="text-primary" v-if="realRequired">*</span>
      <span>{{ options.label }} </span>
    </div>

    <div class="relative w-full">
      <component
        v-if="component"
        :is="component"
        class="w-full"
        :class="options.valueClass"
      ></component>
      <!-- <div
        class="absolute -bottom-4 left-0 text-xs text-danger"
        v-if="verifyError"
      >
        {{ verifyError }}
      </div> -->
    </div>
  </div>
</template>

<script setup lang="ts" generic="T, U">
import { useOptions } from './index';
import { toRefs, computed, h, defineComponent, isRef } from 'vue';
import {
  ElInput,
  ElSelect,
  ElOption,
  ElDatePicker,
  ElButton,
  ElSwitch,
  ElCheckboxGroup,
  ElCheckbox,
  ElRadioGroup,
  ElRadio,
  ElCascader,
  ElInputNumber,
  ElTooltip,
} from 'element-plus';
import IconParkOutlineTipsOne from '~icons/icon-park-outline/tips-one';

import type { FormItem } from './type';

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: FormItem;
    /** 完整表单 */
    form: U;
  }>(),
  {},
);

// watch(
//   props,
//   (val) => {
//     if (val.options.key === 'available') {
//       console.log(val.form, val.options.data);
//     }
//   },
//   {
//     immediate: true,
//   },
// );

const emits = defineEmits<{
  'update:modelValue': [val: T];
}>();

const { getAsyncOptions, filterVal, finalOptions, lazyStatus } = useOptions(
  toRefs(props),
);
const vNode = computed(() => {
  const propsData = {
    modelValue: props?.modelValue as any,
    'onUpdate:modelValue': (val: any) => {
      // if (props.options.key === 'available') {
      //   console.log('update:modelValue', val);
      // }
      emits('update:modelValue', val);
    },
    key: props.options.key,
  };

  const { data } = props.options;

  if (data.type === 'input') {
    return h(ElInput, {
      ...data.props,
      ...propsData,
    });
  } else if (data.type === 'input-number') {
    return h(ElInputNumber, {
      ...data.props,
      ...propsData,
      class: 'w-full!',
    });
  } else if (data.type === 'select') {
    const { onFocus, ...rest } = data.props ?? {};
    const itemsOptions = finalOptions.value.map(
      ({ render, label, value, disabled }) =>
        h(
          ElOption,
          {
            key: value,
            label,
            value,
            disabled,
          },
          render,
        ),
    );

    // console.log(finalOptions.value, rest);

    return h(
      ElSelect,
      {
        ...rest,
        ...propsData,
        filterable: rest.filterable,
        remote: rest.filterable,
        remoteMethod(val: string) {
          filterVal.value = val.trim();
        },
        onFocus(...items: any[]) {
          onFocus?.(...items);
          getAsyncOptions();
        },
        loading: !lazyStatus.value,
      },
      () => itemsOptions,
    );
  } else if (data.type === 'date-picker') {
    return h(ElDatePicker, {
      unlinkPanels: true,
      startPlaceholder: '选择日期',
      endPlaceholder: '选择日期',
      ...data.props,
      ...propsData,
    });
  } else if (data.type === 'button') {
    return h(
      ElButton,
      { type: 'primary', ...data.props, ...propsData },
      () => data.text,
    );
  } else if (data.type === 'custom') {
    return data.render?.(propsData) ?? h('span', {}, String(props.modelValue));
  } else if (data.type === 'component') {
    return h(data.component, {
      ...propsData,
      props: data.props,
    });
  } else if (data.type === 'switch') {
    return h(ElSwitch, { ...data.props, ...propsData });
  } else if (data.type === 'check-box-group') {
    return h('div', [
      h(
        ElCheckboxGroup,
        {
          ...data.props,
          ...propsData,
        },
        () =>
          finalOptions.value.map(({ label, value, disabled }) =>
            h(
              ElCheckbox,
              {
                value,
                disabled,
              },
              () => label,
            ),
          ),
      ),
    ]);
  } else if (data.type === 'radio-group') {
    return h(
      ElRadioGroup,
      {
        ...propsData,
        ...data.props,
      },
      () =>
        finalOptions.value.map(({ label, value, disabled }) =>
          h(
            ElRadio,
            {
              value,
              disabled,
            },
            () => label,
          ),
        ),
    );
  } else if (data.type === 'cascader') {
    const { onFocus, props = {}, onVisibleChange, ...rest } = data.props ?? {};
    const node = h(ElCascader, {
      options: finalOptions.value,
      props: {
        ...props,
      },
      ...propsData,
      ...rest,
      onFocus() {
        getAsyncOptions();
      },
      onVisibleChange(val) {
        if (val) {
          getAsyncOptions();
        }
        onVisibleChange?.(val);
      },
    });
    return node;
  }

  return null;
});

const component = computed(() =>
  defineComponent({
    setup() {
      return () => vNode.value;
    },
  }),
);

/** 是否隐藏 */
const realHidden = computed(() => {
  const val = props.options.hidden;
  if (!val) {
    return false;
  }
  return isRef(val) ? val.value : val;
});

/** 是否禁用 */
const realDisabled = computed(() => {
  const val = props.options.disabled;
  if (!val) {
    return false;
  }
  return isRef(val) ? val.value : val;
});

/** 是否必填 */
const realRequired = computed(() => {
  const val = props.options.required;
  if (!val) {
    return false;
  }
  return (isRef(val) ? val.value : val) && !realDisabled.value;
});
</script>

<style lang="postcss" scoped>
:deep(.el-date-editor--daterange, .el-date-editor--timerange) {
  --el-date-editor-width: 100%;
}
:deep(.el-date-editor) {
  --el-date-editor-width: 100%;
}
</style>
