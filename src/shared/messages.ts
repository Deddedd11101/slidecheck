import type { IssueGroup, Severity } from "./types";

export type ScanScope = "page" | "selected";
export type ScanStrictness = "soft" | "standard" | "strict";

export type EnabledRuleGroups = Record<IssueGroup, boolean>;

export interface ScanSettings {
  strictness: ScanStrictness;
  enabledGroups: EnabledRuleGroups;
}

export interface IssueDto {
  id: string;
  group: IssueGroup;
  severity: Severity;
  title: string;
  slide: string;
  layer: string;
  why: string;
  fix: string;
  nodeId?: string;
}

export type UiToPluginMessage =
  | { type: "SCAN_REQUEST"; scope: ScanScope; settings: ScanSettings }
  | { type: "SELECT_NODE_REQUEST"; nodeId: string };

export type PluginToUiMessage =
  | { type: "SCAN_RESULT"; issues: IssueDto[]; slideCount: number }
  | { type: "SCAN_ERROR"; message: string }
  | { type: "SELECT_NODE_RESULT"; nodeId: string }
  | { type: "SELECT_NODE_ERROR"; message: string };
