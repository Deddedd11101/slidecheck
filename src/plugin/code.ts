import { collectFigmaDocument } from "./adapter/collect-figma-document";
import { RULES } from "./rules/registry";
import { scanDocument } from "./scanner/scan-document";
import type { Finding, NormalizedDocument } from "../shared/types";
import type { IssueDto, PluginToUiMessage, UiToPluginMessage } from "../shared/messages";

figma.showUI(__html__, { width: 400, height: 620, title: "SlideCheck" });

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  try {
    if (message.type === "SCAN_REQUEST") {
      const document = collectFigmaDocument(message.scope);
      const findings = scanDocument(document);

      postToUi({
        type: "SCAN_RESULT",
        issues: findings.map((finding) => toIssueDto(finding, document)),
        slideCount: document.slides.length,
      });
    }

    if (message.type === "SELECT_NODE_REQUEST") {
      await selectNode(message.nodeId);
    }
  } catch (error) {
    postToUi({
      type: "SCAN_ERROR",
      message: error instanceof Error ? error.message : "Unknown scan error",
    });
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
  figma.viewport.scrollAndZoomIntoView([node]);
}

function isSelectableSceneNode(node: BaseNode): node is SceneNode {
  return "type" in node && "visible" in node && "removed" in node && node.removed === false;
}
