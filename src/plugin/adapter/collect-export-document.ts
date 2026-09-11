import type {
  ExportDocumentDto,
  ExportElementDto,
  ExportImageDto,
  ExportShapeDto,
  ExportSlideDto,
  ExportTextDto,
} from "../../shared/export";
import type { ScanScope } from "../../shared/messages";
import { toUnrotatedBox } from "../../shared/export-geometry";

const NATIVE_SHAPES = new Set(["RECTANGLE", "ELLIPSE", "LINE"]);
const CONTAINER_TYPES = new Set(["FRAME", "GROUP", "SECTION", "COMPONENT", "COMPONENT_SET", "INSTANCE"]);

/** Множитель растеризации отдельных слоёв: 2x хватает для проекторов и печати. */
const RASTER_SCALE = 2;
/** Потолок по длинной стороне PNG, чтобы фон во весь слайд не раздувал файл. */
const RASTER_MAX_SIDE = 3840;

interface SlideContext {
  root: FrameNode | SlideNode;
  rasterReasons: string[];
}

export async function collectExportDocument(scope: ScanScope): Promise<ExportDocumentDto> {
  const roots = getExportRoots(scope);
  if (roots.length === 0) {
    throw new Error("Не найдено ни одного фрейма или слайда для экспорта");
  }

  // Последовательно: параллельный exportAsync по всем слайдам съедает память
  // на больших деках и тормозит Figma.
  const slides: ExportSlideDto[] = [];
  for (const root of roots) {
    slides.push(await collectExportSlide(root));
  }
  return { slides };
}

async function collectExportSlide(root: FrameNode | SlideNode): Promise<ExportSlideDto> {
  const width = root.width;
  const height = root.height;
  const slideFallback = getSlideFallbackReason(root);

  if (!slideFallback) {
    try {
      const context: SlideContext = { root, rasterReasons: [] };
      const elements: ExportElementDto[] = [];
      const background = getContainerBackground(context, root);
      if (background) elements.push(background);

      for (const child of root.children) {
        await collectNode(context, child, elements);
      }

      return {
        id: root.id,
        name: root.name,
        width,
        height,
        mode: "editable",
        elements,
        rasterReasons: context.rasterReasons,
      };
    } catch (error) {
      return imageOnlySlide(root, error instanceof Error ? error.message : "Не удалось разобрать слайд");
    }
  }

  return imageOnlySlide(root, slideFallback);
}

async function imageOnlySlide(root: FrameNode | SlideNode, reason: string): Promise<ExportSlideDto> {
  return {
    id: root.id,
    name: root.name,
    width: root.width,
    height: root.height,
    mode: "image-only",
    elements: [],
    fallbackPng: await root.exportAsync({
      format: "PNG",
      constraint: { type: "WIDTH", value: 1920 },
    }),
    fallbackReason: reason,
  };
}

/**
 * Весь слайд уходит в PNG только там, где поэлементная растеризация не спасает:
 * режим наложения считается относительно подложки, а фон слайда нечем заменить.
 */
function getSlideFallbackReason(root: FrameNode | SlideNode): string | null {
  if (hasVisibleEffects(root)) return `${root.name}: эффекты на самом слайде`;
  if (isBlended(root)) return `${root.name}: режим наложения на слайде`;
  if (hasNonSolidPaint(getPaints(root, "fills"))) return `${root.name}: градиент или изображение в фоне слайда`;
  if (hasBlendedDescendant(root)) return `${root.name}: режим наложения внутри слайда`;
  return null;
}

async function collectNode(
  context: SlideContext,
  node: SceneNode,
  elements: ExportElementDto[],
): Promise<void> {
  if (!node.visible || getOpacity(node) === 0) return;

  if (isContainer(node)) {
    const reason = getContainerRasterReason(node);
    if (reason) {
      await pushRaster(context, node, elements, reason);
      return;
    }

    const background = getContainerBackground(context, node);
    if (background) elements.push(background);

    for (const child of node.children) {
      await collectNode(context, child, elements);
    }
    return;
  }

  const native = getNativeElement(context, node);
  if (native) {
    elements.push(native);
    return;
  }

  await pushRaster(context, node, elements, describeLeaf(node));
}

/**
 * Контейнер растеризуется целиком, когда его нельзя разобрать без потери смысла:
 * маска обрезает соседей, clipsContent прячет вылезающее, эффекты и групповая
 * прозрачность применяются ко всей группе сразу.
 */
