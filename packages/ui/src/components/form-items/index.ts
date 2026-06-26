import { shallowRef, defineComponent, h, isRef, computed } from 'vue';
import VFormItems from './index.vue';
import { deepCopy } from '@repo/utils-browser';

import type { FormItem } from '../form-item/type';
import type { BeString } from '../../types';
import type { Props } from './props';
import type { ShallowRef, ComputedRef } from 'vue';

export type { FormItem } from '../form-item/type';
export { default as VFormItems } from './index.vue';

export function useFormItems<
  T extends Record<string, unknown>,
  Prefix extends string = '',
>({
  prefix,
  props,
  ...rest
}: {
  form: T;
  options:
    | FormItem<BeString<keyof T>>[][]
    | ((_: { form: ShallowRef<T> }) => FormItem<BeString<keyof T>>[][])
    | ComputedRef<FormItem<BeString<keyof T>>[][]>;
  prefix?: Prefix;
  props?: Omit<Props<T>, 'options' | 'modelValue'>;
}) {
  const initial = deepCopy(rest.form);

  const form: ShallowRef<T> = shallowRef(deepCopy(rest.form));

  const _options = rest.options;

  const options =
    typeof _options === 'function'
      ? computed(() => _options({ form }))
      : _options;

  const component = defineComponent({
    emits: ['update:modelValue'],
    setup(_props, { emit }) {
      return () =>
        h(VFormItems, {
          options: isRef(options) ? options.value : options,
          modelValue: form.value,
          'onUpdate:modelValue'(val) {
            form.value = val as T;
            emit('update:modelValue', val);
          },
          ...props,
        });
    },
  });

  /** 重置，默认恢复到初始值, 模板里请加上 () */
  function formClear(val?: T) {
    form.value = val ?? initial;
  }

  type FormKey = Prefix extends '' ? 'form' : `${Prefix}Form`;
  type OptionsKey = Prefix extends '' ? 'options' : `${Prefix}Options`;
  type ComponentKey = Prefix extends '' ? 'component' : `${Prefix}Component`;
  type ClearKey = Prefix extends '' ? 'formClear' : `${Prefix}FormClear`;

  type Main = {
    [key in FormKey]: typeof form;
  } & {
    [key in OptionsKey]: typeof options;
  } & {
    [key in ComponentKey]: typeof component;
  } & {
    [key in ClearKey]: typeof formClear;
  };

  const main = {
    [`${!prefix ? 'form' : prefix + 'Form'}`]: form,
    [`${!prefix ? 'options' : prefix + 'Options'}`]: options,
    [`${!prefix ? 'component' : prefix + 'Component'}`]: component,
    [`${!prefix ? 'formClear' : prefix + 'FormClear'}`]: formClear,
  } as Main;

  return main;
}
