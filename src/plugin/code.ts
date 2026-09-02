import { collectFigmaDocument } from "./adapter/collect-figma-document";
import { RULES } from "./rules/registry";
import { scanDocument } from "./scanner/scan-document";
import type { Finding, NormalizedDocument } from "../shared/types";
import type { IssueDto, PluginToUiMessage, UiToPluginMessage } from "../shared/messages";

figma.showUI(__html__, { width: 400, height: 620, title: "SlideCheck" });

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "SCAN_REQUEST") {
    try {
      const document = collectFigmaDocument(message.scope);
      const findings = scanDocument(document);

      postToUi({
        type: "SCAN_RESULT",
        issues: findings.map((finding) => toIssueDto(finding, document)),
        slideCount: document.slides.length,
      });
    } catch (error) {
      postToUi({
        type: "SCAN_ERROR",
        message: error instanceof Error ? error.message : "Unknown scan error",
      });
    }
  }

  if (message.type === "SELECT_NODE_REQUEST") {
    try {
      await selectNode(message.nodeId);
    } catch (error) {
      postToUi({
        type: "SELECT_NODE_ERROR",
        message: error instanceof Error ? error.message : "Unknown node selection error",
      });
    }
  }
};

function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function toIssueDto(finding: Finding, document: NormalizedDocument): IssueDto {
  const rule = RULES[finding.ruleId];
  const slide = document.slides.find((item) => item.id === finding.slideId);

  if (!rule) {
    throw new Error(`Missing rule metadata for ${finding.ruleId}`);
  }

  return {
    id: finding.id,
    group: rule.group,
    severity: rule.severity,
    title: rule.title,
    slide: slide ? slide.name : "Unknown slide",
    layer: finding.nodePath.join(" / "),
    why: rule.why,
    fix: rule.fixHint,
    nodeId: finding.nodeId,
  };
}

async function selectNode(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node || !isSelectableSceneNode(node)) {
    postToUi({ type: "SELECT_NODE_ERROR", message: "Node is not selectable" });
    return;
  }

  figma.currentPage.selection = [node];
  focusNodeSmooth(node);
  postToUi({ type: "SELECT_NODE_RESULT", nodeId });
}

function isSelectableSceneNode(node: BaseNode): node is SceneNode {
  return "type" in node && "visible" in node && "removed" in node && node.removed === false;
}

function focusNodeSmooth(node: SceneNode): void {
  if (!("absoluteBoundingBox" in node) || !node.absoluteBoundingBox) {
    figma.viewport.scrollAndZoomIntoView([node]);
    return;
  }

  const bounds = node.absoluteBoundingBox;
  const targetCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const targetZoom = getTargetZoom(bounds);
  const startCenter = figma.viewport.center;
  const startZoom = figma.viewport.zoom;
  const durationMs = 310;
  const startedAt = Date.now();

  const step = () => {
    const elapsed = Date.now() - startedAt;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeOutCubic(progress);

    figma.viewport.center = {
      x: lerp(startCenter.x, targetCenter.x, eased),
      y: lerp(startCenter.y, targetCenter.y, eased),
    };
    figma.viewport.zoom = lerp(startZoom, targetZoom, eased);

    if (progress < 1) {
      setTimeout(step, 16);
    }
  };

  step();
}

function getTargetZoom(bounds: { width: number; height: number }): number {
  const viewportBounds = figma.viewport.bounds;
  const padding = 1.8;
  const fitZoom = Math.min(
    viewportBounds.width / Math.max(bounds.width * padding, 1),
    viewportBounds.height / Math.max(bounds.height * padding, 1),
  );

  return clamp(fitZoom, 0.35, 2);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
