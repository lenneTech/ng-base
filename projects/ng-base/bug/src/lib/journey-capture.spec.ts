import { LT_BUG_DEFAULTS } from './bug-options';
import type { LtBugUserJourneyOptions } from './bug-types';
import { isLtSensitiveField, LtJourneyCapture } from './journey-capture';

function setup(options: Partial<LtBugUserJourneyOptions> = {}): LtJourneyCapture {
  const capture = new LtJourneyCapture({ ...LT_BUG_DEFAULTS.userJourney, ...options });
  capture.install(window, { listenToHistory: false });
  return capture;
}

function html(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LtJourneyCapture', () => {
  let capture: LtJourneyCapture;

  afterEach(() => {
    capture?.uninstall();
    document.body.innerHTML = '';
  });

  it('records the page load and clicks with element description (closest interactive element)', () => {
    capture = setup();
    const host = html('<button id="save" class="btn primary large extra" type="button"><span>Speichern</span></button>');
    host.querySelector('span')?.click();
    const events = capture.entries();
    expect(events[0]?.type).toBe('navigation');
    expect(events[1]).toMatchObject({ metadata: { id: 'save', tag: 'button', text: 'Speichern' }, target: 'button#save.btn.primary.large', type: 'click' });
  });

  it('ignores interactions inside the reporter UI (data-lt-bug-ui)', () => {
    capture = setup({ captureNavigation: false });
    html('<div data-lt-bug-ui><button type="button">Senden</button></div>').querySelector('button')?.click();
    expect(capture.entries()).toHaveLength(0);
  });

  it('records navigation once per URL, from → to, with redacted tokens', () => {
    capture = setup();
    capture.recordNavigation('https://app.test/reset?token=abc');
    capture.recordNavigation('https://app.test/reset?token=abc');
    const navigation = capture.entries().filter((event) => event.type === 'navigation');
    expect(navigation).toHaveLength(2);
    expect(navigation[1]?.metadata).toMatchObject({ toUrl: 'https://app.test/reset?token=[redacted]' });
    expect(navigation[1]?.metadata?.fromUrl).toBeDefined();
  });

  it('records form changes without values by default', () => {
    capture = setup({ captureNavigation: false });
    const input = html('<input name="city" value="Bonn" />').querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(capture.entries()[0]?.type).toBe('form_change');
    expect(capture.entries()[0]?.metadata?.value).toBeUndefined();
  });

  it('records values only with captureInputValues and never from password, OTP or token fields', () => {
    capture = setup({ captureInputValues: true, captureNavigation: false });
    const host = html(`
      <input name="city" value="Bonn" />
      <input type="password" name="pw" value="hunter2" />
      <input name="code" autocomplete="one-time-code" value="123456" />
      <input name="newpw" autocomplete="new-password" value="geheim" />
      <input name="apiToken" value="tok" />
      <textarea name="note">see /x?token=abc</textarea>
    `);
    host.querySelectorAll('input, textarea').forEach((field) => field.dispatchEvent(new Event('change', { bubbles: true })));
    const values = capture.entries().map((event) => event.metadata?.value);
    expect(values).toEqual(['Bonn', undefined, undefined, undefined, undefined, 'see /x?token=[redacted]']);
    expect(JSON.stringify(capture.entries())).not.toMatch(/hunter2|123456|geheim|tok"/);
  });

  it('isLtSensitiveField detects passwords, hidden fields, autocomplete secrets and secret names', () => {
    const host = html(`
      <input id="a" type="password" /><input id="b" type="hidden" /><input id="c" autocomplete="current-password" />
      <input id="d" autocomplete="cc-number" /><input id="e" name="cvv" /><input id="f" name="email" /><select id="g"></select>
    `);
    const sensitive = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => isLtSensitiveField(host.querySelector(`#${id}`)));
    expect(sensitive).toEqual([true, true, true, true, true, false, false]);
  });

  it('records keyboard shortcuts but never typed characters', () => {
    capture = setup({ captureNavigation: false });
    const input = html('<input name="q" /><input type="password" name="pw" />').querySelectorAll('input');
    const press = (target: EventTarget, init: KeyboardEventInit) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    press(document.body, { ctrlKey: true, key: 's' });
    press(document.body, { key: 'a' });
    press(document.body, { altKey: true, key: '@' });
    press(input[0] as HTMLInputElement, { ctrlKey: true, altKey: true, key: '€' });
    press(input[0] as HTMLInputElement, { metaKey: true, key: 'z' });
    press(input[1] as HTMLInputElement, { metaKey: true, key: 'v' });
    press(document.body, { ctrlKey: true, key: 'Control' });
    expect(capture.entries().map((event) => event.target)).toEqual(['s', 'z']);
  });

  it('records errors and unhandled rejections once per message and second', () => {
    capture = setup({ captureNavigation: false });
    capture.recordError('boom');
    capture.recordError('boom');
    capture.recordError('https://x.test/?token=abc failed');
    expect(capture.entries().map((event) => event.metadata?.errorMessage)).toEqual(['boom', 'https://x.test/?token=[redacted] failed']);
  });

  it('keeps the newest maxEvents events', () => {
    capture = setup({ captureNavigation: false, maxEvents: 3 });
    for (const target of ['a', 'b', 'c', 'd', 'e']) {
      capture.record('click', target);
    }
    expect(capture.entries().map((event) => event.target)).toEqual(['c', 'd', 'e']);
  });

  it('records dialogs that open and close (captureModalEvents)', async () => {
    capture = setup({ captureNavigation: false });
    const host = html('');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Artikel bearbeiten');
    host.appendChild(dialog);
    await flush();
    dialog.remove();
    await flush();
    expect(capture.entries().map((event) => [event.type, event.target])).toEqual([
      ['modal_open', 'Artikel bearbeiten'],
      ['modal_close', 'Artikel bearbeiten'],
    ]);
  });

  it('throttles input events (leading and trailing)', async () => {
    capture = setup({ captureInputChanges: true, captureNavigation: false, throttleRate: 30 });
    const input = html('<input name="q" />').querySelector('input') as HTMLInputElement;
    for (let i = 0; i < 5; i++) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(capture.entries()).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(capture.entries()).toHaveLength(2);
  });

  it('records nothing when the journey or a capture switch is off, and stops on uninstall', () => {
    capture = setup({ enabled: false });
    html('<button type="button">x</button>').querySelector('button')?.click();
    capture.record('click', 'manual');
    expect(capture.entries()).toHaveLength(0);
    capture.uninstall();
    capture = setup({ captureClicks: false, captureNavigation: false });
    document.querySelector('button')?.click();
    expect(capture.entries()).toHaveLength(0);
    capture.uninstall();
    capture = setup({ captureNavigation: false });
    capture.uninstall();
    document.querySelector('button')?.click();
    expect(capture.entries()).toHaveLength(0);
  });
});
