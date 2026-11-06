import { Component, inject } from '@angular/core';
import { LtAuthService } from '@lenne.tech/ng-base/auth';

/** `/app/admin`, guarded by `ltRoleGuard('admin')` (UI gating only; the API authorizes every request). */
@Component({
  selector: 'app-admin-page',
  templateUrl: './admin-page.html',
})
export class AdminPage {
  protected readonly auth = inject(LtAuthService);
}
