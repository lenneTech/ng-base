// =============================================================================
// AI Assistant Types
// =============================================================================
// Mirror the @lenne.tech/nest-server AI module API (REST + SSE). Kept loose
// where the backend payload is open-ended (data, results) so consumers stay
// forward-compatible across nest-server minor versions.

import type { Signal } from '@angular/core';

/** Execution mode for a prompt. `auto` = reactive agent loop, `plan` = validate-all-then-execute. */
export type LtAiMode = 'auto' | 'plan';

/**
 * Input for a single AI run — sent to `POST /ai/prompt` | `POST /ai/stream`.
 *
 * Distinct from {@link LtAiPromptInput} (CRUD input for the user-facing
 * `LtAiPrompt` entity). Pre-1.7.0 release builds called this type
 * `LtAiPromptInput`; renamed to avoid a silent declaration merge with the
 * CRUD input introduced for `LtAiPromptsService`.
 */
export interface LtAiPromptRunInput {
  /** Confirm execution of actions that required confirmation in a previous turn. */
  confirm?: boolean;
  /** Id of the connection to use (omit to let the backend resolution chain decide). */
  connectionId?: string;
  /** Conversation id for multi-turn continuation. */
  conversationId?: string;
  /** Structured context the assistant should consider. */
  context?: Record<string, unknown>;
  /** Untrusted client metadata (current URL, navigation, console logs) for enrichment. */
  metadata?: Record<string, unknown>;
  /** Execution mode (defaults to the backend's `ai.defaultMode`). */
  mode?: LtAiMode;
  /** The user's prompt text. */
  prompt: string;
  /** Override the admin default for requiring confirmation of mutating actions. */
  requireConfirmation?: boolean;
}

/** A tool action executed (or planned/pending) during a run. */
export interface LtAiAction {
  arguments?: Record<string, any>;
  name: string;
  result?: any;
  success?: boolean;
}

/** Token usage of a single run (best effort). */
export interface LtAiUsage {
  completionTokens?: number;
  promptTokens?: number;
  totalTokens?: number;
}

/** Compact token-budget summary attached to every response. */
export interface LtAiBudgetSummary {
  /** Effective limit (user → tenant → LLM context window → null). Null = no limit. */
  maxTokens?: number;
  promptTokens?: number;
  remainingTokens?: number;
  resetAt?: string;
  /** Which scope yielded maxTokens: 'user', 'tenant' or 'llm'. */
  scope?: 'llm' | 'tenant' | 'user';
  usedTokens?: number;
}

/** Structured response of a prompt run (`CoreAiResponse`). */
export interface LtAiResponse {
  actions?: LtAiAction[];
  budget?: LtAiBudgetSummary;
  connectionId?: string;
  /** Context-window utilization at the end of the run (used/total tokens). */
  contextWindow?: { total: number; used: number };
  conversationId?: string;
  data?: any;
  denied?: boolean;
  deniedActions?: LtAiAction[];
  iterations?: number;
  pendingActions?: LtAiAction[];
  pendingQuestion?: { options?: { label: string; value: string }[]; question: string };
  plan?: LtAiAction[];
  requiresConfirmation?: boolean;
  text: string;
  usage?: LtAiUsage;
}

/** Server-sent event emitted by `POST /ai/stream`. */
export type LtAiStreamEvent =
  | { action: LtAiAction; type: 'action' }
  | { message: string; type: 'error' }
  | { response: LtAiResponse; type: 'final' }
  | { token: string; type: 'token' };

/** Callbacks for {@link LtAiState.promptStream}. */
export interface LtAiStreamHandlers {
  onAction?: (action: LtAiAction) => void;
  onError?: (message: string) => void;
  onEvent?: (event: LtAiStreamEvent) => void;
  onFinal?: (response: LtAiResponse) => void;
  onToken?: (token: string) => void;
}

/** A single chat message in {@link LtAiChatState}. */
export interface LtAiMessage {
  actions?: LtAiAction[];
  budget?: LtAiBudgetSummary;
  content: string;
  createdAt?: string;
  denied?: boolean;
  error?: boolean;
  /** Pending actions awaiting confirmation (assistant turns only). */
  pendingActions?: LtAiAction[];
  /** Whether this assistant turn is still streaming. */
  pending?: boolean;
  /** Whether this assistant turn awaits a confirmation to proceed. */
  requiresConfirmation?: boolean;
  role: 'assistant' | 'user';
}

