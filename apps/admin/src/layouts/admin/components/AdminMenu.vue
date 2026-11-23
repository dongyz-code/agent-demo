<template>
  <div :class="style" class="h-full w-full overflow-x-hidden">
    <el-menu
      :mode="store.$state.NAV_MODE"
      :collapse="store.$state.NAV_COLLAPSE"
      :show-timeout="50"
      :default-active="current"
      popper-class="admin-el-menu-popper rounded-lg! shadow! border-none!"
      :popper-offset="4"
      class="h-full! w-full"
      router
      :default-openeds="openedIndexes"
      :collapse-transition="false"
    >
      <menu-item
        v-for="item in items"
        :key="item.index"
        :item="item"
      ></menu-item>
    </el-menu>
  </div>
</template>
<script setup lang="ts">
import { ElMenu, ElMenuItem, ElSubMenu } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { defineComponent, computed, h } from 'vue';
import { VIcon } from '@repo/ui';
import { useStore } from '@/models';

import type { Props, MenuItem } from '../types';
import type { PropType, VNode } from 'vue';

const props = defineProps<Props>();

const store = useStore();
const route = useRoute();
const router = useRouter();
const current = computed(() => route.path);

type Item = MenuItem<
  string,
  {
    index: string;
    indexs: string[];
    /** 存在的时候，点击会跳转默认路由(sub-menu) */
    firstChildValue?: string;
    opened?: boolean;
  }
>;

function getItems(
  items: MenuItem[],
  prefixs: string[] = [],
): {
  items: Item[];
  firstChild: string | undefined;
} {
  let firstChild: string | undefined = undefined;
  const itemNext = items.map((item, i) => {
    const indexs = [...prefixs, i + ''];
    let index = indexs.join('.');

    if ('value' in item) {
      index = router.resolve({ name: item.value }).path;
      if (!firstChild) {
        firstChild = item.value;
      }
    }

    const itemNext = {
      index,
      indexs,
      ...item,
    } as Item;

    if ('children' in item) {
      const { items, firstChild: val } = getItems(item.children, indexs);

      if (!firstChild) {
        firstChild = val;
      }

      return {
        ...itemNext,
        children: items,
        firstChildValue: val,
      };
    }

    return itemNext;
  });

  return {
    items: itemNext,
    firstChild,
  };
}

const items = computed(() => getItems(props.items).items);
const openedIndexes = computed(() =>
  items.value.flatMap((item) =>
    'opened' in item && item.opened ? [item.index] : [],
  ),
);

const MenuItem = defineComponent({
  props: {
    item: {
      type: Object as PropType<Item>,
      required: true,
    },
    depth: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    return () => {
      const { item } = props;
      const { label, icon } = item;

      const labelNodes: (VNode | string)[] = [];
      if (icon) {
        labelNodes.push(h(VIcon, { icon }));
      }
      if (
        store.$state.NAV_MODE === 'vertical' &&
        store.$state.NAV_COLLAPSE &&
        props.depth === 0
      ) {
        //
      } else {
        labelNodes.push(label);
      }

      const labelRender = h(
        'div',
        {
          class: 'flex items-center gap-2 h-full w-full',
        },
        labelNodes,
      );

      if ('children' in item) {
        return h(
          ElSubMenu,
          { index: item.index },
          {
            default: () =>
              item.children.map((item) =>
                h(MenuItem, { item, depth: props.depth + 1 }),
              ),
            title: () => labelRender,
          },
        );
      }

      return h(ElMenuItem, { index: item.index }, () => labelRender);
    };
  },
});

const style = computed(() => {
  const { NAV_MODE } = store.$state;
  if (NAV_MODE === 'vertical') {
    return 'h-full min-h-0 w-full overflow-y-auto bg-white';
  }
  return '';
});
</script>

<style lang="postcss">
.admin-el-menu-popper {
  .el-menu--popup {
    border-radius: 8px !important;
    box-shadow: none !important;
  }
}
</style>
