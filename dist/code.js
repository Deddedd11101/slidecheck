"use strict";
(() => {
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/plugin/adapter/collect-design.ts
  function collectDesignDocument(scope) {
    const roots = getScanRoots(scope);
    return {
      slides: roots.map(normalizeSlideRoot)
    };
  }
  function getScanRoots(scope) {
    if (scope === "selected") {
      const selectedFrames = figma.currentPage.selection.filter((node) => node.type === "FRAME");
      if (selectedFrames.length > 0) {
        return selectedFrames;
      }
    }
    return figma.currentPage.children.filter((node) => node.type === "FRAME");
  }
  function normalizeSlideRoot(frame) {
    var _a;
    const bounds = (_a = frame.absoluteBoundingBox) != null ? _a : { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    return {
      id: frame.id,
      name: frame.name,
      type: "FRAME",
      bounds,
      children: frame.children.map((child) => normalizeNode(child, [frame.name]))
    };
  }
  function normalizeNode(node, parentPath) {
    const path = [...parentPath, node.name];
    const normalized = {
      id: node.id,
      name: node.name,
      type: node.type,
      path
    };
    if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
      normalized.bounds = node.absoluteBoundingBox;
    }
    if ("fills" in node && Array.isArray(node.fills)) {
      normalized.fills = node.fills.map(normalizePaint);
    }
    if ("effects" in node && Array.isArray(node.effects)) {
      normalized.effects = node.effects.map((effect) => ({
        type: effect.type,
        visible: effect.visible
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
  function normalizePaint(paint) {
    return {
      type: paint.type,
      visible: paint.visible
    };
  }
  function normalizeTextStyle(node) {
    const fontName = node.fontName;
    if (fontName === figma.mixed) {
      return {};
    }
    return {
      fontFamily: fontName.family,
      fontPostScriptName: fontName.style,
      fontSize: typeof node.fontSize === "number" ? node.fontSize : void 0
    };
  }
  function hasChildren(node) {
    return "children" in node && Array.isArray(node.children);
  }

  // src/plugin/rules/registry.ts
  var RULES = {
    "visual.gradient-fill": {
      id: "visual.gradient-fill",
      group: "visual",
      severity: "warning",
      title: "Gradient fill may change in PPTX",
      why: "Gradient fills can degrade or be converted when exported to PowerPoint.",
      fixHint: "Replace the gradient with a solid fill or rasterize the object."
    },
    "text.near-slide-edge": {
      id: "text.near-slide-edge",
      group: "text",
      severity: "warning",
      title: "Text is close to the slide edge",
      why: "Text near the slide edge can be clipped after font substitution or PPTX layout changes.",
      fixHint: "Move the text inward or increase the slide-safe margin."
    }
  };

  // src/plugin/scanner/scan-document.ts
  var DEFAULT_SAFE_MARGIN = 16;
  function scanDocument(document) {
    const findings = [];
    for (const slide of document.slides) {
      visitNodeTree(slide.children, slide, findings);
    }
    return findings;
  }
  function visitNodeTree(nodes, slide, findings) {
    var _a;
    for (const node of nodes) {
      findings.push(...scanNode(node, slide));
      if ((_a = node.children) == null ? void 0 : _a.length) {
        visitNodeTree(node.children, slide, findings);
      }
    }
  }
  function scanNode(node, slide) {
    return [
      ...checkGradientFill(node, slide),
      ...checkTextNearSlideEdge(node, slide)
    ];
  }
  function checkGradientFill(node, slide) {
    var _a, _b;
    const visibleFills = (_b = (_a = node.fills) == null ? void 0 : _a.filter((fill) => fill.visible !== false)) != null ? _b : [];
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
          fillTypes: gradientFills.map((fill) => fill.type)
        }
      }
    ];
  }
  function checkTextNearSlideEdge(node, slide) {
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
          distance
        }
      }
    ];
  }
  function getMinDistanceToContainerEdge(node, container) {
    const left = node.x - container.x;
    const top = node.y - container.y;
    const right = container.x + container.width - (node.x + node.width);
    const bottom = container.y + container.height - (node.y + node.height);
    return Math.min(left, top, right, bottom);
  }

  // src/plugin/code.ts
  figma.showUI(__html__, { width: 400, height: 620, title: "SlideCheck" });
  figma.ui.onmessage = (message) => __async(null, null, function* () {
    try {
      if (message.type === "SCAN_REQUEST") {
        const document = collectDesignDocument(message.scope);
        const findings = scanDocument(document);
        postToUi({
          type: "SCAN_RESULT",
          issues: findings.map((finding) => toIssueDto(finding, document)),
          slideCount: document.slides.length
        });
      }
      if (message.type === "SELECT_NODE_REQUEST") {
        yield selectNode(message.nodeId);
      }
    } catch (error) {
      postToUi({
        type: "SCAN_ERROR",
        message: error instanceof Error ? error.message : "Unknown scan error"
      });
    }
  });
  function postToUi(message) {
    figma.ui.postMessage(message);
  }
  function toIssueDto(finding, document) {
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
      nodeId: finding.nodeId
    };
  }
  function selectNode(nodeId) {
    return __async(this, null, function* () {
      const node = yield figma.getNodeByIdAsync(nodeId);
      if (!node || !isSelectableSceneNode(node)) {
        postToUi({ type: "SELECT_NODE_ERROR", message: "Node is not selectable" });
        return;
      }
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    });
  }
  function isSelectableSceneNode(node) {
    return "type" in node && "visible" in node && "removed" in node && node.removed === false;
  }
})();
