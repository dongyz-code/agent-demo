import axios, { AxiosError } from 'axios';
import { addApiSendLog } from './utils.js';

import type {
  CreateAxiosDefaults,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import type { Label, ApiLogMeta } from './static.js';

function handleAxiosError(error: unknown) {
  if (error instanceof AxiosError) {
    const { name, code, message, response, config, stack } = error;

    console.error({
      baseURL: config?.baseURL,
      url: config?.url,
      name,
      code,
      status: response?.status,
      statusText: response?.statusText,
      message,
      stack,
    });

    return Promise.reject(message);
  }
  return Promise.reject(error);
}

/** 发起的所有请求都需要通过这个实例，以便记录日志 */
export function createAxiosInstance<T extends Label | null>({
  label,
  config = {},
}: {
  /** null 代表默认客户端，无日志记录等 */
  label: T;
  config?: CreateAxiosDefaults;
}) {
  type RespBase = <T>(
    config: AxiosRequestConfig,
  ) => Promise<AxiosResponse<T, any, {}>>;

  type RespWrap = <T>(
    config: AxiosRequestConfig,
    meta: ApiLogMeta,
  ) => Promise<AxiosResponse<T, any, {}>>;

  type Resp = T extends null ? RespBase : RespWrap;

  /** 默认不启用代理 */
  config.proxy = config.proxy ?? false;

  const instance = axios.create(config);

  if (label) {
    /** 请求函数 */
    const insRequest: RespWrap = async <T>(
      config: AxiosRequestConfig,
      _meta: ApiLogMeta,
    ) => {
      const meta =
        'disableLog' in _meta
          ? _meta
          : {
              label,
              start_timestamp: new Date(),
              ..._meta,
            };

      try {
        const response = await instance.request<T>(config);

        addApiSendLog({ config: response.config, response, meta });
        return response;
      } catch (error) {
        if (error instanceof AxiosError) {
          const { response, config } = error;
          addApiSendLog({ config, response, error, meta });
        }
        return handleAxiosError(error);
      }
    };

    return insRequest as Resp;
  } else {
    const insRequest: RespBase = async <T>(config: AxiosRequestConfig) => {
      try {
        return await instance.request<T>(config);
      } catch (error) {
        return handleAxiosError(error);
      }
    };
    return insRequest as Resp;
  }
}
