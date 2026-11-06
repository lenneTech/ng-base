import { Component, computed, inject } from '@angular/core';
import { LtAiStatusService } from '@lenne.tech/ng-base/ai';

/**
 * Status line of the nest-server AI module (`GET /ai/status`). The server waits for the answer and hands it to the
 * browser via `TransferState`, so the browser does not ask again.
 */
@Component({
  selector: 'app-ai-status',
  templateUrl: './ai-status.html',
})
export class AiStatus {
  protected readonly ai = inject(LtAiStatusService);
  protected readonly label = computed(() => {
    if (!this.ai.loaded()) {
      return 'wird geprüft …';
    }
    if (this.ai.error()) {
      return 'unbekannt';
    }
    return this.ai.enabled() ? 'an' : 'aus';
  });

  constructor() {
    void this.ai.load();
  }
}
