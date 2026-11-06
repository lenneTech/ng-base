import { Component, inject } from '@angular/core';
import { LtAuthService } from '@lenne.tech/ng-base/auth';

import { PasskeySettings } from './passkey-settings';
import { PasswordSettings } from './password-settings';
import { TwoFactorSettings } from './two-factor-settings';

/** `/app`: the signed-in user and the security settings (2FA, passkey, password). */
@Component({
  imports: [PasskeySettings, PasswordSettings, TwoFactorSettings],
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  protected readonly auth = inject(LtAuthService);
}
