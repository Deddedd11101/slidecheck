import { describe, expect, it } from "vitest";
import { scanDocument } from "./scan-document";
import type { NormalizedDocument } from "../../shared/types";

describe("scanDocument", () => {
  it("reports visible gradient fills", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Cover",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "node-1",
              name: "Background",
              type: "RECTANGLE",
              path: ["Cover", "Background"],
              fills: [{ type: "GRADIENT_LINEAR" }],
            },
          ],
        },
      ],
    };

    expect(scanDocument(document)).toMatchObject([
      {
        ruleId: "visual.gradient-fill",
        nodeId: "node-1",
        slideId: "slide-1",
      },
    ]);
  });

  it("reports text inside the unsafe slide margin", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Contacts",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "node-2",
              name: "Footer",
              type: "TEXT",
              path: ["Contacts", "Footer"],
              bounds: { x: 8, y: 1000, width: 400, height: 40 },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document)).toMatchObject([
      {
        ruleId: "text.near-slide-edge",
        nodeId: "node-2",
        slideId: "slide-1",
        evidence: {
          safeMargin: 16,
          distance: 8,
        },
      },
    ]);
  });

  it("does not report hidden gradients or safe text", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Clean",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "node-1",
              name: "Hidden gradient",
              type: "RECTANGLE",
              path: ["Clean", "Hidden gradient"],
              fills: [{ type: "GRADIENT_LINEAR", visible: false }],
            },
            {
              id: "node-2",
              name: "Safe text",
              type: "TEXT",
              path: ["Clean", "Safe text"],
              bounds: { x: 100, y: 100, width: 400, height: 40 },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document)).toEqual([]);
  });

  it("reports visual effects and masks", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Visual",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "mask-1",
              name: "Image mask",
              type: "RECTANGLE",
              path: ["Visual", "Image mask"],
              isMask: true,
            },
            {
              id: "blur-1",
              name: "Glass card",
              type: "FRAME",
              path: ["Visual", "Glass card"],
              effects: [{ type: "BACKGROUND_BLUR" }, { type: "DROP_SHADOW" }, { type: "INNER_SHADOW" }],
            },
            {
              id: "blend-1",
              name: "Overlay",
              type: "RECTANGLE",
              path: ["Visual", "Overlay"],
              blendMode: "MULTIPLY",
            },
          ],
        },
      ],
    };

    expect(scanDocument(document).map((finding) => finding.ruleId)).toEqual([
      "visual.mask",
      "visual.background-blur",
      "visual.multiple-shadows",
      "structure.nested-frame",
      "visual.blend-mode",
    ]);
  });

  it("reports layer blur but ignores hidden effects", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Effects",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "visible-blur",
              name: "Blurred image",
              type: "RECTANGLE",
              path: ["Effects", "Blurred image"],
              effects: [{ type: "LAYER_BLUR" }],
            },
            {
              id: "hidden-blur",
              name: "Hidden blur",
              type: "RECTANGLE",
              path: ["Effects", "Hidden blur"],
              effects: [{ type: "LAYER_BLUR", visible: false }],
            },
          ],
        },
      ],
    };

    expect(scanDocument(document).map((finding) => finding.ruleId)).toEqual([
      "visual.layer-blur",
    ]);
  });

  it("does not report a slide at the widescreen tolerance boundary", () => {
    const width = 1600;
    const height = width / (16 / 9 + 0.009);
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Tolerance",
          type: "FRAME",
          bounds: { x: 0, y: 0, width, height },
          children: [],
        },
      ],
    };

    expect(scanDocument(document).some((finding) => finding.ruleId === "structure.non-16-9-slide")).toBe(false);
  });

  it("reports non-system fonts and text outside slide bounds", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Typography",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "text-1",
              name: "Headline",
              type: "TEXT",
              path: ["Typography", "Headline"],
              bounds: { x: 100, y: 100, width: 400, height: 80 },
              textStyle: { fontFamily: "Neue Montreal", fontPostScriptName: "Neue Montreal Bold" },
            },
            {
              id: "text-2",
              name: "Off-slide caption",
              type: "TEXT",
              path: ["Typography", "Off-slide caption"],
              bounds: { x: -50, y: 100, width: 400, height: 80 },
              textStyle: { fontFamily: "Arial", fontPostScriptName: "ArialMT" },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document).map((finding) => finding.ruleId)).toEqual([
      "text.non-system-font",
      "text.outside-slide-bounds",
    ]);
  });

  it("reports non-16:9 slides and non-text objects outside slide bounds", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Wrong size",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1280, height: 800 },
          children: [
            {
              id: "shape-1",
              name: "Outside decoration",
              type: "ELLIPSE",
              path: ["Wrong size", "Outside decoration"],
              bounds: { x: 1250, y: 200, width: 200, height: 200 },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document).map((finding) => finding.ruleId)).toEqual([
      "structure.non-16-9-slide",
      "structure.object-outside-slide-bounds",
    ]);
  });

  it("downgrades minor object overflow in standard mode", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Decor",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "shape-1",
              name: "Small overflow circle",
              type: "ELLIPSE",
              path: ["Decor", "Small overflow circle"],
              bounds: { x: 1912, y: 200, width: 16, height: 16 },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document)).toMatchObject([
      {
        ruleId: "structure.object-outside-slide-bounds",
        severityOverride: "suggestion",
        evidence: {
          overflow: 8,
          minorOverflowThreshold: 12,
        },
      },
    ]);
  });

  it("ignores minor object overflow in soft mode", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Decor",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          children: [
            {
              id: "shape-1",
              name: "Small overflow circle",
              type: "ELLIPSE",
              path: ["Decor", "Small overflow circle"],
              bounds: { x: 1912, y: 200, width: 16, height: 16 },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document, { strictness: "soft" })).toEqual([]);
  });

  it("respects disabled rule groups", () => {
    const document: NormalizedDocument = {
      slides: [
        {
          id: "slide-1",
          name: "Structure disabled",
          type: "FRAME",
          bounds: { x: 0, y: 0, width: 1280, height: 800 },
          children: [
            {
              id: "shape-1",
              name: "Outside decoration",
              type: "ELLIPSE",
              path: ["Structure disabled", "Outside decoration"],
              bounds: { x: 1250, y: 200, width: 200, height: 200 },
            },
          ],
        },
      ],
    };

    expect(scanDocument(document, {
      enabledGroups: {
        visual: true,
        text: true,
        structure: false,
        interactive: true,
        export: true,
      },
    })).toEqual([]);
  });
});
