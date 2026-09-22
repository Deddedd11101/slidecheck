# Test Strategy

## Goal

Avoid using manual Figma plugin reloads as the main development loop.

Manual Figma testing is still required, but it should validate integration, not every rule change.

## Test Layers

1. Pure scanner tests

Run rules against JSON fixtures representing normalized Figma nodes.

Fast feedback:

```txt
fixture -> scanDocument() -> expected findings
```

Autofix geometry helpers are also unit-tested outside the Figma runtime. The
plugin-side mutation code stays thin and delegates position math to pure helpers
where possible.

2. Adapter and fix tests

`src/plugin/testing/figma-mock.ts` implements the slice of the Figma Plugin API
the plugin actually touches: a scene graph of frames/slides, absolute
coordinates, paints, effects, blend modes, cloning, grouping, and raster export.

`installMockFigma()` installs the global `figma` object, so `applyFixes()` and
`collectExportDocument()` run unchanged outside Figma:

```txt
installMockFigma(scene) -> applyFixes(targets, mode) -> assert on the scene
installMockFigma(scene) -> collectExportDocument(scope) -> assert on the DTO
```

Every test that installs the mock must call `uninstallMockFigma()` afterwards —
the global is shared.

3. Generated PPTX checks

The editable builder is tested without React or Figma by writing real PPTX
buffers and inspecting the OOXML ZIP contents. Checks cover editable text,
shape geometry/rotation/strokes, image relationships and valid PNG media.
These checks prove file structure, not PowerPoint's font rendering.

The Figma mock includes composed parent transforms and valid tiny PNG data.
It does not render masks, shadows or text: visual fidelity still needs Figma
and PowerPoint smoke tests.

4. UI tests with mocked transport

Run the React UI locally with fake scan responses.

5. Manual Figma smoke tests

Use a small controlled Figma/Figma Slides file:
- 5-10 slides;
- intentional known problems;
- 1-2 clean slides;
- clear layer names for expected problems.

## Initial Fixture Cases

- gradient fill;
- image mask / clip content;
- background blur;
- multiple shadows;
- non-system font;
- mixed text styles;
- text near slide edge;
- object outside slide bounds;
- nested frame;
- prototype interaction;
- video fill, if accessible through plugin node data.
- scan strictness and enabled rule groups.

## Commands

Planned commands:

```sh
pnpm test
pnpm build:plugin
```

Manual smoke testing is documented in [SMOKE_TEST.md](SMOKE_TEST.md).
