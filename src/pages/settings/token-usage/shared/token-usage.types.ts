export type TokenUsageRange = '7d' | '30d' | 'all';

export interface TokenUsageFilters {
  range?: TokenUsageRange;
  projectId?: string;
  provider?: string;
  modelName?: string;
}

export interface TokenUsageRefreshPayload {
  force?: boolean;
}

export interface TokenUsageRefreshStatus {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string;
  lastResult: TokenUsageRefreshResult | null;
}

export interface TokenUsageRefreshResult {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface TokenUsageTotals {
  runCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  toolTokens: number;
  totalTokens: number;
  rounds: number;
}

export interface TokenUsageModelSummary {
  provider: string;
  modelName: string;
  profileName: string;
  apiBaseHost: string;
  runCount: number;
  totalTokens: number;
}

export interface TokenUsageDailySummary {
  date: string;
  totalTokens: number;
}

export interface TokenUsageSummary {
  filters: Required<TokenUsageFilters>;
  totals: TokenUsageTotals;
  models: TokenUsageModelSummary[];
  daily: TokenUsageDailySummary[];
  status: TokenUsageRefreshStatus;
}

export type TokenUsageSummaryResponse =
  | { ok: true; summary: TokenUsageSummary }
  | { ok: false; reason: string };

export type TokenUsageRefreshResponse =
  | { ok: true; status: TokenUsageRefreshStatus; result: TokenUsageRefreshResult }
  | { ok: false; status: TokenUsageRefreshStatus; reason: string };

export type TokenUsageStatusResponse = { ok: true; status: TokenUsageRefreshStatus };
