import type { IssueGroup } from "../../shared/types";
import type { EnabledRuleGroups, ScanSettings, ScanStrictness } from "../../shared/messages";

export interface ScannerConfig {
  strictness: ScanStrictness;
  safeMargin: number;
  outsideBoundsTolerance: number;
  minorObjectOverflow: number;
  allowedFontFamilies: Set<string>;
  enabledGroups: EnabledRuleGroups;
}

export const DEFAULT_ENABLED_GROUPS: EnabledRuleGroups = {
  visual: true,
  text: true,
  structure: true,
  interactive: true,
  export: true,
};

const DEFAULT_SAFE_SYSTEM_FONTS = [
  "Arial",
  "Aptos",
  "Calibri",
  "Cambria",
  "Georgia",
  "Helvetica",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  strictness: "standard",
  enabledGroups: DEFAULT_ENABLED_GROUPS,
};

export function createScannerConfig(settings: Partial<ScanSettings> = {}): ScannerConfig {
  const strictness = settings.strictness ?? DEFAULT_SCAN_SETTINGS.strictness;

  return {
    strictness,
    safeMargin: getSafeMargin(strictness),
    outsideBoundsTolerance: strictness === "strict" ? 0 : 1,
    minorObjectOverflow: getMinorObjectOverflow(strictness),
    allowedFontFamilies: new Set(DEFAULT_SAFE_SYSTEM_FONTS),
    enabledGroups: {
      ...DEFAULT_ENABLED_GROUPS,
      ...(settings.enabledGroups ?? {}),
    },
  };
}

export function isRuleGroupEnabled(ruleId: string, config: ScannerConfig): boolean {
  const group = ruleId.split(".")[0] as IssueGroup;
  return config.enabledGroups[group] !== false;
}

function getSafeMargin(strictness: ScanStrictness): number {
  if (strictness === "soft") return 8;
  if (strictness === "strict") return 24;
  return 16;
}

function getMinorObjectOverflow(strictness: ScanStrictness): number {
  if (strictness === "soft") return 32;
  if (strictness === "strict") return 0;
  return 12;
}
