# Rule Format

Designers can provide rough export-risk candidates. Engineering converts them into deterministic rules.

## Designer Input Format

```md
## Problem Name

Category: visual | text | structure | interactive | export
Severity: critical | warning | suggestion

Where it appears:
What breaks in PPTX:
How to spot it in Figma:
Recommended manual fix:
Example file/slide/layer:
Confidence: confirmed | likely | needs-test
```

## Engineering Rule Metadata

User-facing fields must be written in Russian. Rule IDs stay in English because they are stable technical identifiers used by code, tests, and future migrations.

```ts
export interface RuleDefinition {
  id: string;
  group: "visual" | "text" | "structure" | "interactive" | "export";
  severity: "critical" | "warning" | "suggestion";
  title: string;
  why: string;
  fixHint: string;
  autofix?: {
    label: string;
  };
}
```

## Finding Shape

```ts
export interface Finding {
  id: string;
  ruleId: string;
  nodeId: string;
  slideId?: string;
  nodeName: string;
  nodePath: string[];
  evidence?: Record<string, unknown>;
}
```

## Rule Acceptance Checklist

A candidate becomes an MVP rule only when:
- it describes a PPTX export risk, not a subjective design preference;
- it can be detected through Figma node properties;
- it has at least one fixture or test Figma example;
- severity is agreed;
- the user-facing message and fix hint are understandable.

## Example

```ts
{
  id: "visual.gradient-fill",
  group: "visual",
  severity: "warning",
  title: "Градиент может измениться в PPTX",
  why: "Градиентные заливки могут упроститься, исказиться или превратиться в сплошной цвет при экспорте в PowerPoint.",
  fixHint: "Замените градиент на сплошной цвет или растеризуйте объект перед экспортом."
}
```

Checker condition:

```ts
node.fills contains a paint with type starting with "GRADIENT_"
```
