import { Dialog } from '@angular/cdk/dialog';
import { ApplicationRef, ErrorHandler } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LT_TOAST_ADAPTER, LtI18nService, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';
import { provideSpartanHlm } from '@lenne.tech/ng-base/ui';

import { LT_BUG_DEV_MODE } from '../bug-options';
import { LtBugReportService } from '../bug-report-service';
import type { LtBugOptions, LtBugReportData } from '../bug-types';
import { provideLtBug } from '@lenne.tech/ng-base/bug/provide';
import { LT_BUG_SCREENSHOT_LOADER } from '../screenshot';
import { LtBugReport } from './bug-report';

const SCREENSHOT = 'data:image/png;base64,iVBORw0KGgo=';

async function settle(): Promise<void> {
  const appRef = TestBed.inject(ApplicationRef);
  for (let i = 0; i < 4; i++) {
    appRef.tick();
    await appRef.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const dialog = (): HTMLElement | null => document.querySelector('cdk-dialog-container');

/** Tick until `predicate` holds (the dialog is a lazily loaded chunk; generous for loaded CI runners). */
async function waitFor(predicate: () => boolean, timeout = 10_000): Promise<void> {
  const appRef = TestBed.inject(ApplicationRef);
  const end = Date.now() + timeout;
  while (!predicate() && Date.now() < end) {
    appRef.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await settle();
}
const inDialog = <T extends Element = HTMLElement>(selector: string): T | null => dialog()?.querySelector<T>(selector) ?? null;
const allInDialog = (selector: string): HTMLElement[] => Array.from(dialog()?.querySelectorAll<HTMLElement>(selector) ?? []);

function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('blur'));
}

// The lazily loaded dialog chunk takes 1–3 s on a busy runner: more room than Vitest's 5 s default per test.
describe('LtBugReport', { timeout: 30_000 }, () => {
  const originalFetch = window.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<LtBugReport>;
  let host: HTMLElement;

  async function render(options: { appEnv?: string; bug?: LtBugOptions; inputs?: Record<string, unknown> } = {}): Promise<LtBugReportService> {
    TestBed.configureTestingModule({
      providers: [
        provideSpartanHlm(),
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { appEnv: options.appEnv ?? 'test' }) },
        { provide: LT_BUG_DEV_MODE, useValue: false },
        { provide: LT_BUG_SCREENSHOT_LOADER, useValue: () => Promise.resolve({ domToPng: () => Promise.resolve(SCREENSHOT) }) },
        { provide: LT_TOAST_ADAPTER, useValue: { show: () => true } },
        provideLtBug(options.bug ?? {}),
      ],
    });
    TestBed.inject(LtI18nService).setLocale('de');
    fixture = TestBed.createComponent(LtBugReport);
    for (const [name, value] of Object.entries(options.inputs ?? {})) {
      fixture.componentRef.setInput(name, value);
    }
    host = fixture.nativeElement as HTMLElement;
    const bug = TestBed.inject(LtBugReportService);
    await bug.whenReady();
    await settle();
    return bug;
  }

  const button = (): HTMLButtonElement | null => host.querySelector('[data-slot="bug-report-button"]');

  async function openDialog(): Promise<void> {
    button()?.click();
    await waitFor(() => !!dialog()?.querySelector('form'));
  }

  async function openWith(bug: LtBugReportService, error?: Parameters<LtBugReportService['open']>[0]): Promise<void> {
    bug.open(error);
    await waitFor(() => !!dialog()?.querySelector('form'));
  }

  async function submit(): Promise<void> {
    inDialog<HTMLButtonElement>('[data-action="submit"]')?.click();
    await settle();
  }

  const lastPayload = (): LtBugReportData => JSON.parse(String((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body)) as LtBugReportData;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{"success":true,"identifier":"DEV-7"}', { headers: { 'content-type': 'application/json' }, status: 200 })));
    window.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    TestBed.resetTestingModule();
    window.fetch = originalFetch;
    document.querySelectorAll('.cdk-overlay-container').forEach((container) => (container.innerHTML = ''));
  });

  it('starts the capture when it is created (provideLtBug() alone starts nothing)', async () => {
    const bug = await render();
    expect(bug.running).toBe(true);
  });

  it('renders nothing while the reporter is inactive (production)', async () => {
    await render({ appEnv: 'production' });
    expect(button()).toBeNull();
  });

  it('renders a labelled floating button with the configured position and color', async () => {
    await render();
    const element = button() as HTMLButtonElement;
    expect(element.getAttribute('type')).toBe('button');
    expect(element.getAttribute('aria-label')).toBe('Fehler melden');
    expect(element.getAttribute('aria-haspopup')).toBe('dialog');
    expect(element.className).toContain('bottom-4');
    expect(element.className).toContain('right-4');
    expect(element.style.backgroundColor).toMatch(/220, 38, 38|#dc2626/i);
    expect(host.getAttribute('data-lt-bug-ui')).toBe('');
  });

  it('lets inputs override position, text and color; text replaces the aria-label', async () => {
    await render({ inputs: { color: '#123456', position: 'top-left', text: 'Bug melden' } });
    const element = button() as HTMLButtonElement;
    expect(element.className).toContain('top-4');
    expect(element.className).toContain('left-4');
    expect(element.textContent?.trim()).toBe('Bug melden');
    expect(element.hasAttribute('aria-label')).toBe(false);
  });

  it('hides the button with autoShow: false but still opens the dialog for open()', async () => {
    const bug = await render({ bug: { autoShow: false } });
    expect(button()).toBeNull();
    await openWith(bug);
    expect(dialog()).not.toBeNull();
  });

  it('takes the screenshot first, then opens a labelled dialog with focus inside and the screenshot attached', async () => {
    const bug = await render();
    await openDialog();
    const container = dialog() as HTMLElement;
    expect(container.getAttribute('role')).toBe('dialog');
    expect(document.getElementById(container.getAttribute('aria-labelledby') ?? '')?.textContent?.trim()).toBe('Fehler melden');
    expect(container.contains(document.activeElement)).toBe(true);
    expect(bug.isOpen()).toBe(true);
    const screenshot = inDialog('[data-slot="attachment"][data-screenshot]');
    expect(screenshot?.textContent).toContain('screenshot.png');
    expect(screenshot?.textContent).toContain('Screenshot');
    expect(inDialog<HTMLImageElement>('[data-slot="attachment"] img')?.alt).toBe('screenshot.png');
  });

  it('labels every form control and marks the required ones', async () => {
    await render();
    await openDialog();
    for (const id of ['lt-bug-title', 'lt-bug-type', 'lt-bug-description', 'lt-bug-expected', 'lt-bug-steps']) {
      expect(inDialog(`label[for="${id}"]`)?.textContent?.trim(), id).toBeTruthy();
      expect(allInDialog(`[id="${id}"]`), id).toHaveLength(1);
    }
    expect(inDialog('label[for="lt-bug-title"]')?.textContent).toContain('*');
    expect(inDialog('label[for="lt-bug-description"]')?.textContent).toContain('*');
    expect(inDialog('label[for="lt-bug-expected"]')?.textContent).not.toContain('*');
  });

  it('validates on submit: shows the messages, focuses the first invalid field and sends nothing', async () => {
    await render();
    await openDialog();
    await submit();
    await settle();
    const text = dialog()?.textContent ?? '';
    expect(text).toContain('Titel ist erforderlich');
    expect(text).toContain('Typ ist erforderlich');
    expect(text).toContain('Beschreibung ist erforderlich');
    expect(document.activeElement?.id).toBe('lt-bug-title');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pre-fills from the last error, sends the report and closes with an announcement', async () => {
    const bug = await render();
    await openWith(bug, { componentName: 'ErrorHandler', message: 'Cannot read x', stack: 'Error: Cannot read x', timestamp: new Date().toISOString() });
    expect(inDialog<HTMLInputElement>('#lt-bug-title')?.value).toBe('Cannot read x');
    type(inDialog<HTMLTextAreaElement>('#lt-bug-expected') as HTMLTextAreaElement, 'Liste lädt');
    await settle();
    await submit();
    await waitFor(() => !dialog());
    const payload = lastPayload();
    expect(payload).toMatchObject({ expectedBehavior: 'Liste lädt', title: 'Cannot read x', type: 'bug' });
    expect(payload.description).toContain('**Error Message:**');
    expect(payload.attachments?.[0]).toMatchObject({ data: SCREENSHOT, isScreenshot: true, name: 'screenshot.png' });
    expect(payload.attachments?.[0]).not.toHaveProperty('preview');
    expect(payload.browserInfo).toBeDefined();
    expect(payload.consoleLogs).toBeDefined();
    expect(dialog()).toBeNull();
    expect(host.querySelector('[data-slot="bug-report-announcement"]')?.textContent?.trim()).toBe('Fehlerbericht gesendet');
    expect(bug.screenshot()).toBeNull();
  });

  it('keeps the dialog open with the error notice when sending fails', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{"success":false}', { status: 502 })));
    const bug = await render();
    await openWith(bug, { message: 'Boom', timestamp: new Date().toISOString() });
    await submit();
    await waitFor(() => !!inDialog('[data-slot="bug-report-error"]'));
    expect(dialog()).not.toBeNull();
    const notice = inDialog('[data-slot="bug-report-error"]') as HTMLElement;
    expect(notice.textContent).toContain('Bitte versuchen Sie es später erneut.');
    (notice.querySelector('button') as HTMLButtonElement).click();
    await settle();
    expect(inDialog('[data-slot="bug-report-error"]')).toBeNull();
  });

  it('leaves switched-off data out of the payload (switches are labelled)', async () => {
    const bug = await render();
    window.console.info('a console line');
    await openWith(bug, { message: 'Boom', timestamp: new Date().toISOString() });
    (inDialog('[data-slot="bug-report-additional"] button[data-slot="collapsible-trigger"]') as HTMLButtonElement).click();
    await settle();
    const consoleSwitch = inDialog<HTMLButtonElement>('[role="switch"][aria-labelledby="lt-bug-include-console-label"]') as HTMLButtonElement;
    expect(document.getElementById(consoleSwitch.getAttribute('aria-labelledby') ?? '')?.textContent).toContain('Konsolen-Logs auslesen');
    consoleSwitch.click();
    await settle();
    await submit();
    await waitFor(() => !dialog());
    expect(lastPayload().consoleLogs).toBeUndefined();
    expect(lastPayload().networkRequests).toBeDefined();
  });

  it('removes an attachment through its labelled button', async () => {
    await render();
    await openDialog();
    const remove = inDialog<HTMLButtonElement>('[data-slot="attachment"] [data-action="remove"]') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Entfernen: screenshot.png');
    remove.click();
    await settle();
    expect(inDialog('[data-slot="attachment"]')).toBeNull();
  });

  it('closes on Escape and on cancel, and returns to the closed state', async () => {
    const bug = await render();
    await openDialog();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    await waitFor(() => !dialog() && !bug.isOpen());
    expect(dialog()).toBeNull();
    expect(bug.isOpen()).toBe(false);
    await openDialog();
    inDialog<HTMLButtonElement>('[data-action="cancel"]')?.click();
    await waitFor(() => !dialog());
    expect(dialog()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the user journey preview with a type filter', async () => {
    const bug = await render();
    bug.recordInteraction('click', 'button#save', { text: 'Speichern' });
    bug.recordInteraction('keyboard', 's', { key: 's' });
    await openDialog();
    (inDialog('[data-slot="bug-report-journey"] button[data-slot="collapsible-trigger"]') as HTMLButtonElement).click();
    await settle();
    expect(allInDialog('[data-slot="journey-event"]').length).toBeGreaterThanOrEqual(2);
    const filter = inDialog<HTMLSelectElement>('[data-slot="bug-report-journey"] select') as HTMLSelectElement;
    expect(inDialog(`label[for="${filter.id}"]`)).not.toBeNull();
    filter.value = 'keyboard';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(allInDialog('[data-slot="journey-event"]').map((row) => row.getAttribute('data-type'))).toEqual(['keyboard']);
  });

  it('does not open twice and ignores errors while the dialog is open', async () => {
    const bug = await render({ bug: { autoOpenOnError: true } });
    await openDialog();
    TestBed.inject(ErrorHandler).handleError(new Error('while open'));
    await settle();
    bug.open();
    await settle();
    expect(document.querySelectorAll('cdk-dialog-container')).toHaveLength(1);
  });
});
