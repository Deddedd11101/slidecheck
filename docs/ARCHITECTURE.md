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

- `visual.gradient-fill`: replace a gradient with its interpolated midpoint color as a solid fill;
- `visual.background-blur`: remove background blur effects;
- `visual.layer-blur`: remove layer blur effects;
- `visual.multiple-shadows`: keep the first visible shadow;
- `visual.blend-mode`: reset the node blend mode to `NORMAL`;
- `text.non-system-font`: replace a simple text style with Arial and preserve
  bold/italic intent;
- `text.near-slide-edge`: move text inside the 16px safe margin;
- `text.outside-slide-bounds`: move text back inside the 16px safe margin;
- `structure.object-outside-slide-bounds`: move object back inside slide bounds;
- `structure.non-16-9-slide`: resize the slide/frame to 16:9 using its current width.

Current limitations:

- fixes mutate the current Figma document and rely on Figma Undo for rollback;
- the user can choose to apply fixes in place or clone the affected root
  frames/slides first; copy mode rescans the created copies;
- position fixes skip children controlled by Auto Layout instead of forcing
  manual coordinates;
- mask fixes remain manual; nested-frame fixes apply only to plain non-auto-layout
  frames without fills, strokes, effects, or clipping;
- copy mode currently clones affected root frames/slides, not the entire page;
  whole-presentation duplication remains a separate phase.

## Scan Settings

The transport keeps `ScanSettings` for forward compatibility, but the primary UI
currently sends one standard configuration and does not expose strictness,
rule-group filters, or ignore controls.

Current standard effects:

- default text safe margin;
- minor decorative object overflow is downgraded to a suggestion;
- all registered rule groups are enabled.

Additional scan modes can be reconsidered after the rule catalog and false
positive profile are validated against real team files.
