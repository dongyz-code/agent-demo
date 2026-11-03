import type { ApiMultAction } from '../../common/index.js';
import type {
  FilePurpose,
  UploadedFile,
  UploadedPartInfo,
  UploadSessionStatus,
} from '../../upload.js';

/** 通用上传接口，不包含文档目标、裸 key 访问或物理删除入口。 */
export type Upload = ApiMultAction<{
  /** 创建或恢复一次上传，传输方式和约束由服务端决定。 */
  init: {
    body: {
      /** 用户提供的文件名，服务端会清洗。 */
      filename: string;
      /** 客户端 MIME 声明，完成时仍需验证内容。 */
      contentType: string;
      /** 声明的文件字节数。 */
      size: number;
      /** 一次上传尝试的幂等键，重试初始化时保持一致。 */
      idempotencyKey: string;
      /** 客户端可选用途，具体限制由服务端决定。 */
      purpose: Exclude<FilePurpose, 'preview'>;
    };
    resp:
      | {
          /** 已完成会话只能取回原文件。 */
          mode: 'completed';
          /** 用于幂等获取已验证文件的会话标识。 */
          sessionId: string;
        }
      | {
          /** 普通对象直传。 */
          mode: 'single';
          /** 服务端上传会话标识。 */
          sessionId: string;
          /** 只能写入临时对象的短期地址。 */
          uploadUrl: string;
          /** 直传必须携带的请求头。 */
          headers: Record<string, string>;
        }
      | {
          /** S3 Multipart 直传。 */
          mode: 'multipart';
          /** 服务端上传会话标识。 */
          sessionId: string;
          /** 除末片外的目标分片字节数。 */
          partSize: number;
        };
  };
  /** 为一个分片生成写入地址。 */
  'sign-parts': {
    body: {
      /** 当前用户可操作的会话标识。 */
      sessionId: string;
      /** 从 1 开始的分片编号。 */
      partNumber: number;
    };
    resp: {
      /** 只能写入指定临时分片的地址。 */
      uploadUrl: string;
    };
  };
  /** 从存储读取真实分片以恢复上传。 */
  'list-parts': {
    body: {
      /** 当前用户可操作的会话标识。 */
      sessionId: string;
    };
    resp: {
      /** 按编号排序的已上传分片。 */
      parts: UploadedPartInfo[];
    };
  };
  /** 固化并验证对象，返回可用于业务绑定的句柄。 */
  complete: {
    body: {
      /** 当前用户可操作的会话标识。 */
      sessionId: string;
    };
    resp: UploadedFile;
  };
  /** 取消尚未完成的上传。 */
  abort: {
    body: {
      /** 当前用户可操作的会话标识。 */
      sessionId: string;
    };
    resp: 'ok';
  };
  /** 查询传输状态，不包含业务绑定状态。 */
  status: {
    body: {
      /** 当前用户可操作的会话标识。 */
      sessionId: string;
    };
    resp: {
      /** 服务端当前上传状态。 */
      status: UploadSessionStatus;
    };
  };
}>;
