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
});

