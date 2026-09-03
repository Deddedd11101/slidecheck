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
  -> run scanner rules with scan settings
  -> SCAN_RESULT
  -> UI renders findings

UI finding click
  -> SELECT_NODE_REQUEST
  -> figma.currentPage.selection = [node]
  -> figma.viewport.scrollAndZoomIntoView([node])

UI autofix button
  -> APPLY_FIXES_REQUEST
  -> plugin fix engine mutates supported nodes
  -> collect Figma nodes again
  -> run scanner rules again
  -> APPLY_FIXES_RESULT
  -> UI renders updated findings
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

## Autofix Design

Autofix support is explicit per rule through `RuleDefinition.autofix`. A rule is
not considered fixable unless the registry declares a user-facing autofix label
and the plugin fix engine implements the matching `ruleId`.

Current supported autofixes:

- `text.near-slide-edge`: move text inside the 16px safe margin;
- `text.outside-slide-bounds`: move text back inside the 16px safe margin;
- `structure.object-outside-slide-bounds`: move object back inside slide bounds;
- `structure.non-16-9-slide`: resize the slide/frame to 16:9 using its current width.

Current limitations:

- fixes mutate the current Figma document and rely on Figma Undo for rollback;
- mask, blur, blend-mode, gradient, nested-frame, and font fixes remain manual;
- safe-copy workflow is a separate phase because Slides copy behavior needs
  manual API verification.

## Scan Settings

The UI sends scan settings with each scan request:

- `strictness`: `soft`, `standard`, or `strict`;
- `enabledGroups`: toggles for visual/text/structure/interactive/export checks.

Current strictness effects:

- soft: smaller text safe margin and ignores minor decorative object overflow;
- standard: default margin and downgrades minor object overflow to a suggestion;
- strict: larger text safe margin and reports every object overflow as a warning.
