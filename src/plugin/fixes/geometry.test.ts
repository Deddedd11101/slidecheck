import { describe, expect, it } from "vitest";
import { getDeltaToFitBounds } from "./geometry";

describe("getDeltaToFitBounds", () => {
  it("moves a node back inside the right edge", () => {
    expect(getDeltaToFitBounds(
      { x: 1910, y: 100, width: 80, height: 40 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      0,
    )).toEqual({ x: -70, y: 0 });
  });

  it("keeps a safe margin for text fixes", () => {
    expect(getDeltaToFitBounds(
      { x: 4, y: 1000, width: 300, height: 40 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      16,
    )).toEqual({ x: 12, y: 0 });
  });
});
