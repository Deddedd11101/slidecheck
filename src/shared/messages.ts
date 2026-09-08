import type { IssueGroup, Severity } from "./types";
import type { ExportDocumentDto } from "./export";

export type ScanScope = "page" | "selected";
export type FixMode = "in-place" | "copy";
export type ScanStrictness = "soft" | "standard" | "strict";

export type EnabledRuleGroups = Record<IssueGroup, boolean>;

export interface ScanSettings {
  strictness: ScanStrictness;
  enabledGroups: EnabledRuleGroups;
}

export interface IssueDto {
  id: string;
  ruleId: string;
  group: IssueGroup;
  severity: Severity;
  title: string;
  slide: string;
  layer: string;
  why: string;
  fix: string;
  fixAvailable: boolean;
  fixLabel?: string;
  nodeId?: string;
}

export interface FixTargetDto {
  issueId: string;
  ruleId: string;
  nodeId: string;
}

export interface FixRunResultDto {
  applied: number;
  skipped: number;
  issues: IssueDto[];
  slideCount: number;
  copyNames?: string[];
}

export interface ExportedSlideDto {
  name: string;
  width: number;
  height: number;
  bytes: Uint8Array;
}

export type UiToPluginMessage =
  | { type: "SCAN_REQUEST"; scope: ScanScope; settings: ScanSettings }
  | { type: "SELECT_NODE_REQUEST"; nodeId: string }
  | { type: "APPLY_FIXES_REQUEST"; scope: ScanScope; settings: ScanSettings; targets: FixTargetDto[]; mode: FixMode }
  | { type: "EXPORT_PPTX_REQUEST"; scope: ScanScope }
  | { type: "EXPORT_EDITABLE_PPTX_REQUEST"; scope: ScanScope };

export type PluginToUiMessage =
  | { type: "SCAN_RESULT"; issues: IssueDto[]; slideCount: number }
  | { type: "SCAN_ERROR"; message: string }
  | { type: "SELECT_NODE_RESULT"; nodeId: string }
  | { type: "SELECT_NODE_ERROR"; message: string }
  | { type: "APPLY_FIXES_RESULT"; result: FixRunResultDto }
  | { type: "APPLY_FIXES_ERROR"; message: string }
  | { type: "EXPORT_PPTX_RESULT"; slides: ExportedSlideDto[] }
  | { type: "EXPORT_PPTX_ERROR"; message: string }
  | { type: "EXPORT_EDITABLE_PPTX_RESULT"; document: ExportDocumentDto }
  | { type: "EXPORT_EDITABLE_PPTX_ERROR"; message: string };
