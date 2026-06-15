import { getKeys, sleep } from '@repo/utils-browser';
import { shallowRef } from 'vue';

import type { ShallowRef } from 'vue';

/** loading */
export function loadingFunc<
  T extends Record<string, (...items: any[]) => Promise<any>>,
>({
  funcs,
  minDuration,
  waitLast = true,
}: {
  funcs: T;
  /** 至少等待 minDuration 才结束函数（ms） */
  minDuration?: number;
  /** 等待上一次函数执行完毕 */
  waitLast?: boolean;
}) {
  const loading = {} as Record<
    `${keyof T extends string ? keyof T : never}Loading`,
    ShallowRef<boolean>
  >;
  const obj = {} as T;

  getKeys(funcs).forEach((key) => {
    const loadingItem = shallowRef(false);
    loading[`${key as string}Loading` as keyof typeof loading] = loadingItem;

    const func = funcs[key];
    const callback = async (...items: Parameters<typeof func>) => {
      if (waitLast && loadingItem.value) {
        console.trace('loadingFunc waitLast');
        return;
      }
      loadingItem.value = true;
      try {
        const start = Date.now();
        const resp = await func!(...items);
        const end = Date.now();
        const duration = end - start;
        if (minDuration && duration < minDuration) {
          await sleep(minDuration - duration);
        }
        return resp;
      } finally {
        loadingItem.value = false;
      }
    };
    obj[key] = callback as typeof func;
  });

  return {
    ...obj,
    ...loading,
  };
}
