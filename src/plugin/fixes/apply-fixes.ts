import type { FixMode, FixTargetDto } from "../../shared/messages";
import { getDeltaToFitBounds } from "./geometry";

export interface ApplyFixesResult {
  applied: number;
  skipped: number;
  copyNames: string[];
  copyNodeIds: string[];
}

const TEXT_SAFE_MARGIN = 16;
const WIDESCREEN_RATIO = 16 / 9;

export async function applyFixes(targets: FixTargetDto[], mode: FixMode): Promise<ApplyFixesResult> {
  let applied = 0;
  let skipped = 0;
  const copyNames: string[] = [];
  const copyNodeIds: string[] = [];
  const seen = new Set<string>();
  const effectiveTargets = mode === "copy" ? await cloneTargetRoots(targets, copyNames, copyNodeIds) : targets;

  for (const target of effectiveTargets) {
    const dedupeKey = `${target.nodeId}:${target.ruleId}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    try {
      const fixed = await applyFix(target);
      if (fixed) {
        applied += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return { applied, skipped, copyNames, copyNodeIds };
}

async function cloneTargetRoots(targets: FixTargetDto[], copyNames: string[], copyNodeIds: string[]): Promise<FixTargetDto[]> {
  const rootMap = new Map<string, SceneNode>();
  const clonedTargets: FixTargetDto[] = [];

  for (const target of targets) {
    const original = await figma.getNodeByIdAsync(target.nodeId);
    if (!original || !isSceneNode(original)) {
      clonedTargets.push({ ...target, nodeId: "" });
      continue;
    }

    const root = findSlideRoot(original) ?? original;
    let clone = rootMap.get(root.id);
    if (!clone) {
      clone = cloneSceneNode(root);
      if (!clone) {
        clonedTargets.push({ ...target, nodeId: "" });
        continue;
      }
      rootMap.set(root.id, clone);
      clone.name = `${root.name} — исправленная копия`;
      copyNames.push(clone.name);
      copyNodeIds.push(clone.id);
    }

    const path = getChildIndexPath(root, original);
    const clonedNode = path ? getNodeByChildIndexPath(clone, path) : null;
    clonedTargets.push({ ...target, nodeId: clonedNode?.id ?? "" });
  }

  return clonedTargets;
}

function cloneSceneNode(node: SceneNode): SceneNode | null {
  if (!("clone" in node) || typeof node.clone !== "function") {
    return null;
  }

  return node.clone();
}

function getChildIndexPath(root: SceneNode, target: SceneNode): number[] | null {
  const path: number[] = [];
  let current: BaseNode | null = target;

  while (current && current.id !== root.id) {
    const parent = current.parent;
    if (!parent || !("children" in parent)) {
      return null;
    }
    const index = parent.children.findIndex(child => child.id === current?.id);
    if (index < 0) {
      return null;
    }
    path.unshift(index);
    current = parent;
  }

  return current?.id === root.id ? path : null;
}

function getNodeByChildIndexPath(root: SceneNode, path: number[]): SceneNode | null {
  let current: SceneNode = root;
  for (const index of path) {
    if (!("children" in current) || !current.children[index]) {
      return null;
    }
    current = current.children[index];
  }
  return current;
}

async function applyFix(target: FixTargetDto): Promise<boolean> {
  const node = await figma.getNodeByIdAsync(target.nodeId);

  if (!node || !isSceneNode(node) || node.removed) {
    return false;
  }

  if (target.ruleId === "structure.non-16-9-slide") {
    return resizeSlideToWidescreen(node);
  }

  if (target.ruleId === "visual.gradient-fill") {
    return replaceGradientsWithSolidFills(node);
  }

  if (target.ruleId === "visual.background-blur") {
    return removeEffects(node, effect => effect.type === "BACKGROUND_BLUR");
  }

  if (target.ruleId === "visual.layer-blur") {
    return removeEffects(node, effect => effect.type === "LAYER_BLUR");
  }

  if (target.ruleId === "visual.multiple-shadows") {
    return keepOneShadow(node);
  }

  if (target.ruleId === "visual.blend-mode") {
    return resetBlendMode(node);
  }

  if (target.ruleId === "text.non-system-font") {
    return replaceWithArial(node);
  }

  if (target.ruleId === "structure.nested-frame") {
    return replacePlainFrameWithGroup(node);
  }

  if (target.ruleId === "text.near-slide-edge" || target.ruleId === "text.outside-slide-bounds") {
    return moveNodeInsideSlide(node, TEXT_SAFE_MARGIN);
  }

  if (target.ruleId === "structure.object-outside-slide-bounds") {
    return moveNodeInsideSlide(node, 0);
  }

  return false;
}

function resizeSlideToWidescreen(node: SceneNode): boolean {
  if (!canResize(node)) {
    return false;
  }

  const width = node.width || 1920;
  node.resize(width, Math.round(width / WIDESCREEN_RATIO));
  return true;
}

async function replaceGradientsWithSolidFills(node: SceneNode): Promise<boolean> {
  if (!("fills" in node) || !("setFillsAsync" in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) {
    return false;
  }

  let changed = false;
  const fills = node.fills.map(paint => {
    if (!paint.type.startsWith("GRADIENT_") || !("gradientStops" in paint) || paint.gradientStops.length === 0) {
      return paint;
    }

    const color = getGradientMidpointColor(paint.gradientStops);
    changed = true;
    return {
      type: "SOLID" as const,
      color: { r: color.r, g: color.g, b: color.b },
      opacity: paint.opacity ?? color.a,
      visible: paint.visible,
      blendMode: paint.blendMode,
    };
  });

  if (!changed) {
    return false;
  }

  await node.setFillsAsync(fills);
  return true;
}

function getGradientMidpointColor(stops: ReadonlyArray<ColorStop>): RGBA {
  if (stops.length === 1) {
    return stops[0].color;
  }

  const ordered = [...stops].sort((left, right) => left.position - right.position);
  const midpoint = 0.5;
  const rightIndex = ordered.findIndex(stop => stop.position >= midpoint);

  if (rightIndex <= 0) {
    return ordered[0].color;
  }

  if (rightIndex === -1) {
    return ordered[ordered.length - 1].color;
  }

  const left = ordered[rightIndex - 1];
  const right = ordered[rightIndex];
  const span = Math.max(right.position - left.position, Number.EPSILON);
  const ratio = (midpoint - left.position) / span;

  return {
    r: left.color.r + (right.color.r - left.color.r) * ratio,
    g: left.color.g + (right.color.g - left.color.g) * ratio,
    b: left.color.b + (right.color.b - left.color.b) * ratio,
    a: left.color.a + (right.color.a - left.color.a) * ratio,
  };
}

function removeEffects(node: SceneNode, shouldRemove: (effect: Effect) => boolean): boolean {
  if (!("effects" in node)) {
    return false;
  }

  const effects = node.effects;
  const nextEffects = effects.filter(effect => !shouldRemove(effect));
  if (nextEffects.length === effects.length) {
    return false;
  }

  node.effects = nextEffects;
  return true;
}

function keepOneShadow(node: SceneNode): boolean {
  if (!("effects" in node)) {
    return false;
  }

  let shadowKept = false;
  let changed = false;
  const nextEffects = node.effects.filter(effect => {
    const isVisibleShadow = effect.visible && (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW");
    if (!isVisibleShadow || !shadowKept) {
      if (isVisibleShadow) shadowKept = true;
      return true;
    }
    changed = true;
    return false;
  });

  if (!changed) {
    return false;
  }

  node.effects = nextEffects;
  return true;
}

function resetBlendMode(node: SceneNode): boolean {
  if (!("blendMode" in node) || node.blendMode === "NORMAL" || node.blendMode === "PASS_THROUGH") {
    return false;
  }

  node.blendMode = "NORMAL";
  return true;
}

async function replaceWithArial(node: SceneNode): Promise<boolean> {
  if (node.type !== "TEXT" || node.fontName === figma.mixed) {
    return false;
  }

  const targetFont: FontName = {
    family: "Arial",
    style: getArialStyle(node.fontName.style),
  };

  if (node.fontName.family === targetFont.family) {
    return false;
  }

  try {
    await figma.loadFontAsync(targetFont);
    node.fontName = targetFont;
    return true;
  } catch {
    return false;
  }
}

function getArialStyle(style: string): string {
  const normalized = style.toLowerCase();
  const isBold = normalized.includes("bold") || normalized.includes("semibold") || normalized.includes("black") || normalized.includes("heavy");
  const isItalic = normalized.includes("italic") || normalized.includes("oblique");

  if (isBold && isItalic) return "Bold Italic";
  if (isBold) return "Bold";
  if (isItalic) return "Italic";
  return "Regular";
}

function replacePlainFrameWithGroup(node: SceneNode): boolean {
  if (node.type !== "FRAME" || node.children.length === 0 || node.layoutMode !== "NONE" || node.clipsContent) {
    return false;
  }

  if (node.fills === figma.mixed || node.strokes === figma.mixed || node.fills.length > 0 || node.strokes.length > 0 || node.effects.length > 0) {
    return false;
  }

  const parent = node.parent;
  if (!parent || !("children" in parent)) {
    return false;
  }

  const index = parent.children.findIndex(child => child.id === node.id);
  if (index < 0) {
    return false;
  }

  const group = figma.group([...node.children], parent, index);
  group.name = `${node.name} — группа`;
  node.remove();
  return true;
}

function moveNodeInsideSlide(node: SceneNode, margin: number): boolean {
  if (!canMove(node) || isPositionControlledByAutoLayout(node) || !("absoluteBoundingBox" in node) || !node.absoluteBoundingBox) {
    return false;
  }

  const slide = findSlideRoot(node);
  if (!slide || !("absoluteBoundingBox" in slide) || !slide.absoluteBoundingBox) {
    return false;
  }

  const delta = getDeltaToFitBounds(node.absoluteBoundingBox, slide.absoluteBoundingBox, margin);
  if (delta.x === 0 && delta.y === 0) {
    return false;
  }

  node.x += delta.x;
  node.y += delta.y;
  return true;
}

function isPositionControlledByAutoLayout(node: SceneNode): boolean {
  const parent = node.parent;
  return Boolean(parent && "layoutMode" in parent && parent.layoutMode !== "NONE");
}

function findSlideRoot(node: BaseNode): SceneNode | null {
  let current: BaseNode | null = node;
  let slide: SceneNode | null = null;

  while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (isFrameOrSlide(current)) {
      slide = current;
    }
    current = current.parent;
  }

  return slide;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return "visible" in node;
}

function isFrameOrSlide(node: BaseNode): node is FrameNode | SlideNode {
  return node.type === "FRAME" || node.type === "SLIDE";
}

function canMove(node: SceneNode): node is SceneNode & { x: number; y: number } {
  return "x" in node && "y" in node;
}

function canResize(node: SceneNode): node is SceneNode & { width: number; height: number; resize: (width: number, height: number) => void } {
  return "width" in node && "height" in node && "resize" in node;
}
