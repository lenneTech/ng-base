/*
 * Public API of `@lenne.tech/ng-base/ai`: client of the nest-server AI module (prompt runs incl. SSE stream, chat,
 * connections, settings, status, usage, prompts, placeholders and the admin endpoints).
 */
export { injectLtAiChat } from './lib/ai-chat';
export type { LtAiChat } from './lib/ai-chat';
export { LtAiAdminService } from './lib/ai-admin-service';
export { LtAiConnectionsService } from './lib/ai-connections-service';
export { LT_AI_SSE_MAX_LINE, LtAiHttpService, ltAiResponseError, parseLtAiSseStream } from './lib/ai-http';
export { LT_AI_OPTIONS, provideLtAi } from './lib/ai-options';
export type { LtAiOptions } from './lib/ai-options';
export { LtAiPlaceholdersService } from './lib/ai-placeholders-service';
export { LtAiPromptsService } from './lib/ai-prompts-service';
export { LtAiService } from './lib/ai-service';
export { LtAiSettingsService } from './lib/ai-settings-service';
export { LT_AI_STATUS_STATE_KEY, LT_AI_STATUS_TIMEOUT_MS, LtAiStatusService } from './lib/ai-status-service';
export { LtAiUsageService } from './lib/ai-usage-service';
export type {
  LtAiMode,
  LtAiPromptRunInput,
  LtAiAction,
  LtAiUsage,
  LtAiBudgetSummary,
  LtAiResponse,
  LtAiStreamEvent,
  LtAiStreamHandlers,
  LtAiMessage,
  LtAiAvailableConnection,
  LtAiSettings,
  LtAiSettingsInput,
  LtAiStatus,
  LtAiUsageScope,
  LtAiUsageInfo,
  LtAiConnection,
  LtAiConnectionInput,
  LtAiConnectionPreference,
  LtAiBudgetLimit,
  LtAiInteraction,
  LtAiSlot,
  LtAiSlotInput,
  LtAiEffectiveSlot,
  LtAiPlaceholder,
  LtAiPromptHint,
  LtAiPromptHintInput,
  LtAiPrompt,
  LtAiPromptInput,
  LtAiState,
  LtAiChatOptions,
  LtAiChatState,
  LtAiConnectionsState,
  LtAiStatusState,
  LtAiSettingsState,
  LtAiUsageState,
  LtAiPromptsState,
  LtAiAdminState,
  LtAiPlaceholdersState,
} from './lib/ai-types';