/** A non-sensitive connection the current user/tenant may use. */
export interface LtAiAvailableConnection {
  id: string;
  isDefault?: boolean;
  locked?: boolean;
  model?: string;
  name?: string;
  selected?: boolean;
}

/** The current user's AI settings as they take effect (`GET/PUT /ai/settings`, nest-server >= 12.3.0). */
export interface LtAiSettings {
  /** Whether MCP asks this user before a destructive tool (and a mutating one, if configured) runs. */
  mcpConfirmation: boolean;
  /** Whether the server fixed `mcpConfirmation`, so the user cannot change it (a change answers 403 `#LTNS_0609`). */
  mcpConfirmationEnforced: boolean;
}

/** The user's own choices for `PUT /ai/settings`; a field left out stays unchanged. */
export interface LtAiSettingsInput {
  mcpConfirmation?: boolean;
}

/** Whether the API's AI module is on (`GET /ai/status`), as `LtAiStatusService` holds it. */
export interface LtAiStatus {
  /** True only after a well-formed 200: the AI module is on. */
  enabled: boolean;
  /** Why the status could not be read (network, timeout, other status, malformed body); null for an answer, 404 included. */
  error: null | string;
  /** True once an answer or an error is in. */
  loaded: boolean;
  /** Whether the API serves MCP; false whenever `enabled` is false. */
  mcp: boolean;
}

/** Usage for a single scope (user or tenant). */
export interface LtAiUsageScope {
  maxPrompts?: number;
  maxTokens?: number;
  period: string;
  refId?: string;
  remainingPrompts?: number;
  remainingTokens?: number;
  resetAt?: string;
  scope: string;
  usedPrompts: number;
  usedTokens: number;
}

/** Full usage info (`GET /ai/usage`). */
export interface LtAiUsageInfo {
  tenant?: LtAiUsageScope;
  user?: LtAiUsageScope;
}

// =============================================================================
// Admin types (connections, preferences, budgets, audit)
// =============================================================================

/** Admin view of a connection (`apiKey` is never returned — only `hasApiKey`). */
export interface LtAiConnection {
  apiKeyEnv?: string;
  baseUrl?: string;
  capabilities?: string[];
  defaultMaxTokens?: number;
  defaultTemperature?: number;
  description?: string;
  enabled?: boolean;
  enforced?: boolean;
  enforcedTenantIds?: string[];
  hasApiKey?: boolean;
  id: string;
  isDefault?: boolean;
  model?: string;
  name?: string;
  providerType?: string;
  supportsJsonResponse?: boolean;
  supportsNativeTools?: boolean;
  supportsVision?: boolean;
  tenantIds?: string[];
}

/** Input to create/update a connection (`apiKey`: value sets, '' clears, omit leaves). */
export interface LtAiConnectionInput {
  apiKey?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
  description?: string;
  enabled?: boolean;
  enforced?: boolean;
  enforcedTenantIds?: string[];
  isDefault?: boolean;
  model?: string;
  name?: string;
  providerType?: string;
  supportsJsonResponse?: boolean;
  supportsNativeTools?: boolean;
  supportsVision?: boolean;
  tenantIds?: string[];
}

/** A tenant/user connection preference. */
export interface LtAiConnectionPreference {
  connectionId: string;
  enforced?: boolean;
  id?: string;
  refId: string;
  scope: 'tenant' | 'user';
}

/** A per-user/per-tenant budget-limit override. */
export interface LtAiBudgetLimit {
  id?: string;
  maxPrompts?: number;
  maxTokens?: number;
  period?: 'day' | 'month' | 'none';
  refId: string;
  scope: 'tenant' | 'user';
}

/** An AI interaction audit record. */
export interface LtAiInteraction {
  actions?: { name: string; success: boolean }[];
  completionTokens?: number;
  connectionId?: string;
  createdAt?: string;
  id: string;
  iterations?: number;
  prompt?: string;
  promptTokens?: number;
  responseText?: string;
  tenantId?: string;
  totalTokens?: number;
  userId?: string;
}

/**
 * An admin-editable AI slot — a logical building block of the SYSTEM prompt
 * (e.g. `base`, `permissions`, `anti_hallucination`, `tool_catalog`).
 * The backend ships built-in defaults for every key; a row here OVERRIDES the
 * default for its `key` (optionally scoped by `locale`/`capability`).
 * When multi-tenancy is active, slots are tenant-scoped.
 */
