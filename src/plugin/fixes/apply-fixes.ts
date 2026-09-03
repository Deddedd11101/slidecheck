import type { FixTargetDto } from "../../shared/messages";
import { getDeltaToFitBounds } from "./geometry";

export interface ApplyFixesResult {
  applied: number;
  skipped: number;
}

const TEXT_SAFE_MARGIN = 16;
const WIDESCREEN_RATIO = 16 / 9;

export async function applyFixes(targets: FixTargetDto[]): Promise<ApplyFixesResult> {
  let applied = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const target of targets) {
    const dedupeKey = `${target.nodeId}:${target.ruleId}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const fixed = await applyFix(target);
    if (fixed) {
      applied += 1;
    } else {
      skipped += 1;
    }
  }

  return { applied, skipped };
}

async function applyFix(target: FixTargetDto): Promise<boolean> {
  const node = await figma.getNodeByIdAsync(target.nodeId);

  if (!node || !isSceneNode(node) || node.removed) {
    return false;
  }

  if (target.ruleId === "structure.non-16-9-slide") {
    return resizeSlideToWidescreen(node);
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

function moveNodeInsideSlide(node: SceneNode, margin: number): boolean {
  if (!canMove(node) || !("absoluteBoundingBox" in node) || !node.absoluteBoundingBox) {
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
