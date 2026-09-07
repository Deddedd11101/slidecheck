"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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

  // src/plugin/adapter/collect-figma-document.ts
  function collectFigmaDocument(scope) {
    const roots = getScanRoots(scope);
    return {
      slides: roots.map(normalizeSlideRoot)
    };
  }
  function getScanRoots(scope) {
    if (figma.editorType === "slides") {
      return getSlideScanRoots(scope);
    }
    return getDesignScanRoots(scope);
  }
  function getDesignScanRoots(scope) {
    if (scope === "selected") {
      const selectedFrames = figma.currentPage.selection.filter((node) => node.type === "FRAME");
      if (selectedFrames.length > 0) {
        return selectedFrames;
      }
    }
    return figma.currentPage.children.filter((node) => node.type === "FRAME");
  }
  function getSlideScanRoots(scope) {
    if (scope === "selected") {
      const selectedSlides = figma.currentPage.selection.filter((node) => node.type === "SLIDE");
      if (selectedSlides.length > 0) {
        return selectedSlides;
      }
      if (figma.currentPage.focusedSlide) {
        return [figma.currentPage.focusedSlide];
      }
    }
    return figma.getSlideGrid().flat();
  }
  function normalizeSlideRoot(frame) {
    var _a;
    const bounds = (_a = frame.absoluteBoundingBox) != null ? _a : { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    return {
      id: frame.id,
      name: frame.name,
      type: frame.type === "SLIDE" ? "SLIDE" : "FRAME",
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

  // src/plugin/fixes/geometry.ts
  function getDeltaToFitBounds(bounds, container, margin) {
    const maxX = container.x + container.width - margin - bounds.width;
    const maxY = container.y + container.height - margin - bounds.height;
    const minX = container.x + margin;
    const minY = container.y + margin;
    const targetX = clamp(bounds.x, minX, Math.max(minX, maxX));
    const targetY = clamp(bounds.y, minY, Math.max(minY, maxY));
    return {
      x: targetX - bounds.x,
      y: targetY - bounds.y
    };
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // src/plugin/fixes/apply-fixes.ts
  var TEXT_SAFE_MARGIN = 16;
  var WIDESCREEN_RATIO = 16 / 9;
  function applyFixes(targets) {
    return __async(this, null, function* () {
      let applied = 0;
      let skipped = 0;
      const seen = /* @__PURE__ */ new Set();
      for (const target of targets) {
        const dedupeKey = `${target.nodeId}:${target.ruleId}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const fixed = yield applyFix(target);
        if (fixed) {
          applied += 1;
        } else {
          skipped += 1;
        }
      }
      return { applied, skipped };
    });
  }
  function applyFix(target) {
    return __async(this, null, function* () {
      const node = yield figma.getNodeByIdAsync(target.nodeId);
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
    });
  }
  function resizeSlideToWidescreen(node) {
    if (!canResize(node)) {
      return false;
    }
    const width = node.width || 1920;
    node.resize(width, Math.round(width / WIDESCREEN_RATIO));
    return true;
  }
  function moveNodeInsideSlide(node, margin) {
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
  function findSlideRoot(node) {
    let current = node;
    let slide = null;
    while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
      if (isFrameOrSlide(current)) {
        slide = current;
      }
      current = current.parent;
    }
    return slide;
  }
  function isSceneNode(node) {
    return "visible" in node;
  }
  function isFrameOrSlide(node) {
    return node.type === "FRAME" || node.type === "SLIDE";
  }
  function canMove(node) {
    return "x" in node && "y" in node;
  }
  function canResize(node) {
    return "width" in node && "height" in node && "resize" in node;
  }

  // src/plugin/rules/registry.ts
  var RULES = {
    "visual.gradient-fill": {
      id: "visual.gradient-fill",
      group: "visual",
      severity: "warning",
      title: "\u0413\u0440\u0430\u0434\u0438\u0435\u043D\u0442 \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F \u0432 PPTX",
      why: "\u0413\u0440\u0430\u0434\u0438\u0435\u043D\u0442\u043D\u044B\u0435 \u0437\u0430\u043B\u0438\u0432\u043A\u0438 \u043C\u043E\u0433\u0443\u0442 \u0443\u043F\u0440\u043E\u0441\u0442\u0438\u0442\u044C\u0441\u044F, \u0438\u0441\u043A\u0430\u0437\u0438\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u043F\u0440\u0435\u0432\u0440\u0430\u0442\u0438\u0442\u044C\u0441\u044F \u0432 \u0441\u043F\u043B\u043E\u0448\u043D\u043E\u0439 \u0446\u0432\u0435\u0442 \u043F\u0440\u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0435 \u0432 PowerPoint.",
      fixHint: "\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442 \u043D\u0430 \u0441\u043F\u043B\u043E\u0448\u043D\u043E\u0439 \u0446\u0432\u0435\u0442 \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u043F\u0435\u0440\u0435\u0434 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u043E\u043C."
    },
    "visual.mask": {
      id: "visual.mask",
      group: "visual",
      severity: "critical",
      title: "\u041C\u0430\u0441\u043A\u0430 \u043C\u043E\u0436\u0435\u0442 \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438\u0441\u044C \u0432 PPTX",
      why: "\u041E\u0431\u044A\u0435\u043A\u0442\u044B \u0441 \u043C\u0430\u0441\u043A\u0430\u043C\u0438 \u043C\u043E\u0433\u0443\u0442 \u0441\u043F\u043B\u044E\u0449\u0438\u0442\u044C\u0441\u044F, \u043E\u0431\u0440\u0435\u0437\u0430\u0442\u044C\u0441\u044F \u0438\u043D\u0430\u0447\u0435 \u0438\u043B\u0438 \u043F\u0440\u043E\u043F\u0430\u0441\u0442\u044C \u043F\u0440\u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0435 \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438.",
      fixHint: "\u0421\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0441 \u043C\u0430\u0441\u043A\u043E\u0439 \u043F\u0435\u0440\u0435\u0434 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u043E\u043C."
    },
    "visual.background-blur": {
      id: "visual.background-blur",
      group: "visual",
      severity: "warning",
      title: "Background blur \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F \u0432 PPTX",
      why: "PowerPoint \u043D\u0435 \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442 background blur \u0438\u0437 Figma \u043E\u0434\u0438\u043D \u0432 \u043E\u0434\u0438\u043D.",
      fixHint: "\u0420\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u0441 \u0440\u0430\u0437\u043C\u044B\u0442\u0438\u0435\u043C \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u044D\u0444\u0444\u0435\u043A\u0442 \u0441\u0442\u0430\u0442\u0438\u0447\u043D\u044B\u043C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C."
    },
    "visual.layer-blur": {
      id: "visual.layer-blur",
      group: "visual",
      severity: "warning",
      title: "Layer blur \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F \u0432 PPTX",
      why: "\u0420\u0430\u0437\u043C\u044B\u0442\u0438\u0435 \u0441\u043B\u043E\u044F \u043C\u043E\u0436\u0435\u0442 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u0432\u044B\u0433\u043B\u044F\u0434\u0435\u0442\u044C \u0438\u043D\u0430\u0447\u0435 \u043F\u043E\u0441\u043B\u0435 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430.",
      fixHint: "\u0420\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u0440\u0430\u0437\u043C\u044B\u0442\u044B\u0439 \u0441\u043B\u043E\u0439, \u0435\u0441\u043B\u0438 \u0432\u0430\u0436\u043D\u0430 \u0442\u043E\u0447\u043D\u0430\u044F \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430."
    },
    "visual.multiple-shadows": {
      id: "visual.multiple-shadows",
      group: "visual",
      severity: "suggestion",
      title: "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0442\u0435\u043D\u0435\u0439 \u043C\u043E\u0433\u0443\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u0432 PowerPoint",
      why: "\u041C\u043E\u0434\u0435\u043B\u044C \u0442\u0435\u043D\u0435\u0439 \u0432 PowerPoint \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u0435\u0435, \u0447\u0435\u043C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0445 \u044D\u0444\u0444\u0435\u043A\u0442\u043E\u0432 \u0432 Figma.",
      fixHint: "\u0423\u043F\u0440\u043E\u0441\u0442\u0438\u0442\u0435 \u0442\u0435\u043D\u044C \u0434\u043E \u043E\u0434\u043D\u043E\u0433\u043E \u044D\u0444\u0444\u0435\u043A\u0442\u0430 \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442."
    },
    "visual.blend-mode": {
      id: "visual.blend-mode",
      group: "visual",
      severity: "warning",
      title: "\u0420\u0435\u0436\u0438\u043C \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F \u0432 PPTX",
      why: "\u041D\u0435\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 blend modes \u0437\u0430\u0432\u0438\u0441\u044F\u0442 \u043E\u0442 \u0440\u0435\u043D\u0434\u0435\u0440\u0430 Figma \u0438 \u043C\u043E\u0433\u0443\u0442 \u0441\u043F\u043B\u044E\u0449\u0438\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u0432\u044B\u0433\u043B\u044F\u0434\u0435\u0442\u044C \u0438\u043D\u0430\u0447\u0435.",
      fixHint: "\u0421\u0432\u0435\u0434\u0438\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u0441 \u0440\u0435\u0436\u0438\u043C\u043E\u043C \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u044D\u0444\u0444\u0435\u043A\u0442 \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u043F\u0440\u043E\u0437\u0440\u0430\u0447\u043D\u043E\u0441\u0442\u044C\u044E/\u0437\u0430\u043B\u0438\u0432\u043A\u043E\u0439."
    },
    "text.near-slide-edge": {
      id: "text.near-slide-edge",
      group: "text",
      severity: "warning",
      title: "\u0422\u0435\u043A\u0441\u0442 \u0431\u043B\u0438\u0437\u043A\u043E \u043A \u043A\u0440\u0430\u044E \u0441\u043B\u0430\u0439\u0434\u0430",
      why: "\u0422\u0435\u043A\u0441\u0442 \u0440\u044F\u0434\u043E\u043C \u0441 \u043A\u0440\u0430\u0435\u043C \u043C\u043E\u0436\u0435\u0442 \u043E\u0431\u0440\u0435\u0437\u0430\u0442\u044C\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043C\u0435\u043D\u044B \u0448\u0440\u0438\u0444\u0442\u0430 \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u043E\u0439 \u0432\u0451\u0440\u0441\u0442\u043A\u0438 \u0432 PowerPoint.",
      fixHint: "\u0421\u0434\u0432\u0438\u043D\u044C\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0432\u043D\u0443\u0442\u0440\u044C \u0441\u043B\u0430\u0439\u0434\u0430 \u0438\u043B\u0438 \u0443\u0432\u0435\u043B\u0438\u0447\u044C\u0442\u0435 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u043E\u0442\u0441\u0442\u0443\u043F.",
      autofix: { label: "\u0421\u0434\u0432\u0438\u043D\u0443\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0432\u043D\u0443\u0442\u0440\u044C \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0439 \u0437\u043E\u043D\u044B" }
    },
    "text.outside-slide-bounds": {
      id: "text.outside-slide-bounds",
      group: "text",
      severity: "critical",
      title: "\u0422\u0435\u043A\u0441\u0442 \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0437\u0430 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0441\u043B\u0430\u0439\u0434\u0430",
      why: "\u0422\u0435\u043A\u0441\u0442 \u0437\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u0441\u043B\u0430\u0439\u0434\u0430 \u043C\u043E\u0436\u0435\u0442 \u043E\u0431\u0440\u0435\u0437\u0430\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u043E \u043F\u043E\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430.",
      fixHint: "\u041F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u0432\u043D\u0443\u0442\u0440\u044C \u0433\u0440\u0430\u043D\u0438\u0446 \u0441\u043B\u0430\u0439\u0434\u0430.",
      autofix: { label: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0432 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0441\u043B\u0430\u0439\u0434\u0430" }
    },
    "text.non-system-font": {
      id: "text.non-system-font",
      group: "text",
      severity: "warning",
      title: "\u041D\u0435\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439 \u0448\u0440\u0438\u0444\u0442 \u043C\u043E\u0436\u0435\u0442 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F",
      why: "PowerPoint \u0437\u0430\u043C\u0435\u043D\u0438\u0442 \u0448\u0440\u0438\u0444\u0442, \u0435\u0441\u043B\u0438 \u043E\u043D \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435, \u0433\u0434\u0435 \u043E\u0442\u043A\u0440\u043E\u044E\u0442 PPTX.",
      fixHint: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 \u0448\u0440\u0438\u0444\u0442 \u0438\u043B\u0438 \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u044B\u0439 \u0448\u0440\u0438\u0444\u0442 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0443 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F."
    },
    "structure.non-16-9-slide": {
      id: "structure.non-16-9-slide",
      group: "structure",
      severity: "critical",
      title: "\u0421\u043B\u0430\u0439\u0434 \u043D\u0435 \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 16:9",
      why: "\u041D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u043E\u0442\u043D\u043E\u0448\u0435\u043D\u0438\u0435 \u0441\u0442\u043E\u0440\u043E\u043D \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u0438\u0432\u0435\u0441\u0442\u0438 \u043A \u0440\u0430\u0437\u043D\u044B\u043C \u0440\u0430\u0437\u043C\u0435\u0440\u0430\u043C \u0441\u0442\u0440\u0430\u043D\u0438\u0446 \u0438\u043B\u0438 \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u043C\u0443 \u043C\u0430\u0441\u0448\u0442\u0430\u0431\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E \u0432 PPTX.",
      fixHint: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0440\u0430\u0437\u043C\u0435\u0440 \u0441\u043B\u0430\u0439\u0434\u0430/\u0444\u0440\u0435\u0439\u043C\u0430 \u043D\u0430 16:9, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 1920x1080.",
      autofix: { label: "\u041F\u0440\u0438\u0432\u0435\u0441\u0442\u0438 \u0441\u043B\u0430\u0439\u0434 \u043A 16:9" }
    },
    "structure.object-outside-slide-bounds": {
      id: "structure.object-outside-slide-bounds",
      group: "structure",
      severity: "warning",
      title: "\u041E\u0431\u044A\u0435\u043A\u0442 \u0432\u044B\u0445\u043E\u0434\u0438\u0442 \u0437\u0430 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0441\u043B\u0430\u0439\u0434\u0430",
      why: "\u041E\u0431\u044A\u0435\u043A\u0442\u044B \u0437\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u0441\u043B\u0430\u0439\u0434\u0430 \u043C\u043E\u0433\u0443\u0442 \u043E\u0431\u0440\u0435\u0437\u0430\u0442\u044C\u0441\u044F, \u043F\u043E\u043F\u0430\u0441\u0442\u044C \u0432 \u044D\u043A\u0441\u043F\u043E\u0440\u0442 \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u043E \u0438\u043B\u0438 \u043F\u043E\u0432\u043B\u0438\u044F\u0442\u044C \u043D\u0430 layout \u0441\u043B\u0430\u0439\u0434\u0430.",
      fixHint: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u0432\u043D\u0443\u0442\u0440\u044C \u0441\u043B\u0430\u0439\u0434\u0430 \u0438\u043B\u0438 \u0443\u0434\u0430\u043B\u0438\u0442\u0435 \u0435\u0433\u043E \u043F\u0435\u0440\u0435\u0434 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u043E\u043C.",
      autofix: { label: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043E\u0431\u044A\u0435\u043A\u0442 \u0432 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0441\u043B\u0430\u0439\u0434\u0430" }
    },
    "structure.nested-frame": {
      id: "structure.nested-frame",
      group: "structure",
      severity: "warning",
      title: "\u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u0444\u0440\u0435\u0439\u043C \u043C\u043E\u0436\u0435\u0442 \u043D\u0435\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u043E \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C\u0441\u044F",
      why: "\u0412\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0435 \u0444\u0440\u0435\u0439\u043C\u044B \u043D\u0435\u0441\u0443\u0442 Figma-\u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u0443\u044E \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443 \u0438 \u043C\u043E\u0433\u0443\u0442 \u0441\u043F\u043B\u044E\u0449\u0438\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u043F\u043E\u0432\u0435\u0441\u0442\u0438 \u0441\u0435\u0431\u044F \u043D\u0435\u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0443\u0435\u043C\u043E \u043F\u0440\u0438 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0435.",
      fixHint: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0438\u043B\u0438 \u0441\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u0444\u0440\u0435\u0439\u043C, \u0435\u0441\u043B\u0438 \u044D\u0442\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0431\u044A\u0435\u043A\u0442."
    }
  };

  // src/plugin/scanner/config.ts
  var DEFAULT_ENABLED_GROUPS = {
    visual: true,
    text: true,
    structure: true,
    interactive: true,
    export: true
  };
  var DEFAULT_SAFE_SYSTEM_FONTS = [
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
  ];
  var DEFAULT_SCAN_SETTINGS = {
    strictness: "standard",
    enabledGroups: DEFAULT_ENABLED_GROUPS
  };
  function createScannerConfig(settings = {}) {
    var _a, _b;
    const strictness = (_a = settings.strictness) != null ? _a : DEFAULT_SCAN_SETTINGS.strictness;
    return {
      strictness,
      safeMargin: getSafeMargin(strictness),
      outsideBoundsTolerance: strictness === "strict" ? 0 : 1,
      minorObjectOverflow: getMinorObjectOverflow(strictness),
      allowedFontFamilies: new Set(DEFAULT_SAFE_SYSTEM_FONTS),
      enabledGroups: __spreadValues(__spreadValues({}, DEFAULT_ENABLED_GROUPS), (_b = settings.enabledGroups) != null ? _b : {})
    };
  }
  function isRuleGroupEnabled(ruleId, config) {
    const group = ruleId.split(".")[0];
    return config.enabledGroups[group] !== false;
  }
  function getSafeMargin(strictness) {
    if (strictness === "soft") return 8;
    if (strictness === "strict") return 24;
    return 16;
  }
  function getMinorObjectOverflow(strictness) {
    if (strictness === "soft") return 32;
    if (strictness === "strict") return 0;
    return 12;
  }

  // src/plugin/scanner/scan-document.ts
  var ASPECT_RATIO_TOLERANCE = 0.01;
  var TARGET_WIDESCREEN_RATIO = 16 / 9;
  function scanDocument(document, settings) {
    const config = createScannerConfig(settings);
    const findings = [];
    for (const slide of document.slides) {
      findings.push(...scanSlide(slide, config));
      visitNodeTree(slide.children, slide, config, findings);
    }
    return findings;
  }
  function scanSlide(slide, config) {
    const ruleId = "structure.non-16-9-slide";
    if (!isRuleGroupEnabled(ruleId, config) || isWidescreen(slide.bounds)) {
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
  function visitNodeTree(nodes, slide, config, findings) {
    var _a;
    for (const node of nodes) {
      if (node.visible === false) {
        continue;
      }
      findings.push(...scanNode(node, slide, config));
      if ((_a = node.children) == null ? void 0 : _a.length) {
        visitNodeTree(node.children, slide, config, findings);
      }
    }
  }
  function scanNode(node, slide, config) {
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
      ...checkNestedFrame(node, slide, config)
    ];
  }
  function checkGradientFill(node, slide, config) {
    var _a, _b;
    const ruleId = "visual.gradient-fill";
    if (!isRuleGroupEnabled(ruleId, config)) return [];
    const visibleFills = (_b = (_a = node.fills) == null ? void 0 : _a.filter((fill) => fill.visible !== false)) != null ? _b : [];
    const gradientFills = visibleFills.filter((fill) => fill.type.startsWith("GRADIENT_"));
    if (gradientFills.length === 0) {
      return [];
    }
    return [
      createFinding(ruleId, slide, node, {
        fillTypes: gradientFills.map((fill) => fill.type)
      })
    ];
  }
  function checkMask(node, slide, config) {
    const ruleId = "visual.mask";
    if (!isRuleGroupEnabled(ruleId, config) || node.isMask !== true) {
      return [];
    }
    return [createFinding(ruleId, slide, node)];
  }
  function checkBlurEffects(node, slide, config) {
    var _a, _b;
    const visibleEffects = (_b = (_a = node.effects) == null ? void 0 : _a.filter((effect) => effect.visible !== false)) != null ? _b : [];
    const findings = [];
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
  function checkMultipleShadows(node, slide, config) {
    var _a, _b;
    const ruleId = "visual.multiple-shadows";
    if (!isRuleGroupEnabled(ruleId, config)) return [];
    const visibleEffects = (_b = (_a = node.effects) == null ? void 0 : _a.filter((effect) => effect.visible !== false)) != null ? _b : [];
    const shadowCount = visibleEffects.filter((effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW").length;
    if (shadowCount <= 1) {
      return [];
    }
    return [
      createFinding(ruleId, slide, node, {
        shadowCount
      })
    ];
  }
  function checkBlendMode(node, slide, config) {
    const ruleId = "visual.blend-mode";
    if (!isRuleGroupEnabled(ruleId, config) || !node.blendMode || node.blendMode === "NORMAL" || node.blendMode === "PASS_THROUGH") {
      return [];
    }
    return [
      createFinding(ruleId, slide, node, {
        blendMode: node.blendMode
      })
    ];
  }
  function checkTextOutsideSlideBounds(node, slide, config) {
    const ruleId = "text.outside-slide-bounds";
    if (!isRuleGroupEnabled(ruleId, config) || node.type !== "TEXT" || !node.bounds || isInsideBounds(node.bounds, slide.bounds, config.outsideBoundsTolerance)) {
      return [];
    }
    return [createFinding(ruleId, slide, node)];
  }
  function checkTextNearSlideEdge(node, slide, config) {
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
        distance
      })
    ];
  }
  function checkNonSystemFont(node, slide, config) {
    var _a;
    const ruleId = "text.non-system-font";
    if (!isRuleGroupEnabled(ruleId, config) || node.type !== "TEXT" || !((_a = node.textStyle) == null ? void 0 : _a.fontFamily) || config.allowedFontFamilies.has(node.textStyle.fontFamily)) {
      return [];
    }
    return [
      createFinding(ruleId, slide, node, {
        fontFamily: node.textStyle.fontFamily,
        fontPostScriptName: node.textStyle.fontPostScriptName
      })
    ];
  }
  function checkObjectOutsideSlideBounds(node, slide, config) {
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
        minorOverflowThreshold: config.minorObjectOverflow
      }, overflow <= config.minorObjectOverflow ? "suggestion" : void 0)
    ];
  }
  function checkNestedFrame(node, slide, config) {
    const ruleId = "structure.nested-frame";
    if (!isRuleGroupEnabled(ruleId, config) || node.type !== "FRAME") {
      return [];
    }
    return [createFinding(ruleId, slide, node)];
  }
  function createFinding(ruleId, slide, node, evidence, severityOverride) {
    return {
      id: `${node.id}:${ruleId}`,
      ruleId,
      nodeId: node.id,
      slideId: slide.id,
      nodeName: node.name,
      nodePath: node.path,
      severityOverride,
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
  function getMaxOverflowBeyondContainer(node, container) {
    const left = Math.max(container.x - node.x, 0);
    const top = Math.max(container.y - node.y, 0);
    const right = Math.max(node.x + node.width - (container.x + container.width), 0);
    const bottom = Math.max(node.y + node.height - (container.y + container.height), 0);
    return Math.max(left, top, right, bottom);
  }

  // src/plugin/code.ts
  figma.showUI(__html__, { width: 400, height: 620, title: "SlideCheck" });
  figma.ui.onmessage = (message) => __async(null, null, function* () {
    if (message.type === "SCAN_REQUEST") {
      try {
        const document = collectFigmaDocument(message.scope);
        const findings = scanDocument(document, message.settings);
        postToUi({
          type: "SCAN_RESULT",
          issues: findings.map((finding) => toIssueDto(finding, document)),
          slideCount: document.slides.length
        });
      } catch (error) {
        postToUi({
          type: "SCAN_ERROR",
          message: error instanceof Error ? error.message : "Unknown scan error"
        });
      }
    }
    if (message.type === "SELECT_NODE_REQUEST") {
      try {
        yield selectNode(message.nodeId);
      } catch (error) {
        postToUi({
          type: "SELECT_NODE_ERROR",
          message: error instanceof Error ? error.message : "Unknown node selection error"
        });
      }
    }
    if (message.type === "APPLY_FIXES_REQUEST") {
      try {
        const applyResult = yield applyFixes(message.targets);
        const document = collectFigmaDocument(message.scope);
        const findings = scanDocument(document, message.settings);
        postToUi({
          type: "APPLY_FIXES_RESULT",
          result: __spreadProps(__spreadValues({}, applyResult), {
            issues: findings.map((finding) => toIssueDto(finding, document)),
            slideCount: document.slides.length
          })
        });
      } catch (error) {
        postToUi({
          type: "APPLY_FIXES_ERROR",
          message: error instanceof Error ? error.message : "Unknown autofix error"
        });
      }
    }
  });
  function postToUi(message) {
    figma.ui.postMessage(message);
  }
  function toIssueDto(finding, document) {
    var _a, _b;
    const rule = RULES[finding.ruleId];
    const slide = document.slides.find((item) => item.id === finding.slideId);
    if (!rule) {
      throw new Error(`Missing rule metadata for ${finding.ruleId}`);
    }
    return {
      id: finding.id,
      ruleId: finding.ruleId,
      group: rule.group,
      severity: (_a = finding.severityOverride) != null ? _a : rule.severity,
      title: rule.title,
      slide: slide ? slide.name : "Unknown slide",
      layer: finding.nodePath.join(" / "),
      why: rule.why,
      fix: rule.fixHint,
      fixAvailable: Boolean(rule.autofix),
      fixLabel: (_b = rule.autofix) == null ? void 0 : _b.label,
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
      focusNodeSmooth(node);
      postToUi({ type: "SELECT_NODE_RESULT", nodeId });
    });
  }
  function isSelectableSceneNode(node) {
    return "type" in node && "visible" in node && "removed" in node && node.removed === false;
  }
  function focusNodeSmooth(node) {
    if (!("absoluteBoundingBox" in node) || !node.absoluteBoundingBox) {
      figma.viewport.scrollAndZoomIntoView([node]);
      return;
    }
    const bounds = node.absoluteBoundingBox;
    const targetCenter = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
    const targetZoom = getTargetZoom(bounds);
    const startCenter = figma.viewport.center;
    const startZoom = figma.viewport.zoom;
    const durationMs = 400;
    const startedAt = Date.now();
    const step = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeOutCubic(progress);
      figma.viewport.center = {
        x: lerp(startCenter.x, targetCenter.x, eased),
        y: lerp(startCenter.y, targetCenter.y, eased)
      };
      figma.viewport.zoom = lerp(startZoom, targetZoom, eased);
      if (progress < 1) {
        setTimeout(step, 16);
      }
    };
    step();
  }
  function getTargetZoom(bounds) {
    const viewportBounds = figma.viewport.bounds;
    const padding = 1.8;
    const fitZoom = Math.min(
      viewportBounds.width / Math.max(bounds.width * padding, 1),
      viewportBounds.height / Math.max(bounds.height * padding, 1)
    );
    return clamp2(fitZoom * 0.82, 0.35, 2);
  }
  function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
  }
  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }
  function clamp2(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
