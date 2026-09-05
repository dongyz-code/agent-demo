/**
 * 身份凭据按以下规则处理：
 *
 * 1. Authorization Basic 仅供接口调用方使用；
 * 2. signed Cookie 是浏览器会话凭据；
 * 3. jwtCookieOnly 开启时拒绝 token/Bearer 请求头，否则仅为兼容非浏览器调用保留。
 *
 */
import jsonwebtoken from 'jsonwebtoken';

import type { FastifyReply, FastifyRequest } from '../fastify/index.js';
import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

type Method = 'POST' | 'GET';

type IgnoreUri = {
  url: string;
  role?: 'startsWith';
  method: Method | Method[];
};

type PromiseLike<T> = T | Promise<T>;

type TokenAndCookie = {
  /** token 解析后的数据格式 */
  token: Record<string, unknown>;
  /** cookie 解析后的数据格式 */
  cookie: {
    [key: string]: string;
  } & { token: string };
};

export type AuthenticationContext<T extends Record<string, unknown>> =
  | {
      /** JWT 用户 token 身份。 */
      type: 'jwt';
      /** JWT 解析后的 token 数据。 */
      token: T;
    }
  | {
      /** Basic Auth 接口调用身份。 */
      type: 'basic';
      /** Basic Auth 返回的部分 token 数据。 */
      token: Partial<T>;
    };

type AuthenticationOpts<T extends TokenAndCookie> = {
  /** 身份认证返回异常，定义函数如何抛出异常 */
  SET_ERROR: () => Error;
  /** 哪些路由忽略前置的身份校验 */
  ignore?: (string | IgnoreUri)[];
  /** 基础身份认证（仅接口调用，Basic，不设置则无对应验证逻辑，直接返回异常），返回 false 值就是报错 */
  basicAuth?: (_: {
    id: string;
    secret: string;
    request: FastifyRequest;
  }) => PromiseLike<Partial<T['token']> | undefined | null | void>;
  /** 仅模板，便于后续使用, 仅验证指定的 KEY */
  cookieModel: T['cookie'];
  /** 浏览器会话只允许从 signed Cookie 读取 JWT，不接受 token/Bearer 请求头。 */
  jwtCookieOnly?: boolean;
};

export function initAuthentication<T extends TokenAndCookie>({
  opts,
  jwt,
  prod,
}: {
  opts: AuthenticationOpts<T>;
  jwt: {
    /** 密钥 */
    secret: string;
    /** 默认有效期 秒 */
    expire: number;
  };
  /** 是否是生产环境(默认是生产环境，HTTPS, 更加严格) */
  prod?: boolean;
}) {
  const { cookieModel, ignore = [], jwtCookieOnly = false } = opts;
  const allCookieKeys = Object.keys(cookieModel);

  const ignores = ignore.map((val) =>
    typeof val === 'string'
      ? {
          method: 'GET' as const,
          url: val,
        }
      : val,
  );
  const ignoresNext = ignores.map(({ url, role, method }) => {
    return {
      url,
      role,
      methods: Array.isArray(method) ? method : [method],
    };
  });

  /** jwt 签名 */
  function jwtSign(data: T['token'], sign?: SignOptions) {
    return jsonwebtoken.sign(data, jwt.secret, {
      expiresIn: jwt.expire,
      ...sign,
    });
  }

  /** jwt 校验 */
  function jwtVerify(token: string, verify?: VerifyOptions) {
    try {
      return jsonwebtoken.verify(token, jwt.secret, verify) as T['token'];
    } catch {
      throw opts.SET_ERROR();
    }
  }

  type Opts = Parameters<FastifyReply['clearCookie']>[1];

  const cookieSerializeOptions: Opts = {
    signed: true,
    httpOnly: true,
    sameSite: prod ? 'strict' : 'lax',
    secure: prod,
    /** 秒 */
    maxAge: jwt.expire,
    path: '/',
  };

  /** set-cookie */
  function cookieSign(reply: FastifyReply, cookies: T['cookie']) {
    Object.keys(cookies).forEach((name) => {
      /** 在没有 Secure 标记(Secure = false)的情况下，浏览器可能会阻止 SameSite=None 的 Cookie 在 HTTP 连接上发送。 */
      reply.setCookie(name, cookies[name], cookieSerializeOptions);
    });
  }

  /** cookie 刷新有效期 */
  function cookieRefresh(req: FastifyRequest, reply: FastifyReply) {
    allCookieKeys.forEach((name) => {
      const val = req.cookies?.[name] ?? '';
      if (!val) {
        return;
      }
      const unsignVal = req.unsignCookie(val);
      if (unsignVal.valid && unsignVal.value) {
        reply.setCookie(name, unsignVal.value, cookieSerializeOptions);
      }
    });
  }

  /** set-cookie-clear */
  function cookieClear(reply: FastifyReply) {
    allCookieKeys.forEach((name) => {
      reply.clearCookie(name as string, cookieSerializeOptions);
    });
  }

  /** 身份认证函数，信息写入 request.auth
   *
   * 验证优先级
   *
   * 1. authorization Basic (一般作为 API)
   * 2. signed cookies.token
   * 3. token/Bearer（仅非 Cookie-only 模式）
   */
  async function authentication(req: FastifyRequest) {
    const { basicAuth, SET_ERROR } = opts;

    const ignore = ignoresNext.some(({ methods, role, url }) => {
      if (!methods.includes(req.method as Method)) {
        return false;
      }
      return role === 'startsWith' ? req.url.startsWith(url) : url === req.url;
    });

    if (ignore) {
      return;
    }

    const authentication = req.headers['authorization'];

    if (authentication?.startsWith('Basic')) {
      const [id, secret] = Buffer.from(authentication.split(' ')[1], 'base64')
        .toString('utf8')
        .split(':');

      const __token = await basicAuth?.({ id, secret, request: req });

      if (!__token) {
        throw SET_ERROR();
      }

      req.auth = {
        type: 'basic',
        token: __token,
      } satisfies AuthenticationContext<T['token']>;
    } else {
      const getToken = () => {
        if (req.cookies?.['token']) {
          const resp = req.unsignCookie(req.cookies['token']);
          if (resp.valid && resp.value) {
            return resp.value;
          }
        }

        if (jwtCookieOnly) {
          throw SET_ERROR();
        }

        if (req.headers['token']) {
          return req.headers['token'] as string;
        }

        if (authentication?.startsWith('Bearer')) {
          return authentication.split(' ')[1];
        }

        throw SET_ERROR();
      };

      const token = getToken();
      const __token = jwtVerify(token);
      req.auth = {
        type: 'jwt',
        token: __token,
      } satisfies AuthenticationContext<T['token']>;
    }
  }

  return {
    /** 身份认证函数，信息写入 request.auth */
    authentication,
    /** jwt 签名 */
    jwtSign,
    /** cookie 刷新有效期 */
    cookieRefresh,
    /** set-cookie */
    cookieSign,
    /** set-cookie-clear */
    cookieClear,
  };
}
