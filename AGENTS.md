# Project Operating Rules

Критиковать слабые решения, предлагать более верные альтернативы и задавать уточняющие вопросы, если постановка ведет к лишней сложности.

## Product Goal

SlideCheck is a deterministic Figma/Figma Slides plugin for detecting presentation export risks before PPTX handoff.

MVP scope:
- scan selected frames or current page slides/frames;
- detect predefined rule-based issues;
- show grouped findings in the existing UI;
- select the corresponding Figma node when a finding is clicked.

Out of MVP:
- AI-based analysis;
- automatic fixes;
- editable PPTX reconstruction;
- visual taste linting unrelated to export risk.

## Engineering Rules

- Keep Figma API access inside `src/plugin`.
- Keep pure linting logic independent from Figma runtime where possible.
- Store rule metadata separately from checker logic.
- Add fixtures/tests for scanner behavior before expanding the rule set.
- Do not rely on manual Figma reloads as the primary test loop.
- Keep `dist/code.js` and `dist/ui.html` build outputs available for local Figma loading; ignore temporary build folders.

