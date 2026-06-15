import type { TableData, TableRow, MinWidthKey, MinWidth } from './types';

const min = 80;
const max = 1000;

const map: Record<MinWidthKey, number> = {
  mini: 40,
  sm: 80,
  normal: 120,
  large: 200,
  xl: 320,
};

function isMinKey(key?: MinWidth): key is MinWidthKey {
  return key ? key in map : false;
}

export function handleRows(
  data: TableData,
  rows: TableRow[] = [],
  // ele?: number,
) {
  const cRows = rows;
  if (!rows.length && data.length) {
    const keys = Object.keys(data[0]!);
    cRows.push(...keys.map((x) => ({ value: x })));
  }
  if (data.length) {
    // 修改单元格宽度 minWidth
    const keys = Object.keys(data[0]!);
    const len: Record<string, number> = {};
    keys.forEach((e) => {
      len[e] = 0;
    });
    data.forEach((x) => {
      keys.forEach((e) => {
        len[e]! += (x[e] + '').length;
      });
    });
    const list = keys.map((e) => len[e]!);
    const count = list.reduce((v, t) => v + t, 0);
    const cList = list.map((x) => {
      const i = (x * max) / count;
      if (i <= min) {
        return min;
      }
      return parseInt(i + '');
    });

    keys.forEach((x, index) => {
      len[x] = cList[index]!;
    });

    cRows.forEach((x) => {
      const val = x.minWidth;
      if (isMinKey(val)) {
        x.minWidth = map[val];
      } else {
        x.minWidth = val || len[x.value || ''];
      }
    });
  }

  const main: Required<TableRow>[] = cRows.map(
    ({
      value = '',
      label,
      width = 0,
      minWidth = 0,
      sort = false,
      sortType = 'string',
      fixed = false,
      slot = '',
      type,
      tips = '',
      align = 'left',
    }) => {
      return {
        label: label || value,
        value: value || slot,
        width: typeof width === 'string' ? map[width as MinWidthKey] : width,
        minWidth:
          typeof minWidth === 'string'
            ? map[minWidth as MinWidthKey]
            : minWidth,
        sort,
        sortType,
        fixed,
        slot,
        type: type!,
        tips,
        align,
      };
    },
  );

  /** 最大宽度，自动缩放？？，需要加个容器 */
  // if (ele) {
  //   const all = main
  //     .map((x) => Math.max(+x.width, +x.minWidth))
  //     .reduce((v, t) => {
  //       if (isNaN(v)) {
  //         v = 0;
  //       }
  //       if (isNaN(t)) {
  //         t = 0;
  //       }
  //       return v + t;
  //     }, 0);
  //   /** 超出是否自动缩放 */
  //   if (all > ele) {
  //     // const scale = (all * 1.1) / ele;
  //     // main.forEach((x) => {
  //     //     x.minWidth = Math.max(
  //     //         Math.floor(+x.width / scale),
  //     //         Math.floor(+x.minWidth / scale)
  //     //     );
  //     //     x.width = 0;
  //     // });
  //   }
  // }

  return main;
}
