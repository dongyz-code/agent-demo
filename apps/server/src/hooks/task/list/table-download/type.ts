import type { Table } from '@/database/index.js';

export type TableDownload = {
  table: Table;
  target?: string;
};
