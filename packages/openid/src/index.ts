/**
 * https://github.com/panva/openid-client?tab=readme-ov-file
 *
 * https://casdoor.org/zh/docs/how-to-connect/oauth
 *
 */

import * as client from 'openid-client';
import { promiseCacheCallback } from './utils.js';

export type { client };

/** OAuth2 配置 */
export type OAuth2Configs = {
  /** /.well-known/openid-configuration URL */
  discovery: string;
  /** 客户端ID */
  clientId: string;
  /** 客户端密钥 */
  clientSecret: string;
  /** 授权后的重定向地址 */
  redirectUri: string;
  /** 登出后的重定向地址 */
  logoutRedirectUri: string;
  /** 授权范围 */
  scope: string[];
  /** 密钥，用来生成 code_challenge，分布式环境需要保证唯一 */
  code_verifier: string;
  /** 状态 */
  state: string;
};

/**
 * state 前端控制，方便自定义额外逻辑
 */
export function useOAuth2({
  configs: qAuth2Configs,
}: {
  /** OAuth2 配置 */
  configs: OAuth2Configs;
}) {
  const code_challenge_method = 'S256';

  /** 配置发现 */
  const discovery = promiseCacheCallback(async () => {
    return await client.discovery(
      new URL(qAuth2Configs.discovery),
      qAuth2Configs.clientId,
      qAuth2Configs.clientSecret,
    );
  });

  /** 生成 code_challenge */
  const makeCodeChallenge = promiseCacheCallback(async () => {
    /** 一个 code_verifier 只会生成唯一的 code_challenge */
    return await client.calculatePKCECodeChallenge(qAuth2Configs.code_verifier);
  });

  /** 构建授权URL, 首次生成后是不会变更的 */
  const buildAuthorizationUrl = promiseCacheCallback(async () => {
    const [clientConfig, codeChallenge] = await Promise.all([
      discovery(),
      makeCodeChallenge(),
    ]);

    const redirectTo = client.buildAuthorizationUrl(clientConfig, {
      redirect_uri: qAuth2Configs.redirectUri,
      scope: qAuth2Configs.scope.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method,
      state: qAuth2Configs.state,
    });

    return redirectTo.href;
  });

  /** 获取令牌 传入前端完成登录后的回调URL */
  async function authorizationCodeGrant({
    url,
    state,
  }: {
    url: string;
    state: string;
  }) {
    const clientConfig = await discovery();
    const tokens = await client.authorizationCodeGrant(
      clientConfig,
      new URL(url),
      {
        pkceCodeVerifier: qAuth2Configs.code_verifier,
        expectedState: state,
      },
    );
    return {
      state,
      tokens,
      clientConfig,
    };
  }

  /** 构造登出链接 */
  function buildLogoutUrl({
    state,
    tokens,
    clientConfig,
  }: Awaited<ReturnType<typeof authorizationCodeGrant>>) {
    const params: Record<string, string> = {
      post_logout_redirect_uri: qAuth2Configs.logoutRedirectUri,
      state,
    };
    if (tokens.id_token) {
      params.id_token_hint = tokens.id_token;
    }
    const url = client.buildEndSessionUrl(clientConfig, params);
    return url.href;
  }

  /** 获取用户信息 传入令牌 */
  async function fetchUserInfo<T = never>(
    resp: Awaited<ReturnType<typeof authorizationCodeGrant>>,
  ) {
    const { clientConfig, tokens } = resp;
    const data = await client.fetchUserInfo(
      clientConfig,
      tokens.access_token,
      tokens.claims()!.sub,
    );
    return {
      userInfo: data as [T] extends [never] ? client.UserInfoResponse : T,
      logoutUrl: buildLogoutUrl(resp),
    };
  }

  return {
    /** 构建授权URL */
    buildAuthorizationUrl,
    /** 获取令牌 传入前端完成登录后的回调URL */
    authorizationCodeGrant,
    /** 获取用户信息 传入令牌 */
    fetchUserInfo,
  };
}
