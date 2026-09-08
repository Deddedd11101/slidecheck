import type {
  ExportDocumentDto,
  ExportElementDto,
  ExportImageDto,
  ExportShapeDto,
  ExportSlideDto,
  ExportTextDto,
} from "../../shared/export";
import type { ScanScope } from "../../shared/messages";

const SUPPORTED_SHAPES = new Set(["RECTANGLE", "ELLIPSE", "LINE"]);

export async function collectExportDocument(scope: ScanScope): Promise<ExportDocumentDto> {
  const roots = getExportRoots(scope);
  if (roots.length === 0) {
    throw new Error("Не найдено ни одного фрейма или слайда для экспорта");
  }

  const slides = await Promise.all(roots.map(collectExportSlide));
  return { slides };
}

async function collectExportSlide(root: FrameNode | SlideNode): Promise<ExportSlideDto> {
  const width = root.width;
  const height = root.height;
  const unsupported = findUnsupportedNode(root);

  if (unsupported) {
    return {
      id: root.id,
      name: root.name,
      width,
      height,
      mode: "image-only",
      elements: [],
      fallbackPng: await root.exportAsync({
        format: "PNG",
        constraint: { type: "WIDTH", value: 1920 },
      }),
      fallbackReason: unsupported,
    };
  }

  const elements: ExportElementDto[] = [];
  await collectChildren(root, root, elements);

  return {
    id: root.id,
    name: root.name,
    width,
    height,
    mode: "editable",
    elements,
  };
}

async function collectChildren(
  root: FrameNode | SlideNode,
  parent: ChildrenMixin,
  elements: ExportElementDto[],
): Promise<void> {
  for (const node of parent.children) {
    if (!node.visible) continue;

    const element = await collectElement(root, node);
    if (element) elements.push(element);

    if ("children" in node) {
      await collectChildren(root, node, elements);
    }
  }
}

async function collectElement(
  root: FrameNode | SlideNode,
  node: SceneNode,
): Promise<ExportElementDto | null> {
  const bounds = getBounds(root, node);
  if (!bounds || node.type === "GROUP" || node.type === "FRAME" || node.type === "SECTION") {
    return null;
  }

  if (node.type === "TEXT") {
    const style = node.fontName;
    const fill = getSolidPaint(node.fills);
    if (style === figma.mixed || node.fontSize === figma.mixed || !fill) return null;

    const text: ExportTextDto = {
      kind: "text",
      id: node.id,
      text: node.characters,
      fontFamily: style.family,
      fontSize: node.fontSize,
      color: fill.color,
      bold: style.style.toLowerCase().includes("bold"),
      italic: style.style.toLowerCase().includes("italic"),
      align: node.textAlignHorizontal === "CENTER"
        ? "center"
        : node.textAlignHorizontal === "RIGHT"
          ? "right"
          : "left",
      ...bounds,
    };
    return text;
  }

  if (SUPPORTED_SHAPES.has(node.type)) {
    const image = await getImagePaint(node);
    if (image) return { kind: "image", id: node.id, bytes: image, ...bounds } satisfies ExportImageDto;

    const fill = getSolidPaint(node.fills);
    const stroke = getSolidPaint(node.strokes);
    if (!fill && !stroke) return null;

    const shape: ExportShapeDto = {
      kind: "shape",
      id: node.id,
      shape: node.type === "ELLIPSE" ? "ellipse" : node.type === "LINE" ? "line" : "rect",
      fill: fill?.color,
      stroke: stroke?.color,
      ...bounds,
    };
    return shape;
  }

  return null;
}

function findUnsupportedNode(root: FrameNode | SlideNode): string | null {
  const visit = (node: SceneNode): string | null => {
    if (!node.visible) return null;
    if (node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
      return `${node.name}: режим наложения ${node.blendMode}`;
    }
    if (node.effects.length > 0) return `${node.name}: эффекты и blur`;

    if (node.type === "TEXT") {
      if (node.fontName === figma.mixed || node.fontSize === figma.mixed) {
        return `${node.name}: смешанные стили текста`;
      }
      if (!getSolidPaint(node.fills)) return `${node.name}: сложная заливка текста`;
    } else if (SUPPORTED_SHAPES.has(node.type)) {
      if (hasUnsupportedPaint(node.fills) || hasUnsupportedPaint(node.strokes)) {
        return `${node.name}: градиент, маска или сложная заливка`;
      }
    } else if (node.type !== "GROUP" && node.type !== "FRAME" && node.type !== "SECTION") {
      return `${node.name}: тип ${node.type} пока не поддерживается`;
    }

    if ("children" in node) {
      for (const child of node.children) {
        const reason = visit(child);
        if (reason) return reason;
      }
    }
    return null;
  };

  if ("children" in root) {
    for (const child of root.children) {
      const reason = visit(child);
      if (reason) return reason;
    }
  }
  return null;
}

function getBounds(root: FrameNode | SlideNode, node: SceneNode) {
  const bounds = node.absoluteBoundingBox;
  const rootBounds = root.absoluteBoundingBox;
  if (!bounds || !rootBounds) return null;

  return {
    x: bounds.x - rootBounds.x,
    y: bounds.y - rootBounds.y,
    width: bounds.width,
    height: bounds.height,
    rotation: node.rotation,
    opacity: node.opacity,
  };
}

function hasUnsupportedPaint(paints: readonly Paint[] | typeof figma.mixed): boolean {
  if (paints === figma.mixed) return true;
  return paints.some(paint => paint.visible !== false && paint.type !== "SOLID" && paint.type !== "IMAGE");
}

function getSolidPaint(paints: readonly Paint[] | typeof figma.mixed) {
  if (paints === figma.mixed || paints.length === 0) return null;
  const paint = paints.find(item => item.visible !== false && item.type === "SOLID");
  if (!paint || paint.type !== "SOLID") return null;
  return {
    color: rgbToHex(paint.color),
    opacity: paint.opacity ?? 1,
  };
}

async function getImagePaint(node: SceneNode): Promise<Uint8Array | null> {
  if (!("fills" in node) || node.fills === figma.mixed) return null;
  const paint = node.fills.find(item => item.visible !== false && item.type === "IMAGE");
  if (!paint || paint.type !== "IMAGE") return null;
  // Re-export as PNG so the UI does not have to guess whether the source was
  // JPEG, SVG, or another image format.
  return node.exportAsync({ format: "PNG" });
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
