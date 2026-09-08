import { describe, expect, it } from "vitest";
import { PPTX_WIDE_HEIGHT, PPTX_WIDE_WIDTH, toPptxBox } from "./export-geometry";

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
      opacity: 1,
    }, 1920, 1080);

    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
  });
});
