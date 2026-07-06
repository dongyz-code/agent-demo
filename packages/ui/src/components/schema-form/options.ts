import { isRef } from 'vue';

import type {
  NormalizedSchemaFormColumn,
  SchemaFormColumn,
  SchemaFormModel,
  SchemaFormOption,
  SchemaMaybeRef,
} from './type';

/** 字段选项加载状态，组件层按字段 key 保存。 */
export interface SchemaOptionState {
  /** 当前选项列表。 */
  items: SchemaFormOption[];
  /** 是否加载中。 */
  loading: boolean;
  /** 最近一次加载错误。 */
  error?: unknown;
  /** 请求序号，用于忽略过期响应。 */
  requestId: number;
  /** reloadOn 当前签名，用于判断是否需要重新请求。 */
  reloadSignature?: string;
  /** 最近一次远程搜索关键字。 */
  keyword?: string;
}

/** 创建默认选项状态。 */
export function createOptionState(): SchemaOptionState {
  return {
    items: [],
    loading: false,
    requestId: 0,
  };
}

/** 判断值是否是 Promise-like 对象。 */
export function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** 读取普通值、Ref 或 ComputedRef。 */
export function resolveMaybeRef<T>(value: SchemaMaybeRef<T>): T {
  return isRef(value) ? value.value : value;
}

/** 将 valueEnum 转换成标准 options。 */
export function valueEnumToOptions(
  valueEnum?: SchemaFormColumn['valueEnum'],
): SchemaFormOption[] {
  if (!valueEnum) {
    return [];
  }
  return Object.entries(valueEnum).map(([value, item]) => {
    if (typeof item === 'string') {
      return {
        label: item,
        value,
      };
    }
    return {
      disabled: item.disabled,
      label: item.text,
      value,
    };
  });
}

/** 将任意数组选项尽量转换成标准 options，同时保留额外字段。 */
export function normalizeOptions(options: unknown): SchemaFormOption[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options.map((item) => {
    if (item !== null && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const value = record.value as SchemaFormOption['value'];
      const label = record.label ?? record.text ?? String(value ?? '');
      const children = normalizeOptions(record.children);
      return {
        ...record,
        children: children.length ? children : undefined,
        disabled: Boolean(record.disabled),
        label: String(label),
        value,
      };
    }
    return {
      label: String(item),
      value: item as SchemaFormOption['value'],
    };
  });
}

/** 获取 column.data.options 原始来源。 */
export function getDataOptionsSource<T extends SchemaFormModel>(
  column: SchemaFormColumn<T>,
): unknown {
  if (!column.data || !('options' in column.data)) {
    return undefined;
  }
  return column.data.options;
}

/** 同步读取静态选项来源，适用于 valueEnum、数组、Ref 和 ComputedRef。 */
export function resolveStaticOptions<T extends SchemaFormModel>(
  field: NormalizedSchemaFormColumn<T>,
): SchemaFormOption[] | undefined {
  if (field.column.valueEnum) {
    return valueEnumToOptions(field.column.valueEnum);
  }

  const source = getDataOptionsSource(field.column);
  if (source === undefined || typeof source === 'function') {
    return undefined;
  }

  return normalizeOptions(resolveMaybeRef(source as SchemaMaybeRef<unknown>));
}

/** 读取 column.data.options，兼容同步函数、异步函数、Ref 和 ComputedRef。 */
export async function resolveDataOptions<T extends SchemaFormModel>(
  field: NormalizedSchemaFormColumn<T>,
): Promise<SchemaFormOption[]> {
  const source = getDataOptionsSource(field.column);
  if (source === undefined) {
    return [];
  }

  const raw = typeof source === 'function' ? source() : source;
  const resolved = isPromiseLike<unknown>(raw) ? await raw : raw;
  return normalizeOptions(resolveMaybeRef(resolved as SchemaMaybeRef<unknown>));
}

/** 计算 reloadOn 依赖签名；签名变化时才重新加载 request。 */
export function buildReloadSignature<T extends SchemaFormModel>({
  field,
  form,
  getValue,
}: {
  /** 当前字段。 */
  field: NormalizedSchemaFormColumn<T>;
  /** 当前表单。 */
  form: T;
  /** 根据 dataIndex 读取值的方法，由 value 模块提供。 */
  getValue: (form: T, dataIndex: SchemaFormColumn<T>['dataIndex']) => unknown;
}): string {
  return JSON.stringify(
    (field.column.reloadOn ?? []).map((dataIndex) => [
      dataIndex,
      getValue(form, dataIndex),
    ]),
  );
}
