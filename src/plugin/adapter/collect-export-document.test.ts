import { describe, expect, it } from "vitest";
import { collectExportDocument } from "./collect-export-document";
import { installMockFigma, uninstallMockFigma } from "../testing/figma-mock";

const SOLID_WHITE = { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
const SOLID_BLACK = { type: "SOLID", color: { r: 0, g: 0, b: 0 } };

function frame(children: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    type: "FRAME",
    name: "Slide 1",
    width: 1920,
    height: 1080,
    fills: [SOLID_WHITE],
    children,
    ...extra,
  } as Parameters<typeof installMockFigma>[0][number];
}

describe("collectExportDocument / editable", () => {
  it("собирает текст и фигуру в координатах, относительных слайду", async () => {
    installMockFigma([frame([
      { type: "TEXT", name: "Title", x: 100, y: 80, width: 800, height: 120, characters: "Привет", fills: [SOLID_BLACK], fontSize: 64, fontName: { family: "Arial", style: "Bold" }, textAlignHorizontal: "CENTER" },
      { type: "RECTANGLE", name: "Card", x: 100, y: 300, width: 400, height: 200, fills: [SOLID_BLACK] },
    ])]);

    const document = await collectExportDocument("page");

    expect(document.slides).toHaveLength(1);
    const slide = document.slides[0];
    expect(slide.mode).toBe("editable");
    // фон слайда + текст + прямоугольник
    expect(slide.elements).toHaveLength(3);
    expect(slide.elements[1]).toMatchObject({ kind: "text", text: "Привет", x: 100, y: 80, align: "center", bold: true });
    expect(slide.elements[2]).toMatchObject({ kind: "shape", shape: "rect", x: 100, y: 300 });
    uninstallMockFigma();
  });

  it("сохраняет фон слайда как прямоугольник", async () => {
    installMockFigma([frame([])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.elements[0]).toMatchObject({ kind: "shape", shape: "rect", x: 0, y: 0, width: 1920, height: 1080 });
    uninstallMockFigma();
  });

  it("сохраняет заливку вложенного фрейма-карточки", async () => {
    installMockFigma([frame([{
      type: "FRAME",
      name: "Card",
      x: 200,
      y: 200,
      width: 600,
      height: 400,
      fills: [SOLID_BLACK],
      children: [{ type: "TEXT", x: 220, y: 220, width: 300, height: 60, characters: "Внутри", fills: [SOLID_WHITE] }],
    }])]);

    const slide = (await collectExportDocument("page")).slides[0];
    const cardBackground = slide.elements.find(element => element.kind === "shape" && element.width === 600);

    expect(slide.mode).toBe("editable");
    expect(cardBackground).toBeDefined();
    uninstallMockFigma();
  });

  it("учитывает обрезку контента фреймом", async () => {
    installMockFigma([frame([{
      type: "FRAME",
      name: "Clipper",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      clipsContent: true,
      fills: [],
      children: [{ type: "RECTANGLE", name: "Overflow", x: 900, y: 0, width: 400, height: 400, fills: [SOLID_BLACK] }],
    }])]);

    const slide = (await collectExportDocument("page")).slides[0];
    const overflow = slide.elements.find(element => element.id.length > 0 && element.width === 400 && element.x === 900);

    expect(overflow).toBeUndefined();
    uninstallMockFigma();
  });

  it("пропускает невидимые узлы", async () => {
    installMockFigma([frame([{ type: "RECTANGLE", visible: false, fills: [SOLID_BLACK] }])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.elements).toHaveLength(1);
    uninstallMockFigma();
  });
});

describe("collectExportDocument / fallback", () => {
  it("не роняет весь слайд в PNG из-за одной тени на карточке", async () => {
    installMockFigma([frame([
      { type: "TEXT", x: 0, y: 0, width: 500, height: 80, characters: "Заголовок", fills: [SOLID_BLACK] },
      { type: "RECTANGLE", x: 0, y: 200, width: 300, height: 200, fills: [SOLID_BLACK], effects: [{ type: "DROP_SHADOW", visible: true, radius: 8 }] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    uninstallMockFigma();
  });

  it("не роняет весь слайд в PNG из-за одной векторной иконки", async () => {
    installMockFigma([frame([
      { type: "TEXT", x: 0, y: 0, width: 500, height: 80, characters: "Заголовок", fills: [SOLID_BLACK] },
      { type: "VECTOR", name: "Icon", x: 40, y: 400, width: 48, height: 48, fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    uninstallMockFigma();
  });

  it("отдаёт PNG для слайда целиком, когда иначе никак", async () => {
    installMockFigma([frame([
      { type: "RECTANGLE", x: 0, y: 0, width: 100, height: 100, blendMode: "MULTIPLY", fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("image-only");
    expect(slide.fallbackPng).toBeDefined();
    expect(slide.fallbackReason).toBeDefined();
    uninstallMockFigma();
  });
});

describe("collectExportDocument / поэлементная растеризация", () => {
  it("растеризует фон слайда с картинкой отдельно, дети остаются нативными", async () => {
    installMockFigma([frame([
      { type: "TEXT", x: 100, y: 100, width: 600, height: 80, characters: "Поверх фото", fills: [SOLID_BLACK] },
    ], { fills: [{ type: "IMAGE", imageHash: "abc", scaleMode: "FILL" }] })]);
    const rootsBefore = figma.currentPage.children.length;

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements[0]).toMatchObject({ kind: "image", x: 0, y: 0, width: 1920, height: 1080 });
    expect(slide.elements[1]).toMatchObject({ kind: "text", text: "Поверх фото" });
    expect(slide.rasterReasons?.[0]).toContain("фон слайда");
    // временный прямоугольник не должен остаться в документе
    expect(figma.currentPage.children.length).toBe(rootsBefore);
    uninstallMockFigma();
  });


  it("растеризует только карточку с тенью, остальное оставляет векторным", async () => {
    installMockFigma([frame([
      { type: "TEXT", x: 0, y: 0, width: 500, height: 80, characters: "Заголовок", fills: [SOLID_BLACK] },
      {
        type: "GROUP",
        name: "Card",
        x: 0,
        y: 200,
        width: 300,
        height: 200,
        effects: [{ type: "DROP_SHADOW", visible: true, radius: 8 }],
        children: [{ type: "RECTANGLE", x: 0, y: 200, width: 300, height: 200, fills: [SOLID_BLACK] }],
      },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements.map(element => element.kind)).toEqual(["shape", "text", "image"]);
    expect(slide.rasterReasons).toHaveLength(1);
    uninstallMockFigma();
  });

  it("растеризует векторную иконку в её координатах", async () => {
    installMockFigma([frame([
      { type: "VECTOR", name: "Icon", x: 40, y: 400, width: 48, height: 48, fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];
    const icon = slide.elements[1];

    expect(icon).toMatchObject({ kind: "image", x: 40, y: 400, width: 48, height: 48, rotation: 0, opacity: 1 });
    uninstallMockFigma();
  });

  it("растеризует группу с маской целиком", async () => {
    installMockFigma([frame([{
      type: "GROUP",
      name: "Masked",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      children: [
        { type: "ELLIPSE", name: "Mask", isMask: true, width: 400, height: 400, fills: [SOLID_BLACK] },
        { type: "RECTANGLE", name: "Photo", width: 400, height: 400, fills: [SOLID_BLACK] },
      ],
    }])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements.filter(element => element.kind === "image")).toHaveLength(1);
    expect(slide.rasterReasons?.[0]).toContain("маска");
    uninstallMockFigma();
  });

  it("кладёт повёрнутый текст в неповёрнутую рамку с исходным размером", async () => {
    installMockFigma([frame([{
      type: "TEXT",
      name: "Rotated",
      x: 100,
      y: 50,
      width: 100,
      height: 20,
      rotation: 90,
      characters: "Сбоку",
      fills: [SOLID_BLACK],
    }])]);

    const slide = (await collectExportDocument("page")).slides[0];
    const text = slide.elements[1];

    expect(text).toMatchObject({ kind: "text", rotation: 90, width: 100, height: 20 });
    uninstallMockFigma();
  });

  it("сохраняет фон слайда в Figma Slides", async () => {
    installMockFigma([{
      type: "SLIDE",
      name: "Slide 1",
      width: 1920,
      height: 1080,
      fills: [SOLID_BLACK],
      children: [],
    }], { editorType: "slides" });

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.elements[0]).toMatchObject({ kind: "shape", width: 1920, height: 1080 });
    uninstallMockFigma();
  });

  it("экспортирует изображение-заливку в удвоенном разрешении", async () => {
    const figma = installMockFigma([frame([{
      type: "RECTANGLE",
      name: "Photo",
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      fills: [{ type: "IMAGE" }],
    }])]);
    const photo = figma.page.children[0].children[0];

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.elements[1]).toMatchObject({ kind: "image", width: 600, height: 400 });
    expect(photo.exportCalls[0]).toMatchObject({ constraint: { type: "SCALE", value: 2 } });
    uninstallMockFigma();
  });

  it("срезает множитель растеризации для очень крупных слоёв", async () => {
    const figma = installMockFigma([frame([{
      type: "VECTOR",
      name: "Huge",
      x: 0,
      y: 0,
      width: 7680,
      height: 1080,
      fills: [SOLID_BLACK],
    }], { width: 7680, height: 4320 })]);
    const vector = figma.page.children[0].children[0];

    await collectExportDocument("page");

    expect(vector.exportCalls[0]).toMatchObject({ constraint: { type: "SCALE", value: 1 } });
    uninstallMockFigma();
  });
});
