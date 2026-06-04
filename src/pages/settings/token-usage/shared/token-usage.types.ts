export type TokenUsageRange = '7d' | '30d' | 'all';

export interface TokenUsageFilters {
  range?: TokenUsageRange;
  projectId?: string;
  provider?: 'claude' | 'codex' | 'gemini' | '';
  modelName?: string;
}

export interface TokenUsageRefreshPayload {
  force?: boolean;
}

export interface TokenUsageRefreshStatus {
  running: boolean;
  lastStartedAt: string;
  lastFinishedAt: string;
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
  error: string;
}

export interface TokenUsageRefreshResult {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface TokenUsageTotals {
  runCount: number;
  sessionCount: number;
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

export interface TokenUsageProjectSummary {
  projectId: string;
  projectName: string;
  totalTokens: number;
  sessionCount: number;
}

export interface TokenUsageSessionSummary {
  sessionId: string;
  title: string;
  projectName: string;
  provider: string;
  modelName: string;
  totalTokens: number;
  lastActiveAt: string;
}

export interface TokenUsageSummary {
  filters: Required<TokenUsageFilters>;
  totals: TokenUsageTotals;
  projects: TokenUsageProjectSummary[];
  sessions: TokenUsageSessionSummary[];
  models: TokenUsageModelSummary[];
  daily: TokenUsageDailySummary[];
  status: TokenUsageRefreshStatus;
}

export type TokenUsageSummaryResponse =
  | { ok: true; summary: TokenUsageSummary }
  | { ok: false; reason: string };

export type TokenUsageRefreshResponse =
  | { ok: true; status: TokenUsageRefreshStatus }
  | { ok: false; status: TokenUsageRefreshStatus; reason: string };

export type TokenUsageStatusResponse = { ok: true; status: TokenUsageRefreshStatus };
