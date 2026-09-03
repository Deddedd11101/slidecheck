export type IssueGroup = "visual" | "text" | "structure" | "interactive" | "export";

export type Severity = "critical" | "warning" | "suggestion";

export interface RuleDefinition {
  id: string;
  group: IssueGroup;
  severity: Severity;
  title: string;
  why: string;
  fixHint: string;
  autofix?: {
    label: string;
  };
}

export interface Finding {
  id: string;
  ruleId: string;
  nodeId: string;
  slideId?: string;
  nodeName: string;
  nodePath: string[];
  severityOverride?: Severity;
  evidence?: Record<string, unknown>;
}

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPaint {
  type: string;
  visible?: boolean;
}

export interface NormalizedEffect {
  type: string;
  visible?: boolean;
}

export interface NormalizedTextStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontSize?: number;
}

export interface NormalizedNode {
  id: string;
  name: string;
  type: string;
  path: string[];
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  isMask?: boolean;
  bounds?: NormalizedBounds;
  fills?: NormalizedPaint[];
  effects?: NormalizedEffect[];
  textStyle?: NormalizedTextStyle;
  children?: NormalizedNode[];
}

export interface NormalizedSlide {
  id: string;
  name: string;
  type: "FRAME" | "SLIDE";
  bounds: NormalizedBounds;
  children: NormalizedNode[];
}

export interface NormalizedDocument {
  slides: NormalizedSlide[];
}
