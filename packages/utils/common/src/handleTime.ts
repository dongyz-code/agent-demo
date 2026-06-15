/** 毫秒数转换为可读性的值 */
export function handleTime(
  n: number,
  opts?: {
    secondsPrecision?: number;
  },
) {
  const _s = n / 1000;
  const h = Math.floor(_s / 3600);
  const m = Math.floor((_s - h * 3600) / 60);
  const s = (_s - h * 3600 - m * 60).toFixed(opts?.secondsPrecision ?? 1);
  let str = '';
  if (h) {
    str += `${h}h`;
  }
  if (m) {
    str += `${m}m`;
  }
  if (s) {
    str += `${s}s`;
  }
  return str;
}
