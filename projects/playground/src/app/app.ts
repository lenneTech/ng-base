import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LtBugReport } from '@lenne.tech/ng-base/bug';
import { LT_BUG_ACTIVE } from '@lenne.tech/ng-base/bug/provide';

import { Toaster } from './toaster';

/** Root shell: the pages bring their own `main` landmark (the signed-in area its header). */
@Component({
  imports: [LtBugReport, RouterOutlet, Toaster],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  /** Bug reporter on in this stage (off in production): only then is its chunk loaded. */
  protected readonly bugActive = inject(LT_BUG_ACTIVE);
}
