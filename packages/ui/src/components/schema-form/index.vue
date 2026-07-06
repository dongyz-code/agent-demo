<template>
  <el-form
    ref="formRef"
    class="v-schema-form w-full"
    :class="formClass"
    :model="modelValue"
    :label-width="formLabelWidth"
    v-bind="formProps"
  >
    <div
      ref="gridRef"
      class="v-schema-form__grid items-start"
      :style="gridStyle"
    >
      <el-form-item
        v-for="item in visibleLayoutItems"
        :key="item.field.key"
        v-bind="item.field.formItemProps"
        :label="item.field.title"
        :prop="getFormItemProp(item.field)"
        :style="item.style"
      >
        <template v-if="$slots[getLabelSlotName(item.field)]" #label>
          <slot
            :name="getLabelSlotName(item.field)"
            v-bind="getSlotProps(item.field)"
          ></slot>
        </template>

        <slot
          v-if="$slots[getFieldSlotName(item.field)]"
          :name="getFieldSlotName(item.field)"
          v-bind="getSlotProps(item.field)"
        ></slot>
        <SchemaFieldRenderer v-else :ctx="getRendererCtx(item.field)" />
      </el-form-item>

      <el-form-item
        v-if="showInlineActions"
        class="v-schema-form__actions-item"
        :label="actionFormItemLabel"
        :style="actionStyle"
      >
        <div
          class="v-schema-form__actions flex min-h-8 w-full min-w-0 items-center gap-2"
          :class="
            searchConfig.actionAlign === 'left' ? 'justify-start' : 'justify-end'
          "
        >
          <slot v-if="$slots.actions" name="actions" v-bind="actionSlotProps" />
          <template v-else>
            <el-button type="primary" @click="submit">
              {{ searchConfig.submitText }}
            </el-button>
            <el-button v-if="searchConfig.showReset" @click="reset">
              {{ searchConfig.resetText }}
            </el-button>
            <el-button
              v-for="action in searchConfig.actions"
              :key="action.key"
              :disabled="action.disabled"
              :loading="action.loading"
              :type="action.type"
              @click="handleAction(action.key)"
            >
              {{ action.text }}
            </el-button>
            <el-button
              v-if="showCollapseButton"
              link
              type="primary"
              @click="toggleCollapsed"
            >
              <span
                class="v-schema-form__collapse-content inline-flex items-center gap-1"
                :class="{ 'is-collapsed': realCollapsed }"
              >
                {{ collapseButtonText }}
                <component
                  :is="collapseIcon"
                  class="v-schema-form__collapse-icon h-3.5 w-3.5 transition-transform duration-200 ease-in-out"
                  aria-hidden="true"
                />
              </span>
            </el-button>
          </template>
        </div>
      </el-form-item>
    </div>

    <div
      v-if="showBottomActions"
      class="v-schema-form__actions mt-4 flex min-h-8 w-full min-w-0 items-center gap-2"
      :class="
        searchConfig.actionAlign === 'left' ? 'justify-start' : 'justify-end'
      "
    >
      <slot v-if="$slots.actions" name="actions" v-bind="actionSlotProps" />
      <template v-else>
        <el-button type="primary" @click="submit">
          {{ searchConfig.submitText }}
        </el-button>
        <el-button v-if="searchConfig.showReset" @click="reset">
          {{ searchConfig.resetText }}
        </el-button>
        <el-button
          v-for="action in searchConfig.actions"
          :key="action.key"
          :disabled="action.disabled"
          :loading="action.loading"
          :type="action.type"
          @click="handleAction(action.key)"
        >
          {{ action.text }}
        </el-button>
        <el-button
          v-if="showCollapseButton"
          link
          type="primary"
          @click="toggleCollapsed"
        >
          <span
            class="v-schema-form__collapse-content inline-flex items-center gap-1"
            :class="{ 'is-collapsed': realCollapsed }"
          >
            {{ collapseButtonText }}
            <component
              :is="collapseIcon"
              class="v-schema-form__collapse-icon h-3.5 w-3.5 transition-transform duration-200 ease-in-out"
              aria-hidden="true"
            />
          </span>
        </el-button>
      </template>
    </div>
  </el-form>
</template>

<script setup lang="ts" generic="T extends SchemaFormModel">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import { ElButton, ElForm, ElFormItem } from 'element-plus';
import {
  buildActionStyle,
  buildGridStyle,
  buildLayoutItems,
  hasCollapsedItems,
  resolveColumnCount,
  resolveSearchLabelPosition,
} from './layout';
import { normalizeColumns, resolveRuntimeField } from './normalize';
import {
  buildReloadSignature,
  createOptionState,
  getDataOptionsSource,
  resolveDataOptions,
  resolveStaticOptions,
} from './options';
import { SchemaFieldRenderer } from './renderers';
import {
  buildSubmitParams,
  cloneFormValue,
  dataIndexToPath,
  getFormValue,
  setFormValue,
} from './value';
import LucideChevronDown from '~icons/lucide/chevron-down';
import LucideChevronUp from '~icons/lucide/chevron-up';

