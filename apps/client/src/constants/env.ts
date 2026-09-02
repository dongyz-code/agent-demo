/** 当前客户端是否运行在 Vite 开发服务器中。 */
export const { DEV } = import.meta.env;

/** 开发时直连服务端，生产时由同源反向代理转发 `/api`。 */
export const API_BASE = DEV ? `http://${location.hostname}:7366` : '';
