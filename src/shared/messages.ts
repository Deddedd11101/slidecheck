import type { IssueGroup, Severity } from "./types";

export type ScanScope = "page" | "selected";

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
  | { type: "SCAN_REQUEST"; scope: ScanScope }
  | { type: "SELECT_NODE_REQUEST"; nodeId: string };

export type PluginToUiMessage =
  | { type: "SCAN_RESULT"; issues: IssueDto[]; slideCount: number }
  | { type: "SCAN_ERROR"; message: string }
  | { type: "SELECT_NODE_RESULT"; nodeId: string }
  | { type: "SELECT_NODE_ERROR"; message: string };
