import { getAxios } from '@repo/utils-browser';
import { routerGoLogin } from '@/router';
import { API_BASE } from '@/configs';
import { AxiosError } from 'axios';

import { progress } from '@/plugins/progress';
import { notify } from '@/plugins/notify';

import type { API } from '@/types';
import type { AxiosResponse } from 'axios';

type RespError =
  | {
      code: string;
      msg: string;
    }
  | undefined;

function respErrorHandle(error: RespError) {
  if (error) {
    const { msg, code } = error;
    notify('error', msg);
    if (['401'].includes(code)) {
      routerGoLogin();
    }
  }
}

function errorOrRespHandle(payload: AxiosResponse | AxiosError<unknown>) {
  progress.close(true);
  /** HTTP 错误 */
  if (payload instanceof AxiosError) {
    notify('error', payload.message);
    return Promise.reject(payload);
  } else {
    /** 自定义错误 */
    const error = payload?.data?.error as RespError | undefined;
    if (error) {
      respErrorHandle(error);
      return Promise.reject(error);
    }
    return payload;
  }
}

export const { api } = getAxios<API>({
  /** 默认都是POST，需要使用GET的单独标记 */
  cache: {},
  prefix: '/api',
  origin: API_BASE,
  config: {
    withCredentials: true,
    timeout: 1e3 * 60 * 10,
  },
  callback(instance) {
    instance.interceptors.request.use(
      async function (config) {
        progress.start(true);
        return config;
      },
      function (error: AxiosError) {
        return errorOrRespHandle(error);
      },
    );
    instance.interceptors.response.use(
      function (response) {
        return errorOrRespHandle(response);
      },
      function (error: AxiosError) {
        return errorOrRespHandle(error);
      },
    );
  },
});
