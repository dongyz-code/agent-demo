import { onMounted, onUnmounted, watch } from 'vue';
import isEqual from 'lodash-es/isEqual';
import { useElementVisibility, useDebounceFn } from '@vueuse/core';

import type { WatchHandle, ShallowRef } from 'vue';

/**
 * 监控条件变化进行数据请求的组件
 *
 * 1. 组件必须处在可视范围内
 * 2. 组件 onMounted 后，才进行时机监听，记得卸载
 * 3. 事件如果和上一次成功触发的事件完全一致，忽略
 * 4. 条件值为 undefined 时，忽略处理
 *
 */
export function useWatchCondition<T extends () => unknown>({
  label,
  condition,
  callback,
  element,
}: {
  /** 标记(可选) */
  label?: string;
  /** 元素 或者 自定义响应式 boolean */
  element: ShallowRef<HTMLElement | null | undefined> | ShallowRef<boolean>;
  /** 监听规则（类似计算属性，作为参数传递给 vue.watch） */
  condition: T;
  /** 回调 */
  callback: (opts: {
    label?: string;
    val: ReturnType<T>;
  }) => void | Promise<void>;
}) {
  const isVisible =
    typeof element.value === 'boolean'
      ? element
      : useElementVisibility(element);

  /** 是否设置过lastVal(没有设置过就是第一次执行) */
  let hasSetLastVal = false;
  /** 上一次的表单 */
  let lastVal: ReturnType<T> | undefined = undefined;
  /** 下一次待触发的表单，pop, 因为 callback 过程中可能会进来了新的条件(但始终保证队列长度不超过1) */
  let nextVal: ReturnType<T>[] = [];
  /** 是否正在执行 */
  let isRunning = false;

  let unwatchCondition: WatchHandle | undefined = undefined;
  let unwatchVisible: WatchHandle | undefined = undefined;

  /** 递归执行 */
  const run = async () => {
    if (!isVisible.value || isRunning || !nextVal.length) {
      return;
    }

    isRunning = true;

    try {
      const val = nextVal.pop()!;
      if (hasSetLastVal && isEqual(val, lastVal)) {
        console.log('useWatchCondition:', label, 'skip');
      } else {
        lastVal = val;
        hasSetLastVal = true;
        await callback({ val, label });
      }
    } finally {
      isRunning = false;
      await run();
    }
  };
  const debounceRun = useDebounceFn(run, 100);

  onMounted(() => {
    const handler = (val: unknown) => {
      nextVal = [val as ReturnType<T>];
      debounceRun();
    };
    unwatchCondition = watch(condition, handler, {
      immediate: true,
    });
    unwatchVisible = watch(isVisible, debounceRun, {
      immediate: true,
    });
  });

  onUnmounted(() => {
    unwatchCondition?.();
    unwatchVisible?.();
  });
}
