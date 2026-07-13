# 通用上传组件

业务页面使用 `UploadDialog` 并传入服务端策略键；`uploaded` 事件只在对象上传完成、服务端验证和业务回调全部成功后返回 `fileId`。组件内部用 Uppy Core 调度普通上传和 Multipart，并通过 Golden Retriever 在 IndexedDB 中恢复浏览器仍可读取的文件队列。浏览器无法恢复文件数据时，重新选择同一文件会以稳定指纹恢复服务端会话并通过 ListParts 跳过已完成分片。

弹窗卸载时 `useUploader` 会销毁 Uppy 实例。业务页面不要保存预签名 URL，也不要从文件名拼接对象地址。