export interface LtAiSlot {
  /** Capability scope: 'all', 'native' or 'emulated'. */
  capability?: string;
  /** Slot text (supports {{placeholders}}). */
  content: string;
  createdAt?: string;
  /** Admin-facing description of the slot. */
  description?: string;
  /** Whether the slot is included in the prompt. */
  enabled?: boolean;
  id: string;
  /** Logical prompt slot key (e.g. 'base', 'permissions', 'anti_hallucination'). */
  key: string;
  /** Locale (e.g. 'en', 'de'); empty = all languages. */
  locale?: string;
  /** Assembly order (ascending). */
  order?: number;
  /** Tenant id the slot applies to (auto-set; undefined = system-wide). */
  tenantId?: string;
  updatedAt?: string;
}

/** Input to create/update an admin AI slot. */
export interface LtAiSlotInput {
  capability?: string;
  content?: string;
  description?: string;
  enabled?: boolean;
  key?: string;
  locale?: string;
  order?: number;
}

/**
 * Effective slot for the admin UI — framework defaults + tenant overrides +
 * tenant customs in one list. The `isSystem` / `isOverride` flags drive which
 * actions the UI renders:
 *  - `isSystem: true`  → virtual default row (no `id`). Action: "Bearbeiten" → POST creates an override.
 *  - `isOverride: true` → tenant row that overrides a system default. Action: "Zurücksetzen" → reset.
 *  - else               → custom tenant slot. Action: "Löschen" → real delete (no restore).
 */
export interface LtAiEffectiveSlot {
  capability?: string;
  content: string;
  description?: string;
  enabled: boolean;
  id?: string;
  /** True when a tenant row overrides a framework default. */
  isOverride: boolean;
  /** True for built-in framework defaults (no DB row). */
  isSystem: boolean;
  key: string;
  locale?: string;
  order: number;
  scope?: string;
  /** System-default key this row overrides (only on overrides). */
  systemKey?: string;
  tenantId?: string;
}

/**
 * Public metadata of a registered placeholder — returned by the placeholders
 * endpoint. Used by the slot / prompt editors to render a "what can I insert"
 * hint sidebar dynamically (no hard-coded list in the frontend).
 */
export interface LtAiPlaceholder {
  /** One-sentence description shown in the helper sidebar. */
  description: string;
  /** Optional example value (tooltip). */
  example?: string;
  /** Token name without curly braces (e.g. `'roles'` matches `{{roles}}`). */
  name: string;
}

/**
 * A learned prompt hint from the governed self-improvement loop. Only `approved`
 * + enabled hints reach the prompt; hints only ever ADD guidance and can never
 * relax the backend-enforced security core.
 */
export interface LtAiPromptHint {
  /** Guidance text added to the prompt when approved. */
  content: string;
  createdAt?: string;
  /** Whether the hint is active. */
  enabled?: boolean;
  id: string;
  /** Number of times the failure pattern was observed. */
  occurrences?: number;
  /** Scope the hint applies to (e.g. a tool name); empty = global. */
  scope?: string;
  /** Governance status: 'suggested', 'approved' or 'rejected'. */
  status?: string;
  /** Failure-pattern identifier that produced the hint. */
  trigger?: string;
  updatedAt?: string;
}

/** Input to create/update a learned prompt hint (typically approve/reject or edit). */
export interface LtAiPromptHintInput {
  content?: string;
  enabled?: boolean;
  occurrences?: number;
  scope?: string;
  status?: string;
  trigger?: string;
}

/**
 * A user-facing prompt ("Vorlage") — a short, named piece of text the user
 * can insert into the chat input with one click. Different from
 * {@link LtAiSlot}, which is the admin-only system-prompt building block.
 *
 * Visibility scopes:
 *  - `user`   — only the owner sees it ("private", default).
 *  - `tenant` — all members of the owner's tenant see it ("public").
 */
export interface LtAiPrompt {
  /** The prompt text inserted into the chat input (may contain placeholders). */
  content: string;
  createdAt?: string;
  /** Optional description. */
  description?: string;
  /** Whether the prompt is active (disabled prompts are hidden). */
  enabled?: boolean;
  /** Optional icon hint (lucide name or single emoji). */
  icon?: string;
  id: string;
  /** Display label shown in the picker. */
  name: string;
  /** Owner user id (set automatically by the server). */
  ownerId?: string;
  /** Sort order in the picker (ascending). */
  order?: number;
  /** Visibility scope (`'user'` | `'tenant'` | `'global'`). */
  scope: string;
  /** Tenant id when `scope === 'tenant'` (set automatically by the server). */
  tenantId?: string;
  updatedAt?: string;
}

