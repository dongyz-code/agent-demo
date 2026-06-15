import { ref, watch, shallowRef, computed, isRef } from 'vue';
import { arrObject, numSplit } from '@repo/utils-browser';

import type { Ref, VNode } from 'vue';
import type { FormItem, ComputedRefWrap } from './type';

/** select 最多显示 MAX 个 */
const SELECT_MAX_COUNT = 50;

type OptionItem = {
  label: string;
  value: string | number;
  disabled?: boolean;
  render?: () => VNode;
};

/** 异步 options 处理 */
export function useOptions<T>({
  options,
  modelValue,
}: {
  options: Ref<FormItem>;
  modelValue: Ref<T>;
}) {
  /** 选项是否懒加载完毕 */
  const lazyStatus = shallowRef<boolean>(false);
  /** 临时选项是否懒加载完毕 */
  const lazyTempStatus = shallowRef<boolean>(false);
  /** 选项启动了懒加载 */
  const lazyPromise = shallowRef<Promise<unknown>>();
  /** 所有的选项（应该是数组） */
  const asyncOptions = shallowRef<ComputedRefWrap<OptionItem[]>>();
  /** 所有的选项 （按 value mapping ） */
  const asyncOptionsMapping = computed(() => {
    const val: ComputedRefWrap<unknown> = asyncOptions?.value ?? [];
    const list = (isRef(val) ? val.value : val) as OptionItem[];
    return arrObject(list, 'value');
  });

  /** 选项进行过滤 */
  const filterVal = ref('');

  const FILTRE_LABEL = (val: number) =>
    `请尝试搜索缩小范围，可用项 ${numSplit(
      val,
    )} 超过 ${SELECT_MAX_COUNT}，仅显示前 ${SELECT_MAX_COUNT} 项。`;

  /** 过滤后的选项 */
  const filterOptions = computed(() => {
    const { type } = options.value.data;
    const val = asyncOptions?.value ?? [];
    const list = (isRef(val) ? val.value : val) as OptionItem[];
    if (type === 'select') {
      const filterStr = filterVal.value.trim().toLowerCase();
      if (filterStr) {
        return list.filter((x) =>
          (x.label as string).toLowerCase().includes(filterStr),
        );
      }
      return list;
    }
    return list;
  });

  /** 已经选中的选项 */
  const selectedOptions = computed(() => {
    const list = Array.isArray(modelValue.value)
      ? modelValue.value
      : [modelValue.value];
    return list.map((x) => asyncOptionsMapping.value[x]!).filter(Boolean);
  });

  /** 需要额外添加的选项  */
  const needAddOptions = computed(() => {
    const { type } = options.value.data;
    if (type === 'select') {
      const len = filterOptions.value.length;
      if (len > SELECT_MAX_COUNT) {
        return [
          {
            label: FILTRE_LABEL(len),
            value: '_'.repeat(50),
            disabled: true,
          },
        ];
      }
    }
    return [];
  });

  /** 最终的选项 */
  const finalOptions = computed(() => {
    if (
      options.value.data.type === 'cascader' &&
      !lazyTempStatus.value &&
      !lazyStatus.value
    ) {
      return [
        {
          label: '加载中 ...',
          value: '加载中 ...',
          disabled: true,
        },
      ] as OptionItem[];
    }
    const { type } = options.value.data;

    let list = filterOptions.value;
    if (type === 'select') {
      list = list.slice(0, SELECT_MAX_COUNT);
      const except = arrObject(list, 'value');
      const restSelected = selectedOptions.value.filter(
        (x) => !except[x!.value as string],
      );
      return [
        ...needAddOptions.value,
        ...list,
        ...restSelected,
      ] as OptionItem[];
    }
    return list;
  });

  function getAsyncOptions() {
    if (lazyPromise.value) {
      return;
    }
    lazyPromise.value = new Promise((resolve) => {
      const { data } = options.value;

      const isOpt =
        data.type === 'select' ||
        data.type === 'cascader' ||
        data.type === 'check-box-group' ||
        data.type === 'radio-group';

      if (isOpt) {
        if (typeof data.options === 'function') {
          (data.options() as Promise<OptionItem[]>).then((data) => {
            asyncOptions.value = data;
            lazyStatus.value = true;
            resolve(1);
          });
        } else {
          asyncOptions.value = data.options as OptionItem[];
          lazyStatus.value = true;
          resolve(1);
        }
      } else {
        lazyStatus.value = true;
        resolve(1);
      }
    });
  }

  watch(
    options,
    () => {
      lazyStatus.value = false;
      lazyPromise.value = undefined;

      if ('lazy' in options.value.data && options.value.data.lazy) {
        if (typeof options.value.data.lazy === 'function') {
          const func = options.value.data.lazy as unknown as () => Promise<
            OptionItem[]
          >;
          /** 临时加载初始值, 仅一次性 */
          func().then(async (data) => {
            lazyTempStatus.value = true;
            asyncOptions.value = data;
          });
        } else if (
          (Array.isArray(modelValue.value) && modelValue.value.length) ||
          (modelValue.value !== null && modelValue.value !== undefined)
        ) {
          getAsyncOptions();
        }
      } else {
        getAsyncOptions();
      }
    },
    {
      immediate: true,
    },
  );

  return {
    getAsyncOptions,
    filterVal,
    lazyStatus,
    finalOptions,
  };
}
