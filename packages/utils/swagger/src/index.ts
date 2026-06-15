import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUiScalar from '@scalar/fastify-api-reference';
import { Type } from '@sinclair/typebox';

import type { FastifyInstance, FastifySchema } from 'fastify';
import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import type { Merge } from 'type-fest';
import type { TSchema, Static } from '@sinclair/typebox';

export { Type as T } from '@sinclair/typebox';

export type { FastifySchema } from 'fastify';
export type * as Typebox from '@sinclair/typebox';

/**
 * https://github.com/fastify/fastify-swagger
 *
 * https://github.com/fastify/fastify-swagger-ui
 *
 * https://github.com/sinclairzx81/typebox
 */
export function useSwagger<Tag extends string>({
  baseURL,
  info,
  tags,
  uiRoutePrefix,
}: {
  baseURL: `/${string}`;
  info: NonNullable<
    NonNullable<FastifyDynamicSwaggerOptions['openapi']>['info']
  >;
  tags: {
    name: Tag;
    description?: string;
  }[];
  /** UI 界面处于哪个路由下 */
  uiRoutePrefix: `/${string}`;
}) {
  /** FastifySchema 生成辅助函数, 集中管理 */
  function helperSchema<
    RoutesSource extends {
      [key in string]: {
        req: unknown;
        resp: unknown;
      };
    },
  >() {
    /** 传入按照 RoutesSource 配置即可 */
    function helper<
      T extends {
        [key in keyof RoutesSource]: Merge<
          FastifySchema,
          {
            tags: Tag[];
            body: TSchema;
            response: TSchema;
          }
        >;
      },
    >(data: T) {
      const dataNext = {} as {
        [key in keyof T]: Omit<T[key], 'response'> & {
          response: {
            200: TSchema;
          };
        };
      };
      const keys = Object.keys(data) as (keyof T)[];

      keys.forEach((key) => {
        const { response, ...rest } = data[key]!;
        Object.assign(dataNext, {
          [key]: {
            ...rest,
            response: {
              200: Type.Object({
                data: response as TSchema,
              }),
            },
          },
        });
      });

      type Verify = {
        [key in keyof T]: key extends keyof RoutesSource
          ? T[key] extends Record<string, unknown>
            ? [
                Static<T[key]['body']> extends RoutesSource[key]['req']
                  ? RoutesSource[key]['req'] extends Static<T[key]['body']>
                    ? true
                    : false
                  : false,
                Static<T[key]['response']> extends RoutesSource[key]['resp']
                  ? RoutesSource[key]['resp'] extends Static<T[key]['response']>
                    ? true
                    : false
                  : false,
              ]
            : []
          : [];
      };

      type TYPE_MAP = {
        [key in keyof T]: {
          body: Static<T[key]['body']>;
          response: Static<T[key]['response']>;
        };
      };

      const SCHEMA_VERIFY = undefined as unknown as {
        detail: Verify;
        key: Verify[keyof Verify][number] extends true ? true : never;
      };

      return {
        fastifySchemaSource: data,
        fastifySchema: dataNext,
        /** 校验 schema */
        SCHEMA_VERIFY,
        TYPE_MAP: {} as TYPE_MAP,
      };
    }

    return helper;
  }

  async function fastifySwaggerRegister(instance: FastifyInstance) {
    await instance.register(fastifySwagger, {
      openapi: {
        openapi: '3.0.0',
        info,
        tags,
        components: {
          securitySchemes: {
            basicAuth: {
              type: 'http',
              scheme: 'basic',
            },
          },
        },
        servers: [
          {
            url: baseURL,
          },
        ],
      },
      hideUntagged: true,
    });

    /** https://github.com/fastify/fastify-swagger */
    // await instance.register(fastifySwaggerUi, {
    //   routePrefix: uiRoutePrefix,
    //   uiConfig: {
    //     docExpansion: 'list',
    //     deepLinking: false,
    //     tryItOutEnabled: true,
    //     filter: true,
    //     displayRequestDuration: true,
    //   },
    //   theme: {
    //     title: info.title,
    //     css: [
    //       {
    //         filename: 'swagger-ui.css',
    //         content: `
    //         /* 隐藏顶部栏 */
    //         .swagger-ui .topbar { display: none }
    //         `,
    //       },
    //     ],
    //   },
    // });

    /** https://github.com/scalar/scalar */
    instance.get(uiRoutePrefix + '/doc.json', async () => {
      return instance.swagger();
    });
    await instance.register(fastifySwaggerUiScalar, {
      routePrefix: uiRoutePrefix,
      configuration: {
        url: (baseURL === '/' ? '' : baseURL) + uiRoutePrefix + '/doc.json',
        hideClientButton: true,
      },
    });
  }

  return {
    /** FastifySchema 生成辅助函数 */
    helperSchema,
    fastifySwaggerRegister,
  };
}
