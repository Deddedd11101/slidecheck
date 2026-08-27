import type { NormalizedDocument, NormalizedNode, NormalizedPaint, NormalizedSlide } from "../../shared/types";
import type { ScanScope } from "../../shared/messages";

type NodeWithChildren = SceneNode & ChildrenMixin;

export function collectDesignDocument(scope: ScanScope): NormalizedDocument {
  const roots = getScanRoots(scope);

  return {
    slides: roots.map(normalizeSlideRoot),
  };
}

function getScanRoots(scope: ScanScope): FrameNode[] {
  if (scope === "selected") {
    const selectedFrames = figma.currentPage.selection.filter((node): node is FrameNode => node.type === "FRAME");

    if (selectedFrames.length > 0) {
      return selectedFrames;
    }
  }

  return figma.currentPage.children.filter((node): node is FrameNode => node.type === "FRAME");
}

function normalizeSlideRoot(frame: FrameNode): NormalizedSlide {
  const bounds = frame.absoluteBoundingBox ?? { x: frame.x, y: frame.y, width: frame.width, height: frame.height };

  return {
    id: frame.id,
    name: frame.name,
    type: "FRAME",
    bounds,
    children: frame.children.map((child) => normalizeNode(child, [frame.name])),
  };
}

function normalizeNode(node: SceneNode, parentPath: string[]): NormalizedNode {
  const path = [...parentPath, node.name];
  const normalized: NormalizedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    path,
    visible: node.visible,
  };

  if ("opacity" in node) {
    normalized.opacity = node.opacity;
  }

  if ("blendMode" in node) {
    normalized.blendMode = node.blendMode;
  }

  if ("isMask" in node) {
    normalized.isMask = node.isMask;
  }

  if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
    normalized.bounds = node.absoluteBoundingBox;
  }

  if ("fills" in node && Array.isArray(node.fills)) {
    normalized.fills = node.fills.map(normalizePaint);
  }

  if ("effects" in node && Array.isArray(node.effects)) {
    normalized.effects = node.effects.map((effect) => ({
      type: effect.type,
      visible: effect.visible,
    }));
  }

  if (node.type === "TEXT") {
    normalized.textStyle = normalizeTextStyle(node);
  }

  if (hasChildren(node)) {
    normalized.children = node.children.map((child) => normalizeNode(child, path));
  }

  return normalized;
}

function normalizePaint(paint: Paint): NormalizedPaint {
  return {
    type: paint.type,
    visible: paint.visible,
  };
}

function normalizeTextStyle(node: TextNode) {
  const fontName = node.fontName;

  if (fontName === figma.mixed) {
    return {};
  }

  return {
    fontFamily: fontName.family,
    fontPostScriptName: fontName.style,
    fontSize: typeof node.fontSize === "number" ? node.fontSize : undefined,
  };
}

function hasChildren(node: SceneNode): node is NodeWithChildren {
  return "children" in node && Array.isArray(node.children);
}
