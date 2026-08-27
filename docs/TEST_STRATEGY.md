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

2. Adapter tests

Validate that mocked Figma node-like objects normalize into our internal model correctly.

3. UI tests with mocked transport

Run the React UI locally with fake scan responses.

4. Manual Figma smoke tests

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

## Commands

Planned commands:

```sh
pnpm test
pnpm build:plugin
```

The current project does not yet have a test runner configured.

