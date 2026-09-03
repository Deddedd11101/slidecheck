import type { Finding, NormalizedBounds, NormalizedDocument, NormalizedNode, NormalizedSlide } from "../../shared/types";
import type { ScanSettings } from "../../shared/messages";
import { createScannerConfig, isRuleGroupEnabled, type ScannerConfig } from "./config";

const ASPECT_RATIO_TOLERANCE = 0.01;
const TARGET_WIDESCREEN_RATIO = 16 / 9;

export function scanDocument(document: NormalizedDocument, settings?: Partial<ScanSettings>): Finding[] {
  const config = createScannerConfig(settings);
  const findings: Finding[] = [];

  for (const slide of document.slides) {
    findings.push(...scanSlide(slide, config));
    visitNodeTree(slide.children, slide, config, findings);
  }

  return findings;
}

function scanSlide(slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "structure.non-16-9-slide";

  if (!isRuleGroupEnabled(ruleId, config) || isWidescreen(slide.bounds)) {
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

function visitNodeTree(nodes: NormalizedNode[], slide: NormalizedSlide, config: ScannerConfig, findings: Finding[]): void {
  for (const node of nodes) {
    if (node.visible === false) {
      continue;
    }

    findings.push(...scanNode(node, slide, config));

    if (node.children?.length) {
      visitNodeTree(node.children, slide, config, findings);
    }
  }
}

function scanNode(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  return [
    ...checkGradientFill(node, slide, config),
    ...checkMask(node, slide, config),
    ...checkBlurEffects(node, slide, config),
    ...checkMultipleShadows(node, slide, config),
    ...checkBlendMode(node, slide, config),
    ...checkTextOutsideSlideBounds(node, slide, config),
    ...checkTextNearSlideEdge(node, slide, config),
    ...checkNonSystemFont(node, slide, config),
    ...checkObjectOutsideSlideBounds(node, slide, config),
    ...checkNestedFrame(node, slide, config),
  ];
}

function checkGradientFill(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "visual.gradient-fill";
  if (!isRuleGroupEnabled(ruleId, config)) return [];

  const visibleFills = node.fills?.filter((fill) => fill.visible !== false) ?? [];
  const gradientFills = visibleFills.filter((fill) => fill.type.startsWith("GRADIENT_"));

  if (gradientFills.length === 0) {
    return [];
  }

  return [
    createFinding(ruleId, slide, node, {
      fillTypes: gradientFills.map((fill) => fill.type),
    }),
  ];
}

function checkMask(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "visual.mask";
  if (!isRuleGroupEnabled(ruleId, config) || node.isMask !== true) {
    return [];
  }

  return [createFinding(ruleId, slide, node)];
}

function checkBlurEffects(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const visibleEffects = node.effects?.filter((effect) => effect.visible !== false) ?? [];
  const findings: Finding[] = [];

  const backgroundBlurRuleId = "visual.background-blur";
  if (isRuleGroupEnabled(backgroundBlurRuleId, config) && visibleEffects.some((effect) => effect.type === "BACKGROUND_BLUR")) {
    findings.push(createFinding(backgroundBlurRuleId, slide, node));
  }

  const layerBlurRuleId = "visual.layer-blur";
  if (isRuleGroupEnabled(layerBlurRuleId, config) && visibleEffects.some((effect) => effect.type === "LAYER_BLUR")) {
    findings.push(createFinding(layerBlurRuleId, slide, node));
  }

  return findings;
}

function checkMultipleShadows(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "visual.multiple-shadows";
  if (!isRuleGroupEnabled(ruleId, config)) return [];

  const visibleEffects = node.effects?.filter((effect) => effect.visible !== false) ?? [];
  const shadowCount = visibleEffects.filter((effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW").length;

  if (shadowCount <= 1) {
    return [];
  }

  return [
    createFinding(ruleId, slide, node, {
      shadowCount,
    }),
  ];
}

function checkBlendMode(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "visual.blend-mode";
  if (!isRuleGroupEnabled(ruleId, config) || !node.blendMode || node.blendMode === "NORMAL" || node.blendMode === "PASS_THROUGH") {
    return [];
  }

  return [
    createFinding(ruleId, slide, node, {
      blendMode: node.blendMode,
    }),
  ];
}

function checkTextOutsideSlideBounds(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "text.outside-slide-bounds";
  if (!isRuleGroupEnabled(ruleId, config) || node.type !== "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, config.outsideBoundsTolerance)) {
    return [];
  }

  return [createFinding(ruleId, slide, node)];
}

function checkTextNearSlideEdge(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "text.near-slide-edge";
  if (!isRuleGroupEnabled(ruleId, config) || node.type !== "TEXT" || !node.bounds || !isInsideBounds(node.bounds, slide.bounds, config.outsideBoundsTolerance)) {
    return [];
  }

  const distance = getMinDistanceToContainerEdge(node.bounds, slide.bounds);

  if (distance >= config.safeMargin) {
    return [];
  }

  return [
    createFinding(ruleId, slide, node, {
      safeMargin: config.safeMargin,
      distance,
    }),
  ];
}

function checkNonSystemFont(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "text.non-system-font";
  if (!isRuleGroupEnabled(ruleId, config) || node.type !== "TEXT" || !node.textStyle?.fontFamily || config.allowedFontFamilies.has(node.textStyle.fontFamily)) {
    return [];
  }

  return [
    createFinding(ruleId, slide, node, {
      fontFamily: node.textStyle.fontFamily,
      fontPostScriptName: node.textStyle.fontPostScriptName,
    }),
  ];
}

function checkObjectOutsideSlideBounds(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "structure.object-outside-slide-bounds";
  if (!isRuleGroupEnabled(ruleId, config) || node.type === "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, config.outsideBoundsTolerance)) {
    return [];
  }

  const overflow = getMaxOverflowBeyondContainer(node.bounds, slide.bounds);

  if (overflow <= config.minorObjectOverflow && config.strictness === "soft") {
    return [];
  }

  return [
    createFinding(ruleId, slide, node, {
      overflow,
      minorOverflowThreshold: config.minorObjectOverflow,
    }, overflow <= config.minorObjectOverflow ? "suggestion" : undefined),
  ];
}

function checkNestedFrame(node: NormalizedNode, slide: NormalizedSlide, config: ScannerConfig): Finding[] {
  const ruleId = "structure.nested-frame";
  if (!isRuleGroupEnabled(ruleId, config) || node.type !== "FRAME") {
    return [];
  }

  return [createFinding(ruleId, slide, node)];
}

function createFinding(
  ruleId: string,
  slide: NormalizedSlide,
  node: Pick<NormalizedNode, "id" | "name" | "path">,
  evidence?: Record<string, unknown>,
  severityOverride?: Finding["severityOverride"],
): Finding {
  return {
    id: `${node.id}:${ruleId}`,
    ruleId,
    nodeId: node.id,
    slideId: slide.id,
    nodeName: node.name,
    nodePath: node.path,
    severityOverride,
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

function getMaxOverflowBeyondContainer(node: NormalizedBounds, container: NormalizedBounds): number {
  const left = Math.max(container.x - node.x, 0);
  const top = Math.max(container.y - node.y, 0);
  const right = Math.max(node.x + node.width - (container.x + container.width), 0);
  const bottom = Math.max(node.y + node.height - (container.y + container.height), 0);

  return Math.max(left, top, right, bottom);
}
