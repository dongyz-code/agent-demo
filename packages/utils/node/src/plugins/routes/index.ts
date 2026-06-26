import fastifyStatic from '@fastify/static';
import {
  getAPIByDir,
  getAPIBySingleFile,
  registerResponseEnvelope,
  sendErrorResponse,
} from '../fastify/index.js';
import { initAuthentication } from '@/plugins/authorization/index.js';
import { byteConversion, dayJsformat } from '@repo/utils-common';

import type {
  FastifyReply,
  FastifyInstance,
  RouteOptions,
} from '../fastify/index.js';
import type { ListDir, ListFile } from '@fastify/static';

type FastifyRoute = RouteOptions;

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
    /** 路由目录，优先用于动态加载 route 文件 */
    dir?: string;
    /** 单文件，兼容旧 routes-single-file 模式 */
    singleFile?: string;
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
  callback?: (fastify: FastifyInstance) => void | Promise<void>;
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
  callback: () => (fastify: FastifyInstance) => Promise<void>;
} {
  errorLogger = errorLogger ?? logger.error;

  /** 错误处理 */
  function errorHandle(
    reply: FastifyReply,
    _error: unknown,
    statusCode?: number,
  ) {
    const error = _error as Error & {
      code?: string;
    };
    errorLogger!(error);

    if (reply.sent) {
      return;
    }
    sendErrorResponse({
      reply,
      error,
      defaultCode: ROOT_ERROR_DEFAULT_CODE,
      statusCode,
    });
  }

  /** 路由加载 */
  async function getRoutes() {
    const { dir, singleFile, prefix = '/api', log, callback } = routes;
    const routeList = dir
      ? await getAPIByDir({ dir, prefix, log })
      : singleFile
        ? await getAPIBySingleFile({
            file: singleFile,
            prefix,
            log,
          })
        : undefined;

    if (!routeList) {
      throw new Error('routes.dir or routes.singleFile is required');
    }

    if (callback) {
      return callback({ routes: routeList, prefix });
    }

    return routeList;
  }

  /** 额外处理 */
  function callback() {
    const callback = async (fastify: FastifyInstance) => {
      fastify.decorateRequest('auth', null);
      registerResponseEnvelope(fastify);
      await rest.callback?.(fastify);

      /** 权限校验等 */
      fastify.addHook('onRequest', async (req, reply) => {
        const isNginx = req.url === '/auth';

        try {
          await authentication(req);
          if (isNginx) {
            return reply.status(200).send('success');
          }
        } catch (error) {
          if (isNginx) {
            return reply.status(401).send('401');
          } else {
            errorHandle(reply, error, 401);
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
