import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { LtAuthService } from '@lenne.tech/ng-base/auth';
import { HlmButton, LtHeader, LtHeaderActions, type LtNavigationItem } from '@lenne.tech/ng-base/ui';

/** Shell of the signed-in area `/app/**` (lazy, so the header and its sheet stay out of the initial bundle). */
@Component({
  imports: [HlmButton, LtHeader, LtHeaderActions, RouterOutlet],
  selector: 'app-shell',
  templateUrl: './app-shell.html',
})
export class AppShell {
  protected readonly auth = inject(LtAuthService);
  private readonly router = inject(Router);

  protected readonly items = computed<LtNavigationItem[]>(() => [
    { exact: true, label: 'Übersicht', link: '/app' },
    { label: 'Upload', link: '/app/upload' },
    ...(this.auth.isAdmin() ? [{ label: 'Administration', link: '/app/admin' }] : []),
  ]);

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/auth/login');
  }
}
