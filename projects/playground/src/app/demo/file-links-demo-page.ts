import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LtFileService } from '@lenne.tech/ng-base/files';

/** Placeholder file id: the page shows the URLs, the file itself does not have to exist. */
export const DEMO_FILE_ID = '6650a1b2c3d4e5f6a7b8c9d0';

/**
 * `/demo/file-links`: an image and a download link from `LtFileService`, server-rendered. The SSR E2E (`e2e/ssr.spec.ts`)
 * reads this page's HTML: the links carry the public API URL (`NG_PUBLIC_API_URL`, or `/api` behind the proxy) and
 * never the server-only `NG_API_URL`, which the browser cannot reach.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-file-links-demo-page',
  templateUrl: './file-links-demo-page.html',
})
export class FileLinksDemoPage {
  protected readonly files = inject(LtFileService);
  protected readonly fileId = DEMO_FILE_ID;
}
