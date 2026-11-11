import { Component, inject, PLATFORM_ID, REQUEST_CONTEXT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideLtNgBase, type LtRequestContext } from '@lenne.tech/ng-base';

import { LtFileService } from './file-service';

const ID = '6650a1b2c3d4e5f6a7b8c9d0';
const INTERNAL_API = 'http://api:3000';

/** A page that renders file links, the way an app shows an image and a download link. */
@Component({
  selector: 'lt-ssr-file-links',
  template: `<img alt="" [src]="files.getFileUrl(id)" /><a [href]="files.getDownloadUrl(id, 'report.pdf')">report.pdf</a>`,
})
class SsrFileLinks {
  protected readonly files = inject(LtFileService);
  protected readonly id = ID;
}

/**
 * Render {@link SsrFileLinks} the way the server does: server platform, `provideLtNgBase()` and the request context
 * `ltAngularRequestHandler()` passes (public runtime config plus the internal `NG_API_URL`). This is where an SSR render
 * decides which URL goes into the HTML. (platform-server's `renderApplication` cannot run here: with DOM emulation it
 * replaces the DOM classes on globalThis that every other spec in this realm (`isolate: false`) relies on.)
 */
function render(context: LtRequestContext): string {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: 'server' }, { provide: REQUEST_CONTEXT, useValue: context }, provideLtNgBase({ configCheck: false })],
  });
  const fixture = TestBed.createComponent(SsrFileLinks);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).innerHTML;
}

/**
 * Server-side rendering never writes the internal API URL (`NG_API_URL`) into the HTML. A link in `src`/`href` is
 * followed by the browser, which cannot reach the internal host; a Nuxt project shipped `http://api:3000/...` in image
 * `src` attributes that way (2026-11-11). File links use the public URL, also during SSR. The playground E2E
 * (`e2e/ssr.spec.ts`) checks the same in the HTML of the real SSR server.
 */
describe('LtFileService links in server-rendered HTML', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('use NG_PUBLIC_API_URL, never NG_API_URL', () => {
    const html = render({ runtimeConfig: { apiProxy: false, apiUrl: 'https://api.example.com' }, serverApiUrl: INTERNAL_API });
    expect(html).toContain(`src="https://api.example.com/files/id/${ID}"`);
    expect(html).toContain(`href="https://api.example.com/files/id/${ID}"`);
    expect(html).not.toContain('api:3000');
  });

  it('use the dev proxy path behind NG_PUBLIC_API_PROXY, never NG_API_URL', () => {
    const html = render({ runtimeConfig: { apiProxy: true, apiUrl: 'https://api.example.com' }, serverApiUrl: INTERNAL_API });
    expect(html).toContain(`src="/api/files/id/${ID}"`);
    expect(html).not.toContain('api:3000');
  });

  it('stay relative without a public API URL rather than fall back to NG_API_URL', () => {
    const html = render({ runtimeConfig: { apiProxy: false, apiUrl: '' }, serverApiUrl: INTERNAL_API });
    expect(html).toContain(`src="/files/id/${ID}"`);
    expect(html).not.toContain('api:3000');
  });

  it('keep NG_API_URL for the requests the service sends itself', () => {
    render({ runtimeConfig: { apiProxy: false, apiUrl: 'https://api.example.com' }, serverApiUrl: INTERNAL_API });
    expect(TestBed.inject(LtFileService)['baseUrl']()).toBe(`${INTERNAL_API}/files`);
  });
});
