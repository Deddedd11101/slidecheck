import type { ExportElementDto } from "./export";

export const PPTX_WIDE_WIDTH = 13.333;
export const PPTX_WIDE_HEIGHT = 7.5;

export function toPptxBox(element: ExportElementDto, slideWidth: number, slideHeight: number) {
  return {
    x: element.x / slideWidth * PPTX_WIDE_WIDTH,
    y: element.y / slideHeight * PPTX_WIDE_HEIGHT,
    w: Math.max(element.width / slideWidth * PPTX_WIDE_WIDTH, 0.001),
    h: Math.max(element.height / slideHeight * PPTX_WIDE_HEIGHT, 0.001),
  };
}
