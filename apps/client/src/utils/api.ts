import { AxiosError } from 'axios';

import type { API } from '@repo/types';

import { API_BASE } from '@/constants/env';
import {
  getSessionEpoch,
  handleUnauthorized,
} from '@/model';
import { getAxios } from '@repo/utils-browser';

type ApiErrorPayload = {
  code: string;
  msg: string;
};

export class ApiResponseError extends Error {
  code: string;

  constructor({ code, msg }: ApiErrorPayload) {
    super(msg);
    this.name = 'ApiResponseError';
    this.code = code;
  }
}

export const { api, axios: http } = getAxios<API>({
  origin: API_BASE,
  prefix: '/api',
  config: {
    withCredentials: true,
    timeout: 30_000,
  },
  callback(instance) {
    /** 记录请求发出时的会话版本，避免旧请求的 401 清理新会话。 */
    const requestEpochs = new WeakMap<object, number>();

    instance.interceptors.request.use((config) => {
      requestEpochs.set(config, getSessionEpoch());
      return config;
    });

    const handleErrorPayload = (payload: unknown) => {
      const error = (payload as { error?: ApiErrorPayload } | undefined)?.error;
      if (error) {
        return new ApiResponseError(error);
      }
    };

    instance.interceptors.response.use(
      (response) => {
        const error = handleErrorPayload(response.data);
        if (error) {
          if (error.code === '401') {
            void handleUnauthorized(requestEpochs.get(response.config));
          }
          return Promise.reject(error);
        }
        return response;
      },
      (error: AxiosError | ApiResponseError) => {
        let responseError: ApiResponseError | undefined;

        if (error instanceof ApiResponseError) {
          responseError = error;
        } else {
          responseError = handleErrorPayload(error.response?.data);
        }

        if (
          responseError?.code === '401' ||
          (error instanceof AxiosError && error.response?.status === 401)
        ) {
          const requestConfig =
            error instanceof AxiosError ? error.config : undefined;
          void handleUnauthorized(
            requestConfig ? requestEpochs.get(requestConfig) : undefined,
          );
        }

        return Promise.reject(responseError ?? error);
      },
    );
  },
});
