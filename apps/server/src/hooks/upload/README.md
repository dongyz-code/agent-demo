# 通用文件模块

`hooks/upload` 负责文件从上传到删除的完整生命周期，不理解知识库、头像、附件等业务语义。

## 依赖边界

```text
routes/upload、routes/file → hooks/upload
hooks/document             → hooks/upload/index.ts
hooks/rag                  → hooks/document/index.ts
hooks/upload               ✗ hooks/document、hooks/rag
```

- routes 仅做请求校验、认证上下文转换和调用公共服务。
- 文档模块只能使用 `index.ts` 暴露的文件描述、流工厂和引用服务。
- S3 客户端、Object Key、验证器、预览生成器和数据表属于模块内部实现。

## MinIO 开发配置

创建私有 Bucket 后保持匿名访问关闭，并配置只允许管理端来源的 CORS。示例 CORS：

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

Bucket 生命周期至少需要包含未完成 Multipart 清理规则：

```json
{
  "Rules": [
    {
      "ID": "abort-incomplete-uploads",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

服务端配置示例：

```json
{
  "storage": {
    "s3": {
      "internalEndpoint": "http://127.0.0.1:9000",
      "publicEndpoint": "http://127.0.0.1:9000",
      "region": "us-east-1",
      "accessKey": "请使用独立应用账号",
      "secretKey": "请使用高强度密钥",
      "bucket": "files"
    }
  },
  "upload": {
    "presignExpiresSeconds": 1200,
    "multipartThresholdBytes": 52428800,
    "partSizeBytes": 16777216,
    "maxFileSizeBytes": 2147483648,
    "sessionExpiresSeconds": 86400,
    "unboundRetentionDays": 7
  }
}
```

生产环境的 `publicEndpoint` 必须使用浏览器实际访问的 HTTPS 域名，反向代理不得改写签名参与计算的 Host 和 Path。

## 上传策略与 Uppy

- `default-attachment` 用于普通附件；`image` 用于图片；`rag-document` 用于知识文档。策略中的大小、MIME、扩展名、Multipart 阈值和保留期均由服务端决定。
- 管理端 `components/upload` 使用 Uppy Core + AWS S3 插件。业务页面只传策略键并监听验证后的文件，不直接接触 Bucket、Object Key 或长期凭证。
- 刷新后浏览器无法自动恢复本地 `File` 内容；用户重新选择同一文件后，稳定指纹会命中原会话，Uppy 通过 ListParts 跳过已完成分片。

## 预览 Worker

Office 预览通过 `upload.officePreviewEndpoint` 调用隔离 Worker。Worker 接收短期 `sourceUrl`、文件名和目标格式，返回 PDF 二进制。生产部署应限制 CPU、内存、执行时间和临时目录，并禁止 Worker 访问管理端 Cookie。

未配置 Worker 时 Office 文件安全降级为下载；HTML、SVG 等主动内容不会在管理端同源直接渲染。

## 故障排查

- 浏览器返回签名不匹配：检查 `publicEndpoint` 是否与浏览器请求 Host、协议和 path-style 路径完全一致。
- 浏览器跨域失败：检查 CORS 是否允许管理端 Origin、PUT/GET/HEAD，并暴露 ETag 与 Range 响应头。
- Multipart 无法继续：确认会话未过期、Bucket 生命周期未提前终止，以及 ListParts 使用内部 Endpoint。
- 文件完成后 rejected：检查声明 MIME、Magic Number、对象大小和服务端 SHA-256 日志中的稳定错误码。
- Office 长时间 pending/failed：检查 Worker Endpoint、超时、返回 Content-Type 和对象存储回源权限。
