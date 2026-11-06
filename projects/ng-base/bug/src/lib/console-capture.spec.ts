import { LtConsoleCapture } from './console-capture';

type Target = Pick<Console, 'debug' | 'error' | 'info' | 'log' | 'warn'>;

function fakeConsole(): Target & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const record = (...args: unknown[]) => void calls.push(args);
  return { calls, debug: record, error: record, info: record, log: record, warn: record };
}

describe('LtConsoleCapture', () => {
  let target: ReturnType<typeof fakeConsole>;
  let capture: LtConsoleCapture;

  beforeEach(() => {
    target = fakeConsole();
    capture = new LtConsoleCapture(50, target);
    capture.install();
  });

  afterEach(() => capture.uninstall());

  it('captures log, warn and error calls with level, message and timestamp', () => {
    target.log('Test log message');
    target.warn('Test warning');
    target.error('Test error');
    const logs = capture.entries();
    expect(logs.map((log) => [log.level, log.message])).toEqual([
      ['log', ['Test log message']],
      ['warn', ['Test warning']],
      ['error', ['Test error']],
    ]);
    expect(new Date(logs[0]?.timestamp ?? '').getTime()).not.toBeNaN();
  });

  it('serialises several arguments like @lenne.tech/bug.lt', () => {
    target.log('Message', 123, { key: 'value' }, true);
    expect(capture.entries(1)[0]?.message).toEqual(['Message', '123', '{\n  "key": "value"\n}', 'true']);
  });

  it('keeps only the newest entries (ring buffer) and respects the limit', () => {
    const small = new LtConsoleCapture(3, fakeConsole());
    const console3 = fakeConsole();
    const capture3 = new LtConsoleCapture(3, console3);
    capture3.install();
    for (let i = 0; i < 10; i++) {
      console3.log(`Log ${i}`);
    }
    expect(capture3.entries().map((log) => log.message[0])).toEqual(['Log 7', 'Log 8', 'Log 9']);
    expect(capture3.entries(2)).toHaveLength(2);
    capture3.uninstall();
    expect(small.size).toBe(0);
  });

  it('keeps the original console working', () => {
    target.log('Test message');
    target.warn('Test warning');
    expect(target.calls).toEqual([['Test message'], ['Test warning']]);
  });

  it('records error objects with their stack trace', () => {
    target.error('Error occurred:', new Error('Test error'));
    const [log] = capture.entries(1);
    expect(log?.message).toEqual(['Error occurred:', 'Test error']);
    expect(log?.stack).toContain('Error: Test error');
  });

  it('drops %c placeholders with their CSS arguments, but keeps plain text that looks like CSS', () => {
    target.log('%cStyled%c text', 'color: red; font-weight: bold', 'background: blue', 'extra');
    target.log('Font color: red is set');
    expect(capture.entries().map((log) => log.message)).toEqual([['Styled text', 'extra'], ['Font color: red is set']]);
  });

  it('redacts secrets in logged text and objects', () => {
    target.log('reset link', 'https://app.test/reset?token=abc123');
    target.info({ email: 'a@b.de', password: 'hunter2' });
    const text = JSON.stringify(capture.entries());
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('hunter2');
    expect(text).toContain('[redacted]');
  });

  it('restores the original methods on uninstall', () => {
    const original = target.log;
    capture.uninstall();
    expect(target.log).not.toBe(original);
    const fresh = fakeConsole();
    const freshLog = fresh.log;
    const other = new LtConsoleCapture(5, fresh);
    other.install();
    expect(fresh.log).not.toBe(freshLog);
    other.uninstall();
    expect(fresh.log).toBe(freshLog);
  });

  it('records uncaught errors unless another listener already handled them', async () => {
    const view = new EventTarget() as unknown as Window;
    const viewCapture = new LtConsoleCapture(10, fakeConsole());
    viewCapture.install(view);
    // A later listener (like Angular's global error listeners) that handles and logs the error itself.
    view.addEventListener('error', (event) => (event as ErrorEvent).message === 'handled' && event.preventDefault());
    view.dispatchEvent(Object.assign(new Event('error', { cancelable: true }), { error: new Error('boom'), message: 'boom' }));
    view.dispatchEvent(Object.assign(new Event('error', { cancelable: true }), { error: new Error('handled'), message: 'handled' }));
    await Promise.resolve();
    expect(viewCapture.entries().map((log) => log.message[0])).toEqual(['boom']);
    viewCapture.uninstall();
  });
});
