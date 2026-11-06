import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LtAuthService } from '@lenne.tech/ng-base/auth';

import { AiStatus } from './ai-status';

/** `/`: entry page with the AI status line and links to every demo. */
@Component({
  imports: [AiStatus, RouterLink],
  selector: 'app-home-page',
  templateUrl: './home-page.html',
})
export class HomePage {
  protected readonly auth = inject(LtAuthService);
}
