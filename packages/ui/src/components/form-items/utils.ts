import { debounce } from '@repo/utils-browser';

export const scrollView = debounce((el: HTMLElement) => {
  el.scrollIntoView({
    behavior: 'smooth',
  });
}, 200);

const textLengthCache: Record<string, number> = {};
export function getTextWidthDOM(text: string) {
  if (!textLengthCache[text]) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    // console.log(
    //   window
    //     .getComputedStyle(document.documentElement)
    //     .getPropertyValue('font-size'),
    // );
    context.font = '16px Arial';
    textLengthCache[text] = context.measureText(text).width;
  }
  return textLengthCache[text];
}
