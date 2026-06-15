import axios from 'axios';

import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  Method,
} from 'axios';

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;

type ApiItem = {
  method: Method;
  req: unknown;
  resp: unknown;
};

type JoinPath<Prefix extends string, Key extends string> =
  `${Prefix}${Key}` extends `/${infer Rest}` ? `/${Rest}` : `${Prefix}${Key}`;

type ApiTreeToList<T, Prefix extends string = ''> = UnionToIntersection<
  {
    [K in keyof T]: K extends string
      ? T[K] extends ApiItem
        ? { [P in JoinPath<Prefix, K>]: T[K] }
        : ApiTreeToList<T[K], JoinPath<Prefix, K>>
      : never;
  }[keyof T]
>;

type ApiSource<T extends { routes: Record<string, unknown> }> =
  ApiTreeToList<T['routes']>;

type ApiFunc<T extends { routes: Record<string, unknown> }> = <
  K extends keyof ApiSource<T> & string,
>(
  url: K,
  data: ApiSource<T>[K] extends ApiItem ? ApiSource<T>[K]['req'] : never,
  config?: AxiosRequestConfig,
) => Promise<
  ApiSource<T>[K] extends ApiItem ? ApiSource<T>[K]['resp'] : never
>;

export function getAxios<T extends { routes: Record<string, unknown> }>({
  origin = '',
  prefix = '',
  config,
  callback,
}: {
  origin?: string;
  prefix?: string;
  cache?: Record<string, unknown>;
  config?: AxiosRequestConfig;
  callback?: (instance: AxiosInstance) => void;
}) {
  const instance = axios.create({
    baseURL: `${origin}${prefix}`,
    ...config,
  });

  callback?.(instance);

  const api: ApiFunc<T> = async (url, data, config) => {
    const method = (config?.method ?? 'POST').toUpperCase();
    const response: AxiosResponse = await instance.request({
      ...config,
      url,
      method,
      ...(method === 'GET' ? { params: data } : { data }),
    });
    return (response.data && 'data' in response.data
      ? response.data.data
      : response.data) as Awaited<ReturnType<ApiFunc<T>>>;
  };

  return {
    axios: instance,
    api,
  };
}
