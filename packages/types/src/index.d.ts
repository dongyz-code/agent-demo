import type { ApiMultActionToApi } from './common/index.js';

import type { Login } from './routes/login/index.js';
import type { Sys } from './routes/sys/index.js';
import type { DocumentsAction } from './routes/documents/index.js';

export type API = {
  prefix: '/api';
  routes: {
    '/login': ApiMultActionToApi<Login>;
    '/sys': ApiMultActionToApi<Sys>;
    '/documents': ApiMultActionToApi<DocumentsAction>;
  };
};

export type * from './common/index.js';
export type * from './routes/index.js';
export type * from '@repo/shared/permission';

export type * as ApiLogin from './routes/login/index.js';
export type * as ApiSys from './routes/sys/index.js';
export type * as ApiDocuments from './routes/documents/index.js';
