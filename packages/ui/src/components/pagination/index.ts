import { shallowRef, computed, defineComponent, h } from 'vue';
import VPagination from './index.vue';

import type { PageData, Props } from './type';

export function usePage({
  page,
  props,
}: {
  page?: Partial<PageData>;
  props?: Props;
} = {}) {
  const pageData = shallowRef<PageData>({
    total: 0,
    size: 10,
    current: 1,
    ...page,
  });

  const pageRange = computed(() => {
    const { current, size } = pageData.value;
    return [(current - 1) * size, current * size];
  });

  const pageComponent = defineComponent({
    emits: ['update:modelValue'],
    setup(_, { emit }) {
      return () =>
        h(VPagination, {
          modelValue: pageData.value,
          'onUpdate:modelValue'(val) {
            pageData.value = val;
            emit('update:modelValue');
          },
          ...props,
        });
    },
  });

  function setPageData(val: Partial<PageData>) {
    pageData.value = {
      ...pageData.value,
      ...val,
    };
  }

  return {
    setPageData,
    pageRange,
    pageComponent,
    pageData,
  };
}
