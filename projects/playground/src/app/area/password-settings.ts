import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, minLength, required } from '@angular/forms/signals';
import { LtErrorTranslationService } from '@lenne.tech/ng-base';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtFormField, LtNotice, LtPasswordInput } from '@lenne.tech/ng-base/ui';

import { fieldError } from '../shared/field-error';

/** Password change (`LtAuthService.changePassword()`, both passwords hashed). */
@Component({
  imports: [FormField, FormRoot, HlmButton, LtFormField, LtNotice, LtPasswordInput],
  selector: 'app-password-settings',
  templateUrl: './password-settings.html',
})
export class PasswordSettings {
  private readonly auth = inject(LtAuthService);
  private readonly errors = inject(LtErrorTranslationService);

  protected readonly error = signal<string | null>(null);
  protected readonly changed = signal(false);
  protected readonly pending = signal(false);
  protected readonly fieldError = fieldError;

  private readonly model = signal({ currentPassword: '', newPassword: '' });
  protected readonly passwordForm = form(
    this.model,
    (path) => {
      required(path.currentPassword, { message: 'Bitte gib dein aktuelles Passwort ein.' });
      required(path.newPassword, { message: 'Bitte gib ein neues Passwort ein.' });
      minLength(path.newPassword, 8, { message: 'Das Passwort braucht mindestens 8 Zeichen.' });
    },
    { name: 'password', submission: { action: async () => this.change() } },
  );

  private async change(): Promise<undefined> {
    this.error.set(null);
    this.changed.set(false);
    this.pending.set(true);
    try {
      const { currentPassword, newPassword } = this.model();
      const result = await this.auth.changePassword({ currentPassword, newPassword });
      if (result.error) {
        this.error.set(result.error.message ? this.errors.translateError(result.error.message) : 'Das Passwort konnte nicht geändert werden.');
        return undefined;
      }
      this.changed.set(true);
      this.model.set({ currentPassword: '', newPassword: '' });
      this.passwordForm().reset();
    } finally {
      this.pending.set(false);
    }
    return undefined;
  }
}
