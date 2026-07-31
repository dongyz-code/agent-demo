# 通用上传组件

业务页面使用 `UploadDialog` 并传入服务端策略键；`uploaded` 事件只在对象上传完成、服务端验证和业务回调全部成功后返回文档版本结果。组件内部用 Uppy Core 调度普通上传和 Multipart，并通过 Golden Retriever 在 IndexedDB 中恢复浏览器仍可读取的文件队列。恢复后的 Multipart 使用服务端会话标识续传，并通过 ListParts 跳过对象存储已经接收的分片；无法恢复 Blob 的幽灵文件会直接移出队列。

弹窗卸载时 `useUploader` 会销毁 Uppy 实例。业务页面不要保存预签名 URL，也不要从文件名拼接对象地址。
