const getDateRange = (callback: (now: Date) => void) => {
  const end = new Date();
  const start = new Date();
  callback(start);
  return [start, end];
};

export const shortcuts: {
  text: string;
  value: Date[];
  current?: boolean;
}[] = [
  {
    text: '近一天',
    value: getDateRange((now) => now.setDate(now.getDate() - 1)),
  },
  {
    text: '近三天',
    value: getDateRange((now) => now.setDate(now.getDate() - 3)),
  },
  {
    text: '近一周',
    value: getDateRange((now) => now.setDate(now.getDate() - 7)),
  },
  {
    text: '近一月',
    value: getDateRange((now) => now.setMonth(now.getMonth() - 1)),
  },
  {
    text: '近三月',
    value: getDateRange((now) => now.setMonth(now.getMonth() - 3)),
  },
  {
    text: '近半年',
    value: getDateRange((now) => now.setMonth(now.getMonth() - 6)),
  },
  {
    text: '近一年',
    value: getDateRange((now) => now.setFullYear(now.getFullYear() - 1)),
  },
  {
    text: '近三年',
    value: getDateRange((now) => now.setFullYear(now.getFullYear() - 3)),
  },
  {
    text: '近五年',
    value: getDateRange((now) => now.setFullYear(now.getFullYear() - 5)),
  },
  {
    text: '近十年',
    value: getDateRange((now) => now.setFullYear(now.getFullYear() - 10)),
  },
];