function getContainerRasterReason(node: SceneNode & ChildrenMixin): string | null {
  if (hasVisibleEffects(node)) return `${node.name}: эффекты на группе`;
  if (isBlended(node)) return `${node.name}: режим наложения на группе`;
  if (getOpacity(node) < 1) return `${node.name}: прозрачность группы`;
  if (node.children.some(child => child.visible && "isMask" in child && child.isMask)) {
    return `${node.name}: маска внутри группы`;
  }
  if (hasNonSolidPaint(getPaints(node, "fills"))) return `${node.name}: сложный фон контейнера`;
  if (hasNonSolidPaint(getPaints(node, "strokes"))) return `${node.name}: сложная обводка контейнера`;
  if (isClipping(node) && hasOverflowingChild(node)) return `${node.name}: контент обрезан фреймом`;
  return null;
}

function getNativeElement(context: SlideContext, node: SceneNode): ExportElementDto | null {
  const box = getElementBox(context.root, node);
  if (!box) return null;

  if (hasVisibleEffects(node) || isBlended(node)) return null;

  if (node.type === "TEXT") {
    if (node.fontName === figma.mixed || node.fontSize === figma.mixed) return null;
    if (node.textTruncation === "ENDING") return null;
    const fill = getSolidPaint(node.fills);
    if (!fill) return null;

    const text: ExportTextDto = {
      kind: "text",
      id: node.id,
      text: node.characters,
      fontFamily: node.fontName.family,
      fontSize: node.fontSize,
      color: fill.color,
      colorOpacity: fill.opacity,
      bold: node.fontName.style.toLowerCase().includes("bold"),
      italic: node.fontName.style.toLowerCase().includes("italic"),
      align: node.textAlignHorizontal === "CENTER"
        ? "center"
        : node.textAlignHorizontal === "RIGHT"
          ? "right"
          : "left",
      ...box,
    };
    return text;
  }

  if (NATIVE_SHAPES.has(node.type)) {
    const fills = getPaints(node, "fills");
    const strokes = getPaints(node, "strokes");
    if (hasNonSolidPaint(fills) || hasNonSolidPaint(strokes)) return null;

    const fill = getSolidPaint(fills);
    const stroke = getSolidPaint(strokes);
    if (!fill && !stroke) return null;

    const shape: ExportShapeDto = {
      kind: "shape",
      id: node.id,
      shape: node.type === "ELLIPSE" ? "ellipse" : node.type === "LINE" ? "line" : "rect",
      fill: fill ?? undefined,
      stroke: stroke ?? undefined,
      strokeWidth: stroke ? getStrokeWidth(node) : undefined,
      cornerRadius: getCornerRadius(node),
      ...box,
    };
    return shape;
  }

  return null;
}

async function pushRaster(
  context: SlideContext,
  node: SceneNode,
  elements: ExportElementDto[],
  reason: string,
): Promise<void> {
  const raster = await rasterize(context.root, node);
  if (!raster) return;
  elements.push(raster);
  if (!context.rasterReasons.includes(reason)) {
    context.rasterReasons.push(reason);
  }
}

/**
 * Растеризует один слой. PNG уже содержит поворот, прозрачность и эффекты,
 * поэтому в PPTX он кладётся без дополнительных трансформаций.
 */
async function rasterize(root: FrameNode | SlideNode, node: SceneNode): Promise<ExportImageDto | null> {
  const rootBounds = root.absoluteBoundingBox;
  const bounds = getRenderBounds(node);
  if (!rootBounds || !bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  if (!("exportAsync" in node)) return null;

  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: getRasterScale(bounds.width, bounds.height) },
  });

  return {
    kind: "image",
    id: node.id,
    bytes,
    x: bounds.x - rootBounds.x,
    y: bounds.y - rootBounds.y,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    opacity: 1,
  };
}

function getRasterScale(width: number, height: number): number {
  const longestSide = Math.max(width, height, 1);
  return Math.min(RASTER_SCALE, Math.max(1, RASTER_MAX_SIDE / longestSide));
}

function getContainerBackground(context: SlideContext, node: SceneNode): ExportShapeDto | null {
  if (node.type !== "FRAME" && node.type !== "SLIDE" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
    return null;
  }
  const fill = getSolidPaint(getPaints(node, "fills"));
  if (!fill) return null;
  const box = getElementBox(context.root, node);
  if (!box) return null;

  return {
    kind: "shape",
    id: `${node.id}:bg`,
    shape: "rect",
    fill,
    cornerRadius: getCornerRadius(node),
    ...box,
  };
}

function getElementBox(root: FrameNode | SlideNode, node: SceneNode) {
  const aabb = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
  const rootBounds = root.absoluteBoundingBox;
  if (!aabb || !rootBounds) return null;

  const rotation = "rotation" in node && typeof node.rotation === "number" ? node.rotation : 0;
  const box = rotation === 0 || !("width" in node)
    ? { x: aabb.x, y: aabb.y, width: aabb.width, height: aabb.height }
    : toUnrotatedBox(aabb, node.width, node.height);

  return {
    x: box.x - rootBounds.x,
    y: box.y - rootBounds.y,
    width: box.width,
    height: box.height,
    rotation,
    opacity: getOpacity(node),
  };
}

