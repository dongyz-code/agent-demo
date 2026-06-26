import type {
  APISource,
  ApiMultAction,
  ApiMultActionToApi,
  ApiRouteBody,
  ApiRouteParams,
  ApiRouteQuery,
  ApiRouteRequest,
  ApiRouteResponse,
} from './api.js';

/** 类型相等断言，供声明文件在编译期校验 API helper 行为。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T,
>() => T extends B ? 1 : 2
  ? true
  : false;

/** 编译期断言，传入 false 时触发 TypeScript 错误。 */
type Assert<T extends true> = T;

/** 旧 req 写法的验证样本。 */
type LegacyAction = ApiMultAction<{
  detail: {
    req: { id: string };
    resp: { name: string };
  };
  remove: {
    req: { id: string };
  };
}>;

/** 新请求部位写法的验证样本。 */
type SplitAction = ApiMultAction<{
  'items/:id': {
    method: 'GET';
    query: { page: number };
    params: { id: string };
    resp: string[];
  };
  update: {
    body: { name: string };
    resp: 'ok';
  };
}>;

/** 验证旧 req 会转换成完整 API 路由契约。 */
type LegacyApi = {
  routes: {
    '/legacy': ApiMultActionToApi<LegacyAction>;
  };
};

/** 验证新请求部位会转换成完整 API 路由契约。 */
type SplitApi = {
  routes: {
    '/split': ApiMultActionToApi<SplitAction>;
  };
};

/** 旧 req 路由铺平后的类型映射。 */
type LegacySource = APISource<LegacyApi>;

/** 新请求部位路由铺平后的类型映射。 */
type SplitSource = APISource<SplitApi>;

/** 旧 req 的前端请求数据保持兼容。 */
type VerifyLegacyRequest = Assert<
  Equal<ApiRouteRequest<LegacySource['/legacy/detail']>, { id: string }>
>;

/** 显式 resp 的响应类型保持兼容。 */
type VerifyLegacyResponse = Assert<
  Equal<ApiRouteResponse<LegacySource['/legacy/detail']>, { name: string }>
>;

/** 未声明 resp 的接口默认返回 ok。 */
type VerifyDefaultResponse = Assert<
  Equal<ApiRouteResponse<LegacySource['/legacy/remove']>, 'ok'>
>;

/** GET 显式 query 不会被归入 body。 */
type VerifySplitQuery = Assert<
  Equal<ApiRouteQuery<SplitSource['/split/items/:id']>, { page: number }>
>;

/** GET 显式 params 可以独立读取。 */
type VerifySplitParams = Assert<
  Equal<ApiRouteParams<SplitSource['/split/items/:id']>, { id: string }>
>;

/** 显式 body 可以独立读取。 */
type VerifySplitBody = Assert<
  Equal<ApiRouteBody<SplitSource['/split/update']>, { name: string }>
>;
