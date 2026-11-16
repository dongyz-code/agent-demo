import { collectMimes } from '@/utils/index.js';
import { minerU } from './mineru.js';
import { parseTextContent } from './parser-text.js';

import type { DocumentParser } from './types.js';

/** 使用 MinerU 把图片、PDF 与 Office 文档转换为 Markdown。 */
export const minerUParser: DocumentParser = {
  name: 'mineru',
  version: '1',
  contentTypes: collectMimes('image', 'pdf', 'word', 'ppt', 'excel'),
  async parse(input) {
    const markdown = await minerU.markdown(input);
    return parseTextContent(markdown, input.file.key, true);
  },
};
