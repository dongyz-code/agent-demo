import { getAxios } from '@repo/utils-browser';
import { AxiosError } from 'axios';

import { API_BASE } from '@/constants/env';
import { useSessionModel } from '@/model/session';

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
  origin: API_BASE,
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
      (error: AxiosError | ApiResponseError) => {
        let responseError: ApiResponseError | undefined;

        if (error instanceof ApiResponseError) {
          responseError = error;
        } else {
          responseError = handleErrorPayload(error.response?.data);
        }

        if (responseError?.code === '401') {
          useSessionModel.getState().clearSession();
        }

        return Promise.reject(responseError ?? error);
      },
    );
  },
});
