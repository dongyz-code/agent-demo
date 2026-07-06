import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VSchemaForm from './index.vue';

import type { App, Component } from 'vue';
import type { SchemaFormColumn } from './type';

const mountedApps: App[] = [];

/** 挂载测试组件，并在 afterEach 中统一卸载。 */
function mount(component: Component) {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(component);
  app.mount(root);
  mountedApps.push(app);
  return root;
}

afterEach(() => {
  mountedApps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
});

describe('VSchemaForm', () => {
  it('渲染查询表单按钮并触发 submit', async () => {
    const onSubmit = vi.fn();

    const TestView = defineComponent({
      setup() {
        const form = ref({ username: 'dong' });
        const columns: SchemaFormColumn[] = [
          {
            dataIndex: 'username',
            title: '用户名',
            valueType: 'text',
          },
        ];
        return () =>
          h(VSchemaForm, {
            columns,
            mode: 'search',
            modelValue: form.value,
            'onUpdate:modelValue': (value) => {
              form.value = value as typeof form.value;
            },
            onSubmit,
            search: {
              columns: 2,
            },
          });
      },
    });

    const root = mount(TestView);
    await nextTick();

    expect(root.textContent).toContain('用户名');
    expect(root.textContent).toContain('搜索');
    expect(root.textContent).toContain('重置');

    const submitButton = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('搜索'),
    );
    submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onSubmit).toHaveBeenCalledWith({ username: 'dong' }, { username: 'dong' });
  });

  it('未显式传入 search 配置时仍渲染默认查询按钮', async () => {
    const TestView = defineComponent({
      setup() {
        const form = ref({ username: '' });
        const columns: SchemaFormColumn[] = [
          {
            dataIndex: 'username',
            title: '用户名',
            valueType: 'text',
          },
        ];
        return () =>
          h(VSchemaForm, {
            columns,
            mode: 'search',
            modelValue: form.value,
            'onUpdate:modelValue': (value) => {
              form.value = value as typeof form.value;
            },
          });
      },
    });

    const root = mount(TestView);
    await nextTick();

    expect(root.textContent).toContain('搜索');
    expect(root.textContent).toContain('重置');
  });

  it('未受控 collapsed 时可以切换展开收起', async () => {
    const TestView = defineComponent({
      setup() {
        const form = ref({});
        const columns: SchemaFormColumn[] = Array.from({ length: 9 }).map(
          (_, index) => ({
            dataIndex: `field_${index}`,
            title: `字段${index}`,
            valueType: 'text',
          }),
        );
        return () =>
          h(VSchemaForm, {
            columns,
            mode: 'search',
            modelValue: form.value,
            'onUpdate:modelValue': (value) => {
              form.value = value as typeof form.value;
            },
          });
      },
    });

    const root = mount(TestView);
    await nextTick();

    expect(root.textContent).toContain('展开');
    expect(root.textContent).not.toContain('字段8');

    const collapseButton = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('展开'),
    );
    collapseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(root.textContent).toContain('收起');
    expect(root.textContent).toContain('字段8');

    const expandButton = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('收起'),
    );
    expandButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(root.textContent).toContain('展开');
    expect(root.textContent).not.toContain('字段8');
  });

  it('内联操作区复用表单项结构对齐 label 和控件', async () => {
    const TestView = defineComponent({
      setup() {
        const form = ref({ username: '' });
        const columns: SchemaFormColumn[] = [
          {
            dataIndex: 'username',
            title: '用户名',
            valueType: 'text',
          },
        ];
        return () =>
          h(VSchemaForm, {
            columns,
            formProps: {
              labelPosition: 'top',
            },
            mode: 'search',
            modelValue: form.value,
            'onUpdate:modelValue': (value) => {
              form.value = value as typeof form.value;
            },
            search: {
              columns: 2,
            },
          });
      },
    });

    const root = mount(TestView);
    await nextTick();

    const actionItem = root.querySelector('.v-schema-form__actions-item');
    expect(actionItem?.classList.contains('el-form-item')).toBe(true);
    expect(actionItem?.querySelector('.el-form-item__label')).not.toBeNull();
    expect(
      actionItem?.querySelector('.el-form-item__content .v-schema-form__actions'),
    ).not.toBeNull();
  });

  it('默认通过 form item style 清理 Element Plus 底部间距', async () => {
    const TestView = defineComponent({
      setup() {
        const form = ref({ username: '' });
        const columns: SchemaFormColumn[] = [
          {
            dataIndex: 'username',
            title: '用户名',
            valueType: 'text',
          },
        ];
        return () =>
          h(VSchemaForm, {
            columns,
            modelValue: form.value,
            'onUpdate:modelValue': (value) => {
              form.value = value as typeof form.value;
            },
          });
      },
    });

    const root = mount(TestView);
    await nextTick();

    const item = root.querySelector('.el-form-item') as HTMLElement | null;
    expect(item?.style.marginBottom).toBe('0px');
  });

  it('允许通过 formItemProps.style 覆盖表单项底部间距', async () => {
    const TestView = defineComponent({
      setup() {
        const form = ref({ username: '' });
        const columns: SchemaFormColumn[] = [
          {
            dataIndex: 'username',
            formItemProps: {
              style: {
                marginBottom: '12px',
              },
            },
            title: '用户名',
            valueType: 'text',
          },
        ];
        return () =>
          h(VSchemaForm, {
            columns,
            modelValue: form.value,
            'onUpdate:modelValue': (value) => {
              form.value = value as typeof form.value;
            },
          });
      },
    });

    const root = mount(TestView);
    await nextTick();

    const item = root.querySelector('.el-form-item') as HTMLElement | null;
    expect(item?.style.marginBottom).toBe('12px');
  });

  it('支持按 dataIndex 覆盖字段 slot', async () => {
    const TestView = defineComponent({
      setup() {
        const form = ref({ username: 'dong' });
        const columns: SchemaFormColumn[] = [
          {
            dataIndex: 'username',
            title: '用户名',
            valueType: 'text',
          },
        ];
        return () =>
          h(
            VSchemaForm,
            {
              columns,
              modelValue: form.value,
              'onUpdate:modelValue': (value) => {
                form.value = value as typeof form.value;
              },
            },
            {
              'field-username': ({ value }: { value?: unknown }) =>
                h('span', { class: 'custom-field' }, `自定义:${String(value)}`),
            },
          );
      },
    });

    const root = mount(TestView);
    await nextTick();

    expect(root.querySelector('.custom-field')?.textContent).toBe('自定义:dong');
  });
});
