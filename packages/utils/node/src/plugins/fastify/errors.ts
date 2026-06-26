import type { FastifyReply } from './types.js';

/** 可被错误处理器识别的错误字段。 */
type ErrorLike = Error & {
  /** 业务错误码。 */
  code?: string;
  /** HTTP 状态码。 */
  statusCode?: number;
  /** Fastify schema 校验错误明细。 */
  validation?: unknown;
};

/** 标准错误响应体。 */
export type ErrorResponseBody = {
  /** 错误对象。 */
  error: {
    /** 业务错误码。 */
    code: string;
    /** 面向调用方的错误消息。 */
    msg: string;
  };
};

/** 错误归一化配置。 */
export type NormalizeErrorOptions = {
  /** 默认业务错误码。 */
  defaultCode: string;
  /** 未知错误默认 HTTP 状态码。 */
  defaultStatusCode?: number;
  /** 外部传入的状态码覆盖值。 */
  statusCode?: number;
};

/** 判断 HTTP 状态码是否可以作为错误响应码。 */
function isErrorStatusCode(statusCode: unknown): statusCode is number {
  return (
    typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599
  );
}

/** 将字符串错误码转换为 HTTP 错误状态码。 */
function parseErrorCodeStatus(code: unknown) {
  if (typeof code !== 'string') {
    return undefined;
  }
  const statusCode = Number(code);
  return isErrorStatusCode(statusCode) ? statusCode : undefined;
}

/** 将未知错误转换为统一错误响应信息。 */
export function normalizeError(
  value: unknown,
  {
    defaultCode,
    defaultStatusCode = 500,
    statusCode,
  }: NormalizeErrorOptions,
) {
  const error = value as Partial<ErrorLike>;
  const resolvedStatusCode = isErrorStatusCode(statusCode)
    ? statusCode
    : isErrorStatusCode(error.statusCode)
      ? error.statusCode
      : (parseErrorCodeStatus(error.code) ??
        (error.validation ? 400 : defaultStatusCode));

  return {
    statusCode: resolvedStatusCode,
    body: {
      error: {
        code: typeof error.code === 'string' ? error.code : defaultCode,
        msg:
          typeof error.message === 'string' && error.message
            ? error.message
            : 'Internal Server Error',
      },
    } satisfies ErrorResponseBody,
  };
}

/** 向客户端发送统一错误响应。 */
export function sendErrorResponse({
  reply,
  error,
  defaultCode,
  statusCode,
}: {
  /** Fastify 响应对象。 */
  reply: FastifyReply;
  /** 原始错误。 */
  error: unknown;
  /** 默认业务错误码。 */
  defaultCode: string;
  /** HTTP 状态码覆盖值。 */
  statusCode?: number;
}) {
  const normalized = normalizeError(error, {
    defaultCode,
    statusCode,
  });
  reply.status(normalized.statusCode).send(normalized.body);
}
