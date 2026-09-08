
# SlideCheck

Deterministic Figma/Figma Slides plugin for finding PPTX export risks before a presentation handoff.

The plugin now scans real Figma/Figma Slides documents, supports deterministic
autofixes for selected rules, and can download an image-only PPTX from scanned
frames or slides.

## MVP

- Scan selected frames or current-page frames/slides.
- Detect predefined export-risk rules.
- Show grouped findings in the existing UI.
- Select and zoom to the affected node when a finding is clicked.
- Download selected/page roots as an image-only 16:9 PPTX.

Out of scope for MVP:

- AI-based analysis.
- Full editable PPTX export.

## Development

Install dependencies:

```sh
pnpm install
```

Build the Figma plugin:

```sh
pnpm build:plugin
```

Load `manifest.json` in Figma via Plugins -> Development.

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Rule format](docs/RULES_FORMAT.md)
- [Test strategy](docs/TEST_STRATEGY.md)
- [Development workflow](docs/DEVELOPMENT.md)
- [Versioning](docs/VERSIONING.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS.md)
