import { ErrorHandler } from '@angular/core';

import { LtErrorCapture, ltWrapErrorHandler, toLtBugErrorInfo } from './error-capture';

describe('error capture', () => {
  it('ltWrapErrorHandler lets the listener see the error first and delegates to the previous handler', () => {
    const calls: string[] = [];
    class AppErrorHandler extends ErrorHandler {
      override handleError(error: unknown): void {
        calls.push(`app:${(error as Error).message}`);
      }
    }
    const handler = new AppErrorHandler();
    const restore = ltWrapErrorHandler(handler, (error) => calls.push(`bug:${(error as Error).message}`));
    handler.handleError(new Error('x'));
    expect(calls).toEqual(['bug:x', 'app:x']);
    restore();
    handler.handleError(new Error('y'));
    expect(calls).toEqual(['bug:x', 'app:x', 'app:y']);
    expect(Object.prototype.hasOwnProperty.call(handler, 'handleError')).toBe(false);
  });

  it('a throwing listener never breaks the app error handler', () => {
    const handler = { handleError: vi.fn() } as unknown as ErrorHandler;
    ltWrapErrorHandler(handler, () => {
      throw new Error('listener');
    });
    expect(() => handler.handleError(new Error('app'))).not.toThrow();
  });

  it('reports each error once although ErrorHandler and window both see it', () => {
    const view = Object.assign(new EventTarget(), { location: { href: 'https://app.test/x?token=t' }, navigator: { userAgent: 'UA' } }) as unknown as Window;
    const handler = new ErrorHandler();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];
    const capture = new LtErrorCapture((info) => seen.push(info.message));
    capture.install(handler, view);
    const error = new Error('once');
    handler.handleError(error);
    view.dispatchEvent(Object.assign(new Event('error'), { error, message: 'once' }));
    view.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'rejected' }));
    expect(seen).toEqual(['once', 'rejected']);
    capture.uninstall();
    handler.handleError(new Error('after'));
    expect(seen).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it('toLtBugErrorInfo normalises and redacts errors', () => {
    const info = toLtBugErrorInfo(new Error('reset /x?token=abc failed'), 'ErrorHandler', {
      location: { href: 'https://app.test/?code=1' },
      navigator: { userAgent: 'UA' },
    } as Window);
    expect(info).toMatchObject({ componentName: 'ErrorHandler', message: 'reset /x?token=[redacted] failed', url: 'https://app.test/?code=[redacted]', userAgent: 'UA' });
    expect(info.stack).toContain('Error: reset /x?token=[redacted] failed');
    expect(toLtBugErrorInfo('plain', undefined).message).toBe('plain');
    expect(toLtBugErrorInfo({ message: 'like an error' }, undefined).message).toBe('like an error');
  });
});
