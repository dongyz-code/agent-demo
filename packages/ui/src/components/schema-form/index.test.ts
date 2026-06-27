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
