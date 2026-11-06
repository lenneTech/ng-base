import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, FormRoot, minLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LtErrorTranslationService } from '@lenne.tech/ng-base';
import { LtSystemSetupService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtFormField, LtNotice, LtPageCard, LtPasswordInput, LtTextField } from '@lenne.tech/ng-base/ui';

import { fieldError } from '../shared/field-error';

interface SetupModel {
  email: string;
  name: string;
  password: string;
  token: string;
}

/**
 * `/auth/setup`: creates the first administrator (`LtSystemSetupService.initSetup`, password hashed). `ltSystemSetupGuard`
 * sends every route here while no admin exists and away from here afterwards.
 */
@Component({
  imports: [FormField, FormRoot, HlmButton, LtFormField, LtNotice, LtPageCard, LtPasswordInput, LtTextField],
  selector: 'app-setup-page',
  templateUrl: './setup-page.html',
})
export class SetupPage {
  protected readonly setup = inject(LtSystemSetupService);
  private readonly errors = inject(LtErrorTranslationService);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly fieldError = fieldError;

  private readonly model = signal<SetupModel>({ email: '', name: '', password: '', token: '' });
  protected readonly setupForm = form(
    this.model,
    (path) => {
      required(path.name, { message: 'Bitte gib einen Namen ein.' });
      required(path.email, { message: 'Bitte gib eine E-Mail-Adresse ein.' });
      email(path.email, { message: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
      required(path.password, { message: 'Bitte vergib ein Passwort.' });
      minLength(path.password, 8, { message: 'Das Passwort braucht mindestens 8 Zeichen.' });
      required(path.token, { message: 'Bitte gib das Einrichtungs-Token ein.', when: () => this.setup.httpInitTokenRequired() === true });
    },
    { name: 'setup', submission: { action: async () => this.create() } },
  );

  private async create(): Promise<undefined> {
    this.error.set(null);
    this.pending.set(true);
    try {
      const { email, name, password, token } = this.model();
      await this.setup.initSetup({ email, name, password, token: token || undefined });
      await this.router.navigate(['/auth/login'], { queryParams: { setup: 'done' } });
    } catch (error) {
      this.error.set(this.errors.translateError(error) || 'Die Einrichtung ist fehlgeschlagen.');
    } finally {
      this.pending.set(false);
    }
    return undefined;
  }
}
