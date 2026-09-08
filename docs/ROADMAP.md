# Roadmap

## Phase 0: Project Foundation

- initialize git repository;
- create GitHub repository;
- document architecture, rule format, testing, and versioning;
- verify install/build pipeline.

## Phase 1: MVP Linter Core

- introduce shared message/types;
- implement UI/plugin message transport;
- implement scanner core with fixture tests;
- replace mock scan result with real scan result;
- select affected node on finding click.

## Phase 2: Rule Coverage

- visual rules: gradients, masks, blur/effects, shadows;
- text rules: unsupported fonts, mixed styles, text near edges;
- structure rules: nested frames, off-slide objects, invalid slide aspect;
- interactive rules: prototype links, unsupported media where detectable.

## Phase 3: Slides Support

- update manifest editor type;
- support `SLIDE`, `SLIDE_ROW`, and `SLIDE_GRID`;
- adapt selection and scan scope behavior for Slides.

## Phase 4: Export Experiment

- image-based PPTX generation is implemented for selected/page roots;
- document editable PPTX constraints and support matrix;
- prototype hybrid editable export for clean slides;
- keep image-only fallback for unsupported slides;
- decide whether advanced export belongs in this plugin or a separate package.

## Phase 5: Autofix

- implement fix message transport;
- add one fix algorithm at a time;
- rescan after fixes;
- keep unsupported rules manual until their visual risk is understood;
- implement safe-copy workflow after Design/Slides duplication behavior is verified.
