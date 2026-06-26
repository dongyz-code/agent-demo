import { getAxios } from '@repo/utils-browser';
import { AxiosError } from 'axios';

import type { API } from '@repo/types';

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
  prefix: '/api',
  config: {
    withCredentials: true,
    timeout: 30_000,
  },
  callback(instance) {
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
          return Promise.reject(error);
        }
        return response;
      },
      (error: AxiosError) => {
        const responseError = handleErrorPayload(error.response?.data);
        return Promise.reject(responseError ?? error);
      },
    );
  },
});
