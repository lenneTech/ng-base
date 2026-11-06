import { Component, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LtErrorTranslationService } from '@lenne.tech/ng-base';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtFormField, LtNotice, LtPageCard, LtPageCardFooter, LtPasswordInput, LtTextField } from '@lenne.tech/ng-base/ui';

import { fieldError } from '../shared/field-error';
import { safeRedirect } from './safe-redirect';

interface LoginModel {
  email: string;
  password: string;
}

/**
 * `/auth/login`: e-mail + password (hashed by `LtAuthService`), passkey sign-in when the backend and the browser
 * support it. Backend errors (`#LTNS_xxxx`) are shown translated. `?redirect=` survives the 2FA detour.
 */
@Component({
  imports: [FormField, FormRoot, HlmButton, LtFormField, LtNotice, LtPageCard, LtPageCardFooter, LtPasswordInput, LtTextField, RouterLink],
  selector: 'app-login-page',
  templateUrl: './login-page.html',
})
export class LoginPage {
  /** `?redirect=` (router input binding). */
  readonly redirect = input<string>();
  /** `?setup=done` after the first-admin setup. */
  readonly setup = input<string>();

  protected readonly auth = inject(LtAuthService);
  private readonly errors = inject(LtErrorTranslationService);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly fieldError = fieldError;
  private readonly target = computed(() => safeRedirect(this.redirect()));

  private readonly model = signal<LoginModel>({ email: '', password: '' });
  protected readonly loginForm = form(
    this.model,
    (path) => {
      required(path.email, { message: 'Bitte gib deine E-Mail-Adresse ein.' });
      email(path.email, { message: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
      required(path.password, { message: 'Bitte gib dein Passwort ein.' });
    },
    { name: 'login', submission: { action: async () => this.signIn() } },
  );

  private async signIn(): Promise<undefined> {
    this.error.set(null);
    this.pending.set(true);
    try {
      const { email, password } = this.model();
      const result = await this.auth.signIn.email({ email, password });
      if (result.error) {
        this.error.set(result.error.message ? this.errors.translateError(result.error.message) : 'Die Anmeldung ist gerade nicht möglich.');
        return undefined;
      }
      // A sign-in that needs a second factor: `signIn.email()` has already navigated to `twoFactorRedirectPath`.
      if (result.data?.twoFactorRedirect || result.data?.requiresTwoFactor) {
        return undefined;
      }
      await this.router.navigateByUrl(this.target());
    } finally {
      this.pending.set(false);
    }
    return undefined;
  }

  protected async signInWithPasskey(): Promise<void> {
    this.error.set(null);
    const result = await this.auth.signIn.passkey();
    if (!result.success) {
      this.error.set(result.error ? this.errors.translateError(result.error) : 'Die Passkey-Anmeldung ist fehlgeschlagen.');
      return;
    }
    await this.router.navigateByUrl(this.target());
  }
}
