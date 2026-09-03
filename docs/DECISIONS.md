# Architecture Decisions

## 2026-08-27: Use Local Docs As Project Memory

Decision: keep project context in repository markdown files instead of creating multiple long-running agent tasks immediately.

Reason: the project is still at architecture/bootstrap stage. Separate agents would duplicate context and spend more tokens than they save.

Review when: scanner architecture is stable and isolated tasks can be delegated cleanly.

## 2026-08-27: Keep Rules Deterministic

Decision: no AI-based detection in MVP.

Reason: the product promise is predictable export-risk linting. Rules must be explainable, testable, and reproducible.

## 2026-08-27: Separate Rule Metadata From Checkers

Decision: store rule copy/severity in a registry and keep detection logic in checker functions.

Reason: designers can iterate on wording and severity without changing scanner logic; engineering can test detection independently.

## 2026-08-27: Keep `dist/code.js` And `dist/ui.html`

Decision: keep the final Figma plugin build outputs in the repository for now.

Reason: local Figma loading depends on the manifest paths. Generated intermediate folders remain ignored.

## 2026-08-27: Start With One Vertical Scan Slice

Decision: implement UI/plugin messaging, a Figma Design adapter, and scanner integration before expanding the rule catalog.

Reason: a small working path from Figma document to UI finding is more valuable than a large disconnected rule list.

## 2026-08-27: Russian User-Facing Rule Copy

Decision: rule titles, explanations, and fix hints are written in Russian. Rule IDs remain English.

Reason: the plugin is for an internal Russian-speaking team, while English IDs are better as stable technical keys.

## 2026-08-27: Group Findings By Slide First

Decision: the issues screen groups findings by slide/frame first, then by issue category inside the selected slide.

Reason: designers fix presentations slide by slide. Category-first grouping made full-page scans feel duplicated and hard to navigate.

## 2026-09-02: Ignore Is Session-Only

Decision: the UI can hide individual findings in the current scan result, but ignores are not persisted to the Figma file yet.

Reason: early rule tuning needs a quick way to reduce noise without permanently suppressing problems or writing plugin metadata into user files.

## 2026-09-03: Add Scan Strictness Before More Rules

Decision: add scanner settings and a strictness selector before expanding the rule catalog further.

Reason: the linter already detects real issues. More value now comes from controlling noise and false positives than from adding unchecked rules.
