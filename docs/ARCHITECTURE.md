# Architecture

## Runtime Split

Figma plugins have two runtimes:

- plugin sandbox: `src/plugin/code.ts`, compiled to `dist/code.js`;
- iframe UI: `src/app`, compiled to `dist/ui.html`.

The plugin sandbox can access `figma.*`. The React UI cannot access `figma.*` directly and must communicate through messages.

## Proposed Modules

```txt
src/
  shared/
    messages.ts
    types.ts
  plugin/
    code.ts
    controller.ts
    adapter/
      collect-design.ts
      collect-slides.ts
      normalize.ts
    scanner/
      scan-document.ts
      geometry.ts
    rules/
      registry.ts
      visual.ts
      text.ts
      structure.ts
      interactive.ts
  app/
    App.tsx
```

## Data Flow

```txt
UI button
  -> SCAN_REQUEST
  -> plugin controller
  -> collect Figma nodes
  -> normalize to internal document model
  -> run scanner rules
  -> SCAN_RESULT
  -> UI renders findings

UI finding click
  -> SELECT_NODE_REQUEST
  -> figma.currentPage.selection = [node]
  -> figma.viewport.scrollAndZoomIntoView([node])
```

## Rule Design

Rules have metadata and checker logic.

Metadata explains the problem:
- id;
- group;
- severity;
- title;
- why;
- fix hint.

Checker logic detects the problem and emits findings:
- rule id;
- node id;
- slide/frame id;
- node name/path;
- evidence.

This keeps UI copy stable while allowing scanner implementation to evolve.

