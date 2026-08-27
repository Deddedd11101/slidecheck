# Versioning And Releases

## Versioning

Use SemVer:

```txt
MAJOR.MINOR.PATCH
```

For pre-MVP development:
- `0.1.x`: scanner architecture and Figma Design support;
- `0.2.x`: Figma Slides support;
- `0.3.x`: export experiment;
- `1.0.0`: stable MVP linter.

## Branching

Use `main` as the stable branch.

Feature branches:

```txt
feature/scanner-core
feature/figma-messaging
feature/slides-support
feature/rules-visual
feature/rules-text
```

## Commit Style

Use simple conventional commits:

```txt
docs: add rule format
chore: initialize repository
feat: add scanner core
fix: handle missing fills
test: add gradient fixture
```

## Release Checklist

- `pnpm test` passes.
- `pnpm build:plugin` passes.
- `manifest.json` points to existing `dist/code.js` and `dist/ui.html`.
- Manual smoke test passed in Figma Design.
- Manual smoke test passed in Figma Slides when Slides support is in scope.
- README updated.

