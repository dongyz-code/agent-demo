import { getKeys } from '@repo/utils-browser';

/** 静态数据，多用于 mapping 选项等 */
export function helperStatic<
  const T extends Record<string, [string | number | symbol | boolean, string][]>,
>(data: T) {
  const staticMapping = {} as {
    -readonly [key in keyof T]: Map<T[key][number][0], T[key][number][1]>;
  };

  const staticOptions = {} as {
    -readonly [key in keyof T]: {
      label: string;
      value: T[key][number][0];
    }[];
  };

  getKeys(data).forEach((key) => {
    staticMapping[key] = new Map(data[key]!);
    staticOptions[key] = data[key]!.map(([value, label]) => ({ label, value }));
  });

  return {
    staticMapping,
    staticOptions,
  };
}