/**
 * Input to create/update a {@link LtAiPrompt} (user-facing "Vorlage").
 *
 * Distinct from {@link LtAiPromptRunInput} (the payload for `LtAiService.prompt()`).
 * Used by `LtAiPromptsService.create()` / `.update()`.
 */
export interface LtAiPromptInput {
  content?: string;
  description?: string;
  enabled?: boolean;
  icon?: string;
  name?: string;
  order?: number;
  scope?: string;
}

// =============================================================================
// Service and factory state types
// =============================================================================

export interface LtAiState {
  error: Signal<null | string>;
  loading: Signal<boolean>;
  prompt: (input: LtAiPromptRunInput) => Promise<LtAiResponse>;
  promptStream: (input: LtAiPromptRunInput, handlers?: LtAiStreamHandlers, options?: { signal?: AbortSignal }) => Promise<LtAiResponse | undefined>;
  streaming: Signal<boolean>;
}

export interface LtAiChatOptions {
  /** Fixed connection id (or a ref) to use for every turn. */
  connectionId?: Signal<string | undefined> | string;
  /**
   * Existing conversation id to continue (or a signal). When the signal changes, the chat continues that conversation;
   * the server's answer updates the chat's own `conversationId` either way.
   */
  conversationId?: Signal<string | undefined> | string;
  /**
   * Cap the local `messages` array. When the cap is exceeded after a new push,
   * the oldest entries are removed. Use this for long-running chats to prevent
   * unbounded memory growth. Server-side conversation history is unaffected.
   */
  maxMessages?: number;
  /** Producer for per-turn client metadata (e.g. current URL). */
  metadata?: () => Record<string, unknown>;
  /** Execution mode for every turn (or a signal, read per turn). */
  mode?: LtAiMode | Signal<LtAiMode | undefined>;
  /** Whether to stream responses (default true). */
  stream?: boolean;
}

export interface LtAiChatState {
  budget: Signal<LtAiBudgetSummary | null>;
  clear: () => void;
  confirm: () => Promise<void>;
  /** Context-window utilization of the latest assistant turn (used/total tokens). */
  contextWindow: Signal<{ total: number; used: number } | null>;
  conversationId: Signal<string | undefined>;
  error: Signal<null | string>;
  // Shallow readonly: the ref cannot be reassigned, but message elements stay
  // bindable to child components (avoids DeepReadonly friction in consumers).
  messages: Signal<LtAiMessage[]>;
  requiresConfirmation: Signal<boolean>;
  send: (content: string) => Promise<void>;
  stop: () => void;
  streaming: Signal<boolean>;
}

export interface LtAiConnectionsState {
  connections: Signal<LtAiAvailableConnection[]>;
  error: Signal<null | string>;
  loading: Signal<boolean>;
  load: () => Promise<void>;
  locked: Signal<boolean>;
  select: (connectionId: string) => Promise<void>;
  selected: Signal<LtAiAvailableConnection | undefined>;
}

export interface LtAiStatusState {
  enabled: Signal<boolean>;
  error: Signal<null | string>;
  /** Reads the status once per app start; `force` asks again. Never throws. */
  load: (options?: { force?: boolean }) => Promise<void>;
  loaded: Signal<boolean>;
  mcp: Signal<boolean>;
}

export interface LtAiSettingsState {
  /** True when the server fixed the MCP confirmation: show the switch disabled. */
  enforced: Signal<boolean>;
  error: Signal<null | string>;
  load: () => Promise<void>;
  loading: Signal<boolean>;
  settings: Signal<LtAiSettings | null>;
  /** Stores the user's choice and adopts the answer; throws (and sets `error`) when refused. */
  update: (input: LtAiSettingsInput) => Promise<void>;
}

export interface LtAiUsageState {
  error: Signal<null | string>;
  loading: Signal<boolean>;
  load: () => Promise<void>;
  usage: Signal<LtAiUsageInfo | null>;
}

/**
 * User-facing prompt service. Lets any signed-in user manage their own
 * prompts ("Vorlagen") and use the visible ones (own private + tenant public)
 * in a chat.
 */
/** Options of `LtAiPromptsService.load()`. */
export interface LtAiPromptsLoadOptions {
  /** Also the disabled prompts (management pages; nest-server 12.7.0, ignored by older servers). Default `false`. */
  includeDisabled?: boolean;
}

