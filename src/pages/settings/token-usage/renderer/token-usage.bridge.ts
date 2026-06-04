import type {
  TokenUsageFilters,
  TokenUsageRefreshPayload,
  TokenUsageRefreshResponse,
  TokenUsageStatusResponse,
  TokenUsageSummaryResponse,
} from '../shared/token-usage.types';

export const tokenUsageBridge = {
  summary(payload?: TokenUsageFilters): Promise<TokenUsageSummaryResponse> {
    return window.electronAPI.tokenUsage.summary(payload);
  },
  refresh(payload?: TokenUsageRefreshPayload): Promise<TokenUsageRefreshResponse> {
    return window.electronAPI.tokenUsage.refresh(payload);
  },
  status(): Promise<TokenUsageStatusResponse> {
    return window.electronAPI.tokenUsage.status();
  },
};

export type {
  TokenUsageDailySummary,
  TokenUsageFilters,
  TokenUsageModelSummary,
  TokenUsageRefreshPayload,
  TokenUsageRefreshResponse,
  TokenUsageRefreshResult,
  TokenUsageRefreshStatus,
  TokenUsageStatusResponse,
  TokenUsageSummary,
  TokenUsageSummaryResponse,
  TokenUsageTotals,
} from '../shared/token-usage.types';