import type {
  NormalizedSchemaFormColumn,
  RuntimeSchemaFormField,
  SchemaFormEmits,
  SchemaFormExpose,
  SchemaFormModel,
  SchemaFormProps,
  SchemaFormSearch,
  SchemaFormSlotProps,
  SchemaRendererCtx,
} from './type';

const props = withDefaults(defineProps<SchemaFormProps<T>>(), {
  collapsed: undefined,
  search: undefined,
});

const emit = defineEmits<SchemaFormEmits<T>>();

const formRef = ref<InstanceType<typeof ElForm>>();
const gridRef = ref<HTMLElement>();
const { width: gridWidth } = useElementSize(gridRef);

const mode = computed(() => props.mode ?? 'form');

const initialSnapshot = shallowRef<T>(
  cloneFormValue({
    ...props.modelValue,
    ...(props.initialValues ?? {}),
  } as T),
);

/** 外部 initialValues 变化时更新重置快照，避免弹窗编辑时复用旧初始值。 */
watch(
  () => props.initialValues,
  (value) => {
    if (value) {
      initialSnapshot.value = cloneFormValue({
        ...props.modelValue,
        ...value,
      } as T);
    }
  },
  { deep: true },
);

const normalizedFields = computed(() =>
  normalizeColumns({
    columns: props.columns,
    mode: mode.value,
  }),
);

const runtimeFields = computed(() =>
  normalizedFields.value
    .map((field) =>
      resolveRuntimeField({
        disabled: props.disabled,
        field,
        fieldDefaults: props.fieldDefaults,
        form: props.modelValue,
        readonly: props.readonly,
      }),
    )
    .filter((field) => !field.hidden),
);

type ResolvedSearchConfig = Omit<Required<SchemaFormSearch>, 'columns'> & {
  /** 查询模式列数；不传时由布局工具按容器宽度套用默认断点。 */
  columns?: SchemaFormSearch['columns'];
};

const searchConfig = computed<ResolvedSearchConfig>(() => {
  const config = props.search === false ? {} : (props.search ?? {});
  return {
    actionAlign: config.actionAlign ?? 'right',
    actionPlacement: config.actionPlacement ?? 'inline',
    actions: config.actions ?? [],
    collapsedRows: Math.max(1, config.collapsedRows ?? 2),
    columns: config.columns ?? props.layout?.columns,
    defaultCollapsed: config.defaultCollapsed ?? true,
    resetText: config.resetText ?? '重置',
    showCollapse: config.showCollapse ?? true,
    showHiddenNum: config.showHiddenNum ?? true,
    showReset: config.showReset ?? true,
    submitText: config.submitText ?? '搜索',
  };
});

const columnCount = computed(() =>
  resolveColumnCount({
    columns:
      mode.value === 'search'
        ? searchConfig.value.columns
        : props.layout?.columns,
    mode: mode.value,
    width: gridWidth.value,
  }),
);

const gridStyle = computed(() =>
  buildGridStyle({
    columns: columnCount.value,
    gap: props.layout?.gap,
    mode: mode.value,
  }),
);

const searchLabelPosition = computed(() =>
  resolveSearchLabelPosition({ width: gridWidth.value }),
);

const effectiveLabelPosition = computed(() =>
  props.formProps?.labelPosition ??
  props.layout?.labelPosition ??
  (mode.value === 'search' ? searchLabelPosition.value : undefined),
);

const formClass = computed(() => ({
  'v-schema-form--search': mode.value === 'search',
  'v-schema-form--search-inline':
    mode.value === 'search' && effectiveLabelPosition.value !== 'top',
  'v-schema-form--search-top':
    mode.value === 'search' && effectiveLabelPosition.value === 'top',
}));

const innerCollapsed = ref(searchConfig.value.defaultCollapsed);

/** 查询配置默认收起状态变化时，同步非受控内部状态。 */
watch(
  () => searchConfig.value.defaultCollapsed,
  (value) => {
    if (props.collapsed === undefined) {
      innerCollapsed.value = value;
    }
  },
);

const realCollapsed = computed(() => props.collapsed ?? innerCollapsed.value);

const expandedLayoutItems = computed(() =>
  buildLayoutItems({
    collapsed: false,
    collapsedRows: searchConfig.value.collapsedRows,
    columns: columnCount.value,
    fields: runtimeFields.value,
    mode: mode.value,
    reserveActionSlot: showInlineActions.value,
  }),
);

