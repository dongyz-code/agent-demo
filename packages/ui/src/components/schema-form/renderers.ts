import { defineComponent, h } from 'vue';
import {
  ElButton,
  ElCascader,
  ElCheckbox,
  ElCheckboxGroup,
  ElDatePicker,
  ElInput,
  ElInputNumber,
  ElOption,
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
} from 'element-plus';

import type {
  SchemaFormModel,
  SchemaFormOption,
  SchemaRendererCtx,
} from './type';
import type { Component, PropType, VNode } from 'vue';

const looseElButton = ElButton as unknown as Component;
const looseElCascader = ElCascader as unknown as Component;
const looseElCheckbox = ElCheckbox as unknown as Component;
const looseElCheckboxGroup = ElCheckboxGroup as unknown as Component;
const looseElDatePicker = ElDatePicker as unknown as Component;
const looseElInput = ElInput as unknown as Component;
const looseElInputNumber = ElInputNumber as unknown as Component;
const looseElOption = ElOption as unknown as Component;
const looseElRadio = ElRadio as unknown as Component;
const looseElRadioGroup = ElRadioGroup as unknown as Component;
const looseElSelect = ElSelect as unknown as Component;
const looseElSwitch = ElSwitch as unknown as Component;

/** 调用可能存在的事件函数，避免覆盖业务传入的 Element Plus 事件。 */
function callMaybe(fn: unknown, ...args: unknown[]) {
  if (typeof fn === 'function') {
    (fn as (...args: unknown[]) => void)(...args);
  }
}

/** 合并通用控件 props，并处理只读降级。 */
function buildControlProps<T extends SchemaFormModel>({
  ctx,
  extra,
  supportsReadonly,
}: {
  /** 当前渲染上下文。 */
  ctx: SchemaRendererCtx<T>;
  /** 控件特有 props。 */
  extra?: Record<string, unknown>;
  /** 控件是否原生支持 readonly。 */
  supportsReadonly?: boolean;
}) {
  const readonlyAsDisabled = ctx.readonly && !supportsReadonly;
  return {
    ...ctx.field.fieldProps,
    ...extra,
    class: ['w-full', ctx.field.fieldProps.class, extra?.class],
    disabled: ctx.disabled || readonlyAsDisabled,
    modelValue: ctx.value,
    readonly: supportsReadonly ? ctx.readonly : undefined,
    'onUpdate:modelValue': ctx.setValue,
  };
}

/** 渲染选项 slot，优先使用业务 render，否则回退 label。 */
function renderOptionContent(option: SchemaFormOption) {
  if (option.render) {
    return typeof option.render === 'function' ? option.render : () => option.render;
  }
  return () => option.label;
}

/** 渲染 select 控件，request 字段会启用远程搜索。 */
function renderSelect<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
  props: Record<string, unknown> = {},
): VNode {
  const { onFocus, remoteMethod, ...rest } = {
    ...props,
    ...ctx.field.fieldProps,
  };
  const hasRequest = Boolean(ctx.field.column.request);
  return h(
    looseElSelect,
    {
      ...buildControlProps({
        ctx,
        extra: {
          ...rest,
          filterable: rest.filterable ?? hasRequest,
          loading: Boolean(rest.loading) || ctx.loading,
          remote: rest.remote ?? hasRequest,
          remoteMethod(keyword: string) {
            ctx.setKeyword(keyword);
            if (hasRequest) {
              ctx.loadOptions(keyword);
            }
            callMaybe(remoteMethod, keyword);
          },
          onFocus(...args: unknown[]) {
            ctx.loadOptions();
            callMaybe(onFocus, ...args);
          },
        },
      }),
    },
    () =>
      ctx.options.map((option) =>
        h(
          looseElOption,
          {
            disabled: option.disabled,
            key: String(option.value),
            label: option.label,
            value: option.value,
          },
          renderOptionContent(option),
        ),
      ),
  );
}

/** 渲染 date-picker 控件，dateRange 会自动指定 daterange。 */
function renderDatePicker<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
  props: Record<string, unknown> = {},
): VNode {
  return h(
    looseElDatePicker,
    buildControlProps({
      ctx,
      extra: {
        unlinkPanels: true,
        ...props,
      },
      supportsReadonly: true,
    }),
  );
}

/** 渲染 checkbox-group 控件。 */
function renderCheckbox<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
  props: Record<string, unknown> = {},
): VNode {
  return h(
    looseElCheckboxGroup,
    buildControlProps({ ctx, extra: props }),
    () =>
      ctx.options.map((option) =>
        h(
          looseElCheckbox,
          {
            disabled: option.disabled,
            key: String(option.value),
            value: option.value,
          },
          () => option.label,
        ),
      ),
  );
}

/** 渲染 radio-group 控件。 */
function renderRadio<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
  props: Record<string, unknown> = {},
): VNode {
  return h(
    looseElRadioGroup,
    buildControlProps({ ctx, extra: props }),
    () =>
      ctx.options.map((option) =>
        h(
          looseElRadio,
          {
            disabled: option.disabled,
            key: String(option.value),
            value: option.value,
          },
          () => option.label,
        ),
      ),
  );
}

