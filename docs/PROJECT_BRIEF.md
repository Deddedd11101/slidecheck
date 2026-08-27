# SlideCheck Project Brief

## Objective

Build a Figma plugin that checks Figma Design and Figma Slides files for deterministic, predefined issues that can affect PPTX export quality.

The first product version is a linter. It scans document content, reports issues, and selects the affected frame/layer on click.

## MVP Definition

The MVP is done when:
- the plugin runs from `manifest.json` in Figma;
- it supports Figma Design and Figma Slides editor types;
- the UI can request a real scan from the plugin sandbox;
- the plugin returns real findings from selected frames or current-page top-level frames/slides;
- clicking a finding selects and zooms to the affected node;
- the scanner has fast local tests using fixtures;
- the project has a documented rule format and release process.

## Non-Goals For MVP

- AI analysis.
- Automatic fixes.
- Full editable PPTX export.
- Design-quality critique unrelated to export compatibility.
- A broad rule catalog without test fixtures.

## Current State

The current repository is a UI-heavy prototype:
- `src/app/App.tsx` renders the flow using mock issues.
- `src/plugin/code.ts` only opens the UI.
- `manifest.json` points to generated `dist/code.js` and `dist/ui.html`.

The main implementation task is connecting the UI to real Figma-side scanning logic.

