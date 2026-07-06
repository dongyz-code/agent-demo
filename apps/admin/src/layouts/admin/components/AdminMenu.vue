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
import { RouterLink } from 'vue-router';

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
        const titleRender = item.firstChildValue
          ? h(
              RouterLink,
              { to: { name: item.firstChildValue } },
              () => labelRender,
            )
          : labelRender;

        return h(
          ElSubMenu,
          { index: item.index },
          {
            default: () =>
              item.children.map((item) =>
                h(MenuItem, { item, depth: props.depth + 1 }),
              ),
            /** 默认 router 模式，submenu 自动继承 第一个子路由 */
            title: () => titleRender,
          },
        );
      }

      return h(ElMenuItem, { index: item.index }, () => labelRender);
    };
  },
});

const style = computed(() => {
  const { NAV_MODE, NAV_COLLAPSE } = store.$state;
  if (NAV_MODE === 'vertical') {
    if (NAV_COLLAPSE) {
      return '!w-[var(--header-height)] flex-shrink-0 border-r bg-white shadow-sm';
    }
    return '!w-[var(--menu-width)] flex-shrink-0 border-r bg-white shadow-sm';
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
