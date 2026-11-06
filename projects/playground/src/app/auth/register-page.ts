import { Component, computed, inject, signal } from '@angular/core';
import { email, form, FormField, FormRoot, minLength, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LtErrorTranslationService } from '@lenne.tech/ng-base';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtFormField, LtNotice, LtPageCard, LtPageCardFooter, LtPasswordInput, LtTextField } from '@lenne.tech/ng-base/ui';

import { fieldError } from '../shared/field-error';

interface RegisterModel {
  email: string;
  name: string;
  password: string;
  terms: boolean;
}

/**
 * `/auth/register`: sign-up (password hashed by `LtAuthService`). The terms checkbox follows the backend's
 * `signUpChecks` flag; with `emailVerification` on, the backend creates no session and the page asks for the mail.
 */
@Component({
  imports: [FormField, FormRoot, HlmButton, LtFormField, LtNotice, LtPageCard, LtPageCardFooter, LtPasswordInput, LtTextField, RouterLink],
  selector: 'app-register-page',
  templateUrl: './register-page.html',
})
export class RegisterPage {
  private readonly auth = inject(LtAuthService);
  private readonly errors = inject(LtErrorTranslationService);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly verifyEmail = signal(false);
  protected readonly fieldError = fieldError;
  protected readonly requireTerms = computed(() => this.auth.features()['signUpChecks'] === true);

  private readonly model = signal<RegisterModel>({ email: '', name: '', password: '', terms: false });
  protected readonly registerForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Bitte gib deinen Namen ein.' });
      required(path.email, { message: 'Bitte gib deine E-Mail-Adresse ein.' });
      email(path.email, { message: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
      required(path.password, { message: 'Bitte vergib ein Passwort.' });
      minLength(path.password, 8, { message: 'Das Passwort braucht mindestens 8 Zeichen.' });
      required(path.terms, { message: 'Bitte akzeptiere die AGB und die Datenschutzerklärung.', when: () => this.requireTerms() });
    },
    { name: 'register', submission: { action: async () => this.signUp() } },
  );

  private async signUp(): Promise<undefined> {
    this.error.set(null);
    this.pending.set(true);
    try {
      const { email, name, password } = this.model();
      const result = await this.auth.signUp.email({ email, name, password, ...(this.requireTerms() ? { termsAndPrivacyAccepted: true } : {}) });
      if (result.error) {
        this.error.set(result.error.message ? this.errors.translateError(result.error.message) : 'Die Registrierung ist gerade nicht möglich.');
        return undefined;
      }
      // E-mail verification on: nest-server revoked the session and `signUp.email()` did not sign the visitor in.
      if (result.data?.emailVerificationRequired) {
        this.verifyEmail.set(true);
        return undefined;
      }
      await this.router.navigateByUrl('/app');
    } finally {
      this.pending.set(false);
    }
    return undefined;
  }
}
