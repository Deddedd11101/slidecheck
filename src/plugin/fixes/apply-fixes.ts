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

    const fixed = await applyFix(target);
    if (fixed) {
      applied += 1;
    } else {
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
