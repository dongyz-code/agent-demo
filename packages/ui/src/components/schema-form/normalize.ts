import { dataIndexToKey, getFormValue } from './value';

import type {
  NormalizedSchemaFormColumn,
  RuntimeSchemaFormField,
  SchemaFormColumn,
  SchemaFormColumnCtx,
  SchemaFormFieldDefaults,
  SchemaFormMode,
  SchemaFormModel,
  SchemaValueType,
} from './type';

/** 旧 FormItem data 类型到新 valueType 的保守映射，仅用于内部 renderer 选择。 */
const legacyTypeMap: Record<string, SchemaValueType> = {
  button: 'custom',
  cascader: 'cascader',
  'check-box-group': 'checkbox',
  component: 'custom',
  custom: 'custom',
  'date-picker': 'date',
  input: 'text',
  'input-number': 'number',
  'radio-group': 'radio',
  select: 'select',
  switch: 'switch',
};

/** 根据旧 data 或新 valueType 得到实际控件类型；旧 data 优先。 */
export function resolveValueType<T extends SchemaFormModel>(
  column: SchemaFormColumn<T>,
): SchemaValueType {
  if (column.data) {
    return legacyTypeMap[column.data.type] ?? 'custom';
  }
  return column.valueType ?? 'text';
}

/** 把外部 columns 转成内部稳定字段列表，并按当前 mode 过滤不可用字段。 */
export function normalizeColumns<T extends SchemaFormModel>({
  columns,
  mode,
}: {
  /** 原始字段配置。 */
  columns: SchemaFormColumn<T>[];
  /** 当前表单模式。 */
  mode: SchemaFormMode;
}): NormalizedSchemaFormColumn<T>[] {
  const list = columns
    .map<NormalizedSchemaFormColumn<T> | null>((column, index) => {
      if (mode === 'search' && column.search === false) {
        return null;
      }
      if (mode === 'form' && column.form === false) {
        return null;
      }
      return {
        column,
        dataIndex: column.dataIndex,
        index,
        key: dataIndexToKey(column.dataIndex),
        title: column.title,
        useLegacyData: Boolean(column.data),
        valueType: resolveValueType(column),
      };
    })
    .filter((item): item is NormalizedSchemaFormColumn<T> => item !== null);

  if (mode !== 'search') {
    return list;
  }

  return [...list].sort((a, b) => {
    const aOrder = a.column.search === false ? undefined : a.column.search?.order;
    const bOrder = b.column.search === false ? undefined : b.column.search?.order;
    return (aOrder ?? a.index) - (bOrder ?? b.index);
  });
}

/** 解析对象或函数形式配置；函数会接收当前字段上下文并参与 Vue 响应式追踪。 */
export function resolveMaybeFunction<T extends SchemaFormModel, R>({
  value,
  ctx,
  fallback,
}: {
  /** 原始配置值。 */
  value?: R | ((ctx: SchemaFormColumnCtx<T>) => R);
  /** 当前字段上下文。 */
  ctx: SchemaFormColumnCtx<T>;
  /** 未配置时的默认值。 */
  fallback: R;
}): R {
  if (typeof value === 'function') {
    return (value as (ctx: SchemaFormColumnCtx<T>) => R)(ctx);
  }
  return value ?? fallback;
}

/** 将 normalized 字段补充为运行时字段，合并动态状态、默认 props 和组件级禁用只读。 */
export function resolveRuntimeField<T extends SchemaFormModel>({
  field,
  form,
  fieldDefaults,
  disabled,
  readonly,
}: {
  /** 标准化字段。 */
  field: NormalizedSchemaFormColumn<T>;
  /** 当前完整表单。 */
  form: T;
  /** 组件级默认字段配置。 */
  fieldDefaults?: SchemaFormFieldDefaults;
  /** 组件级禁用状态。 */
  disabled?: boolean;
  /** 组件级只读状态。 */
  readonly?: boolean;
}): RuntimeSchemaFormField<T> {
  const value = getFormValue(form, field.dataIndex);
  const ctx: SchemaFormColumnCtx<T> = {
    column: field.column,
    dataIndex: field.dataIndex,
    form,
    value,
  };
  const formItemProps = {
    ...(fieldDefaults?.formItemProps ?? {}),
    ...resolveMaybeFunction({
      ctx,
      fallback: {},
      value: field.column.formItemProps,
    }),
  };
  const fieldProps = {
    ...(fieldDefaults?.fieldProps ?? {}),
    ...resolveMaybeFunction({
      ctx,
      fallback: {},
      value: field.column.fieldProps,
    }),
  };

  return {
    ...field,
    disabled:
      Boolean(disabled) ||
      Boolean(
        resolveMaybeFunction({
          ctx,
          fallback: false,
          value: field.column.disabled,
        }),
      ),
    fieldProps,
    formItemProps,
    hidden: Boolean(
      resolveMaybeFunction({
        ctx,
        fallback: false,
        value: field.column.hidden,
      }),
    ),
    readonly:
      Boolean(readonly) ||
      Boolean(
        resolveMaybeFunction({
          ctx,
          fallback: false,
          value: field.column.readonly,
        }),
      ),
    value,
  };
}
