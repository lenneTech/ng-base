import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { LtErrorTranslationService } from '@lenne.tech/ng-base';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtFormField, LtNotice, LtPasswordInput, LtTextField } from '@lenne.tech/ng-base/ui';

import { fieldError } from '../shared/field-error';

/**
 * 2FA set-up: password → `twoFactor.enable()` (hashed) → otpauth URI (shown as text, the QR code is the app's job) and
 * backup codes → the first TOTP code confirms it (`twoFactor.verifyTotp()`).
 */
@Component({
  imports: [FormField, FormRoot, HlmButton, LtFormField, LtNotice, LtPasswordInput, LtTextField],
  selector: 'app-two-factor-settings',
  templateUrl: './two-factor-settings.html',
})
export class TwoFactorSettings {
  protected readonly auth = inject(LtAuthService);
  private readonly errors = inject(LtErrorTranslationService);

  protected readonly totpUri = signal<string | null>(null);
  protected readonly backupCodes = signal<string[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly fieldError = fieldError;

  private readonly passwordModel = signal({ password: '' });
  protected readonly enableForm = form(
    this.passwordModel,
    (path) => {
      required(path.password, { message: 'Bitte bestätige mit deinem Passwort.' });
    },
    { name: 'enable2fa', submission: { action: async () => this.enable() } },
  );

  private readonly codeModel = signal({ code: '' });
  protected readonly verifyForm = form(
    this.codeModel,
    (path) => {
      required(path.code, { message: 'Bitte gib den Code aus der App ein.' });
    },
    { name: 'verify2fa', submission: { action: async () => this.verify() } },
  );

  private async enable(): Promise<undefined> {
    await this.run(async () => {
      const result = await this.auth.twoFactor.enable({ password: this.passwordModel().password });
      if (result.error || !result.data) {
        return result.error?.message;
      }
      this.totpUri.set(result.data.totpURI);
      this.backupCodes.set(result.data.backupCodes);
      return undefined;
    });
    return undefined;
  }

  private async verify(): Promise<undefined> {
    await this.run(async () => {
      const result = await this.auth.twoFactor.verifyTotp({ code: this.codeModel().code.trim() });
      if (result.error) {
        return result.error.message;
      }
      if (!this.auth.is2FAEnabled()) {
        await this.auth.validateSession();
      }
      this.totpUri.set(null);
      return undefined;
    });
    return undefined;
  }

  /** Runs a step; a returned message is shown translated. */
  private async run(step: () => Promise<string | undefined>): Promise<void> {
    this.error.set(null);
    this.pending.set(true);
    try {
      const message = await step();
      if (message) {
        this.error.set(this.errors.translateError(message));
      }
    } catch (error) {
      this.error.set(this.errors.translateError(error) || 'Die Aktion ist fehlgeschlagen.');
    } finally {
      this.pending.set(false);
    }
  }
}
