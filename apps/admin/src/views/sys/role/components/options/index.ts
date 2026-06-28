import { defineComponent, ref, watch, computed, toRefs } from 'vue';
import { deepCopy } from '@repo/utils-browser';
import { allP, allKeys } from '@/permission';
import { notify } from '@/plugins/notify';

import { VFormItems, VDialog, VTabs } from '@repo/ui';
import { ElButton } from 'element-plus';
import VCheckBox from '../checkbox/index.vue';

import type { RoleItem } from '@/types';
import type { PropType } from 'vue';
import type { FormItem } from '@repo/ui';
import type { PKey, TreePanel } from '@/permission';

export type Item = Pick<RoleItem, 'name' | 'desc' | 'permission'>;

const getDefaultItem = () => {
  const item: Required<Item> = {
    name: '',
    desc: '',
    permission: [],
  };
  return item;
};

function useRole() {
  const checkVal = ref<Record<string, boolean>>({});
  const tree = computed(() => allP);

  function getParents(key: string): string[] {
    const parents: string[] = [];
    function findParent(nodes: TreePanel[], prefix = ''): boolean {
      for (const node of nodes) {
        const nodeKey = node.key;
        if (nodeKey === key) {
          return true;
        }
        if (node.childs) {
          if (findParent(node.childs, nodeKey + '.')) {
            parents.push(nodeKey);
            return true;
          }
        }
      }
      return false;
    }
    findParent(allP);
    return parents;
  }

  function getChildren(key: string): string[] {
    const children: string[] = [];
    function collect(nodes: TreePanel[]) {
      for (const node of nodes) {
        if (node.key.startsWith(key + '.')) {
          children.push(node.key);
          if (node.childs) collect(node.childs);
        } else if (node.childs) {
          collect(node.childs);
        }
      }
    }
    collect(allP);
    return children;
  }

  function nodeCheck({ key, val }: { key: PKey; val: boolean }) {
    checkVal.value[key] = val;
    if (val) {
      getParents(key).forEach((p) => {
        checkVal.value[p] = true;
      });
      getChildren(key).forEach((c) => {
        checkVal.value[c] = true;
      });
    } else {
      getChildren(key).forEach((c) => {
        checkVal.value[c] = false;
      });
    }
  }

  const checked = computed(() => {
    const val = checkVal.value;

    const pages = Object.keys(val).filter((x) => allKeys[x as PKey] && val[x]);

    return pages;
  });

  return {
    tree,
    checkVal,
    nodeCheck,
    checked,
  };
}

export const setup = defineComponent({
  emits: ['form', 'update:modelValue'],
  props: {
    data: {
      type: Object as PropType<Item>,
    },
    modelValue: {
      type: Boolean,
      required: true,
    },
    title: {
      type: String,
    },
    formKey: {
      type: String,
    },
  },
  components: {
    VCheckBox,
    VFormItems,
    VDialog,
    VTabs,
    ElButton,
  },
  setup(props, { emit }) {
    const keysLimit = computed(() => {
      return allKeys;
    });

    const { data, formKey, modelValue } = toRefs(props);
    const useFormRes = useRole();

    const get = () => (props.data ? deepCopy(props.data) : getDefaultItem());
    const form = ref<Item>(get());
    const set = () => {
      form.value = get();
      useFormRes.checkVal.value = {};
      const pages = ((form.value.permission ?? []) as string[]).filter(
        (x) => keysLimit.value[x as keyof typeof keysLimit.value],
      );
      pages.forEach((key) => {
        useFormRes.checkVal.value[key] = true;
      });
    };

    watch(data, set);
    watch(formKey, set);
    watch(modelValue, set);

    const formOptions: FormItem<keyof Item>[][] = [
      [
        {
          label: '角色名称',
          data: {
            type: 'input',
          },
          key: 'name',
          required: true,
        },
      ],
      [
        {
          label: '角色描述',
          data: {
            type: 'input',
          },
          key: 'desc',
          required: true,
        },
      ],
    ];

    const emitData = computed(() => {
      const { name, desc } = form.value;
      return {
        name: name.trim(),
        desc: (desc ?? '').trim(),
        permission: useFormRes.checked.value,
      };
    });

    /** 保存 */
    function submit() {
      const { name, desc } = emitData.value;
      if (!name) {
        return notify('error', '角色名称不能为空');
      }
      if (!desc) {
        return notify('error', '角色描述不能为空');
      }

      emit('form', emitData.value);
    }

    return {
      form,
      formOptions,
      emit,
      submit,
      ...useFormRes,
      emitData,
    };
  },
});
