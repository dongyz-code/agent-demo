import { dayJsformat } from '@repo/utils-browser';

import type { LiteralUnion } from '@/types';

type Opt = {
  filename?: LiteralUnion<'YYYYMMDDHHmmss', string>;
};

const illegalChars = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

function sanitizeFilename(filename: string) {
  return filename.trim().replace(illegalChars, '_').replace(controlChars, '_');
}

export function downloadFile(src: string, opt?: Opt) {
  const a = document.createElement('a');
  a.setAttribute('href', src);
  a.setAttribute('target', '_blank');
  a.setAttribute(
    'download',
    opt?.filename
      ? opt.filename === 'YYYYMMDDHHmmss'
        ? dayJsformat(undefined, 'YYYYMMDDHHmmss')
        : sanitizeFilename(opt.filename)
      : '',
  );

  a.click();
}
