export type IssueGroup = "visual" | "text" | "structure" | "interactive" | "export";

export type Severity = "critical" | "warning" | "suggestion";

export interface RuleDefinition {
  id: string;
  group: IssueGroup;
  severity: Severity;
  title: string;
  why: string;
  fixHint: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  nodeId: string;
  slideId?: string;
  nodeName: string;
  nodePath: string[];
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
  bounds?: NormalizedBounds;
  fills?: NormalizedPaint[];
  effects?: Array<{ type: string; visible?: boolean }>;
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

