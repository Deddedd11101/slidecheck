# Editable PPTX Spike

## Decision

Editable PPTX should be implemented as a separate export adapter, not mixed
into the scanner or autofix engine.

The plugin API does not provide a direct PPTX export method. It can export
nodes as images and expose Figma node data, but PPTX generation must happen in
our own code. `pptxgenjs` is a suitable first implementation because it runs in
the plugin UI bundle and can create native PowerPoint text, shapes, and images.

Sources:

- [Figma ExportSettings](https://developers.figma.com/docs/plugins/api/ExportSettings/)
- [Figma async export tasks](https://developers.figma.com/docs/plugins/async-tasks/)
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS/)

## Recommended Product Behavior

The first editable export must be hybrid, not an attempt to convert every Figma
feature to PowerPoint.

1. Collect a slide into an export-specific intermediate representation.
2. Convert high-confidence objects to native PPTX objects.
3. Rasterize unsupported objects or an entire slide when mixing would create a
   visible mismatch.
4. Report the export mode per slide: `editable`, `mixed`, or `image-only`.

This keeps the current image-only exporter as a reliable fallback. A slide that
contains a blur, mask, gradient, complex vector, blend mode, or unsupported
effect should not silently become a visually different editable slide.

## Export Model

The scanner's normalized model is intentionally too small for export. Export
needs a separate model with the data required to reproduce appearance:

```ts
type ExportDocument = {
  slides: ExportSlide[];
};

type ExportSlide = {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: ExportElement[];
  fallbackPng?: Uint8Array;
};

type ExportElement =
  | {
      kind: "text";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontFamily: string;
      fontSize: number;
      color: string;
      opacity: number;
      align: "left" | "center" | "right";
      rotation: number;
    }
  | {
      kind: "shape";
      id: string;
      shape: "rect" | "ellipse" | "line";
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: string;
      stroke?: string;
      opacity: number;
      rotation: number;
    }
  | {
      kind: "image";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      bytes: Uint8Array;
      opacity: number;
      rotation: number;
    };
```

This model is intentionally export-specific. It must not become a second
scanner model or a generic serialization of the whole Figma API.

## Initial Support Matrix

| Figma content | PPTX result | Phase |
| --- | --- | --- |
| Simple text with one style | Editable text | Prototype |
| Solid rectangle/ellipse/line | Editable shape | Prototype |
| Raster image | Editable image object | Prototype |
| Plain groups | Flattened native children | Prototype |
| Gradient fill | Whole-slide PNG fallback | Prototype |
| Masks and clips | Whole-slide PNG fallback | Prototype |
| Blur, blend modes, complex shadows | Whole-slide PNG fallback | Prototype |
| Complex vectors and boolean operations | Whole-slide PNG fallback | Prototype |
| Auto-layout | Export resolved geometry, not layout rules | Later |
| Mixed text styles in one text node | PNG fallback or split runs | Later |
| Components and instances | Export visual result, ignore component semantics | Later |

## Geometry

PPTX uses inches while Figma uses pixels. For a widescreen slide:

```txt
slideWidthIn = 13.333
slideHeightIn = 7.5
xIn = (element.x - slide.x) / slide.width * slideWidthIn
yIn = (element.y - slide.y) / slide.height * slideHeightIn
widthIn = element.width / slide.width * slideWidthIn
heightIn = element.height / slide.height * slideHeightIn
```

The adapter must use absolute bounding boxes for the first prototype. Relative
transforms, constraints, and Auto Layout rules are not PowerPoint semantics and
should not be pretended to be editable.

## Implementation Stages

### Stage A: export probe

- inspect representative Figma nodes;
- collect text, solid fills, basic shapes, and raster image bytes;
- generate a PPTX with one native object per supported node;
- compare the result with the image-only export;
- add fixture-level tests for geometry and color conversion.

Estimate: 4-6 hours.

### Stage B: editable clean slide

- add a `COLLECT_EXPORT_MODEL_REQUEST` message;
- implement a plugin-side export adapter;
- mark unsupported content at slide level;
- generate native PPTX for clean slides and PNG fallback for risky slides;
- show the export mode in the UI.

Estimate: 8-12 hours.

### Stage C: real-file verification

- test Design frames and Figma Slides separately;
- test fonts, clipping, rotations, transparency, and z-order;
- compare native output with the source and image-only fallback;
- document known limitations.

Estimate: 4-8 hours, with manual Figma validation required.

For a two-hour-per-day schedule, this is a realistic 2-3 week track alongside
bug fixes. It should not block scanner maintenance or the current image-only
export.

## Acceptance Criteria

The prototype is successful when:

- a clean slide opens in PowerPoint with selectable text and simple shapes;
- unsupported content does not disappear or move silently;
- a risky slide is explicitly exported as image-only;
- exported coordinates stay within a small, documented tolerance;
- the same source can still be exported through the existing image-only path;
- no Figma reload is required for unit tests.

## Open Questions

- Should the product promise editability per slide or only for the whole deck?
- Which fonts are guaranteed in the team's PowerPoint environment?
- Is visual fidelity more important than editability for slides with effects?
- Do users prefer a warning and fallback, or a hard export error for unsupported
  content?

The recommended default is per-slide hybrid export with an explicit fallback,
because a hard error makes the tool less useful and silent conversion makes it
untrustworthy.
