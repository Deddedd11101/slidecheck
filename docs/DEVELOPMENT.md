# Local Development

## Requirements

- Node.js 24.x
- pnpm 11.9.x
- Figma desktop or browser app for manual plugin smoke tests

## Install

```sh
pnpm install
```

If pnpm blocks dependency build scripts, approve only the known build dependencies:

```sh
pnpm approve-builds esbuild @tailwindcss/oxide
```

## Fast Local Checks

Run scanner/unit tests:

```sh
pnpm test
```

Build the Figma plugin:

```sh
pnpm build:plugin
```

The build writes:

```txt
dist/code.js
dist/ui.html
```

These paths are referenced by `manifest.json`.

## UI-Only Development

Run:

```sh
pnpm dev
```

When opened outside Figma, the UI uses mock scan results. Inside Figma, scan results must come from the plugin sandbox.

## Figma Manual Load

1. Run `pnpm build:plugin`.
2. Open Figma.
3. Go to Plugins -> Development.
4. Import `manifest.json` from this repository.
5. Run SlideCheck from the development plugins menu.

## Git Workflow

Use `main` as the stable branch.

For feature work:

```sh
git checkout -b feature/name
pnpm test
pnpm build:plugin
git commit -m "feat: short description"
git push -u origin feature/name
```

## Manual Testing Boundary

Local tests can validate scanner rules and build output. They cannot validate:

- Figma node property quirks;
- node selection and viewport zoom;
- Figma Slides traversal;
- real PPTX export behavior.

Use [SMOKE_TEST.md](SMOKE_TEST.md) for those checks.

