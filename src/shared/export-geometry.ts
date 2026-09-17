import type { ExportElementDto } from "./export";

export const PPTX_WIDE_WIDTH = 13.333;
export const PPTX_WIDE_HEIGHT = 7.5;
const POINTS_PER_INCH = 72;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function toPptxBox(element: ExportElementDto, slideWidth: number, slideHeight: number) {
  return {
    x: element.x / slideWidth * PPTX_WIDE_WIDTH,
    y: element.y / slideHeight * PPTX_WIDE_HEIGHT,
    w: Math.max(element.width / slideWidth * PPTX_WIDE_WIDTH, 0.001),
    h: Math.max(element.height / slideHeight * PPTX_WIDE_HEIGHT, 0.001),
  };
}

/**
 * Переводит длину в пикселях макета в дюймы слайда 16:9.
 */
export function toPptxInches(px: number, slideWidth: number): number {
  return px / slideWidth * PPTX_WIDE_WIDTH;
}

/**
 * Переводит кегль из пикселей Figma в пункты PowerPoint.
 *
 * Слайд PPTX всегда 13.333in = 960pt в ширину, поэтому коэффициент зависит от
 * ширины исходного макета: для 1920px это 0.5, для 1280px — 0.75. Фиксированный
 * множитель делает текст тем крупнее, чем больше макет.
 */
export function toPptxFontSize(fontSizePx: number, slideWidth: number): number {
  const points = fontSizePx * (PPTX_WIDE_WIDTH * POINTS_PER_INCH) / slideWidth;
  return Math.max(Math.round(points * 100) / 100, 1);
}

/**
 * Переводит толщину обводки из пикселей в пункты.
 */
export function toPptxPoints(px: number, slideWidth: number): number {
  return Math.max(Math.round(toPptxInches(px, slideWidth) * POINTS_PER_INCH * 100) / 100, 0.25);
}

/**
 * В Figma положительный угол — поворот против часовой стрелки, в OOXML — по
 * часовой. Знак нужно инвертировать, иначе повёрнутые объекты зеркалятся.
 */
export function toPptxRotation(figmaRotation: number): number {
  if (!Number.isFinite(figmaRotation) || figmaRotation === 0) return 0;
  const normalized = -figmaRotation % 360;
  return Math.round((normalized < 0 ? normalized + 360 : normalized) * 100) / 100;
}

/**
 * Возвращает неповёрнутый прямоугольник объекта по его AABB.
 *
 * PowerPoint поворачивает фигуру вокруг центра заданной рамки, поэтому в PPTX
 * надо класть исходный размер объекта, а не габариты после поворота.
 */
export function toUnrotatedBox(aabb: Box, width: number, height: number): Box {
  return {
    x: aabb.x + (aabb.width - width) / 2,
    y: aabb.y + (aabb.height - height) / 2,
    width,
    height,
  };
}
