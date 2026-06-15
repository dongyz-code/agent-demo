import { defineComponent, h, shallowRef } from 'vue';
import Tabs from './index.vue';

import type { TabItem } from './type';
import type { ShallowRef } from 'vue';

export function useTabs<T extends TabItem>({
  options: _options,
  initial,
}: {
  options: T[];
  initial?: T | T['value'];
}) {
  const options = shallowRef(_options);

  const tab = shallowRef(
    initial
      ? typeof initial === 'string'
        ? _options.find((x) => x.value === initial)
        : initial
      : _options[0],
  ) as ShallowRef<T | undefined>;

  const VTabs = defineComponent({
    setup() {
      return () =>
        h(Tabs, {
          options: options.value,
          modelValue: tab.value,
          'onUpdate:modelValue'(val) {
            tab.value = val as T;
          },
        });
    },
  });

  return {
    tab,
    options,
    VTabs,
  };
}
