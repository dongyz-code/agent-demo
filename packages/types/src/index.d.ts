import type { ApiMultActionToApi } from './common/index.js';

import type { Login } from './routes/login/index.js';
import type { Main } from './routes/main/index.js';
import type { Sys } from './routes/sys/index.js';
import type { Upload } from './routes/upload/index.js';
import type { FileAction } from './routes/file/index.js';
import type { DocumentAction } from './routes/document/index.js';
import type { Rag } from './routes/rag/index.js';

export type API = {
  prefix: '/api';
  routes: {
    '/login': ApiMultActionToApi<Login>;
    '/main': ApiMultActionToApi<Main>;
    '/sys': ApiMultActionToApi<Sys>;
    '/upload': ApiMultActionToApi<Upload>;
    '/file': ApiMultActionToApi<FileAction>;
    '/document': ApiMultActionToApi<DocumentAction>;
    '/rag': ApiMultActionToApi<Rag>;
  };
};

export type * from './common/index.js';
export type * from './routes/index.js';
export type * from '@repo/shared/permission';

export type * as ApiLogin from './routes/login/index.js';
export type * as ApiMain from './routes/main/index.js';
export type * as ApiSys from './routes/sys/index.js';
export type * as ApiUpload from './routes/upload/index.js';
export type * as ApiFile from './routes/file/index.js';
export type * as ApiDocument from './routes/document/index.js';
export type * as ApiRag from './routes/rag/index.js';
