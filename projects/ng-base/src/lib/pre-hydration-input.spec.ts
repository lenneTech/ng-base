import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { collectLtEditedFields, LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT, provideLtPreHydrationInput, restoreLtField } from './pre-hydration-input';

function serverRenderedForm(): { email: HTMLInputElement; password: HTMLInputElement; note: HTMLTextAreaElement } {
  document.body.innerHTML = '<form><input id="email" value=""><input id="password" type="password"><textarea id="note">preset</textarea></form>';
  return {
    email: document.getElementById('email') as HTMLInputElement,
    note: document.getElementById('note') as HTMLTextAreaElement,
    password: document.getElementById('password') as HTMLInputElement,
  };
}

describe('pre-hydration input preservation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('collects only fields the user changed', () => {
    const { email, note } = serverRenderedForm();
    email.value = 'ada@example.com';
    const edited = collectLtEditedFields(document);
    expect([...edited.entries()]).toEqual([[email, 'ada@example.com']]);
    expect(edited.has(note)).toBe(false);
  });

  it('restores a wiped value and dispatches a bubbling input event', () => {
    const { email } = serverRenderedForm();
    const events: string[] = [];
    document.body.addEventListener('input', (event) => events.push((event.target as HTMLInputElement).value));
    email.value = '';
    expect(restoreLtField(email, 'ada@example.com')).toBe(true);
    expect(email.value).toBe('ada@example.com');
    expect(events).toEqual(['ada@example.com']);
    expect(restoreLtField(email, 'ada@example.com')).toBe(false);
  });

  it('snapshots at startup and restores after the app is stable (the first binding wipes the value)', async () => {
    const { email, password } = serverRenderedForm();
    email.value = 'typed@example.com';
    password.value = 'secret';
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'browser' }, provideLtPreHydrationInput({ maxRestoreMs: 0 })] });
    TestBed.inject(ApplicationRef);
    // What hydration's first change detection does to a `[value]` binding:
    email.value = '';
    password.value = '';
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(email.value).toBe('typed@example.com');
    expect(password.value).toBe('secret');
  });

  it('does nothing on the server or when disabled', async () => {
    const { email } = serverRenderedForm();
    email.value = 'typed';
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }, provideLtPreHydrationInput()] });
    TestBed.inject(ApplicationRef);
    email.value = '';
    await new Promise((resolve) => setTimeout(resolve));
    expect(email.value).toBe('');
  });

  it('the submit guard blocks native submission of forms without action only', () => {
    // Run the inline script against a fake document, so no listener stays on the shared test document.
    let listener: ((event: Event) => void) | undefined;
    const fakeDocument = { addEventListener: (_type: string, handler: (event: Event) => void, capture: boolean) => ((listener = handler), expect(capture).toBe(true)) };
    // The guard ships as an inline script string; evaluating exactly that string is the point of this test.
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function('document', LT_PRE_HYDRATION_SUBMIT_GUARD_SCRIPT)(fakeDocument);
    const submit = (form: HTMLFormElement) => {
      const event = new Event('submit', { cancelable: true });
      Object.defineProperty(event, 'target', { value: form });
      listener?.(event);
      return event.defaultPrevented;
    };
    const withAction = document.createElement('form');
    withAction.setAttribute('action', '/search');
    expect(submit(document.createElement('form'))).toBe(true);
    expect(submit(withAction)).toBe(false);
  });
});
