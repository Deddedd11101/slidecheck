import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectExportDocument } from "./collect-export-document";
import { installMockFigma, MIXED, uninstallMockFigma } from "../testing/figma-mock";

const SOLID_WHITE = { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
const SOLID_BLACK = { type: "SOLID", color: { r: 0, g: 0, b: 0 } };

afterEach(uninstallMockFigma);

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
    expect(slide.rasterReasons?.[0]).toMatch(/фон(?:а)? слайда/);
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

    expect(vector.exportCalls[0]).toMatchObject({ constraint: { type: "SCALE", value: 0.5 } });
    uninstallMockFigma();
  });
});

describe("collectExportDocument / conservative regressions", () => {
  it.each([
    ["direct mask", {}, [{ type: "ELLIPSE", isMask: true, fills: [SOLID_BLACK] }, { type: "RECTANGLE", fills: [SOLID_WHITE] }]],
    ["root opacity", { opacity: 0.2 }, [{ type: "TEXT", characters: "Title", fills: [SOLID_BLACK] }]],
    ["root strokes", { strokes: [SOLID_BLACK], strokeWeight: 4 }, []],
    ["root rotation", { rotation: 30 }, [{ type: "TEXT", characters: "Title", fills: [SOLID_BLACK] }]],
    ["root mixed corners", { cornerRadius: MIXED }, [{ type: "TEXT", characters: "Title", fills: [SOLID_BLACK] }]],
    ["root smoothed corners", { cornerRadius: 20, cornerSmoothing: 0.6 }, [{ type: "TEXT", characters: "Title", fills: [SOLID_BLACK] }]],
    ["root rounded clipping", { cornerRadius: 20, clipsContent: true }, [{ type: "TEXT", characters: "Title", fills: [SOLID_BLACK] }]],
    ["root background blur", { effects: [{ type: "BACKGROUND_BLUR", visible: true, radius: 8 }] }, [{ type: "RECTANGLE", fills: [SOLID_BLACK] }]],
    ["descendant background blur", {}, [{ type: "GROUP", children: [{ type: "RECTANGLE", fills: [SOLID_BLACK], effects: [{ type: "BACKGROUND_BLUR", visible: true, radius: 8 }] }] }]],
  ])("uses image-only for %s", async (_name, extra, children) => {
    const mock = installMockFigma([frame(children, extra)]);
    const root = mock.page.children[0];

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("image-only");
    expect(slide.elements).toEqual([]);
    expect(slide.fallbackReason).toEqual(expect.any(String));
    expect(slide.fallbackPng?.length).toBeGreaterThan(8);
    expect(root.exportCalls).toHaveLength(1);
    expect(root.exportCalls[0]).toMatchObject({ format: "PNG" });
    expect(root.children.every(child => child.exportCalls.length === 0)).toBe(true);
  });

  it("rasterizes a stroked nested frame as one layer in sibling order", async () => {
    const mock = installMockFigma([frame([
      { id: "before", type: "RECTANGLE", fills: [SOLID_BLACK] },
      { id: "card", type: "FRAME", x: 100, y: 200, width: 600, height: 300,
        fills: [SOLID_WHITE], strokes: [SOLID_BLACK], strokeWeight: 4,
        children: [{ id: "inside", type: "TEXT", characters: "Inside", fills: [SOLID_BLACK] }] },
      { id: "after", type: "TEXT", characters: "Above", fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements.slice(1).map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "before", kind: "shape" }, { id: "card", kind: "image" }, { id: "after", kind: "text" },
    ]);
    expect(slide.elements[2]).toMatchObject({ x: 100, y: 200, width: 600, height: 300 });
    expect(mock.getNode("card")?.exportCalls).toHaveLength(1);
    expect(mock.getNode("inside")?.exportCalls).toHaveLength(0);
  });

  it.each(["RECTANGLE", "TEXT", "FRAME"])("rasterizes multiple solid fills on %s", async type => {
    const mock = installMockFigma([frame([
      { id: "layer", type, characters: "Layer", fills: [SOLID_WHITE, { ...SOLID_BLACK, opacity: 0.5 }],
        children: type === "FRAME" ? [{ type: "TEXT", characters: "Inside", fills: [SOLID_BLACK] }] : [] },
      { id: "above", type: "TEXT", characters: "Above", fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements.map(element => element.kind)).toEqual(["shape", "image", "text"]);
    expect(slide.elements[1].id).toBe("layer");
    expect(mock.getNode("layer")?.exportCalls).toHaveLength(1);
  });

  it("rasterizes multiple root fills as background without flattening children", async () => {
    const mock = installMockFigma([frame([
      { id: "title", type: "TEXT", characters: "Title", fills: [SOLID_BLACK] },
    ], { fills: [SOLID_WHITE, { ...SOLID_BLACK, opacity: 0.5 }] })]);
    const root = mock.page.children[0];

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements).toHaveLength(2);
    expect(slide.elements[0]).toMatchObject({ id: `${root.id}:bg`, kind: "image", x: 0, y: 0, width: 1920, height: 1080 });
    expect(slide.elements[1]).toMatchObject({ id: "title", kind: "text" });
    expect(root.exportCalls).toHaveLength(0);
    expect(mock.page.children).toEqual([root]);
  });

  it.each(["TEXT", "RECTANGLE"])("inherits parent rotation and transformed position for native %s", async type => {
    installMockFigma([frame([
      { type: "GROUP", x: 300, y: 200, rotation: 90, children: [
        { type, x: 10, y: 30, width: 100, height: 20, characters: "Rotated", fills: [SOLID_BLACK] },
      ] },
    ], { x: 1000, y: 2000 })]);

    const slide = (await collectExportDocument("page")).slides[0];
    const element = slide.elements[1];

    expect(slide.mode).toBe("editable");
    expect(element).toMatchObject({ kind: type === "TEXT" ? "text" : "shape", width: 100, height: 20 });
    expect(element.rotation).toBeCloseTo(90);
    expect(element.x).toBeCloseTo(290);
    expect(element.y).toBeCloseTo(130);
  });

  it("composes parent and child rotations instead of replacing the child angle", async () => {
    installMockFigma([frame([{ type: "GROUP", rotation: 30, children: [
      { type: "TEXT", rotation: 15, width: 100, height: 20, characters: "Rotated", fills: [SOLID_BLACK] },
    ] }])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements[1]).toMatchObject({ kind: "text", width: 100, height: 20 });
    expect(slide.elements[1].rotation).toBeCloseTo(45);
  });

  it.each([
    ["pixel line height", { lineHeight: { unit: "PIXELS", value: 24 } }],
    ["pixel letter spacing", { letterSpacing: { unit: "PIXELS", value: 2 } }],
    ["percent letter spacing", { letterSpacing: { unit: "PERCENT", value: -5 } }],
    ["underline", { textDecoration: "UNDERLINE" }],
    ["strikethrough", { textDecoration: "STRIKETHROUGH" }],
  ])("rasterizes unsupported text with %s", async (_name, typography) => {
    const mock = installMockFigma([frame([
      { id: "styled", type: "TEXT", characters: "Styled", fills: [SOLID_BLACK], ...typography },
      { id: "plain", type: "TEXT", characters: "Plain", fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements.map(element => element.kind)).toEqual(["shape", "image", "text"]);
    expect(slide.elements[1].id).toBe("styled");
    expect(mock.getNode("styled")?.exportCalls).toHaveLength(1);
  });
});

describe("collectExportDocument / optional native properties", () => {
  it.each([
    ["bulleted", { type: "UNORDERED" }],
    ["numbered", { type: "ORDERED" }],
    ["mixed", MIXED],
  ] as const)("rasterizes %s list text without flattening adjacent text", async (_name, options) => {
    const getRangeListOptions = vi.fn(() => options);
    const mock = installMockFigma([frame([
      { id: "list", type: "TEXT", characters: "First\nSecond", fills: [SOLID_BLACK], getRangeListOptions },
      { id: "plain", type: "TEXT", characters: "Plain", fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(getRangeListOptions).toHaveBeenCalledExactlyOnceWith(0, "First\nSecond".length);
    expect(slide.mode).toBe("editable");
    expect(slide.elements.slice(1).map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "list", kind: "image" }, { id: "plain", kind: "text" },
    ]);
    expect(mock.getNode("list")?.exportCalls).toHaveLength(1);
    expect(mock.getNode("plain")?.getRangeListOptions(0, 5)).toEqual({ type: "NONE" });
  });

  it("does not query list options for empty text", async () => {
    const getRangeListOptions = vi.fn(() => { throw new Error("Empty range"); });
    installMockFigma([frame([{ type: "TEXT", characters: "", fills: [SOLID_BLACK], getRangeListOptions }])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(getRangeListOptions).not.toHaveBeenCalled();
    expect(slide.mode).toBe("editable");
    expect(slide.elements[1]).toMatchObject({ kind: "text", text: "" });
  });

  it.each([
    ["mixed rectangle", "RECTANGLE", { cornerRadius: MIXED }],
    ["smoothed rectangle", "RECTANGLE", { cornerRadius: 20, cornerSmoothing: 0.6 }],
    ["mixed frame", "FRAME", { cornerRadius: MIXED }],
    ["smoothed frame", "FRAME", { cornerRadius: 20, cornerSmoothing: 0.6 }],
  ])("rasterizes %s corners as one layer", async (_name, type, corners) => {
    const mock = installMockFigma([frame([
      { id: "rounded", type, fills: [SOLID_BLACK], ...corners,
        children: type === "FRAME" ? [{ type: "TEXT", characters: "Inside", fills: [SOLID_WHITE] }] : [] },
      { id: "plain", type: "TEXT", characters: "Above", fills: [SOLID_BLACK] },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements.map(element => element.kind)).toEqual(["shape", "image", "text"]);
    expect(slide.elements[1].id).toBe("rounded");
    expect(mock.getNode("rounded")?.exportCalls).toHaveLength(1);
  });

  it.each([
    ["TOP", "top"], ["CENTER", "mid"], ["BOTTOM", "bottom"],
  ])("preserves %s text vertical alignment", async (textAlignVertical, valign) => {
    installMockFigma([frame([
      { type: "TEXT", characters: "Aligned", fills: [SOLID_BLACK], textAlignVertical },
    ])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements[1]).toMatchObject({ kind: "text", valign });
  });

  it.each([
    ["omitted arcData", undefined, "shape"],
    ["full ellipse", { startingAngle: 0, endingAngle: Math.PI * 2, innerRadius: 0 }, "shape"],
    ["partial arc", { startingAngle: 0, endingAngle: Math.PI, innerRadius: 0 }, "image"],
    ["donut", { startingAngle: 0, endingAngle: Math.PI * 2, innerRadius: 0.5 }, "image"],
  ])("handles %s", async (_name, arcData, kind) => {
    installMockFigma([frame([{ type: "ELLIPSE", fills: [SOLID_BLACK], arcData }])]);

    const slide = (await collectExportDocument("page")).slides[0];

    expect(slide.mode).toBe("editable");
    expect(slide.elements[1].kind).toBe(kind);
  });
});

describe("Figma export mock", () => {
  it("composes ancestor rotations using Figma's counterclockwise sign and bounds all corners", () => {
    const mock = installMockFigma([frame([{ id: "parent", type: "GROUP", x: 300, y: 200, rotation: 90, children: [
      { id: "child", type: "RECTANGLE", x: 10, y: 30, width: 100, height: 20, rotation: -90 },
    ] }], { x: 1000, y: 2000 })]);
    const parent = mock.getNode("parent")!;
    const child = mock.getNode("child")!;

    expect(parent.absoluteTransform[0][1]).toBeCloseTo(1);
    expect(parent.absoluteTransform[1][0]).toBeCloseTo(-1);
    expect(child.absoluteTransform[0][0]).toBeCloseTo(1);
    expect(child.absoluteTransform[1][1]).toBeCloseTo(1);
    expect(child.absoluteBoundingBox).toEqual({ x: 1330, y: 2190, width: 100, height: 20 });

    child.rotation = 0;
    const box = child.absoluteBoundingBox;
    expect(box.x).toBeCloseTo(1330);
    expect(box.y).toBeCloseTo(2090);
    expect(box.width).toBeCloseTo(20);
    expect(box.height).toBeCloseTo(100);
  });

  it("exports a complete decodable tiny PNG with valid chunk CRCs", async () => {
    const mock = installMockFigma([frame([])]);
    const bytes = await mock.page.children[0].exportAsync({ format: "PNG" });
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const types: string[] = [];
    let offset = 8;
    while (offset < bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      types.push(type);
      let crc = 0xffffffff;
      for (const byte of bytes.slice(offset + 4, offset + 8 + length)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      expect(view.getUint32(offset + 8 + length)).toBe((crc ^ 0xffffffff) >>> 0);
      if (type === "IHDR") {
        expect(view.getUint32(offset + 8)).toBe(1);
        expect(view.getUint32(offset + 12)).toBe(1);
        expect(Array.from(bytes.slice(offset + 16, offset + 21))).toEqual([8, 6, 0, 0, 0]);
      }
      if (type === "IDAT") expect(Array.from(inflateSync(bytes.slice(offset + 8, offset + 8 + length)))).toEqual([0, 0, 0, 0, 0]);
      offset += length + 12;
    }
    expect(types).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(offset).toBe(bytes.length);
  });
});
