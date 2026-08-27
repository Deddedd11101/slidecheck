
# SlideCheck

Deterministic Figma/Figma Slides plugin for finding PPTX export risks before a presentation handoff.

The current project started as a UI prototype. The next engineering milestone is replacing mock scan data with real Figma-side scanning and a tested rule engine.

## MVP

- Scan selected frames or current-page frames/slides.
- Detect predefined export-risk rules.
- Show grouped findings in the existing UI.
- Select and zoom to the affected node when a finding is clicked.

Out of scope for MVP:

- AI-based analysis.
- Automatic fixes.
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
- [Versioning](docs/VERSIONING.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS.md)
