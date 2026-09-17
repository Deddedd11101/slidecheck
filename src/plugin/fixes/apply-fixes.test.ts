import { describe, expect, it } from "vitest";
import { applyFixes } from "./apply-fixes";
import { installMockFigma, uninstallMockFigma, type MockNode } from "../testing/figma-mock";

function slide(children: Parameters<typeof installMockFigma>[0][number]["children"]) {
  return {
    type: "FRAME",
    name: "Slide 1",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    children,
  };
}

function target(nodeId: string, ruleId: string) {
  return { issueId: `${nodeId}:${ruleId}`, ruleId, nodeId };
}

describe("applyFixes / visual", () => {
  it("заменяет градиент на цвет из середины", async () => {
    const figma = installMockFigma([slide([{
      type: "RECTANGLE",
      name: "BG",
      fills: [{
        type: "GRADIENT_LINEAR",
        gradientStops: [
          { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
        ],
      }],
    }])]);
    const rect = figma.page.children[0].children[0];

    const result = await applyFixes([target(rect.id, "visual.gradient-fill")], "in-place");

    expect(result.applied).toBe(1);
    const fills = rect.fills as Array<{ type: string; color: { r: number } }>;
    expect(fills[0].type).toBe("SOLID");
    expect(fills[0].color.r).toBeCloseTo(0.5, 5);
    uninstallMockFigma();
  });

  it("удаляет layer blur, не трогая остальные эффекты", async () => {
    const figma = installMockFigma([slide([{
      type: "RECTANGLE",
      effects: [
        { type: "LAYER_BLUR", visible: true, radius: 8 },
        { type: "DROP_SHADOW", visible: true, radius: 4 },
      ],
    }])]);
    const rect = figma.page.children[0].children[0];

    const result = await applyFixes([target(rect.id, "visual.layer-blur")], "in-place");

    expect(result.applied).toBe(1);
    expect(rect.effects.map(effect => effect.type)).toEqual(["DROP_SHADOW"]);
    uninstallMockFigma();
  });

  it("оставляет одну тень из нескольких", async () => {
    const figma = installMockFigma([slide([{
      type: "RECTANGLE",
      effects: [
        { type: "DROP_SHADOW", visible: true, radius: 2 },
        { type: "DROP_SHADOW", visible: true, radius: 12 },
        { type: "INNER_SHADOW", visible: true, radius: 3 },
      ],
    }])]);
    const rect = figma.page.children[0].children[0];

    const result = await applyFixes([target(rect.id, "visual.multiple-shadows")], "in-place");

    expect(result.applied).toBe(1);
    expect(rect.effects).toHaveLength(1);
    expect(rect.effects[0].radius).toBe(2);
    uninstallMockFigma();
  });

  it("сбрасывает blend mode", async () => {
    const figma = installMockFigma([slide([{ type: "RECTANGLE", blendMode: "MULTIPLY" }])]);
    const rect = figma.page.children[0].children[0];

    const result = await applyFixes([target(rect.id, "visual.blend-mode")], "in-place");

    expect(result.applied).toBe(1);
    expect(rect.blendMode).toBe("NORMAL");
    uninstallMockFigma();
  });
});

describe("applyFixes / text", () => {
  it("заменяет нестандартный шрифт на Arial, сохраняя начертание", async () => {
    const figma = installMockFigma([slide([{
      type: "TEXT",
      characters: "Hello",
      fontName: { family: "Gilroy", style: "SemiBold Italic" },
    }])]);
    const text = figma.page.children[0].children[0];

    const result = await applyFixes([target(text.id, "text.non-system-font")], "in-place");

    expect(result.applied).toBe(1);
    expect(text.fontName).toEqual({ family: "Arial", style: "Bold Italic" });
    uninstallMockFigma();
  });

  it("пропускает замену шрифта, если Arial недоступен", async () => {
    const figma = installMockFigma([slide([{
      type: "TEXT",
      fontName: { family: "Gilroy", style: "Regular" },
    }])], { availableFonts: ["Inter"] });
    const text = figma.page.children[0].children[0];

    const result = await applyFixes([target(text.id, "text.non-system-font")], "in-place");

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(text.fontName).toEqual({ family: "Gilroy", style: "Regular" });
    uninstallMockFigma();
  });

  it("возвращает текст в безопасную зону слайда", async () => {
    const figma = installMockFigma([slide([{ type: "TEXT", x: -40, y: 500, width: 200, height: 60 }])]);
    const text = figma.page.children[0].children[0];

    const result = await applyFixes([target(text.id, "text.outside-slide-bounds")], "in-place");

    expect(result.applied).toBe(1);
    expect(text.x).toBe(16);
    expect(text.y).toBe(500);
    uninstallMockFigma();
  });

  it("не двигает узел внутри auto layout", async () => {
    const figma = installMockFigma([{
      type: "FRAME",
      name: "Slide 1",
      width: 1920,
      height: 1080,
      children: [{
        type: "FRAME",
        name: "Stack",
        layoutMode: "VERTICAL",
        x: -100,
        y: 0,
        width: 300,
        height: 300,
        children: [{ type: "TEXT", x: -100, y: 0, width: 200, height: 40 }],
      }],
    }]);
    const text = figma.page.children[0].children[0].children[0];

    const result = await applyFixes([target(text.id, "text.near-slide-edge")], "in-place");

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    uninstallMockFigma();
  });
});

describe("applyFixes / structure", () => {
  it("приводит фрейм к 16:9", async () => {
    const figma = installMockFigma([slide([])]);
    const frame = figma.page.children[0];
    frame.resize(1280, 800);

    const result = await applyFixes([target(frame.id, "structure.non-16-9-slide")], "in-place");

    expect(result.applied).toBe(1);
    expect(frame.width).toBe(1280);
    expect(frame.height).toBe(720);
    uninstallMockFigma();
  });

  it("не может привести SLIDE к 16:9 и честно отмечает это пропуском", async () => {
    const figma = installMockFigma([{ type: "SLIDE", name: "Slide", width: 1280, height: 800, children: [] }], {
      editorType: "slides",
    });
    const slideNode = figma.page.children[0];

    const result = await applyFixes([target(slideNode.id, "structure.non-16-9-slide")], "in-place");

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    uninstallMockFigma();
  });

  it("заменяет пустой вложенный фрейм на группу", async () => {
    const figma = installMockFigma([slide([{
      type: "FRAME",
      name: "Wrapper",
      width: 400,
      height: 200,
      children: [{ type: "RECTANGLE", width: 100, height: 100 }],
    }])]);
    const wrapper = figma.page.children[0].children[0];

    const result = await applyFixes([target(wrapper.id, "structure.nested-frame")], "in-place");

    expect(result.applied).toBe(1);
    expect(figma.groupCalls).toBe(1);
    expect(wrapper.removed).toBe(true);
    uninstallMockFigma();
  });

  it("не трогает вложенный фрейм с заливкой", async () => {
    const figma = installMockFigma([slide([{
      type: "FRAME",
      name: "Card",
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
      children: [{ type: "RECTANGLE" }],
    }])]);
    const card = figma.page.children[0].children[0];

    const result = await applyFixes([target(card.id, "structure.nested-frame")], "in-place");

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(card.removed).toBe(false);
    uninstallMockFigma();
  });
});

describe("applyFixes / режим копии", () => {
  it("правит копию слайда и не трогает оригинал", async () => {
    const figma = installMockFigma([slide([{ type: "RECTANGLE", name: "BG", blendMode: "MULTIPLY" }])]);
    const original = figma.page.children[0];
    const rect = original.children[0];

    const result = await applyFixes([target(rect.id, "visual.blend-mode")], "copy");

    expect(result.applied).toBe(1);
    expect(result.copyNames).toHaveLength(1);
    expect(rect.blendMode).toBe("MULTIPLY");

    const copy = figma.getNode(result.copyNodeIds[0]) as MockNode;
    expect(copy.children[0].blendMode).toBe("NORMAL");
    uninstallMockFigma();
  });

  it("делает одну копию слайда на несколько проблем", async () => {
    const figma = installMockFigma([slide([
      { type: "RECTANGLE", name: "A", blendMode: "MULTIPLY" },
      { type: "RECTANGLE", name: "B", effects: [{ type: "LAYER_BLUR", visible: true }] },
    ])]);
    const original = figma.page.children[0];

    const result = await applyFixes([
      target(original.children[0].id, "visual.blend-mode"),
      target(original.children[1].id, "visual.layer-blur"),
    ], "copy");

    expect(result.applied).toBe(2);
    expect(result.copyNodeIds).toHaveLength(1);
    uninstallMockFigma();
  });
});

describe("applyFixes / устойчивость", () => {
  it("дедуплицирует одинаковые цели", async () => {
    const figma = installMockFigma([slide([{ type: "RECTANGLE", blendMode: "MULTIPLY" }])]);
    const rect = figma.page.children[0].children[0];

    const result = await applyFixes([
      target(rect.id, "visual.blend-mode"),
      target(rect.id, "visual.blend-mode"),
    ], "in-place");

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    uninstallMockFigma();
  });

  it("считает пропуском неизвестный узел и неизвестное правило", async () => {
    const figma = installMockFigma([slide([{ type: "RECTANGLE" }])]);
    const rect = figma.page.children[0].children[0];

    const result = await applyFixes([
      target("missing-node", "visual.blend-mode"),
      target(rect.id, "visual.unknown-rule"),
    ], "in-place");

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
    uninstallMockFigma();
  });
});
