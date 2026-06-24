export const { DEV, BASE_URL } = import.meta.env;

export const API_BASE = DEV ? `http://${location.hostname}:7366` : '';

export function getStaticUrl(url: string) {
  if (DEV) {
    url = url.startsWith('/') ? url.slice(1) : url;
    return `${API_BASE}/static/${url}`;
  }
  return url;
}
