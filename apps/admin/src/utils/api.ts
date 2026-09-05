import { getAxios } from '@repo/utils-browser';
import { routerGoLogin } from '@/router';
import { logoutHandle } from '@/pages/login/login';
import { API_BASE } from '@/constants';
import { AxiosError } from 'axios';

import { progress } from './progress';
import { notify } from './notify';

import type { API } from '@/types';
import type { AxiosResponse } from 'axios';

type RespError =
  | {
      code: string;
      msg: string;
    }
  | undefined;

/** 统一清理管理端内存会话并回到登录页。 */
function handleUnauthorized() {
  logoutHandle();
  void routerGoLogin().catch(() => undefined);
}

/**
 * 统一提示业务错误；认证失效时同步清理本地会话并替换到登录页。
 *
 * @param error 服务端响应中的业务错误；没有业务错误时不执行操作。
 */
function respErrorHandle(error: RespError) {
  if (error) {
    const { msg, code } = error;
    notify('error', msg);
    if (['401'].includes(code)) {
      handleUnauthorized();
    }
  }
}

function errorOrRespHandle(payload: AxiosResponse | AxiosError<unknown>) {
  progress.close(true);
  /** HTTP 错误 */
  if (payload instanceof AxiosError) {
    const error = (payload.response?.data as { error?: RespError } | undefined)
      ?.error;
    if (error) {
      respErrorHandle(error);
    } else {
      if (payload.response?.status === 401) {
        handleUnauthorized();
      }
      notify('error', payload.message);
    }
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
