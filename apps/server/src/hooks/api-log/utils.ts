import { randomUUID } from 'node:crypto';
import { numSplit, pickObj } from '@repo/utils-node';
import { db, schemas } from '@/database/index.js';
import { ROOT } from '@/configs/env.js';

import type { ApiSendLogParams, ApiSendLogParamsWithLog } from './static.js';

type Item = typeof schemas.api_logs.$inferInsert;
export type ItemAdd = Omit<Item, 'id'>;

/** 添加接口日志 */
export async function addApiLog({ user_id, ...rest }: ItemAdd) {
  const item: Item = {
    ...rest,
    id: randomUUID(),
    user_id: user_id === ROOT.SYS_ADMIN_USER_ID ? null : user_id,
  };

  await db.insert(schemas.api_logs).values(item);
}

const MAX_DATA_LENGTH = 1e4;
const MAX_DATA_ERROR_MESSAGE = (length: number) =>
  `体积 ${numSplit(length)} 超过 ${numSplit(MAX_DATA_LENGTH)}，不记录`;

export function hiddenData<
  T extends {
    headers?: Record<string, unknown>;
    data?: unknown;
  },
>(item: T) {
  if (item.data) {
    const { headers = {} } = item;

    const length = +(
      headers['Content-Length'] ??
      headers['content-length'] ??
      0
    );

    if (!isNaN(length) && length > MAX_DATA_LENGTH) {
      item.data = MAX_DATA_ERROR_MESSAGE(length);
    }
  }

  return item;
}

async function _addApiSendLog({
  config,
  response,
  error,
  meta: { start_timestamp, label, ip, user_id, search_key },
}: ApiSendLogParamsWithLog) {
  const end_timestamp = new Date();

  const detail: Record<string, unknown> = {};

  if (config) {
    detail.url = {
      baseURL: config.baseURL,
      url: config.url,
    };

    const { headers = {}, ...rest } = config;
    const { Authorization, authorization, ...restHeaders } = headers as Record<
      string,
      unknown
    >;

    detail.req = hiddenData({
      ...pickObj(rest, [
        'auth',
        'maxBodyLength',
        'maxContentLength',
        'method',
        'params',
        'proxy',
        'responseType',
        'timeout',
        'data',
      ]),
      headers: restHeaders,
    });
  }
  if (response) {
    detail.resp = hiddenData(
      pickObj(response, ['status', 'statusText', 'headers', 'data']),
    );
  }
  if (error) {
    detail.error = pickObj(error, ['name', 'code', 'message', 'stack']);
  }

  const val: ItemAdd = {
    status: error ? 'failed' : 'completed',
    start_timestamp,
    end_timestamp,
    duration: end_timestamp.getTime() - start_timestamp.getTime(),
    mode: 'active',
    client_mark: label,
    client_id: null,
    ip,
    detail: JSON.stringify(detail),
    url: config?.url ?? null,
    user_id,
    search_key,
  };

  await addApiLog(val);
}

/** 添加接口发送日志 (不抛出错误) */
export async function addApiSendLog(body: ApiSendLogParams) {
  if ('disableLog' in body.meta) {
    return;
  }
  try {
    await _addApiSendLog(body as ApiSendLogParamsWithLog);
  } catch (error) {
    console.error(error);
  }
}
