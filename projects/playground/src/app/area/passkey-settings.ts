import { Component, inject, signal } from '@angular/core';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtNotice } from '@lenne.tech/ng-base/ui';

/** Registers a passkey for the signed-in user (`LtAuthService.registerPasskey()`, WebAuthn with nest-server's challengeId). */
@Component({
  imports: [HlmButton, LtNotice],
  selector: 'app-passkey-settings',
  templateUrl: './passkey-settings.html',
})
export class PasskeySettings {
  protected readonly auth = inject(LtAuthService);

  protected readonly result = signal<{ error?: string; success: boolean } | null>(null);

  protected async register(): Promise<void> {
    this.result.set(null);
    this.result.set(await this.auth.registerPasskey('Playground'));
  }
}
