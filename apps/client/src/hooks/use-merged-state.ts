import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

/** useMergedState 的可选配置，用于合并受控值、默认值和变化回调。 */
export type UseMergedStateOption<T> = {
  /** 受控值；为 undefined 时组件进入非受控模式。 */
  value?: T;
  /** 非受控初始值；只在首次渲染时生效。 */
  defaultValue?: T;
  /** 值变化回调；返回值不会影响合并结果。 */
  onChange?: (value: T, prevValue: T | undefined) => void;
};

/** useMergedState 返回的更新函数，支持直接赋值和基于前值计算。 */
export type UseMergedStateSetter<T> = Dispatch<SetStateAction<T>>;

/**
 * 合并受控与非受控状态的通用 Hook。
 *
 * 当 value 不为 undefined 时，外部 value 是唯一展示来源；当 value 为 undefined 时，
 * 内部状态从 defaultValue 或 defaultStateValue 初始化。两种模式下调用更新函数都会
 * 触发 onChange；受控模式不主动修改内部状态，由外部根据回调决定是否更新。
 *
 * @param defaultStateValue 非受控默认值，优先级低于 defaultValue。
 * @param option 受控值、默认值和变化回调配置。
 * @returns 合并后的值，以及受控/非受控通用的更新函数。
 */
export function useMergedState<T>(
  defaultStateValue?: T,
  option?: UseMergedStateOption<T>,
): [T | undefined, UseMergedStateSetter<T>] {
  const [innerValue, setInnerValue] = useState<T | undefined>(() => {
    if (option?.value !== undefined) {
      return option.value;
    }
    if (option?.defaultValue !== undefined) {
      return option.defaultValue;
    }
    return defaultStateValue;
  });
  const isControlled = option?.value !== undefined;
  const mergedValue = isControlled ? option?.value : innerValue;
  const latestStateRef = useRef({ mergedValue, isControlled, option });
  latestStateRef.current = { mergedValue, isControlled, option };

  const setMergedValue = useCallback<UseMergedStateSetter<T>>((action) => {
    const { mergedValue, isControlled, option } = latestStateRef.current;
    const nextValue =
      typeof action === 'function'
        ? (action as (prevValue: T | undefined) => T)(mergedValue)
        : action;

    if (!isControlled) {
      setInnerValue(nextValue);
    }
    option?.onChange?.(nextValue, mergedValue);
  }, []);

  return [mergedValue, setMergedValue];
}
