import { initGlobalEvent } from '@repo/ui';

import type { ApiMain } from '@/types';

export type AiAppEvent = {
  edit: (
    | {
        role: 'create';
      }
    | {
        role: 'update';
        id: string;
        form: Pick<ApiMain.AiAppItem, 'name' | 'desc' | 'domain'>;
      }
  ) & {
    /** 成功操作后的回调 */
    callback?: (
      val: Pick<ApiMain.AiAppItem, 'name' | 'desc' | 'domain'>,
    ) => void | Promise<void>;
  };
  upload: {
    id: string;
    /** 成功操作后的回调 */
    callback?: () => void | Promise<void>;
  };
  history: {
    id: string;
  };
};

export const aiAppEvent = initGlobalEvent<AiAppEvent>({ group: 'ai-app' });
