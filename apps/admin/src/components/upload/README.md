# 文档上传组件

业务页面统一使用 `DocumentUploader`，调用 `open({ libraryId })` 新建文档，调用 `open({ documentId, libraryId })` 上传新版本。组件按需创建一个 `UploadDialog` 实例，新建文档和每份文档的新版本使用独立、稳定的持久化空间；新版本最多选择一个文件。

新建文档先选资料库再加文件，文件加入队列后冻结目标库。恢复队列时优先显示原资料库；不一致的未完成项必须先移除，不能在界面上改成另一个库后继续原队列。组件内部以 Uppy 调度普通直传和 Multipart，通过 GoldenRetriever 恢复浏览器队列。

文件传输使用通用 `/upload/*` 接口，以 `purpose=document` 初始化；完成返回的 `UploadedFile` 保存在 `meta.uploadedFile`。随后调用 `/documents/document-version-create` 绑定文档，结果保存在 `meta.storedFile`，只有文档绑定成功才触发 uploaded 事件。文件已上传但绑定失败时，重试复用 key，不重新上传字节；页面刷新通知失败不改变已入库结果。

目标 documentId 在首次初始化时冻结在本地元数据中，不属于通用上传会话。刷新恢复后先处理已保存文件句柄，再查询服务端状态；已完成上传即使没有本地 Blob 仍能恢复绑定。仅未完成且丢失 Blob 的条目会被移除并尽力取消会话。

阶段区分 waiting、initializing、uploading、paused、confirming、binding、complete 和 failed。新版持久化命名空间为 agent-demo-upload-v2，旧会话不按新完成语义恢复。

弹窗卸载时销毁 Uppy。页面保存文档标识；上传队列保存文件句柄；预签名 URL 仅用于当前传输，不能作为业务文件引用。
