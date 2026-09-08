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

  // src/plugin/adapter/collect-export-document.ts
  var SUPPORTED_SHAPES = /* @__PURE__ */ new Set(["RECTANGLE", "ELLIPSE", "LINE"]);
  function collectExportDocument(scope) {
    return __async(this, null, function* () {
      const roots = getExportRoots(scope);
      if (roots.length === 0) {
        throw new Error("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0440\u0435\u0439\u043C\u0430 \u0438\u043B\u0438 \u0441\u043B\u0430\u0439\u0434\u0430 \u0434\u043B\u044F \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430");
      }
      const slides = yield Promise.all(roots.map(collectExportSlide));
      return { slides };
    });
  }
  function collectExportSlide(root) {
    return __async(this, null, function* () {
      const width = root.width;
      const height = root.height;
      const unsupported = findUnsupportedNode(root);
      if (unsupported) {
        return {
          id: root.id,
          name: root.name,
          width,
          height,
          mode: "image-only",
          elements: [],
          fallbackPng: yield root.exportAsync({
            format: "PNG",
            constraint: { type: "WIDTH", value: 1920 }
          }),
          fallbackReason: unsupported
        };
      }
      const elements = [];
      yield collectChildren(root, root, elements);
      return {
        id: root.id,
        name: root.name,
        width,
        height,
        mode: "editable",
        elements
      };
    });
  }
  function collectChildren(root, parent, elements) {
    return __async(this, null, function* () {
      for (const node of parent.children) {
        if (!node.visible) continue;
        const element = yield collectElement(root, node);
        if (element) elements.push(element);
        if ("children" in node) {
          yield collectChildren(root, node, elements);
        }
      }
    });
  }
  function collectElement(root, node) {
    return __async(this, null, function* () {
      const bounds = getBounds(root, node);
      if (!bounds || node.type === "GROUP" || node.type === "FRAME" || node.type === "SECTION") {
        return null;
      }
      if (node.type === "TEXT") {
        const style = node.fontName;
        const fill = getSolidPaint(node.fills);
        if (style === figma.mixed || node.fontSize === figma.mixed || !fill) return null;
        const text = __spreadValues({
          kind: "text",
          id: node.id,
          text: node.characters,
          fontFamily: style.family,
          fontSize: node.fontSize,
          color: fill.color,
          bold: style.style.toLowerCase().includes("bold"),
          italic: style.style.toLowerCase().includes("italic"),
          align: node.textAlignHorizontal === "CENTER" ? "center" : node.textAlignHorizontal === "RIGHT" ? "right" : "left"
        }, bounds);
        return text;
      }
      if (SUPPORTED_SHAPES.has(node.type)) {
        const image = yield getImagePaint(node);
        if (image) return __spreadValues({ kind: "image", id: node.id, bytes: image }, bounds);
        const fill = getSolidPaint(node.fills);
        const stroke = getSolidPaint(node.strokes);
        if (!fill && !stroke) return null;
        const shape = __spreadValues({
          kind: "shape",
          id: node.id,
          shape: node.type === "ELLIPSE" ? "ellipse" : node.type === "LINE" ? "line" : "rect",
          fill: fill == null ? void 0 : fill.color,
          stroke: stroke == null ? void 0 : stroke.color
        }, bounds);
        return shape;
      }
      return null;
    });
  }
  function findUnsupportedNode(root) {
    const visit = (node) => {
      if (!node.visible) return null;
      if (node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
        return `${node.name}: \u0440\u0435\u0436\u0438\u043C \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u044F ${node.blendMode}`;
      }
      if (node.effects.length > 0) return `${node.name}: \u044D\u0444\u0444\u0435\u043A\u0442\u044B \u0438 blur`;
      if (node.type === "TEXT") {
        if (node.fontName === figma.mixed || node.fontSize === figma.mixed) {
          return `${node.name}: \u0441\u043C\u0435\u0448\u0430\u043D\u043D\u044B\u0435 \u0441\u0442\u0438\u043B\u0438 \u0442\u0435\u043A\u0441\u0442\u0430`;
        }
        if (!getSolidPaint(node.fills)) return `${node.name}: \u0441\u043B\u043E\u0436\u043D\u0430\u044F \u0437\u0430\u043B\u0438\u0432\u043A\u0430 \u0442\u0435\u043A\u0441\u0442\u0430`;
      } else if (SUPPORTED_SHAPES.has(node.type)) {
        if (hasUnsupportedPaint(node.fills) || hasUnsupportedPaint(node.strokes)) {
          return `${node.name}: \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442, \u043C\u0430\u0441\u043A\u0430 \u0438\u043B\u0438 \u0441\u043B\u043E\u0436\u043D\u0430\u044F \u0437\u0430\u043B\u0438\u0432\u043A\u0430`;
        }
      } else if (node.type !== "GROUP" && node.type !== "FRAME" && node.type !== "SECTION") {
        return `${node.name}: \u0442\u0438\u043F ${node.type} \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F`;
      }
      if ("children" in node) {
        for (const child of node.children) {
          const reason = visit(child);
          if (reason) return reason;
        }
      }
      return null;
    };
    if ("children" in root) {
      for (const child of root.children) {
        const reason = visit(child);
        if (reason) return reason;
      }
    }
    return null;
  }
  function getBounds(root, node) {
    const bounds = node.absoluteBoundingBox;
    const rootBounds = root.absoluteBoundingBox;
    if (!bounds || !rootBounds) return null;
    return {
      x: bounds.x - rootBounds.x,
      y: bounds.y - rootBounds.y,
      width: bounds.width,
      height: bounds.height,
      rotation: node.rotation,
      opacity: node.opacity
    };
  }
  function hasUnsupportedPaint(paints) {
    if (paints === figma.mixed) return true;
    return paints.some((paint) => paint.visible !== false && paint.type !== "SOLID" && paint.type !== "IMAGE");
  }
  function getSolidPaint(paints) {
    var _a;
    if (paints === figma.mixed || paints.length === 0) return null;
    const paint = paints.find((item) => item.visible !== false && item.type === "SOLID");
    if (!paint || paint.type !== "SOLID") return null;
    return {
      color: rgbToHex(paint.color),
      opacity: (_a = paint.opacity) != null ? _a : 1
    };
  }
  function getImagePaint(node) {
    return __async(this, null, function* () {
      if (!("fills" in node) || node.fills === figma.mixed) return null;
      const paint = node.fills.find((item) => item.visible !== false && item.type === "IMAGE");
      if (!paint || paint.type !== "IMAGE") return null;
      return node.exportAsync({ format: "PNG" });
    });
  }
  function rgbToHex(color) {
    return [color.r, color.g, color.b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function getExportRoots(scope) {
    if (figma.editorType === "slides") {
      if (scope === "selected") {
        const selected = figma.currentPage.selection.filter((node) => node.type === "SLIDE");
        if (selected.length > 0) return selected;
        if (figma.currentPage.focusedSlide) return [figma.currentPage.focusedSlide];
      }
      return figma.getSlideGrid().flat();
    }
    if (scope === "selected") {
      const selected = figma.currentPage.selection.filter((node) => node.type === "FRAME");
      if (selected.length > 0) return selected;
    }
    return figma.currentPage.children.filter((node) => node.type === "FRAME");
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
  function applyFixes(targets, mode) {
    return __async(this, null, function* () {
      let applied = 0;
      let skipped = 0;
      const copyNames = [];
      const copyNodeIds = [];
      const seen = /* @__PURE__ */ new Set();
      const effectiveTargets = mode === "copy" ? yield cloneTargetRoots(targets, copyNames, copyNodeIds) : targets;
      for (const target of effectiveTargets) {
        const dedupeKey = `${target.nodeId}:${target.ruleId}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        try {
          const fixed = yield applyFix(target);
          if (fixed) {
            applied += 1;
          } else {
            skipped += 1;
          }
        } catch (e) {
          skipped += 1;
        }
      }
      return { applied, skipped, copyNames, copyNodeIds };
    });
  }
  function cloneTargetRoots(targets, copyNames, copyNodeIds) {
    return __async(this, null, function* () {
      var _a, _b;
      const rootMap = /* @__PURE__ */ new Map();
      const clonedTargets = [];
      for (const target of targets) {
        const original = yield figma.getNodeByIdAsync(target.nodeId);
        if (!original || !isSceneNode(original)) {
          clonedTargets.push(__spreadProps(__spreadValues({}, target), { nodeId: "" }));
          continue;
        }
        const root = (_a = findSlideRoot(original)) != null ? _a : original;
        let clone = rootMap.get(root.id);
        if (!clone) {
          clone = cloneSceneNode(root);
          if (!clone) {
            clonedTargets.push(__spreadProps(__spreadValues({}, target), { nodeId: "" }));
            continue;
          }
          rootMap.set(root.id, clone);
          clone.name = `${root.name} \u2014 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F`;
          copyNames.push(clone.name);
          copyNodeIds.push(clone.id);
        }
        const path = getChildIndexPath(root, original);
        const clonedNode = path ? getNodeByChildIndexPath(clone, path) : null;
        clonedTargets.push(__spreadProps(__spreadValues({}, target), { nodeId: (_b = clonedNode == null ? void 0 : clonedNode.id) != null ? _b : "" }));
      }
      return clonedTargets;
    });
  }
  function cloneSceneNode(node) {
    if (!("clone" in node) || typeof node.clone !== "function") {
      return null;
    }
    return node.clone();
  }
  function getChildIndexPath(root, target) {
    const path = [];
    let current = target;
    while (current && current.id !== root.id) {
      const parent = current.parent;
      if (!parent || !("children" in parent)) {
        return null;
      }
      const index = parent.children.findIndex((child) => child.id === (current == null ? void 0 : current.id));
      if (index < 0) {
        return null;
      }
      path.unshift(index);
      current = parent;
    }
    return (current == null ? void 0 : current.id) === root.id ? path : null;
  }
  function getNodeByChildIndexPath(root, path) {
    let current = root;
    for (const index of path) {
      if (!("children" in current) || !current.children[index]) {
        return null;
      }
      current = current.children[index];
    }
    return current;
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
      if (target.ruleId === "visual.gradient-fill") {
        return replaceGradientsWithSolidFills(node);
      }
      if (target.ruleId === "visual.background-blur") {
        return removeEffects(node, (effect) => effect.type === "BACKGROUND_BLUR");
      }
      if (target.ruleId === "visual.layer-blur") {
        return removeEffects(node, (effect) => effect.type === "LAYER_BLUR");
      }
      if (target.ruleId === "visual.multiple-shadows") {
        return keepOneShadow(node);
      }
      if (target.ruleId === "visual.blend-mode") {
        return resetBlendMode(node);
      }
      if (target.ruleId === "text.non-system-font") {
        return replaceWithArial(node);
      }
      if (target.ruleId === "structure.nested-frame") {
        return replacePlainFrameWithGroup(node);
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
  function replaceGradientsWithSolidFills(node) {
    return __async(this, null, function* () {
      if (!("fills" in node) || !("setFillsAsync" in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) {
        return false;
      }
      let changed = false;
      const fills = node.fills.map((paint) => {
        var _a;
        if (!paint.type.startsWith("GRADIENT_") || !("gradientStops" in paint) || paint.gradientStops.length === 0) {
          return paint;
        }
        const color = getGradientMidpointColor(paint.gradientStops);
        changed = true;
        return {
          type: "SOLID",
          color: { r: color.r, g: color.g, b: color.b },
          opacity: (_a = paint.opacity) != null ? _a : color.a,
          visible: paint.visible,
          blendMode: paint.blendMode
        };
      });
      if (!changed) {
        return false;
      }
      yield node.setFillsAsync(fills);
      return true;
    });
  }
  function getGradientMidpointColor(stops) {
    if (stops.length === 1) {
      return stops[0].color;
    }
    const ordered = [...stops].sort((left2, right2) => left2.position - right2.position);
    const midpoint = 0.5;
    const rightIndex = ordered.findIndex((stop) => stop.position >= midpoint);
    if (rightIndex <= 0) {
      return ordered[0].color;
    }
    if (rightIndex === -1) {
      return ordered[ordered.length - 1].color;
    }
    const left = ordered[rightIndex - 1];
    const right = ordered[rightIndex];
    const span = Math.max(right.position - left.position, Number.EPSILON);
    const ratio = (midpoint - left.position) / span;
    return {
      r: left.color.r + (right.color.r - left.color.r) * ratio,
      g: left.color.g + (right.color.g - left.color.g) * ratio,
      b: left.color.b + (right.color.b - left.color.b) * ratio,
      a: left.color.a + (right.color.a - left.color.a) * ratio
    };
  }
  function removeEffects(node, shouldRemove) {
    if (!("effects" in node)) {
      return false;
    }
    const effects = node.effects;
    const nextEffects = effects.filter((effect) => !shouldRemove(effect));
    if (nextEffects.length === effects.length) {
      return false;
    }
    node.effects = nextEffects;
    return true;
  }
  function keepOneShadow(node) {
    if (!("effects" in node)) {
      return false;
    }
    let shadowKept = false;
    let changed = false;
    const nextEffects = node.effects.filter((effect) => {
      const isVisibleShadow = effect.visible && (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW");
      if (!isVisibleShadow || !shadowKept) {
        if (isVisibleShadow) shadowKept = true;
        return true;
      }
      changed = true;
      return false;
    });
    if (!changed) {
      return false;
    }
    node.effects = nextEffects;
    return true;
  }
  function resetBlendMode(node) {
    if (!("blendMode" in node) || node.blendMode === "NORMAL" || node.blendMode === "PASS_THROUGH") {
      return false;
    }
    node.blendMode = "NORMAL";
    return true;
  }
  function replaceWithArial(node) {
    return __async(this, null, function* () {
      if (node.type !== "TEXT" || node.fontName === figma.mixed) {
        return false;
      }
      const targetFont = {
        family: "Arial",
        style: getArialStyle(node.fontName.style)
      };
      if (node.fontName.family === targetFont.family) {
        return false;
      }
      try {
        yield figma.loadFontAsync(targetFont);
        node.fontName = targetFont;
        return true;
      } catch (e) {
        return false;
      }
    });
  }
  function getArialStyle(style) {
    const normalized = style.toLowerCase();
    const isBold = normalized.includes("bold") || normalized.includes("semibold") || normalized.includes("black") || normalized.includes("heavy");
    const isItalic = normalized.includes("italic") || normalized.includes("oblique");
    if (isBold && isItalic) return "Bold Italic";
    if (isBold) return "Bold";
    if (isItalic) return "Italic";
    return "Regular";
  }
  function replacePlainFrameWithGroup(node) {
    if (node.type !== "FRAME" || node.children.length === 0 || node.layoutMode !== "NONE" || node.clipsContent) {
      return false;
    }
    if (node.fills === figma.mixed || node.strokes === figma.mixed || node.fills.length > 0 || node.strokes.length > 0 || node.effects.length > 0) {
      return false;
    }
    const parent = node.parent;
    if (!parent || !("children" in parent)) {
      return false;
    }
    const index = parent.children.findIndex((child) => child.id === node.id);
    if (index < 0) {
      return false;
    }
    const group = figma.group([...node.children], parent, index);
    group.name = `${node.name} \u2014 \u0433\u0440\u0443\u043F\u043F\u0430`;
    node.remove();
    return true;
  }
  function moveNodeInsideSlide(node, margin) {
    if (!canMove(node) || isPositionControlledByAutoLayout(node) || !("absoluteBoundingBox" in node) || !node.absoluteBoundingBox) {
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
  function isPositionControlledByAutoLayout(node) {
    const parent = node.parent;
    return Boolean(parent && "layoutMode" in parent && parent.layoutMode !== "NONE");
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
      fixHint: "\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442 \u043D\u0430 \u0441\u043F\u043B\u043E\u0448\u043D\u043E\u0439 \u0446\u0432\u0435\u0442 \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u043F\u0435\u0440\u0435\u0434 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u043E\u043C.",
      autofix: { label: "\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u0433\u0440\u0430\u0434\u0438\u0435\u043D\u0442 \u043D\u0430 \u0446\u0432\u0435\u0442 \u0438\u0437 \u0446\u0435\u043D\u0442\u0440\u0430" }
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
      fixHint: "\u0420\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u0441 \u0440\u0430\u0437\u043C\u044B\u0442\u0438\u0435\u043C \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u044D\u0444\u0444\u0435\u043A\u0442 \u0441\u0442\u0430\u0442\u0438\u0447\u043D\u044B\u043C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435\u043C.",
      autofix: { label: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C background blur" }
    },
    "visual.layer-blur": {
      id: "visual.layer-blur",
      group: "visual",
      severity: "warning",
      title: "Layer blur \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F \u0432 PPTX",
      why: "\u0420\u0430\u0437\u043C\u044B\u0442\u0438\u0435 \u0441\u043B\u043E\u044F \u043C\u043E\u0436\u0435\u0442 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u0432\u044B\u0433\u043B\u044F\u0434\u0435\u0442\u044C \u0438\u043D\u0430\u0447\u0435 \u043F\u043E\u0441\u043B\u0435 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430.",
      fixHint: "\u0420\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u0440\u0430\u0437\u043C\u044B\u0442\u044B\u0439 \u0441\u043B\u043E\u0439, \u0435\u0441\u043B\u0438 \u0432\u0430\u0436\u043D\u0430 \u0442\u043E\u0447\u043D\u0430\u044F \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430.",
      autofix: { label: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C layer blur" }
    },
    "visual.multiple-shadows": {
      id: "visual.multiple-shadows",
      group: "visual",
      severity: "suggestion",
      title: "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0442\u0435\u043D\u0435\u0439 \u043C\u043E\u0433\u0443\u0442 \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u0432 PowerPoint",
      why: "\u041C\u043E\u0434\u0435\u043B\u044C \u0442\u0435\u043D\u0435\u0439 \u0432 PowerPoint \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u0435\u0435, \u0447\u0435\u043C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0445 \u044D\u0444\u0444\u0435\u043A\u0442\u043E\u0432 \u0432 Figma.",
      fixHint: "\u0423\u043F\u0440\u043E\u0441\u0442\u0438\u0442\u0435 \u0442\u0435\u043D\u044C \u0434\u043E \u043E\u0434\u043D\u043E\u0433\u043E \u044D\u0444\u0444\u0435\u043A\u0442\u0430 \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u0435\u0440\u0438\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442.",
      autofix: { label: "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0434\u043D\u0443 \u0442\u0435\u043D\u044C" }
    },
    "visual.blend-mode": {
      id: "visual.blend-mode",
      group: "visual",
      severity: "warning",
      title: "\u0420\u0435\u0436\u0438\u043C \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C\u0441\u044F \u0432 PPTX",
      why: "\u041D\u0435\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 blend modes \u0437\u0430\u0432\u0438\u0441\u044F\u0442 \u043E\u0442 \u0440\u0435\u043D\u0434\u0435\u0440\u0430 Figma \u0438 \u043C\u043E\u0433\u0443\u0442 \u0441\u043F\u043B\u044E\u0449\u0438\u0442\u044C\u0441\u044F \u0438\u043B\u0438 \u0432\u044B\u0433\u043B\u044F\u0434\u0435\u0442\u044C \u0438\u043D\u0430\u0447\u0435.",
      fixHint: "\u0421\u0432\u0435\u0434\u0438\u0442\u0435 \u043E\u0431\u044A\u0435\u043A\u0442 \u0441 \u0440\u0435\u0436\u0438\u043C\u043E\u043C \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u044D\u0444\u0444\u0435\u043A\u0442 \u043E\u0431\u044B\u0447\u043D\u043E\u0439 \u043F\u0440\u043E\u0437\u0440\u0430\u0447\u043D\u043E\u0441\u0442\u044C\u044E/\u0437\u0430\u043B\u0438\u0432\u043A\u043E\u0439.",
      autofix: { label: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0435\u0436\u0438\u043C \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u044F" }
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
      fixHint: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 \u0448\u0440\u0438\u0444\u0442 \u0438\u043B\u0438 \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u044B\u0439 \u0448\u0440\u0438\u0444\u0442 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D \u0443 \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F.",
      autofix: { label: "\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u043D\u0430 Arial" }
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
      fixHint: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0438\u043B\u0438 \u0441\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u0444\u0440\u0435\u0439\u043C, \u0435\u0441\u043B\u0438 \u044D\u0442\u043E \u043F\u0440\u043E\u0441\u0442\u043E \u0432\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0431\u044A\u0435\u043A\u0442.",
      autofix: { label: "\u0417\u0430\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u0440\u043E\u0441\u0442\u043E\u0439 \u0444\u0440\u0435\u0439\u043C \u043D\u0430 \u0433\u0440\u0443\u043F\u043F\u0443" }
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
        const applyResult = yield applyFixes(message.targets, message.mode);
        const scanScope = message.mode === "copy" && applyResult.copyNodeIds.length > 0 ? yield selectCopiedRoots(applyResult.copyNodeIds) : message.scope;
        const document = collectFigmaDocument(scanScope);
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
    if (message.type === "EXPORT_PPTX_REQUEST") {
      try {
        const slides = yield exportSlidesAsPng(message.scope);
        postToUi({ type: "EXPORT_PPTX_RESULT", slides });
      } catch (error) {
        postToUi({
          type: "EXPORT_PPTX_ERROR",
          message: error instanceof Error ? error.message : "Unknown PPTX export error"
        });
      }
    }
    if (message.type === "EXPORT_EDITABLE_PPTX_REQUEST") {
      try {
        const document = yield collectExportDocument(message.scope);
        postToUi({ type: "EXPORT_EDITABLE_PPTX_RESULT", document });
      } catch (error) {
        postToUi({
          type: "EXPORT_EDITABLE_PPTX_ERROR",
          message: error instanceof Error ? error.message : "Unknown editable PPTX export error"
        });
      }
    }
  });
  function postToUi(message) {
    figma.ui.postMessage(message);
  }
  function selectCopiedRoots(nodeIds) {
    return __async(this, null, function* () {
      const nodes = (yield Promise.all(nodeIds.map((nodeId) => figma.getNodeByIdAsync(nodeId)))).filter((node) => Boolean(node) && isSelectableSceneNode(node));
      if (nodes.length > 0) {
        figma.currentPage.selection = nodes;
      }
      return "selected";
    });
  }
  function exportSlidesAsPng(scope) {
    return __async(this, null, function* () {
      const roots = getExportRoots2(scope);
      if (roots.length === 0) {
        throw new Error("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0440\u0435\u0439\u043C\u0430 \u0438\u043B\u0438 \u0441\u043B\u0430\u0439\u0434\u0430 \u0434\u043B\u044F \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430");
      }
      const exported = [];
      for (const root of roots) {
        const bytes = yield root.exportAsync({
          format: "PNG",
          constraint: { type: "WIDTH", value: 1920 }
        });
        exported.push({
          name: root.name,
          width: root.width,
          height: root.height,
          bytes
        });
      }
      return exported;
    });
  }
  function getExportRoots2(scope) {
    if (figma.editorType === "slides") {
      if (scope === "selected") {
        const selected = figma.currentPage.selection.filter((node) => node.type === "SLIDE");
        if (selected.length > 0) return selected;
        if (figma.currentPage.focusedSlide) return [figma.currentPage.focusedSlide];
      }
      return figma.getSlideGrid().flat();
    }
    if (scope === "selected") {
      const selected = figma.currentPage.selection.filter((node) => node.type === "FRAME");
      if (selected.length > 0) return selected;
    }
    return figma.currentPage.children.filter((node) => node.type === "FRAME");
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
    const durationMs = 500;
    const startedAt = Date.now();
    const step = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeInOutCubic(progress);
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
    return clamp2(fitZoom * 0.66, 0.35, 2);
  }
  function easeInOutCubic(value) {
    return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }
  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }
  function clamp2(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