export interface LtAiPromptsState {
  create: (input: LtAiPromptInput) => Promise<LtAiPrompt>;
  enabledPrompts: Signal<LtAiPrompt[]>;
  error: Signal<null | string>;
  load: (options?: LtAiPromptsLoadOptions) => Promise<void>;
  loading: Signal<boolean>;
  prompts: Signal<LtAiPrompt[]>;
  remove: (id: string) => Promise<LtAiPrompt>;
  update: (id: string, input: LtAiPromptInput) => Promise<LtAiPrompt>;
}

/**
 * Admin AI service surface — headless on purpose: every method returns the
 * raw backend response. No shared `loading` / `error` refs because admin
 * screens typically need per-row spinners and per-action toasts that a single
 * shared ref cannot model. Wire each call to your UI layer's loading/error
 * scheme.
 *
 * All endpoints are server-side `@Restricted(ADMIN)`; the service itself
 * does not enforce role. Render admin UI behind a frontend route guard for UX,
 * but trust the backend for authorization.
 */
export interface LtAiAdminState {
  /** Create a per-user/per-tenant budget limit override (POST /ai/budget-limits). */
  createBudgetLimit: (input: LtAiBudgetLimit) => Promise<LtAiBudgetLimit>;
  /** Create a connection. `input.apiKey` is write-only; the response never echoes it. */
  createConnection: (input: LtAiConnectionInput) => Promise<LtAiConnection>;
  /** Create a learned prompt hint (typically used to manually approve/reject). */
  createPromptHint: (input: LtAiPromptHintInput) => Promise<LtAiPromptHint>;
  /** Create a tenant-scoped system-prompt slot row (overrides framework default for `key`). */
  createSlot: (input: LtAiSlotInput) => Promise<LtAiSlot>;
  deleteBudgetLimit: (id: string) => Promise<LtAiBudgetLimit>;
  deleteConnection: (id: string) => Promise<LtAiConnection>;
  /** Delete a connection preference by its preference id (NOT the user/tenant id). */
  deletePreference: (id: string) => Promise<LtAiConnectionPreference>;
  deletePromptHint: (id: string) => Promise<LtAiPromptHint>;
  deleteSlot: (id: string) => Promise<LtAiSlot>;
  /**
   * Re-detect a connection's `capabilities` / `supportsNativeTools` / `supportsVision`
   * by probing the provider. Mutates the persisted connection row.
   */
  detectCapabilities: (id: string) => Promise<LtAiConnection>;
  /** Returns the connection WITHOUT the `apiKey` (only `hasApiKey: boolean`). */
  getConnection: (id: string) => Promise<LtAiConnection>;
  listBudgetLimits: () => Promise<LtAiBudgetLimit[]>;
  listConnections: () => Promise<LtAiConnection[]>;
  /** Effective slots view — framework defaults overlaid by tenant overrides + tenant customs. */
  listEffectiveSlots: () => Promise<LtAiEffectiveSlot[]>;
  /** Recent AI interactions (audit log, ADMIN-only). */
  listInteractions: () => Promise<LtAiInteraction[]>;
  listPreferences: () => Promise<LtAiConnectionPreference[]>;
  listPromptHints: () => Promise<LtAiPromptHint[]>;
  /** List ONLY tenant overrides + customs (not the framework defaults — use `listEffectiveSlots` for that). */
  listSlots: () => Promise<LtAiSlot[]>;
  /** Reset a tenant override → framework default applies again. */
  resetSlot: (id: string) => Promise<boolean>;
  /**
   * Upsert a connection preference for the given `refId` (user or tenant) +
   * `scope`. Replaces the existing row for that scope if present.
   */
  setPreference: (input: LtAiConnectionPreference) => Promise<LtAiConnectionPreference>;
  updateBudgetLimit: (id: string, input: LtAiBudgetLimit) => Promise<LtAiBudgetLimit>;
  /**
   * Update a connection. `input.apiKey`: pass the new value to set, an empty
   * string `''` to clear, omit to leave the stored key unchanged.
   */
  updateConnection: (id: string, input: LtAiConnectionInput) => Promise<LtAiConnection>;
  updatePromptHint: (id: string, input: LtAiPromptHintInput) => Promise<LtAiPromptHint>;
  updateSlot: (id: string, input: LtAiSlotInput) => Promise<LtAiSlot>;
}

/**
 * Placeholder list service. Loads the runtime placeholder registry from
 * the backend (`GET /ai/placeholders`) so slot / prompt editors can render
 * a dynamic helper sidebar without hard-coding any names in the frontend.
 */
export interface LtAiPlaceholdersState {
  error: Signal<null | string>;
  load: () => Promise<void>;
  loading: Signal<boolean>;
  placeholders: Signal<LtAiPlaceholder[]>;
}
