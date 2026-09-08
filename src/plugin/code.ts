import { collectFigmaDocument } from "./adapter/collect-figma-document";
import { collectExportDocument } from "./adapter/collect-export-document";
import { applyFixes } from "./fixes/apply-fixes";
import { RULES } from "./rules/registry";
import { scanDocument } from "./scanner/scan-document";
import type { Finding, NormalizedDocument } from "../shared/types";
import type { ExportedSlideDto, IssueDto, PluginToUiMessage, ScanScope, UiToPluginMessage } from "../shared/messages";

figma.showUI(__html__, { width: 400, height: 620, title: "SlideCheck" });

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "SCAN_REQUEST") {
    try {
      const document = collectFigmaDocument(message.scope);
      const findings = scanDocument(document, message.settings);

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

  if (message.type === "APPLY_FIXES_REQUEST") {
    try {
      const applyResult = await applyFixes(message.targets, message.mode);
      const scanScope = message.mode === "copy" && applyResult.copyNodeIds.length > 0
        ? await selectCopiedRoots(applyResult.copyNodeIds)
        : message.scope;
      const document = collectFigmaDocument(scanScope);
      const findings = scanDocument(document, message.settings);

      postToUi({
        type: "APPLY_FIXES_RESULT",
        result: {
          ...applyResult,
          issues: findings.map((finding) => toIssueDto(finding, document)),
          slideCount: document.slides.length,
        },
      });
    } catch (error) {
      postToUi({
        type: "APPLY_FIXES_ERROR",
        message: error instanceof Error ? error.message : "Unknown autofix error",
      });
    }
  }

  if (message.type === "EXPORT_PPTX_REQUEST") {
    try {
      const slides = await exportSlidesAsPng(message.scope);
      postToUi({ type: "EXPORT_PPTX_RESULT", slides });
    } catch (error) {
      postToUi({
        type: "EXPORT_PPTX_ERROR",
        message: error instanceof Error ? error.message : "Unknown PPTX export error",
      });
    }
  }

  if (message.type === "EXPORT_EDITABLE_PPTX_REQUEST") {
    try {
      const document = await collectExportDocument(message.scope);
      postToUi({ type: "EXPORT_EDITABLE_PPTX_RESULT", document });
    } catch (error) {
      postToUi({
        type: "EXPORT_EDITABLE_PPTX_ERROR",
        message: error instanceof Error ? error.message : "Unknown editable PPTX export error",
      });
    }
  }
};

function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

async function selectCopiedRoots(nodeIds: string[]): Promise<"selected"> {
  const nodes = (await Promise.all(nodeIds.map(nodeId => figma.getNodeByIdAsync(nodeId))))
    .filter((node): node is SceneNode => Boolean(node) && isSelectableSceneNode(node));

  if (nodes.length > 0) {
    figma.currentPage.selection = nodes;
  }

  return "selected";
}

async function exportSlidesAsPng(scope: ScanScope): Promise<ExportedSlideDto[]> {
  const roots = getExportRoots(scope);
  if (roots.length === 0) {
    throw new Error("Не найдено ни одного фрейма или слайда для экспорта");
  }

  const exported: ExportedSlideDto[] = [];
  for (const root of roots) {
    const bytes = await root.exportAsync({
      format: "PNG",
      constraint: { type: "WIDTH", value: 1920 },
    });
    exported.push({
      name: root.name,
      width: root.width,
      height: root.height,
      bytes,
    });
  }

  return exported;
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

function toIssueDto(finding: Finding, document: NormalizedDocument): IssueDto {
  const rule = RULES[finding.ruleId];
  const slide = document.slides.find((item) => item.id === finding.slideId);

  if (!rule) {
    throw new Error(`Missing rule metadata for ${finding.ruleId}`);
  }

  return {
    id: finding.id,
    ruleId: finding.ruleId,
    group: rule.group,
    severity: finding.severityOverride ?? rule.severity,
    title: rule.title,
    slide: slide ? slide.name : "Unknown slide",
    layer: finding.nodePath.join(" / "),
    why: rule.why,
    fix: rule.fixHint,
    fixAvailable: Boolean(rule.autofix),
    fixLabel: rule.autofix?.label,
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
  const durationMs = 500;
  const startedAt = Date.now();

  const step = () => {
    const elapsed = Date.now() - startedAt;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeInOutCubic(progress);

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

  return clamp(fitZoom * 0.66, 0.35, 2);
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