const collapsedLayoutItems = computed(() =>
  buildLayoutItems({
    collapsed: true,
    collapsedRows: searchConfig.value.collapsedRows,
    columns: columnCount.value,
    fields: runtimeFields.value,
    mode: mode.value,
    reserveActionSlot: showInlineActions.value,
  }),
);

const visibleLayoutItems = computed(() => {
  const items = realCollapsed.value
    ? collapsedLayoutItems.value
    : expandedLayoutItems.value;
  return items.filter((item) => item.visibleWhenCollapsed);
});

const hasCollapsibleFields = computed(() =>
  hasCollapsedItems(collapsedLayoutItems.value),
);

const hiddenFieldsCount = computed(
  () =>
    collapsedLayoutItems.value.filter((item) => !item.visibleWhenCollapsed)
      .length,
);

const showActions = computed(
  () => mode.value === 'search' && props.search !== false,
);

const showInlineActions = computed(
  () => showActions.value && searchConfig.value.actionPlacement === 'inline',
);

const showBottomActions = computed(
  () => showActions.value && searchConfig.value.actionPlacement === 'bottom',
);

const showCollapseButton = computed(
  () => searchConfig.value.showCollapse && hasCollapsibleFields.value,
);

const collapseButtonText = computed(() => {
  if (!realCollapsed.value) {
    return '收起';
  }

  if (!searchConfig.value.showHiddenNum || hiddenFieldsCount.value <= 0) {
    return '展开';
  }

  return `展开(${hiddenFieldsCount.value})`;
});

const collapseIcon = computed(() =>
  realCollapsed.value ? LucideChevronDown : LucideChevronUp,
);

const actionStyle = computed(() =>
  buildActionStyle({
    columns: columnCount.value,
    placement: searchConfig.value.actionPlacement,
  }),
);

const actionFormItemLabel = computed(() =>
  effectiveLabelPosition.value === 'top' && columnCount.value > 1
    ? ' '
    : undefined,
);

const formLabelWidth = computed(() => {
  if (mode.value !== 'search') {
    return props.layout?.labelWidth ?? props.formProps?.labelWidth;
  }

  if (effectiveLabelPosition.value === 'top') {
    return props.layout?.labelWidth ?? props.formProps?.labelWidth;
  }

  return props.layout?.labelWidth ?? props.formProps?.labelWidth ?? 80;
});

const formProps = computed(() => ({
  ...props.formProps,
  disabled: props.disabled ?? props.formProps?.disabled,
  labelPosition: effectiveLabelPosition.value,
}));

const optionStates = reactive<Record<string, ReturnType<typeof createOptionState>>>(
  {},
);

/** 获取字段选项状态；不存在时创建默认状态。 */
function getOptionState(field: NormalizedSchemaFormColumn<T>) {
  optionStates[field.key] ??= createOptionState();
  return optionStates[field.key]!;
}

/** 字段是否需要异步或函数式加载选项。 */
function shouldLoadOptions(field: NormalizedSchemaFormColumn<T>) {
  return (
    Boolean(field.column.request) ||
    typeof getDataOptionsSource(field.column) === 'function'
  );
}

/** 读取字段当前 options；静态来源直接同步读取，异步来源读取状态缓存。 */
function getOptions(field: NormalizedSchemaFormColumn<T>) {
  return resolveStaticOptions(field) ?? getOptionState(field).items;
}

/** 加载字段 options，并通过 requestId 避免旧响应覆盖新响应。 */
async function loadOptions(
  field: NormalizedSchemaFormColumn<T>,
  keyword?: string,
) {
  if (!shouldLoadOptions(field)) {
    return;
  }

  const state = getOptionState(field);
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  state.keyword = keyword;
  state.loading = true;
  state.error = undefined;

  try {
    const items = field.column.request
      ? await field.column.request({
          column: field.column,
          dataIndex: field.dataIndex,
          form: props.modelValue,
          keyword,
          value: getFormValue(props.modelValue, field.dataIndex),
        })
      : await resolveDataOptions(field);

    if (state.requestId === requestId) {
      state.items = items;
    }
  } catch (error) {
    if (state.requestId === requestId) {
      state.error = error;
    }
  } finally {
    if (state.requestId === requestId) {
      state.loading = false;
    }
  }
}

/** 初始化不依赖其他字段的异步选项。 */
watch(
  normalizedFields,
  (fields) => {
    fields.forEach((field) => {
      getOptionState(field);
      if (!field.column.reloadOn?.length) {
        void loadOptions(field);
      }
    });
  },
  { immediate: true },
);

