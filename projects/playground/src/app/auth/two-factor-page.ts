import { Component, computed, inject, input, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LtErrorTranslationService } from '@lenne.tech/ng-base';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtNotice, LtPageCard, LtPageCardFooter, LtTextField } from '@lenne.tech/ng-base/ui';

import { safeRedirect } from './safe-redirect';

type Method = 'backup' | 'totp';

/**
 * `/auth/2fa`: second factor after a sign-in that answered `requiresTwoFactor`: a TOTP code from the authenticator app
 * or a backup code. On success `LtAuthService` sets the user itself, so the app continues without a reload.
 */
@Component({
  imports: [FormField, FormRoot, HlmButton, LtNotice, LtPageCard, LtPageCardFooter, LtTextField, RouterLink],
  selector: 'app-two-factor-page',
  templateUrl: './two-factor-page.html',
})
export class TwoFactorPage {
  /** `?redirect=` (router input binding). */
  readonly redirect = input<string>();

  private readonly auth = inject(LtAuthService);
  private readonly errors = inject(LtErrorTranslationService);
  private readonly router = inject(Router);

  protected readonly method = signal<Method>('totp');
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly codeLabel = computed(() => (this.method() === 'totp' ? 'Code aus der Authenticator-App' : 'Backup-Code'));

  private readonly model = signal({ code: '' });
  protected readonly codeForm = form(
    this.model,
    (path) => {
      required(path.code, { message: 'Bitte gib den Code ein.' });
    },
    { name: 'twoFactor', submission: { action: async () => this.verify() } },
  );

  protected switchMethod(method: Method): void {
    this.method.set(method);
    this.error.set(null);
    this.model.set({ code: '' });
    this.codeForm().reset();
  }

  private async verify(): Promise<undefined> {
    this.error.set(null);
    this.pending.set(true);
    try {
      const code = this.model().code.trim();
      const result = this.method() === 'totp' ? await this.auth.twoFactor.verifyTotp({ code }) : await this.auth.twoFactor.verifyBackupCode({ code });
      if (result.error || !this.auth.isAuthenticated()) {
        this.error.set(result.error?.message ? this.errors.translateError(result.error.message) : 'Der Code konnte nicht bestätigt werden.');
        return undefined;
      }
      await this.router.navigateByUrl(safeRedirect(this.redirect()));
    } finally {
      this.pending.set(false);
    }
    return undefined;
  }
}
