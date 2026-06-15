import { h } from 'vue';
import { httpCache } from './cache';

type Item = NonNullable<typeof httpCache.user.data.value>[number];

export function handleSelectUserLabel(items: Item[]) {
  return items.map((self) => {
    const { user_id, email, nickname } = self;
    return {
      label: `${nickname} / ${email}`,
      value: user_id,
      render: h('span', {}, [
        h(
          'span',
          {
            class: 'inline-block ',
          },
          `${nickname} `,
        ),
        h(
          'span',
          {
            class: 'px-3 text-gray-300',
          },
          '/',
        ),
        h(
          'span',
          {
            class: '',
          },
          email ?? '-',
        ),
      ]),
      self,
    };
  });
}
