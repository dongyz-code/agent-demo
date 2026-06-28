import { defineComponent, type PropType } from 'vue';
import { ElCheckbox } from 'element-plus';

import type { TreePanel } from '@/permission';
import type { PType } from '@/permission/type';

export const setup = defineComponent({
  name: 'v-check-box',
  components: { ElCheckbox },
  emits: ['node-check'],
  props: {
    data: {
      type: Array as PropType<TreePanel[]>,
      default: () => [],
    },
    checkVal: {
      type: Object as PropType<Record<string, boolean>>,
      required: true,
    },
    depth: {
      type: Number,
      default: () => 0,
    },
  },
  setup(_props, { emit }) {
    function nodeCheck(...items: any[]) {
      emit('node-check', ...items);
    }

    function change(node: TreePanel, val: any) {
      emit('node-check', {
        key: node.key,
        val: Boolean(val),
      });
    }

    return {
      change,
      nodeCheck,
    };
  },
});
