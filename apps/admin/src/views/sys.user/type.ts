import type { UserItem } from '@/types';

export type Item = Pick<
  UserItem,
  'nickname' | 'email' | 'user_id' | 'username' | 'password'
> & {
  role_id: string[];
};

export type OptionsProps = {
  data: Item | Item[] | undefined;
  visible: boolean;
  fields: (keyof Item)[] | undefined;
};
