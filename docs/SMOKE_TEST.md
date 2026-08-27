# Manual Smoke Test

Use this checklist when validating the plugin inside Figma.

## Setup

1. Run:

   ```sh
   pnpm build:plugin
   ```

2. In Figma desktop/browser, load `manifest.json` from this repository via Plugins -> Development.

## Figma Design Test File

Create a page with at least three top-level frames:

1. Clean 16:9 frame
   - Size: 1920x1080.
   - Safe system font text away from edges.
   - No gradients/effects/off-frame objects.

2. Visual-risk frame
   - One rectangle with gradient fill.
   - One masked image/shape.
   - One object with background blur.
   - One object with multiple shadows.
   - One object with non-normal blend mode.

3. Text/structure-risk frame
   - One text layer using a non-system font.
   - One text layer close to the slide edge.
   - One text layer partly outside the frame.
   - One non-text object partly outside the frame.
   - One nested frame.
   - Optional: make one frame non-16:9.

## Expected Behavior

- Page scan returns findings for the risk frames.
- Selected scan only scans selected top-level frames.
- A clean frame does not produce findings.
- Clicking a finding opens detail view.
- Clicking `К слою` selects and zooms to the affected node.
- The issues screen does not enter fake autofix flow.

## Known Manual Validation Boundary

The following cannot be fully verified by local unit tests:

- exact Figma node properties for masks and media;
- selection/zoom behavior inside Figma;
- Figma Slides node traversal;
- real export behavior after PPTX export.

