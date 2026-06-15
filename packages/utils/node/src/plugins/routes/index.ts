import fastifyStatic from '@fastify/static';
import { getAPIBySingleFile, fastifyHooks } from '../fastify/index.js';
import { initAuthentication } from '@/plugins/authorization/index.js';
import { byteConversion, dayJsformat } from '@repo/utils-common';

import type { FastifyReply, FastifyInstance } from '../fastify/index.js';
import type { ListDir, ListFile } from '@fastify/static';

type FastifyRoute = Awaited<ReturnType<typeof getAPIBySingleFile>>[number];

type Opts = {
  /** 基础配置 */
  configs: {
    /** 默认错误码 */
    ROOT_ERROR_DEFAULT_CODE: string;
    /** 错误日志 logger 日志打印 */
    logger: {
      error: (val: unknown) => void;
    };
  };
  /** 认证函数 */
  authentication: ReturnType<typeof initAuthentication>['authentication'];
  /** 静态文件服务 @fastify/static */
  static?: {
    /** 静态目录本地代理，服务器上请用 nginx 统一处理 */
    dist: string;
    /** 路由前缀, （默认是 /static/ ） */
    prefix?: `/${string}/`;
  };
  /** 路由配置 */
  routes: {
    /** 单文件 */
    singleFile: string;
    /** 路由前缀，默认 /api */
    prefix?: string;
    /** 是否打印路由列表 */
    log?: boolean;
    /** 批量修改路由配置 */
    callback?: (body: {
      prefix: string;
      routes: FastifyRoute[];
    }) => FastifyRoute[];
  };
  /** 额外处理，注册插件，钩子函数等 */
  callback?: typeof fastifyHooks.preSerialization;
  /** 错误终端打印函数 */
  errorLogger?: (
    error: Error & {
      code?: string;
    },
  ) => void;
};

/**
 * 路由 / 认证 / 静态服务器 / 错误捕获
 *
 * 后端路径配置:
 * 1. API: /api/
 * 2. Swagger文档: /swagger/
 * 3. 静态文件代理: /static/ (仅用于本地测试，线上使用 NGINX)
 *
 *
 * 默认对响应包裹一层 data，如果是 a string, a Buffer, a stream, or null 等则不包裹
 */
export function initRoutes<T extends Opts>({
  authentication,
  configs: { ROOT_ERROR_DEFAULT_CODE, logger },
  routes,
  errorLogger,
  ...rest
}: T): {
  getRoutes: () => Promise<FastifyRoute[]>;
  callback: () => (fastify: FastifyInstance) => void;
} {
  errorLogger = errorLogger ?? logger.error;

  /** 错误处理 */
  function errorHandle(reply: FastifyReply, _error: unknown) {
    const error = _error as Error & {
      code?: string;
    };

    const errorData =
      'code' in error
        ? {
            code: error.code,
            msg: error.message,
          }
        : {
            code: ROOT_ERROR_DEFAULT_CODE,
            msg: error.message,
          };
    errorLogger!(error);

    reply.status(200).send(
      /** 触发禁用 preSerialization */
      JSON.stringify({
        error: errorData,
      }),
    );
  }

  /** 路由加载 */
  async function getRoutes() {
    const { singleFile, prefix = '/api', log, callback } = routes;
    const routeList = await getAPIBySingleFile({
      file: singleFile,
      prefix,
      log,
    });
    /** 对响应实体进行处理 data 包裹一层 */
    routeList.forEach((item) => {
      if (item.preSerialization) {
        const errMsg = `${item.url}: preSerialization is not allowed`;
        throw new Error(errMsg);
      }
      /** Note: The hook is NOT called if the payload is a string, a Buffer, a stream, or null.
       *
       * 异步忽略 done，非异步需要有
       */
      item.preSerialization = (req, reply, payload, done) => {
        done(null, { data: payload });
      };
    });

    if (callback) {
      return callback({ routes: routeList, prefix });
    }

    return routeList;
  }

  /** 额外处理 */
  function callback() {
    const callback: typeof fastifyHooks.preSerialization = (fastify) => {
      rest.callback?.(fastify);

      /** 权限校验等 */
      fastify.addHook('onRequest', async (req, reply) => {
        const isNginx = req.url === '/auth';

        try {
          await authentication(req);
          if (isNginx) {
            reply.status(200).send('success');
          }
        } catch (error) {
          if (isNginx) {
            reply.status(401).send('401');
          } else {
            errorHandle(reply, error);
          }
        }
      });

      /** 错误处理 */
      fastify.setErrorHandler(function (error, request, reply) {
        /** fastify logger 日志打印，记得注册对应的日志组件 */
        this.log.error(error);
        errorHandle(reply, error);
      });

      /** 文件服务 */
      if (rest.static) {
        const dirHtmlRender = ({ href, name, stats }: ListDir) => {
          return `<li><a href="${href}">${name} | ${byteConversion(stats.size)} | ${dayJsformat(stats.mtimeMs, 'YYYY-MM-DD HH:mm:ss')}</a></li>`;
        };
        const fileHtmlRender = ({ href, name, stats }: ListFile) => {
          return `<li><a href="${href}" target="_blank">${name} | ${byteConversion(stats.size)} | ${dayJsformat(stats.mtimeMs, 'YYYY-MM-DD HH:mm:ss')}</a></li>`;
        };
        const { dist, prefix = '/static/' } = rest.static;

        fastify.register(fastifyStatic, {
          root: dist,
          prefix,
          index: false,
          list: {
            format: 'html',
            render: (dirs, files) => {
              return `<html><body>
              <ul>${dirs.map(dirHtmlRender).join('')}</ul>
              <ul>${files.map(fileHtmlRender).join('')}</ul>
              </body></html>`.trim();
            },
          },
        });
      }
    };

    return callback;
  }

  return {
    getRoutes,
    callback,
  };
}
