import { defineComponent, ref, watch, computed, toRefs, nextTick } from 'vue';
import { deepCopy } from '@repo/utils-browser';
import { notify } from '@/utils';
import {
  adminPermissionTree,
  isAdminPermissionKey,
  normalizeAdminPermissionKeys,
} from '@repo/shared/permission';

import { VDialog, VSchemaForm } from '@repo/ui';
import { ElButton, ElInput, ElTree } from 'element-plus';

import type { RoleItem } from '@/types';
import type { PropType } from 'vue';
import type { SchemaFormColumn } from '@repo/ui';
import type { AdminPermissionNode } from '@repo/shared/permission';

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
  const tree = computed(() => adminPermissionTree);
  const treeRef = ref<InstanceType<typeof ElTree>>();
  const filterText = ref('');
  const checkedKeys = ref<string[]>([]);

  /**
   * 同步树组件当前选中的业务权限 key。
   *
   * @returns 设置完成后结束。
   */
  async function syncCheckedKeys() {
    const keys = treeRef.value
      ? treeRef.value.getCheckedKeys(false).map(String)
      : [];
    await setCheckedKeys(keys);
  }

  const checked = computed(() => {
    return normalizeAdminPermissionKeys(checkedKeys.value);
  });

  /**
   * 设置树组件选中状态。
   *
   * @param keys 需要选中的权限 key，会先过滤未知 key。
   * @returns 设置完成后结束。
   */
  async function setCheckedKeys(keys: string[]) {
    checkedKeys.value = normalizeAdminPermissionKeys(keys);
    await nextTick();
    treeRef.value?.setCheckedKeys(checkedKeys.value, false);
  }

  /**
   * 根据搜索词过滤权限节点。
   *
   * @param value 搜索关键词。
   * @param data 当前权限树节点。
   * @returns 命中 key 或中文标签时返回 true。
   */
  function filterNode(value: string, data: AdminPermissionNode) {
    const keyword = value.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return (
      data.label.toLowerCase().includes(keyword) ||
      data.key.toLowerCase().includes(keyword)
    );
  }

  watch(filterText, (value) => {
    treeRef.value?.filter(value);
  });

  return {
    tree,
    treeRef,
    filterText,
    filterNode,
    checked,
    syncCheckedKeys,
    setCheckedKeys,
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
    canEditBase: {
      type: Boolean,
      default: true,
    },
    canEditPermission: {
      type: Boolean,
      default: true,
    },
  },
  components: {
    VSchemaForm,
    VDialog,
    ElButton,
    ElInput,
    ElTree,
  },
  setup(props, { emit }) {
    const { data, formKey, modelValue } = toRefs(props);
    const useFormRes = useRole();
    const treeProps = computed(() => ({
      label: 'label',
      children: 'children',
      disabled: () => !props.canEditPermission,
    }));

    const get = () => (props.data ? deepCopy(props.data) : getDefaultItem());
    const form = ref<Item>(get());
    const set = async () => {
      form.value = get();
      const pages = ((form.value.permission ?? []) as string[]).filter(
        isAdminPermissionKey,
      );
      await useFormRes.setCheckedKeys(pages);
    };

    watch(data, set);
    watch(formKey, set);
    watch(modelValue, set);

    const formColumns = computed<SchemaFormColumn<Item>[]>(() => [
      {
        dataIndex: 'name',
        fieldProps: {
          disabled: !props.canEditBase,
        },
        formItemProps: {
          required: true,
        },
        title: '角色名称',
        valueType: 'text',
      },
      {
        dataIndex: 'desc',
        fieldProps: {
          disabled: !props.canEditBase,
        },
        formItemProps: {
          required: true,
        },
        title: '角色描述',
        valueType: 'text',
      },
    ]);

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
      formColumns,
      emit,
      submit,
      treeProps,
      ...useFormRes,
      emitData,
    };
  },
});
