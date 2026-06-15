import type { ApiMultAction } from '../../common/index.js';
import type { AiAppItem, AiAppVersionItem } from '../models.js';

export type { AiAppItem } from '../models.js';

export type AiAppUploadInfo = {
  /** 应用ID */
  id: string;
  /** hash值 */
  hash: string;
  /** 文件大小 */
  size: number;
  /** 版本名称 */
  name: string;
};

export type AiAppAction = ApiMultAction<{
  create: {
    req: Pick<AiAppItem, 'name' | 'desc' | 'domain'>;
    resp: 'ok';
  };
  update: {
    req: {
      id: string;
      update: Partial<
        Pick<AiAppItem, 'name' | 'desc' | 'available' | 'domain'>
      >;
    };
    resp: 'ok';
  };
  remove: {
    req: {
      ids: string | string[];
    };
    resp: 'ok';
  };
  ids: {
    req: {
      form?: {
        search?: string;
        available?: AiAppItem['available'];
        last_update_timestamp?: Date[];
      };
      limit?: number[];
      withCount?: boolean;
    };
    resp: {
      ids: string[];
      count: number;
    };
  };
  detail: {
    req: {
      ids: string[];
    };
    resp: AiAppItem[];
  };
  version: {
    req: {
      ids: string | string[];
    };
    resp: {
      id: string;
      list: Omit<AiAppVersionItem, 'id'>[];
    }[];
  };
  upload: {
    req: FormData;
    resp: 'ok';
  };
  /** 提交部署任务（任务需要校验是否冲突） */
  deploy: {
    req: {
      id: string;
      hash: string;
    };
    resp: 'ok';
  };
}>;

export type Main = {
  [key in keyof AiAppAction as `app-${key}`]: AiAppAction[key];
};
