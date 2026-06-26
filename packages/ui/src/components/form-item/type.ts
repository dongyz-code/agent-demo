import type {
  ElSelect,
  ElButton,
  ElInput,
  ElSwitch,
  ElDatePicker,
  ElCheckboxGroup,
  ElRadioGroup,
  ElCascader,
  ElInputNumber,
} from 'element-plus';
import type { Component, ComputedRef, Ref, VNode } from 'vue';

/** options 选取相关 */
type SelectOptions<T = Record<string, unknown>> = (T & {
  label: string;
  value: string | number | boolean;
  disabled?: boolean;
})[];

type CascaderOptions = NonNullable<
  InstanceType<typeof ElCascader>['$props']['options']
>;

/** 懒加载, 如果有默认值，需要立刻加载，可以lazy设置为函数，如果不是就加载对应的 options 。之后触发 focus 等才继续加载 */
type Lazy<T> = boolean | (() => T[] | Promise<T[]>);

/** options */
export type ComputedRefWrap<T> = T | ComputedRef<T> | Ref<T>;

/** options 可能是计算属性或者函数 */
export type OptionsFnWrap<T> =
  | ComputedRefWrap<T>
  | (() => ComputedRefWrap<T> | Promise<ComputedRefWrap<T>>);

export type ComputedRefWrapToRef<T> =
  T extends OptionsFnWrap<infer U> ? U : never;

type FormType =
  | {
      /** 组件，默认传递 modelValue, 其它通过 props 传递 */
      type: 'component';
      component: Component;
      props?: unknown;
    }
  | {
      /** 自定义, 不填 render 默认是 String(modelValue) */
      type: 'custom';
      render?: (props: {
        modelValue: unknown;
        'onUpdate:modelValue': (val: unknown) => void;
      }) => VNode;
    }
  | {
      type: 'button';
      text: string;
      props?: InstanceType<typeof ElButton>['$props'];
    }
  | {
      type: 'select';
      options: OptionsFnWrap<
        SelectOptions<{
          render?: VNode | string | (() => VNode | string);
        }>
      >;
      props?: Omit<InstanceType<typeof ElSelect>['$props'], 'modelValue'>;
      lazy?: Lazy<
        SelectOptions<{
          render?: VNode | string | (() => VNode | string);
        }>
      >;
    }
  | {
      type: 'date-picker';
      props?: Omit<InstanceType<typeof ElDatePicker>['$props'], 'modelValue'>;
    }
  | {
      type: 'check-box-group';
      options: OptionsFnWrap<SelectOptions>;
      props?: Omit<
        InstanceType<typeof ElCheckboxGroup>['$props'],
        'modelValue'
      >;
    }
  | {
      type: 'switch';
      props?: Omit<InstanceType<typeof ElSwitch>['$props'], 'modelValue'>;
    }
  | {
      type: 'cascader';
      options: OptionsFnWrap<CascaderOptions>;
      props?: Omit<InstanceType<typeof ElCascader>['$props'], 'modelValue'>;
      lazy?: Lazy<CascaderOptions>;
    }
  | {
      type: 'input';
      props?: Omit<InstanceType<typeof ElInput>['$props'], 'modelValue'>;
    }
  | {
      type: 'input-number';
      props?: Omit<InstanceType<typeof ElInputNumber>['$props'], 'modelValue'>;
    }
  | {
      type: 'radio-group';
      /** slot */
      options: OptionsFnWrap<SelectOptions>;
      props?: Omit<InstanceType<typeof ElRadioGroup>['$props'], 'modelValue'>;
    };

/** 表单项 */
export type FormItem<T extends string = string> = {
  /** model value key */
  key: T;
  /** props */
  data: FormType;
  /**是否必需 */
  required?: boolean | Ref<boolean>;
  /**label */
  label?: string;
  /** label 宽度, style 绑定 */
  labelWidth?: number;
  /** label 对齐 */
  labelAlign?: 'left' | 'right';
  /** label 是否进行换行 */
  labelWrap?: boolean;
  /** 提示，挂载 label 上 */
  labelTips?: string;
  /** label css类 */
  labelClass?: string;
  /** value css类 */
  valueClass?: string;
  /** 第一位是 offset, 第二位是自身比例，默认 [0, 1]；如果是 number, offset 缺省为 1 */
  range?: [number, number] | number;
  /** 底部异常反馈 */
  verifyFunc?: (_: {
    /** 当前值 */
    self: unknown;
    /** 所有表单 */
    form: unknown;
  }) => string | null | undefined | Error;
  /** 是否隐藏，避免一直更新 v-if */
  hidden?: boolean | Ref<boolean>;
  /** 不可编辑 */
  disabled?: boolean | Ref<boolean>;
  /** props / emit modelvalue 的处理值 */
  modelValueChange?: {
    // emit
    set?: (val: unknown) => unknown;
    // props
    get?: (val: unknown) => unknown;
  };
  DEBUG?: boolean;
};
