import PptxGenJS from "pptxgenjs";
import type { ExportDocumentDto, ExportElementDto } from "../../shared/export";
import { PPTX_WIDE_HEIGHT, PPTX_WIDE_WIDTH, toPptxBox, toPptxFontSize, toPptxInches, toPptxPoints, toPptxRotation } from "../../shared/export-geometry";

export function createEditablePptx(document: ExportDocumentDto): PptxGenJS {
  if (document.slides.length === 0) throw new Error("Нет слайдов для экспорта");

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SlideCheck";
  pptx.subject = "Editable PPTX export from SlideCheck";
  pptx.title = "SlideCheck editable export";

  for (const source of document.slides) {
    const outputSlide = pptx.addSlide();
    outputSlide.background = { color: "FFFFFF" };
    if (source.mode === "image-only" && source.fallbackPng) {
      addContainedImage(outputSlide, bytesToPngDataUrl(source.fallbackPng), source.width, source.height);
      continue;
    }

    for (const element of source.elements) {
      addEditableElement(pptx, outputSlide, element, source.width, source.height);
    }
  }

  return pptx;
}

export async function createEditablePptxFile(document: ExportDocumentDto): Promise<string> {
  const pptx = createEditablePptx(document);
  const fileName = `slidecheck-editable-${new Date().toISOString().slice(0, 10)}.pptx`;
  await pptx.writeFile({ fileName });
  return fileName;
}

function addContainedImage(slide: PptxGenJS.Slide, data: string, width: number, height: number): void {
  const slideWidth = PPTX_WIDE_WIDTH;
  const slideHeight = PPTX_WIDE_HEIGHT;
  const sourceRatio = width / Math.max(height, 1);
  const slideRatio = slideWidth / slideHeight;
  const imageWidth = sourceRatio >= slideRatio ? slideWidth : slideHeight * sourceRatio;
  const imageHeight = sourceRatio >= slideRatio ? slideWidth / sourceRatio : slideHeight;
  slide.addImage({
    data,
    x: (slideWidth - imageWidth) / 2,
    y: (slideHeight - imageHeight) / 2,
    w: imageWidth,
    h: imageHeight,
  });
}

export function addEditableElement(pptx: PptxGenJS, slide: PptxGenJS.Slide, element: ExportElementDto, slideWidth: number, slideHeight: number): void {
  const box = toPptxBox(element, slideWidth, slideHeight);
  const rotate = toPptxRotation(element.rotation);
  const transparency = toTransparency(element.opacity);

  if (element.kind === "text") {
    slide.addText(element.text, {
      ...box,
      fontFace: element.fontFamily,
      fontSize: toPptxFontSize(element.fontSize, slideWidth),
      color: element.color,
      bold: element.bold,
      italic: element.italic,
      align: element.align,
      valign: element.valign ?? "top",
      margin: 0,
      transparency: toTransparency(element.opacity * element.colorOpacity),
      breakLine: false,
      fit: "shrink",
      rotate,
    });
    return;
  }

  if (element.kind === "image") {
    slide.addImage({
      data: bytesToPngDataUrl(element.bytes),
      ...box,
      transparency,
      rotate,
    });
    return;
  }

  const isRounded = element.shape === "rect" && (element.cornerRadius ?? 0) > 0;
  const shapeType = element.shape === "ellipse"
    ? pptx.ShapeType.ellipse
    : element.shape === "line"
      ? pptx.ShapeType.line
      : isRounded
        ? pptx.ShapeType.roundRect
        : pptx.ShapeType.rect;

  slide.addShape(shapeType, {
    ...box,
    rotate,
    ...(isRounded ? { rectRadius: toPptxInches(element.cornerRadius ?? 0, slideWidth) } : {}),
    fill: element.fill
      ? { color: element.fill.color, transparency: toTransparency(element.opacity * element.fill.opacity) }
      : { color: "FFFFFF", transparency: 100 },
    ...(element.stroke
      ? {
        line: {
          color: element.stroke.color,
          width: toPptxPoints(element.strokeWidth ?? 1, slideWidth),
          transparency: toTransparency(element.opacity * element.stroke.opacity),
        },
      }
      // pptxgenjs emits an empty a:ln for type "none", allowing inherited outlines.
      : { line: { color: "FFFFFF", transparency: 100 } }),
  });
}

function toTransparency(visibility: number): number {
  return Math.min(100, Math.max(0, Math.round(100 - visibility * 100)));
}

export function bytesToPngDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}