/** 渲染 cascader 控件，打开时会尝试触发选项加载。 */
function renderCascader<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
  props: Record<string, unknown> = {},
): VNode {
  const { onVisibleChange, onFocus, ...rest } = {
    ...props,
    ...ctx.field.fieldProps,
  };
  return h(
    looseElCascader,
    buildControlProps({
      ctx,
      extra: {
        ...rest,
        loading: Boolean(rest.loading) || ctx.loading,
        options: ctx.options,
        onFocus(...args: unknown[]) {
          ctx.loadOptions();
          callMaybe(onFocus, ...args);
        },
        onVisibleChange(visible: boolean) {
          if (visible) {
            ctx.loadOptions();
          }
          callMaybe(onVisibleChange, visible);
        },
      },
    }),
  );
}

/** 使用新 valueType 渲染字段。 */
function renderValueTypeControl<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
): VNode | string | null {
  if (ctx.field.column.renderFormItem) {
    return ctx.field.column.renderFormItem(ctx);
  }

  if (ctx.field.valueType === 'text') {
    return h(looseElInput, buildControlProps({ ctx, supportsReadonly: true }));
  }
  if (ctx.field.valueType === 'textarea') {
    return h(
      looseElInput,
      buildControlProps({
        ctx,
        extra: { type: 'textarea' },
        supportsReadonly: true,
      }),
    );
  }
  if (ctx.field.valueType === 'password') {
    return h(
      looseElInput,
      buildControlProps({
        ctx,
        extra: { showPassword: true, type: 'password' },
        supportsReadonly: true,
      }),
    );
  }
  if (ctx.field.valueType === 'number') {
    return h(looseElInputNumber, buildControlProps({ ctx }));
  }
  if (ctx.field.valueType === 'select') {
    return renderSelect(ctx);
  }
  if (ctx.field.valueType === 'date') {
    return renderDatePicker(ctx);
  }
  if (ctx.field.valueType === 'dateRange') {
    return renderDatePicker(ctx, {
      endPlaceholder: '结束日期',
      startPlaceholder: '开始日期',
      type: 'daterange',
    });
  }
  if (ctx.field.valueType === 'switch') {
    return h(looseElSwitch, buildControlProps({ ctx }));
  }
  if (ctx.field.valueType === 'radio') {
    return renderRadio(ctx);
  }
  if (ctx.field.valueType === 'checkbox') {
    return renderCheckbox(ctx);
  }
  if (ctx.field.valueType === 'cascader') {
    return renderCascader(ctx);
  }
  return null;
}

/** 使用旧 FormItem data 渲染字段。 */
function renderLegacyControl<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
): VNode | string | null {
  const data = ctx.field.column.data;
  if (!data) {
    return null;
  }
  const propsData = {
    modelValue: ctx.value,
    'onUpdate:modelValue': ctx.setValue,
  };

  if (data.type === 'input') {
    return h(
      looseElInput,
      buildControlProps({
        ctx,
        extra: data.props as Record<string, unknown>,
        supportsReadonly: true,
      }),
    );
  }
  if (data.type === 'input-number') {
    return h(
      looseElInputNumber,
      buildControlProps({
        ctx,
        extra: data.props as Record<string, unknown>,
      }),
    );
  }
  if (data.type === 'select') {
    return renderSelect(ctx, data.props as Record<string, unknown>);
  }
  if (data.type === 'date-picker') {
    return renderDatePicker(ctx, data.props as Record<string, unknown>);
  }
  if (data.type === 'button') {
    return h(
      looseElButton,
      {
        disabled: ctx.disabled,
        type: 'primary',
        ...(data.props as Record<string, unknown>),
        ...ctx.field.fieldProps,
      },
      () => data.text,
    );
  }
  if (data.type === 'custom') {
    return data.render?.(propsData) ?? String(ctx.value ?? '');
  }
  if (data.type === 'component') {
    return h(data.component, {
      ...ctx.field.fieldProps,
      ...propsData,
      disabled: ctx.disabled,
      props: data.props,
    });
  }
  if (data.type === 'switch') {
    return h(
      looseElSwitch,
      buildControlProps({
        ctx,
        extra: data.props as Record<string, unknown>,
      }),
    );
  }
  if (data.type === 'check-box-group') {
    return renderCheckbox(ctx, data.props as Record<string, unknown>);
  }
  if (data.type === 'radio-group') {
    return renderRadio(ctx, data.props as Record<string, unknown>);
  }
  if (data.type === 'cascader') {
    return renderCascader(ctx, data.props as Record<string, unknown>);
  }
  return null;
}

/** 根据字段来源选择旧 data 或新 valueType renderer。 */
export function renderSchemaControl<T extends SchemaFormModel>(
  ctx: SchemaRendererCtx<T>,
): VNode | string | null {
  if (ctx.field.useLegacyData) {
    return renderLegacyControl(ctx);
  }
  return renderValueTypeControl(ctx);
}

/** 模板中使用的字段渲染组件，把 renderer registry 封装成 Vue component。 */
export const SchemaFieldRenderer = defineComponent({
  name: 'SchemaFieldRenderer',
  props: {
    ctx: {
      required: true,
      type: Object as PropType<SchemaRendererCtx<any>>,
    },
  },
  setup(props) {
    return () => renderSchemaControl(props.ctx);
  },
});
