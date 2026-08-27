import type { RuleDefinition } from "../../shared/types";

export const RULES: Record<string, RuleDefinition> = {
  "visual.gradient-fill": {
    id: "visual.gradient-fill",
    group: "visual",
    severity: "warning",
    title: "Gradient fill may change in PPTX",
    why: "Gradient fills can degrade or be converted when exported to PowerPoint.",
    fixHint: "Replace the gradient with a solid fill or rasterize the object.",
  },
  "text.near-slide-edge": {
    id: "text.near-slide-edge",
    group: "text",
    severity: "warning",
    title: "Text is close to the slide edge",
    why: "Text near the slide edge can be clipped after font substitution or PPTX layout changes.",
    fixHint: "Move the text inward or increase the slide-safe margin.",
  },
};