/** 监听 reloadOn 字段签名，只有声明字段变化时才重新请求对应 options。 */
watch(
  () => props.modelValue,
  (form) => {
    normalizedFields.value.forEach((field) => {
      if (!field.column.request || !field.column.reloadOn?.length) {
        return;
      }
      const state = getOptionState(field);
      const signature = buildReloadSignature({
        field,
        form,
        getValue: getFormValue,
      });
      if (signature !== state.reloadSignature) {
        state.reloadSignature = signature;
        void loadOptions(field, state.keyword);
      }
    });
  },
  { deep: true, immediate: true },
);

/** 更新字段值并向外发出新的表单对象。 */
function updateField(field: RuntimeSchemaFormField<T>, value: unknown) {
  emit('update:modelValue', setFormValue(props.modelValue, field.dataIndex, value));
}

/** 生成 renderer 上下文。 */
function getRendererCtx(field: RuntimeSchemaFormField<T>): SchemaRendererCtx<T> {
  const state = getOptionState(field);
  return {
    column: field.column,
    dataIndex: field.dataIndex,
    disabled: field.disabled,
    field,
    form: props.modelValue,
    loadOptions: (keyword?: string) => {
      void loadOptions(field, keyword);
    },
    loading: state.loading,
    options: getOptions(field),
    readonly: field.readonly,
    setKeyword: (keyword: string) => {
      state.keyword = keyword;
    },
    setValue: (value: unknown) => updateField(field, value),
    value: field.value,
  };
}

/** 生成 slot props，保证业务自定义渲染能复用组件动作。 */
function getSlotProps(field?: RuntimeSchemaFormField<T>): SchemaFormSlotProps<T> {
  return {
    collapsed: realCollapsed.value,
    field,
    form: props.modelValue,
    reset,
    setValue: field ? (value: unknown) => updateField(field, value) : undefined,
    submit,
    toggleCollapsed,
    value: field?.value,
  };
}

const actionSlotProps = computed(() => getSlotProps());

/** 获取字段 slot 名称。 */
function getFieldSlotName(field: RuntimeSchemaFormField<T>) {
  return `field-${field.key}`;
}

/** 获取 label slot 名称。 */
function getLabelSlotName(field: RuntimeSchemaFormField<T>) {
  return `label-${field.key}`;
}

/** 将 dataIndex 转成 Element Plus FormItem prop。 */
function getFormItemProp(field: RuntimeSchemaFormField<T>) {
  const path = dataIndexToPath(field.dataIndex);
  return path.length === 1 ? String(path[0]) : path.map(String);
}

/** 设置收起状态并同步事件。 */
function setCollapsed(value: boolean) {
  innerCollapsed.value = value;
  emit('update:collapsed', value);
}

/** 切换展开收起。 */
function toggleCollapsed() {
  setCollapsed(!realCollapsed.value);
}

/** 提交查询参数；普通 form 模式也允许父级通过 exposed submit 复用。 */
function submit() {
  const fields = runtimeFields.value.map((field) => ({
    dataIndex: field.dataIndex,
    search: field.column.search,
  }));
  emit(
    'submit',
    buildSubmitParams({
      fields,
      form: props.modelValue,
    }),
    props.modelValue,
  );
}

/** 重置表单值并清理校验状态。 */
function reset() {
  const nextValue = cloneFormValue(initialSnapshot.value);
  emit('update:modelValue', nextValue);
  emit('reset', nextValue);
  formRef.value?.clearValidate();
}

/** 自定义 action 点击处理。 */
function handleAction(key: string) {
  emit('action', key, props.modelValue);
}

defineExpose<SchemaFormExpose>({
  clearValidate: (...args) => formRef.value?.clearValidate(...args),
  reset,
  resetFields: (...args) => formRef.value?.resetFields(...args),
  submit,
  toggleCollapsed,
  validate: () => formRef.value?.validate() ?? Promise.resolve(true),
  validateField: (...args) =>
    formRef.value?.validateField(...args) ?? Promise.resolve(true),
});
</script>

<style lang="postcss" scoped>
:deep(.el-form-item) {
  margin-bottom: 0;
  min-width: 0;
}

:deep(.el-form-item__content) {
  min-width: 0;
}

.v-schema-form--search-inline :deep(.el-form-item) {
  flex-wrap: nowrap;
}

.v-schema-form--search-inline :deep(.el-form-item__label) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v-schema-form--search :deep(.el-input),
.v-schema-form--search :deep(.el-input-number),
.v-schema-form--search :deep(.el-select),
.v-schema-form--search :deep(.el-cascader) {
  width: 100%;
}

.v-schema-form__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

:deep(.el-date-editor),
:deep(.el-date-editor--daterange),
:deep(.el-date-editor--timerange) {
  --el-date-editor-width: 100%;
}
</style>
