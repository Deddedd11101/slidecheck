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
      path,
      visible: node.visible
    };
    if ("opacity" in node) {
      normalized.opacity = node.opacity;
    }
    if ("blendMode" in node) {
      normalized.blendMode = node.blendMode;
    }
    if ("isMask" in node) {
      normalized.isMask = node.isMask;
    }
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
    "visual.mask": {
      id: "visual.mask",
      group: "visual",
      severity: "critical",
      title: "Mask may not survive PPTX export",
      why: "Masked artwork can be flattened, cropped differently, or disappear during presentation export.",
      fixHint: "Flatten or rasterize the masked group before export."
    },
    "visual.background-blur": {
      id: "visual.background-blur",
      group: "visual",
      severity: "warning",
      title: "Background blur may change in PPTX",
      why: "PowerPoint does not preserve Figma background blur rendering exactly.",
      fixHint: "Rasterize the blurred object or replace the blur with a static image."
    },
    "visual.layer-blur": {
      id: "visual.layer-blur",
      group: "visual",
      severity: "warning",
      title: "Layer blur may change in PPTX",
      why: "Layer blur can rasterize or render differently after export.",
      fixHint: "Rasterize the blurred layer if visual fidelity matters."
    },
    "visual.multiple-shadows": {
      id: "visual.multiple-shadows",
      group: "visual",
      severity: "suggestion",
      title: "Multiple shadows may not match PowerPoint",
      why: "PowerPoint shadow support is more limited than stacked Figma effects.",
      fixHint: "Simplify to one shadow or rasterize the object."
    },
    "visual.blend-mode": {
      id: "visual.blend-mode",
      group: "visual",
      severity: "warning",
      title: "Blend mode may change in PPTX",
      why: "Non-normal blend modes depend on Figma compositing and may flatten or render differently.",
      fixHint: "Flatten the blended artwork or replace it with normal opacity/fills."
    },
    "text.near-slide-edge": {
      id: "text.near-slide-edge",
      group: "text",
      severity: "warning",
      title: "Text is close to the slide edge",
      why: "Text near the slide edge can be clipped after font substitution or PPTX layout changes.",
      fixHint: "Move the text inward or increase the slide-safe margin."
    },
    "text.outside-slide-bounds": {
      id: "text.outside-slide-bounds",
      group: "text",
      severity: "critical",
      title: "Text is outside the slide bounds",
      why: "Text outside the slide can be clipped or appear unexpectedly after export.",
      fixHint: "Move the text fully inside the slide bounds."
    },
    "text.non-system-font": {
      id: "text.non-system-font",
      group: "text",
      severity: "warning",
      title: "Non-system font may be substituted",
      why: "PowerPoint will substitute fonts that are not installed on the recipient machine.",
      fixHint: "Use a safe system font or make sure the font is installed where the PPTX will be opened."
    },
    "structure.non-16-9-slide": {
      id: "structure.non-16-9-slide",
      group: "structure",
      severity: "critical",
      title: "Slide is not 16:9",
      why: "Unexpected slide aspect ratios can create inconsistent PPTX page sizes or scaling.",
      fixHint: "Resize the slide/frame to a 16:9 size such as 1920x1080."
    },
    "structure.object-outside-slide-bounds": {
      id: "structure.object-outside-slide-bounds",
      group: "structure",
      severity: "warning",
      title: "Object is outside the slide bounds",
      why: "Off-slide objects may be clipped, exported unexpectedly, or interfere with slide layout.",
      fixHint: "Move the object inside the slide or delete it before export."
    },
    "structure.nested-frame": {
      id: "structure.nested-frame",
      group: "structure",
      severity: "warning",
      title: "Nested frame may not map cleanly to PPTX",
      why: "Nested frames carry Figma-specific structure that may flatten or behave unpredictably in export workflows.",
      fixHint: "Use groups or flatten the nested frame when it is only visual artwork."
    }
  };

  // src/plugin/scanner/scan-document.ts
  var DEFAULT_SAFE_MARGIN = 16;
  var OUTSIDE_BOUNDS_TOLERANCE = 1;
  var ASPECT_RATIO_TOLERANCE = 0.01;
  var TARGET_WIDESCREEN_RATIO = 16 / 9;
  var SAFE_SYSTEM_FONTS = /* @__PURE__ */ new Set([
    "Arial",
    "Aptos",
    "Calibri",
    "Cambria",
    "Georgia",
    "Helvetica",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana"
  ]);
  function scanDocument(document) {
    const findings = [];
    for (const slide of document.slides) {
      findings.push(...scanSlide(slide));
      visitNodeTree(slide.children, slide, findings);
    }
    return findings;
  }
  function scanSlide(slide) {
    if (isWidescreen(slide.bounds)) {
      return [];
    }
    return [
      createFinding("structure.non-16-9-slide", slide, {
        id: slide.id,
        name: slide.name,
        path: [slide.name]
      })
    ];
  }
  function visitNodeTree(nodes, slide, findings) {
    var _a;
    for (const node of nodes) {
      if (node.visible === false) {
        continue;
      }
      findings.push(...scanNode(node, slide));
      if ((_a = node.children) == null ? void 0 : _a.length) {
        visitNodeTree(node.children, slide, findings);
      }
    }
  }
  function scanNode(node, slide) {
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
      ...checkNestedFrame(node, slide)
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
      createFinding("visual.gradient-fill", slide, node, {
        fillTypes: gradientFills.map((fill) => fill.type)
      })
    ];
  }
  function checkMask(node, slide) {
    if (node.isMask !== true) {
      return [];
    }
    return [createFinding("visual.mask", slide, node)];
  }
  function checkBlurEffects(node, slide) {
    var _a, _b;
    const visibleEffects = (_b = (_a = node.effects) == null ? void 0 : _a.filter((effect) => effect.visible !== false)) != null ? _b : [];
    const findings = [];
    if (visibleEffects.some((effect) => effect.type === "BACKGROUND_BLUR")) {
      findings.push(createFinding("visual.background-blur", slide, node));
    }
    if (visibleEffects.some((effect) => effect.type === "LAYER_BLUR")) {
      findings.push(createFinding("visual.layer-blur", slide, node));
    }
    return findings;
  }
  function checkMultipleShadows(node, slide) {
    var _a, _b;
    const visibleEffects = (_b = (_a = node.effects) == null ? void 0 : _a.filter((effect) => effect.visible !== false)) != null ? _b : [];
    const shadowCount = visibleEffects.filter((effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW").length;
    if (shadowCount <= 1) {
      return [];
    }
    return [
      createFinding("visual.multiple-shadows", slide, node, {
        shadowCount
      })
    ];
  }
  function checkBlendMode(node, slide) {
    if (!node.blendMode || node.blendMode === "NORMAL" || node.blendMode === "PASS_THROUGH") {
      return [];
    }
    return [
      createFinding("visual.blend-mode", slide, node, {
        blendMode: node.blendMode
      })
    ];
  }
  function checkTextOutsideSlideBounds(node, slide) {
    if (node.type !== "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, OUTSIDE_BOUNDS_TOLERANCE)) {
      return [];
    }
    return [createFinding("text.outside-slide-bounds", slide, node)];
  }
  function checkTextNearSlideEdge(node, slide) {
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
        distance
      })
    ];
  }
  function checkNonSystemFont(node, slide) {
    var _a;
    if (node.type !== "TEXT" || !((_a = node.textStyle) == null ? void 0 : _a.fontFamily) || SAFE_SYSTEM_FONTS.has(node.textStyle.fontFamily)) {
      return [];
    }
    return [
      createFinding("text.non-system-font", slide, node, {
        fontFamily: node.textStyle.fontFamily,
        fontPostScriptName: node.textStyle.fontPostScriptName
      })
    ];
  }
  function checkObjectOutsideSlideBounds(node, slide) {
    if (node.type === "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, OUTSIDE_BOUNDS_TOLERANCE)) {
      return [];
    }
    return [createFinding("structure.object-outside-slide-bounds", slide, node)];
  }
  function checkNestedFrame(node, slide) {
    if (node.type !== "FRAME") {
      return [];
    }
    return [createFinding("structure.nested-frame", slide, node)];
  }
  function createFinding(ruleId, slide, node, evidence) {
    return {
      id: `${node.id}:${ruleId}`,
      ruleId,
      nodeId: node.id,
      slideId: slide.id,
      nodeName: node.name,
      nodePath: node.path,
      evidence
    };
  }
  function isWidescreen(bounds) {
    return Math.abs(bounds.width / bounds.height - TARGET_WIDESCREEN_RATIO) <= ASPECT_RATIO_TOLERANCE;
  }
  function isInsideBounds(node, container, tolerance) {
    return node.x >= container.x - tolerance && node.y >= container.y - tolerance && node.x + node.width <= container.x + container.width + tolerance && node.y + node.height <= container.y + container.height + tolerance;
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
