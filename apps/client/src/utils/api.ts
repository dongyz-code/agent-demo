import { getAxios } from '@repo/utils-browser';

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
    instance.interceptors.response.use((response) => {
      const error = response.data?.error as ApiErrorPayload | undefined;
      if (error) {
        return Promise.reject(new ApiResponseError(error));
      }
      return response;
    });
  },
});
