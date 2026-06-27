import type { SchemaFormDataIndex, SchemaFormModel } from './type';

/** 将 dataIndex 转成可遍历路径；点路径用于兼容 schema 写法，数组路径用于兼容 Element Plus prop。 */
export function dataIndexToPath<T extends SchemaFormModel>(
  dataIndex: SchemaFormDataIndex<T>,
): Array<string | number> {
  if (Array.isArray(dataIndex)) {
    return dataIndex;
  }
  const key = String(dataIndex);
  return key.includes('.') ? key.split('.') : [key];
}

/** 将 dataIndex 转成稳定字符串 key，用于 v-for、slot 名称和 option state 索引。 */
export function dataIndexToKey<T extends SchemaFormModel>(
  dataIndex: SchemaFormDataIndex<T>,
): string {
  return dataIndexToPath(dataIndex).join('.');
}

/** 从表单对象中按 dataIndex 读取值；路径不存在时返回 undefined。 */
export function getFormValue<T extends SchemaFormModel>(
  form: T,
  dataIndex: SchemaFormDataIndex<T>,
): unknown {
  return dataIndexToPath(dataIndex).reduce<unknown>((target, key) => {
    if (target === null || target === undefined || typeof target !== 'object') {
      return undefined;
    }
    return (target as Record<string | number, unknown>)[key];
  }, form);
}

/** 按 dataIndex 写入值，并返回新的浅拷贝表单对象；沿途对象也会复制，避免直接修改外部 modelValue。 */
export function setFormValue<T extends SchemaFormModel>(
  form: T,
  dataIndex: SchemaFormDataIndex<T>,
  value: unknown,
): T {
  const path = dataIndexToPath(dataIndex);
  const [firstKey] = path;
  if (firstKey === undefined) {
    return form;
  }

  const root = { ...form } as Record<string | number, unknown>;
  let cursor = root;

  path.slice(0, -1).forEach((key, index) => {
    const nextKey = path[index + 1];
    const oldValue = cursor[key];
    const nextValue =
      oldValue !== null && typeof oldValue === 'object'
        ? Array.isArray(oldValue)
          ? [...oldValue]
          : { ...(oldValue as Record<string | number, unknown>) }
        : typeof nextKey === 'number'
          ? []
          : {};
    cursor[key] = nextValue;
    cursor = nextValue as Record<string | number, unknown>;
  });

  const lastKey = path[path.length - 1]!;
  cursor[lastKey] = value;

  return root as T;
}

/** 深拷贝表单值，优先使用 structuredClone，失败时退回 JSON 拷贝以满足重置快照需求。 */
export function cloneFormValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 根据字段 transform 生成查询参数；未配置 transform 时使用字段路径 key 输出原值。 */
export function buildSubmitParams<T extends SchemaFormModel>({
  form,
  fields,
}: {
  /** 当前完整表单。 */
  form: T;
  /** 参与提交的字段。 */
  fields: {
    /** 字段路径。 */
    dataIndex: SchemaFormDataIndex<T>;
    /** 字段配置中的查询行为。 */
    search?: false | {
      /** 查询提交转换。 */
      transform?: (value: unknown, form: T) => Record<string, unknown>;
    };
  }[];
}): Record<string, unknown> {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    const value = getFormValue(form, field.dataIndex);
    const transform = field.search === false ? undefined : field.search?.transform;
    if (transform) {
      Object.assign(acc, transform(value, form));
      return acc;
    }
    acc[dataIndexToKey(field.dataIndex)] = value;
    return acc;
  }, {});
}
