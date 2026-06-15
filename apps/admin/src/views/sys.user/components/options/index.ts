import { defineComponent, watch, computed, toRefs, shallowRef } from 'vue';
import { arrObject, deepCopy, getKeys } from '@repo/utils-browser';
import { useOptions } from './static';
import { useVModels } from '@vueuse/core';
import { VDialog, VFormItems } from '@repo/ui';
import { ElButton } from 'element-plus';
import { notify } from '@/plugins/notify';

import type { FormItem } from '@repo/ui';
import type { PropType } from 'vue';
import type { Item, OptionsProps } from '../../type';

const getDefaultItem = () => {
  const item: Required<Item> = {
    nickname: '',
    email: '',
    role_id: [],
    user_id: '',
    username: '',
    password: '',
  };
  return item;
};

export const setup = defineComponent({
  components: { VDialog, VFormItems, ElButton },
  emits: ['form', 'update:visible'],
  props: {
    data: {
      /** 编辑已有用户是 Item， 批量设置是  Item[]，新建是 undefined */
      type: [Object, Array] as PropType<OptionsProps['data']>,
    },
    visible: {
      type: Boolean,
      required: true,
    },
    /** 限制可编辑和返回的字段 */
    fields: {
      type: Array as PropType<OptionsProps['fields']>,
    },
    title: {
      type: String,
    },
  },
  setup(props, { emit }) {
    const { visible } = useVModels(props, emit);
    const { data } = toRefs(props);

    function getVal() {
      const val = data.value;
      const base = getDefaultItem();
      if (!val) {
        return base;
      } else if (Array.isArray(val)) {
        /** 合并字段 */
        const keys = getKeys(base);
        keys.forEach((key) => {
          const list = [...new Set(val.map((x) => x[key]))];
          if (list.length === 1) {
            Object.assign(base, {
              [key]: list[0],
            });
          }
        });
        return base;
      } else {
        return deepCopy(val);
      }
    }
    const form = shallowRef(getVal());

    const set = () => {
      form.value = getVal();
    };

    /** ------------ watch ------------ */
    watch(data, set);
    watch(visible, (val) => {
      if (val) {
        set();
      }
    });

    function changeForm(val: Item) {
      form.value = val;
    }

    const { allOptions, ...useOptionsRest } = useOptions();

    const formOptions = computed(() => {
      const list: FormItem<keyof Item>[][] = [
        [
          {
            label: '姓名',
            placeholder: '请输入姓名',
            data: {
              type: 'input',
            },
            key: 'nickname',
            required: true,
            range: 3,
          },
          {
            label: 'K账户',
            data: {
              type: 'input',
            },
            key: 'username',
            required: true,
            range: 3,
          },
        ],
        [
          {
            label: '邮箱',
            placeholder: '请输入邮箱',
            data: {
              type: 'input',
            },
            key: 'email',
            required: true,
            range: 3,
          },
          {
            label: '密码',
            placeholder: '请输入密码',
            data: {
              type: 'input',
            },
            key: 'password',
            required: true,
            range: 3,
          },
        ],
        [
          {
            label: '角色',
            placeholder: '请选择角色',
            data: {
              type: 'select',
              options: computed(() => allOptions.value.role),
              props: {
                multiple: true,
              },
            },
            key: 'role_id',
            required: true,
          },
        ],
      ];

      /** 根据fields 过滤表单，保留原有结构 */
      if (props.fields?.length) {
        const fieldMap = arrObject(props.fields);
        return list
          .map((row) => row.filter((item) => fieldMap[item.key]))
          .filter((row) => row.length);
      }

      return list;
    });

    /** 保存 */
    function submit() {
      const allItems = formOptions.value.flat();

      const filterKeys: NonNullable<typeof props.fields> = props.fields?.length
        ? props.fields
        : allItems.map((item) => item.key);

      const validateItem = (item: FormItem<keyof Item>): string | null => {
        const value = form.value[item.key as keyof Item];

        if (props.fields?.length && !props.fields.includes(item.key)) {
          return null;
        }

        if (item.key === 'password') {
          if (!props.data && !value) {
            return '请输入密码';
          }
          return null;
        }

        if (item.required) {
          if (item.data.props?.multiple) {
            if (!value?.length) {
              return `请选择${item.label}`;
            }
          } else {
            if (!value) {
              return `请输入${item.label}`;
            }
          }
        }

        return null;
      };

      const errors = allItems
        .map(validateItem)
        .filter((error) => error !== null);

      if (errors.length) {
        notify('error', errors.join('\n'));
        return;
      }

      const obj = filterKeys.reduce((acc, key) => {
        acc[key] = form.value[key];
        return acc;
      }, {} as any);

      emit('form', obj);
    }

    return {
      form,
      formOptions,
      visible,
      submit,
      ...useOptionsRest,
      changeForm,
    };
  },
});
