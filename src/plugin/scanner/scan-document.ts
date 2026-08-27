import type { Finding, NormalizedDocument, NormalizedNode, NormalizedSlide } from "../../shared/types";

const DEFAULT_SAFE_MARGIN = 16;

export function scanDocument(document: NormalizedDocument): Finding[] {
  const findings: Finding[] = [];

  for (const slide of document.slides) {
    visitNodeTree(slide.children, slide, findings);
  }

  return findings;
}

function visitNodeTree(nodes: NormalizedNode[], slide: NormalizedSlide, findings: Finding[]): void {
  for (const node of nodes) {
    findings.push(...scanNode(node, slide));

    if (node.children?.length) {
      visitNodeTree(node.children, slide, findings);
    }
  }
}

function scanNode(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  return [
    ...checkGradientFill(node, slide),
    ...checkTextNearSlideEdge(node, slide),
  ];
}

function checkGradientFill(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  const visibleFills = node.fills?.filter((fill) => fill.visible !== false) ?? [];
  const gradientFills = visibleFills.filter((fill) => fill.type.startsWith("GRADIENT_"));

  if (gradientFills.length === 0) {
    return [];
  }

  return [
    {
      id: `${node.id}:visual.gradient-fill`,
      ruleId: "visual.gradient-fill",
      nodeId: node.id,
      slideId: slide.id,
      nodeName: node.name,
      nodePath: node.path,
      evidence: {
        fillTypes: gradientFills.map((fill) => fill.type),
      },
    },
  ];
}

function checkTextNearSlideEdge(node: NormalizedNode, slide: NormalizedSlide): Finding[] {
  if (node.type !== "TEXT" || !node.bounds) {
    return [];
  }

  const distance = getMinDistanceToContainerEdge(node.bounds, slide.bounds);

  if (distance >= DEFAULT_SAFE_MARGIN) {
    return [];
  }

  return [
    {
      id: `${node.id}:text.near-slide-edge`,
      ruleId: "text.near-slide-edge",
      nodeId: node.id,
      slideId: slide.id,
      nodeName: node.name,
      nodePath: node.path,
      evidence: {
        safeMargin: DEFAULT_SAFE_MARGIN,
        distance,
      },
    },
  ];
}

function getMinDistanceToContainerEdge(
  node: { x: number; y: number; width: number; height: number },
  container: { x: number; y: number; width: number; height: number },
): number {
  const left = node.x - container.x;
  const top = node.y - container.y;
  const right = container.x + container.width - (node.x + node.width);
  const bottom = container.y + container.height - (node.y + node.height);

  return Math.min(left, top, right, bottom);
}

