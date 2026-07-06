import {
  defineComponent,
  watch,
  computed,
  toRefs,
  shallowRef,
  ref,
  nextTick,
} from 'vue';
import { deepCopy, getKeys } from '@repo/utils-browser';
import { useOptions } from './static';
import { useVModels } from '@vueuse/core';
import { VDialog, VSchemaForm } from '@repo/ui';
import { ElButton } from 'element-plus';

import type { SchemaFormColumn, SchemaFormExpose } from '@repo/ui';
import type { PropType } from 'vue';
import type { Item, OptionsProps } from '../../types';

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
  components: { VDialog, VSchemaForm, ElButton },
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
    const formRef = ref<SchemaFormExpose>();

    const set = () => {
      form.value = getVal();
    };

    /** ------------ watch ------------ */
    watch(data, set);
    watch(visible, async (val) => {
      if (val) {
        set();
        await nextTick();
        formRef.value?.clearValidate();
      }
    });

    const { allOptions, ...useOptionsRest } = useOptions();
    const roleOptions = computed(() => allOptions.value.role);

    const formColumns = computed<SchemaFormColumn<Item>[]>(() => {
      const list: SchemaFormColumn<Item>[] = [
        {
          dataIndex: 'nickname',
          fieldProps: {
            placeholder: '请输入姓名',
          },
          formItemProps: {
            required: true,
            rules: [
              {
                message: '请输入姓名',
                required: true,
                trigger: 'blur',
              },
            ],
          },
          title: '姓名',
          valueType: 'text',
        },
        {
          dataIndex: 'username',
          formItemProps: {
            required: true,
            rules: [
              {
                message: '请输入K账户',
                required: true,
                trigger: 'blur',
              },
            ],
          },
          title: 'K账户',
          valueType: 'text',
        },
        {
          dataIndex: 'email',
          fieldProps: {
            placeholder: '请输入邮箱',
          },
          formItemProps: {
            required: true,
            rules: [
              {
                message: '请输入邮箱',
                required: true,
                trigger: 'blur',
              },
            ],
          },
          title: '邮箱',
          valueType: 'text',
        },
        {
          dataIndex: 'password',
          fieldProps: {
            placeholder: '请输入密码',
          },
          formItemProps: {
            required: !props.data,
            rules: props.data
              ? []
              : [
                  {
                    message: '请输入密码',
                    required: true,
                    trigger: 'blur',
                  },
                ],
          },
          title: '密码',
          valueType: 'text',
        },
        {
          dataIndex: 'role_id',
          data: {
            type: 'select',
            options: roleOptions,
            props: {
              multiple: true,
              placeholder: '请选择角色',
            },
          },
          formItemProps: {
            required: true,
            rules: [
              {
                message: '请选择角色',
                min: 1,
                required: true,
                trigger: 'change',
                type: 'array',
              },
            ],
          },
          title: '角色',
        },
      ];

      if (props.fields?.length) {
        const fields = new Set(props.fields);
        return list.filter((item) => fields.has(item.dataIndex as keyof Item));
      }

      return list;
    });

    /**
     * 执行 schema-form 的 Element Plus 表单校验，并提交当前可编辑字段。
     *
     * @returns 校验未通过时直接结束；校验通过后触发 `form` 事件。
     */
    async function submit() {
      const valid = await formRef.value?.validate().catch(() => false);
      if (!valid) {
        return;
      }

      const allItems = formColumns.value;

      const filterKeys: NonNullable<typeof props.fields> = props.fields?.length
        ? props.fields
        : allItems.map((item) => item.dataIndex as keyof Item);

      const obj = filterKeys.reduce((acc, key) => {
        acc[key] = form.value[key];
        return acc;
      }, {} as any);

      emit('form', obj);
    }

    return {
      form,
      formRef,
      formColumns,
      visible,
      submit,
      ...useOptionsRest,
    };
  },
});
