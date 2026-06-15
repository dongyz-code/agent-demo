import type { FormItem } from '../form-item/type';

export type Props<T> = {
  options: FormItem[][];
  modelValue: T;
  /** grid 每行最大的单位长度 */
  gridMaxCols?: number;
} & Pick<
  FormItem,
  'labelAlign' | 'labelWidth' | 'labelClass' | 'labelWrap' | 'valueClass'
>;
