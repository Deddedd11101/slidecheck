import { describe, expect, it } from "vitest";
import { PPTX_WIDE_HEIGHT, PPTX_WIDE_WIDTH, toPptxBox, toPptxFontSize, toPptxRotation, toUnrotatedBox } from "./export-geometry";

describe("toPptxBox", () => {
  it("maps a 1920x1080 slide to the full widescreen PPTX canvas", () => {
    const box = toPptxBox({
      kind: "shape",
      id: "shape",
      shape: "rect",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
    }, 1920, 1080);

    expect(box).toEqual({ x: 0, y: 0, w: PPTX_WIDE_WIDTH, h: PPTX_WIDE_HEIGHT });
  });

  it("preserves position and size proportions", () => {
    const box = toPptxBox({
      kind: "shape",
      id: "shape",
      shape: "rect",
      x: 480,
      y: 270,
      width: 960,
      height: 540,
      rotation: 0,
      opacity: 1,
    }, 1920, 1080);

    expect(box).toEqual({
      x: PPTX_WIDE_WIDTH / 4,
      y: PPTX_WIDE_HEIGHT / 4,
      w: PPTX_WIDE_WIDTH / 2,
      h: PPTX_WIDE_HEIGHT / 2,
    });
  });

  it("keeps zero-sized objects representable for pptxgenjs", () => {
    const box = toPptxBox({
      kind: "shape",
      id: "line",
      shape: "line",
      x: 10,
      y: 10,
      width: 0,
      height: 0,
      rotation: 0,
      opacity: 1,
    }, 1920, 1080);

    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
  });
});

describe("toPptxFontSize", () => {
  it("переводит кегль макета 1920px в пункты PPTX", () => {
    expect(toPptxFontSize(64, 1920)).toBe(32);
    expect(toPptxFontSize(24, 1920)).toBe(12);
  });

  it("даёт тот же физический размер для макета 1280px", () => {
    expect(toPptxFontSize(24, 1280)).toBe(18);
    expect(toPptxFontSize(16, 1280)).toBe(12);
  });

  it("никогда не отдаёт нулевой кегль", () => {
    expect(toPptxFontSize(0.1, 1920)).toBe(1);
  });
});

describe("toPptxRotation", () => {
  it("инвертирует направление поворота", () => {
    expect(toPptxRotation(15)).toBe(345);
    expect(toPptxRotation(-15)).toBe(15);
    expect(toPptxRotation(0)).toBe(0);
    expect(toPptxRotation(90)).toBe(270);
  });
});

describe("toUnrotatedBox", () => {
  it("возвращает исходный прямоугольник для неповёрнутого объекта", () => {
    expect(toUnrotatedBox({ x: 10, y: 20, width: 100, height: 50 }, 100, 50))
      .toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("сохраняет центр объекта при повороте", () => {
    // Объект 100x20, повёрнутый на 90°, даёт AABB 20x100 с тем же центром.
    const box = toUnrotatedBox({ x: 100, y: 50, width: 20, height: 100 }, 100, 20);

    expect(box).toEqual({ x: 60, y: 90, width: 100, height: 20 });
    expect(box.x + box.width / 2).toBe(110);
    expect(box.y + box.height / 2).toBe(100);
  });
});
