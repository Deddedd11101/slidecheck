import type { Finding, NormalizedBounds, NormalizedDocument, NormalizedNode, NormalizedSlide } from "../../shared/types";

const DEFAULT_SAFE_MARGIN = 16;
const OUTSIDE_BOUNDS_TOLERANCE = 1;
const ASPECT_RATIO_TOLERANCE = 0.01;
const TARGET_WIDESCREEN_RATIO = 16 / 9;
const SAFE_SYSTEM_FONTS = new Set([
  "Arial",
  "Aptos",
  "Calibri",
  "Cambria",
  "Georgia",
  "Helvetica",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
]);

export function scanDocument(document: NormalizedDocument): Finding[] {
  const findings: Finding[] = [];

  for (const slide of document.slides) {
    findings.push(...scanSlide(slide));
    visitNodeTree(slide.children, slide, findings);
  }

  return findings;
}

function scanSlide(slide: NormalizedSlide): Finding[] {
  if (isWidescreen(slide.bounds)) {
    return [];
  }

  return [
    createFinding("structure.non-16-9-slide", slide, {
      id: slide.id,
      name: slide.name,
      path: [slide.name],
    }),
  ];
}

function visitNodeTree(nodes: NormalizedNode[], slide: NormalizedSlide, findings: Finding[]): void {
  for (const node of nodes) {
    if (node.visible === false) {
      continue;
    }

    findings.push(...scanNode(node, slide));

    if (node.children?.length) {
      visitNodeTree(node.children, slide, findings);
    }
  }
}

function scanNode(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  return [
    ...checkGradientFill(node, slide),
    ...checkMask(node, slide),
    ...checkBlurEffects(node, slide),
    ...checkMultipleShadows(node, slide),
    ...checkBlendMode(node, slide),
    ...checkTextOutsideSlideBounds(node, slide),
    ...checkTextNearSlideEdge(node, slide),
    ...checkNonSystemFont(node, slide),
    ...checkObjectOutsideSlideBounds(node, slide),
    ...checkNestedFrame(node, slide),
  ];
}

function checkGradientFill(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  const visibleFills = node.fills?.filter((fill) => fill.visible !== false) ?? [];
  const gradientFills = visibleFills.filter((fill) => fill.type.startsWith("GRADIENT_"));

  if (gradientFills.length === 0) {
    return [];
  }

  return [
    createFinding("visual.gradient-fill", slide, node, {
      fillTypes: gradientFills.map((fill) => fill.type),
    }),
  ];
}

function checkMask(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.isMask !== true) {
    return [];
  }

  return [createFinding("visual.mask", slide, node)];
}

function checkBlurEffects(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  const visibleEffects = node.effects?.filter((effect) => effect.visible !== false) ?? [];
  const findings: Finding[] = [];

  if (visibleEffects.some((effect) => effect.type === "BACKGROUND_BLUR")) {
    findings.push(createFinding("visual.background-blur", slide, node));
  }

  if (visibleEffects.some((effect) => effect.type === "LAYER_BLUR")) {
    findings.push(createFinding("visual.layer-blur", slide, node));
  }

  return findings;
}

function checkMultipleShadows(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  const visibleEffects = node.effects?.filter((effect) => effect.visible !== false) ?? [];
  const shadowCount = visibleEffects.filter((effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW").length;

  if (shadowCount <= 1) {
    return [];
  }

  return [
    createFinding("visual.multiple-shadows", slide, node, {
      shadowCount,
    }),
  ];
}

function checkBlendMode(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (!node.blendMode || node.blendMode === "NORMAL" || node.blendMode === "PASS_THROUGH") {
    return [];
  }

  return [
    createFinding("visual.blend-mode", slide, node, {
      blendMode: node.blendMode,
    }),
  ];
}

function checkTextOutsideSlideBounds(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.type !== "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, OUTSIDE_BOUNDS_TOLERANCE)) {
    return [];
  }

  return [createFinding("text.outside-slide-bounds", slide, node)];
}

function checkTextNearSlideEdge(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.type !== "TEXT" || !node.bounds || !isInsideBounds(node.bounds, slide.bounds, OUTSIDE_BOUNDS_TOLERANCE)) {
    return [];
  }

  const distance = getMinDistanceToContainerEdge(node.bounds, slide.bounds);

  if (distance >= DEFAULT_SAFE_MARGIN) {
    return [];
  }

  return [
    createFinding("text.near-slide-edge", slide, node, {
      safeMargin: DEFAULT_SAFE_MARGIN,
      distance,
    }),
  ];
}

function checkNonSystemFont(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.type !== "TEXT" || !node.textStyle?.fontFamily || SAFE_SYSTEM_FONTS.has(node.textStyle.fontFamily)) {
    return [];
  }

  return [
    createFinding("text.non-system-font", slide, node, {
      fontFamily: node.textStyle.fontFamily,
      fontPostScriptName: node.textStyle.fontPostScriptName,
    }),
  ];
}

function checkObjectOutsideSlideBounds(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.type === "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, OUTSIDE_BOUNDS_TOLERANCE)) {
    return [];
  }

  return [createFinding("structure.object-outside-slide-bounds", slide, node)];
}

function checkNestedFrame(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.type !== "FRAME") {
    return [];
  }

  return [createFinding("structure.nested-frame", slide, node)];
}

function createFinding(
  ruleId: string,
  slide: NormalizedSlide,
  node: Pick<NormalizedNode, "id" | "name" | "path">,
  evidence?: Record<string, unknown>,
): Finding {
  return {
    id: `${node.id}:${ruleId}`,
    ruleId,
    nodeId: node.id,
    slideId: slide.id,
    nodeName: node.name,
    nodePath: node.path,
    evidence,
  };
}

function isWidescreen(bounds: NormalizedBounds): boolean {
  return Math.abs(bounds.width / bounds.height - TARGET_WIDESCREEN_RATIO) <= ASPECT_RATIO_TOLERANCE;
}

function isInsideBounds(node: NormalizedBounds, container: NormalizedBounds, tolerance: number): boolean {
  return (
    node.x >= container.x - tolerance &&
    node.y >= container.y - tolerance &&
    node.x + node.width <= container.x + container.width + tolerance &&
    node.y + node.height <= container.y + container.height + tolerance
  );
}

function getMinDistanceToContainerEdge(node: NormalizedBounds, container: NormalizedBounds): number {
  const left = node.x - container.x;
  const top = node.y - container.y;
  const right = container.x + container.width - (node.x + node.width);
  const bottom = container.y + container.height - (node.y + node.height);

  return Math.min(left, top, right, bottom);
}