function getOpacity(node: SceneNode): number {
  return "opacity" in node && typeof node.opacity === "number" ? node.opacity : 1;
}

function getRenderBounds(node: SceneNode) {
  const rendered = "absoluteRenderBounds" in node ? node.absoluteRenderBounds : null;
  if (rendered) return rendered;
  return "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
}

function isContainer(node: SceneNode): node is SceneNode & ChildrenMixin {
  return CONTAINER_TYPES.has(node.type) && "children" in node;
}

function isClipping(node: SceneNode): boolean {
  return "clipsContent" in node && node.clipsContent === true;
}

function hasOverflowingChild(node: SceneNode & ChildrenMixin): boolean {
  const bounds = getRenderBounds(node);
  if (!bounds) return false;

  const stickOut = (child: SceneNode): boolean => {
    if (!child.visible) return false;
    const childBounds = getRenderBounds(child);
    if (childBounds && (
      childBounds.x < bounds.x - 0.5 ||
      childBounds.y < bounds.y - 0.5 ||
      childBounds.x + childBounds.width > bounds.x + bounds.width + 0.5 ||
      childBounds.y + childBounds.height > bounds.y + bounds.height + 0.5
    )) {
      return true;
    }
    return "children" in child && child.children.some(stickOut);
  };

  return node.children.some(stickOut);
}

function hasBlendedDescendant(node: SceneNode | FrameNode | SlideNode): boolean {
  if (!("children" in node)) return false;
  return node.children.some(child => {
    if (!child.visible) return false;
    return isBlended(child) || hasBlendedDescendant(child);
  });
}

function isBlended(node: SceneNode): boolean {
  return "blendMode" in node && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH";
}

function hasVisibleEffects(node: SceneNode): boolean {
  if (!("effects" in node)) return false;
  const effects = node.effects;
  if (!Array.isArray(effects)) return false;
  return effects.some(effect => effect.visible !== false);
}

function describeLeaf(node: SceneNode): string {
  if (node.type === "TEXT") return `${node.name}: смешанные стили или сложная заливка текста`;
  if (NATIVE_SHAPES.has(node.type)) return `${node.name}: градиент или изображение в заливке`;
  return `${node.name}: слой типа ${node.type}`;
}

function getPaints(node: SceneNode, key: "fills" | "strokes"): readonly Paint[] | typeof figma.mixed {
  if (!(key in node)) return [];
  return (node as unknown as Record<string, readonly Paint[] | typeof figma.mixed>)[key];
}

function getStrokeWidth(node: SceneNode): number | undefined {
  if (!("strokeWeight" in node)) return undefined;
  const weight = node.strokeWeight;
  return typeof weight === "number" ? weight : undefined;
}

function getCornerRadius(node: SceneNode): number | undefined {
  if (!("cornerRadius" in node)) return undefined;
  const radius = node.cornerRadius;
  return typeof radius === "number" && radius > 0 ? radius : undefined;
}

function hasNonSolidPaint(paints: readonly Paint[] | typeof figma.mixed): boolean {
  if (paints === figma.mixed) return true;
  if (!Array.isArray(paints)) return false;
  return paints.some(paint => paint.visible !== false && paint.type !== "SOLID");
}

function getSolidPaint(paints: readonly Paint[] | typeof figma.mixed) {
  if (paints === figma.mixed || !Array.isArray(paints) || paints.length === 0) return null;
  const paint = paints.find(item => item.visible !== false && item.type === "SOLID");
  if (!paint || paint.type !== "SOLID") return null;
  return {
    color: rgbToHex(paint.color),
    opacity: paint.opacity ?? 1,
  };
}

function rgbToHex(color: RGB): string {
  return [color.r, color.g, color.b]
    .map(channel => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function getExportRoots(scope: ScanScope): Array<FrameNode | SlideNode> {
  if (figma.editorType === "slides") {
    if (scope === "selected") {
      const selected = figma.currentPage.selection.filter((node): node is SlideNode => node.type === "SLIDE");
      if (selected.length > 0) return selected;
      if (figma.currentPage.focusedSlide) return [figma.currentPage.focusedSlide];
    }
    return figma.getSlideGrid().flat();
  }

  if (scope === "selected") {
    const selected = figma.currentPage.selection.filter((node): node is FrameNode => node.type === "FRAME");
    if (selected.length > 0) return selected;
  }
  return figma.currentPage.children.filter((node): node is FrameNode => node.type === "FRAME");
}
