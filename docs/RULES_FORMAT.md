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

```ts
export interface RuleDefinition {
  id: string;
  group: "visual" | "text" | "structure" | "interactive" | "export";
  severity: "critical" | "warning" | "suggestion";
  title: string;
  why: string;
  fixHint: string;
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
  title: "Gradient fill may change in PPTX",
  why: "Gradient fills can degrade or be converted when exported to PowerPoint.",
  fixHint: "Replace the gradient with a solid fill or rasterize the object."
}
```

Checker condition:

```ts
node.fills contains a paint with type starting with "GRADIENT_"
```

