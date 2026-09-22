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
      if (hasNonSolidPaint(getPaints(root, "fills"))) {
        elements.push(await rasterizeBackground(root));
        context.rasterReasons.push(`${root.name}: сложная заливка фона слайда`);
      } else {
        const background = getContainerBackground(context, root);
        if (background) elements.push(background);
      }

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
 * режим наложения и background blur зависят от подложки; корневые маски,
 * обводки и прозрачность требуют общей композиции.
 */
function getSlideFallbackReason(root: FrameNode | SlideNode): string | null {
  if (getOpacity(root) < 1) return `${root.name}: прозрачность всего слайда`;
  if (root.children.some(child => child.visible && "isMask" in child && child.isMask)) {
    return `${root.name}: маска непосредственно на слайде`;
  }
  if (hasVisiblePaint(getPaints(root, "strokes"))) return `${root.name}: обводка слайда`;
  if (hasComplexCorners(root) || (isClipping(root) && getCornerRadius(root))) {
    return `${root.name}: скругленная граница слайда`;
  }
  if (hasBackdropBlur(root)) return `${root.name}: размытие подложки внутри слайда`;
  if (!hasAxisAlignedRoot(root)) return `${root.name}: трансформация корневого фрейма`;
  if (hasVisibleEffects(root)) return `${root.name}: эффекты на самом слайде`;
  if (isBlended(root)) return `${root.name}: режим наложения на слайде`;
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
  if (hasUnsupportedTransform(node)) return `${node.name}: отражение или деформация контейнера`;
  // Container borders can paint over children; flattening them into a background
  // shape changes that ordering, so keep the complete container appearance.
  if (hasVisiblePaint(getPaints(node, "strokes"))) return `${node.name}: обводка контейнера`;
  if (hasComplexCorners(node)) return `${node.name}: сложное скругление углов`;
  if (isClipping(node) && (getCornerRadius(node) || absoluteRotation(node) !== 0)) {
    return `${node.name}: обрезка скругленного или повернутого контейнера`;
  }
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
    if (hasUnsupportedTextStyle(node)) return null;
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
      valign: node.textAlignVertical === "CENTER" ? "mid" : node.textAlignVertical === "BOTTOM" ? "bottom" : "top",
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
    if (hasComplexCorners(node)) return null;
    if (node.type === "ELLIPSE" && node.arcData && (node.arcData.startingAngle !== 0 ||
        Math.abs(node.arcData.endingAngle - Math.PI * 2) > 0.0001 || node.arcData.innerRadius !== 0)) return null;
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

/**
 * Фон слайда нечем экспортировать напрямую — у заливки нет своего узла.
 * Поэтому на время экспорта создаётся прямоугольник с той же заливкой,
 * рендерится в PNG и сразу удаляется; дети слайда остаются нативными.
 */
async function rasterizeBackground(root: FrameNode | SlideNode): Promise<ExportImageDto> {
  const probe = figma.createRectangle();
  try {
    probe.name = "SlideCheck: фон слайда";
    probe.resize(root.width, root.height);
    probe.fills = getPaints(root, "fills") as readonly Paint[];
    probe.strokes = [];

    const bytes = await probe.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: getRasterScale(root.width, root.height) },
    });

    return {
      kind: "image",
      id: `${root.id}:bg`,
      bytes,
      x: 0,
      y: 0,
      width: root.width,
      height: root.height,
      rotation: 0,
      opacity: 1,
    };
  } finally {
    probe.remove();
  }
}

function getRasterScale(width: number, height: number): number {
  const longestSide = Math.max(width, height, 1);
  return Math.min(RASTER_SCALE, RASTER_MAX_SIDE / longestSide);
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

  const rotation = absoluteRotation(node);
  if (hasUnsupportedTransform(node)) return null;
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

function absoluteRotation(node: SceneNode): number {
  if ("absoluteTransform" in node) {
    const matrix = node.absoluteTransform;
    return Math.atan2(-matrix[1][0], matrix[0][0]) * 180 / Math.PI;
  }
  return "rotation" in node ? node.rotation : 0;
}

function hasUnsupportedTransform(node: SceneNode): boolean {
  if (!("absoluteTransform" in node)) return false;
  const [[a, c], [b, d]] = node.absoluteTransform;
  // Reflections, skew and scale cannot be represented by a rotation alone.
  return Math.abs(a * a + b * b - 1) > 0.0001 ||
    Math.abs(c * c + d * d - 1) > 0.0001 ||
    Math.abs(a * c + b * d) > 0.0001 || a * d - b * c < 0;
}

function hasAxisAlignedRoot(node: SceneNode): boolean {
  if (!("absoluteTransform" in node)) return absoluteRotation(node) === 0;
  const [[a, c], [b, d]] = node.absoluteTransform;
  return Math.abs(a - 1) < 0.0001 && Math.abs(d - 1) < 0.0001 &&
    Math.abs(b) < 0.0001 && Math.abs(c) < 0.0001;
}

function hasVisiblePaint(paints: readonly Paint[] | typeof figma.mixed): boolean {
  return paints === figma.mixed || paints.some(paint => paint.visible !== false);
}

function hasBackdropBlur(node: SceneNode): boolean {
  if (!node.visible || getOpacity(node) === 0) return false;
  if ("effects" in node && Array.isArray(node.effects) &&
      node.effects.some(effect => effect.visible !== false && effect.type === "BACKGROUND_BLUR")) return true;
  return "children" in node && node.children.some(hasBackdropBlur);
}

function hasComplexCorners(node: SceneNode): boolean {
  return ("cornerRadius" in node && node.cornerRadius === figma.mixed) ||
    ("cornerSmoothing" in node && node.cornerSmoothing > 0);
}

function hasUnsupportedTextStyle(node: TextNode): boolean {
  if (hasVisiblePaint(node.strokes)) return true;
  if (node.textAlignHorizontal === "JUSTIFIED") return true;
  if (node.textDecoration && node.textDecoration !== "NONE") return true;
  if (node.textCase && node.textCase !== "ORIGINAL") return true;
  if (node.lineHeight === figma.mixed || (node.lineHeight && node.lineHeight.unit !== "AUTO")) return true;
  if (node.letterSpacing === figma.mixed || (node.letterSpacing && node.letterSpacing.value !== 0)) return true;
  if (node.paragraphSpacing || node.paragraphIndent) return true;
  if (node.characters.length > 0 && typeof node.getRangeListOptions === "function") {
    const list = node.getRangeListOptions(0, node.characters.length);
    if (list === figma.mixed || list.type !== "NONE") return true;
  }
  // Weight names such as Medium/Black cannot be represented by a boolean bold flag.
  if (node.fontName !== figma.mixed &&
      !/^(regular|normal|roman|bold|italic|oblique|bold italic|bold oblique)$/i.test(node.fontName.style)) return true;
  return false;
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
  if (hasVisibleEffects(node)) return `${node.name}: эффекты слоя`;
  if (hasUnsupportedTransform(node)) return `${node.name}: отражение или деформация слоя`;
  if (node.type === "TEXT") return `${node.name}: неподдерживаемое оформление или смешанные стили текста`;
  if (NATIVE_SHAPES.has(node.type)) return `${node.name}: сложная заливка или геометрия фигуры`;
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
  const visible = paints.filter(paint => paint.visible !== false);
  return visible.length > 1 || visible.some(paint => paint.type !== "SOLID" ||
    (paint.blendMode && paint.blendMode !== "NORMAL"));
}

function getSolidPaint(paints: readonly Paint[] | typeof figma.mixed) {
  if (hasNonSolidPaint(paints)) return null;
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
