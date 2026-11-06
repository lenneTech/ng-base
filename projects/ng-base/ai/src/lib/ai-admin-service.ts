import { inject, Service } from '@angular/core';

import { LtAiHttpService } from './ai-http';
import type {
  LtAiAdminState,
  LtAiBudgetLimit,
  LtAiConnection,
  LtAiConnectionInput,
  LtAiConnectionPreference,
  LtAiEffectiveSlot,
  LtAiInteraction,
  LtAiPromptHint,
  LtAiPromptHintInput,
  LtAiSlot,
  LtAiSlotInput,
} from './ai-types';

/**
 * Admin AI endpoints, headless on purpose: every method returns the raw response, no shared loading/error state.
 * ADMIN is enforced server-side (`@Restricted(ADMIN)`). Ids are `encodeURIComponent`-ed.
 */
@Service()
export class LtAiAdminService implements LtAiAdminState {
  private readonly http = inject(LtAiHttpService);

  listConnections = () => this.http.request<LtAiConnection[]>('GET', '/connections');
  createConnection = (input: LtAiConnectionInput) => this.http.request<LtAiConnection>('POST', '/connections', input);
  getConnection = (id: string) => this.http.request<LtAiConnection>('GET', `/connections/${encodeURIComponent(id)}`);
  updateConnection = (id: string, input: LtAiConnectionInput) => this.http.request<LtAiConnection>('PUT', `/connections/${encodeURIComponent(id)}`, input);
  deleteConnection = (id: string) => this.http.request<LtAiConnection>('DELETE', `/connections/${encodeURIComponent(id)}`);
  detectCapabilities = (id: string) => this.http.request<LtAiConnection>('POST', `/connections/${encodeURIComponent(id)}/detect-capabilities`);
  listPreferences = () => this.http.request<LtAiConnectionPreference[]>('GET', '/connections/preferences');
  setPreference = (input: LtAiConnectionPreference) => this.http.request<LtAiConnectionPreference>('POST', '/connections/preferences', input);
  deletePreference = (id: string) => this.http.request<LtAiConnectionPreference>('DELETE', `/connections/preferences/${encodeURIComponent(id)}`);
  listBudgetLimits = () => this.http.request<LtAiBudgetLimit[]>('GET', '/budget-limits');
  createBudgetLimit = (input: LtAiBudgetLimit) => this.http.request<LtAiBudgetLimit>('POST', '/budget-limits', input);
  updateBudgetLimit = (id: string, input: LtAiBudgetLimit) => this.http.request<LtAiBudgetLimit>('PUT', `/budget-limits/${encodeURIComponent(id)}`, input);
  deleteBudgetLimit = (id: string) => this.http.request<LtAiBudgetLimit>('DELETE', `/budget-limits/${encodeURIComponent(id)}`);
  listSlots = () => this.http.request<LtAiSlot[]>('GET', '/slots');
  listEffectiveSlots = () => this.http.request<LtAiEffectiveSlot[]>('GET', '/slots/effective');
  createSlot = (input: LtAiSlotInput) => this.http.request<LtAiSlot>('POST', '/slots', input);
  updateSlot = (id: string, input: LtAiSlotInput) => this.http.request<LtAiSlot>('PUT', `/slots/${encodeURIComponent(id)}`, input);
  deleteSlot = (id: string) => this.http.request<LtAiSlot>('DELETE', `/slots/${encodeURIComponent(id)}`);
  resetSlot = (id: string) => this.http.request<boolean>('POST', `/slots/${encodeURIComponent(id)}/reset`);
  listPromptHints = () => this.http.request<LtAiPromptHint[]>('GET', '/prompt-hints');
  createPromptHint = (input: LtAiPromptHintInput) => this.http.request<LtAiPromptHint>('POST', '/prompt-hints', input);
  updatePromptHint = (id: string, input: LtAiPromptHintInput) => this.http.request<LtAiPromptHint>('PUT', `/prompt-hints/${encodeURIComponent(id)}`, input);
  deletePromptHint = (id: string) => this.http.request<LtAiPromptHint>('DELETE', `/prompt-hints/${encodeURIComponent(id)}`);
  listInteractions = () => this.http.request<LtAiInteraction[]>('GET', '/interactions');
}
