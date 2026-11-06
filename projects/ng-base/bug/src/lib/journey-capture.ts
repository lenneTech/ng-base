import type { LtBugUserJourneyOptions, LtUserInteractionEvent, LtUserInteractionMetadata, LtUserInteractionType } from './bug-types';
import { LT_BUG_UI_ATTRIBUTE } from './constants';
import { isLtSensitiveKey, redactLtText, redactLtUrl, truncateLt } from './redact';
import { LtRingBuffer } from './ring-buffer';

const INTERACTIVE = 'a,button,input,label,select,summary,textarea,[role="button"],[role="checkbox"],[role="link"],[role="menuitem"],[role="option"],[role="switch"],[role="tab"]';
const DIALOG = '[role="dialog"],[role="alertdialog"],dialog[open]';
const SENSITIVE_AUTOCOMPLETE = /(^|\s)(cc-csc|cc-exp|cc-exp-month|cc-exp-year|cc-number|current-password|new-password|one-time-code)(\s|$)/i;
const SENSITIVE_NAME_PARTS = ['card', 'credit', 'cvc', 'cvv', 'iban', 'pin', 'secret', 'ssn', 'token'];
const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'OS', 'Shift']);
const ERROR_DEDUPE_MS = 1000;

/** The window members the journey capture listens on. */
export type LtJourneyCaptureWindow = Pick<Window, 'addEventListener' | 'location' | 'removeEventListener' | 'scrollY'> & {
  document?: Document;
  MutationObserver?: typeof MutationObserver;
};

/**
 * Whether a form field holds secrets: password fields, hidden fields, `autocomplete` `current-password` /
 * `new-password` / `one-time-code` / `cc-*`, and names or ids like tokens, secrets, PINs or card numbers. Values of such
 * fields are never recorded, not even with `captureInputValues`.
 */
export function isLtSensitiveField(element: Element | null | undefined): boolean {
  if (!element || typeof element.getAttribute !== 'function') {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !(element as HTMLElement).isContentEditable) {
    return false;
  }
  const type = (element.getAttribute('type') ?? '').toLowerCase();
  if (tag === 'input' && (type === 'password' || type === 'hidden')) {
    return true;
  }
  if (SENSITIVE_AUTOCOMPLETE.test(element.getAttribute('autocomplete') ?? '')) {
    return true;
  }
  return [element.getAttribute('name') ?? '', element.id ?? ''].some(
    (name) => !!name && (isLtSensitiveKey(name) || SENSITIVE_NAME_PARTS.some((part) => name.toLowerCase().includes(part))),
  );
}

/**
 * Records the user journey in a ring buffer: clicks, navigation, form submit/change, (optional) typing, hover and
 * scroll, keyboard shortcuts, errors and dialogs. Never recorded: typed text, values of sensitive fields (see
 * {@link isLtSensitiveField}), values at all without `captureInputValues`, and interactions inside the reporter's own UI
 * ({@link LT_BUG_UI_ATTRIBUTE}). URLs and texts are redacted.
 */
export class LtJourneyCapture {
  private readonly buffer: LtRingBuffer<LtUserInteractionEvent>;
  private readonly cleanups: (() => void)[] = [];
  private lastUrl: string | null = null;
  private lastError: { at: number; message: string } | null = null;
  private view: LtJourneyCaptureWindow | null = null;

  constructor(private readonly options: Required<LtBugUserJourneyOptions>) {
    this.buffer = new LtRingBuffer(options.maxEvents);
  }

  /** Whether the listeners are attached. */
  get installed(): boolean {
    return this.view !== null;
  }

  /**
   * Attach the listeners (idempotent). `listenToHistory` adds `popstate`/`hashchange` listeners for apps without the
   * Angular router; with a router call {@link recordNavigation} from its `NavigationEnd` events instead.
   */
  install(view: LtJourneyCaptureWindow, options: { listenToHistory: boolean }): void {
    if (this.view || !this.options.enabled) {
      return;
    }
    this.view = view;
    const o = this.options;
    const listen = (target: Pick<Window, 'addEventListener' | 'removeEventListener'>, type: string, handler: EventListener, capture = true) => {
      const listenerOptions: AddEventListenerOptions = { capture, passive: true };
      target.addEventListener(type, handler, listenerOptions);
      this.cleanups.push(() => target.removeEventListener(type, handler, listenerOptions));
    };

    if (o.captureClicks) {
      listen(view, 'click', (event) => {
        const element = this.eventElement(event, INTERACTIVE);
        if (element) {
          const description = describe(element);
          this.record('click', description.target, description);
        }
      });
    }
    if (o.captureNavigation) {
      this.recordNavigation(view.location?.href ?? '');
      if (options.listenToHistory) {
        const onHistory = () => this.recordNavigation(view.location?.href ?? '');
        listen(view, 'popstate', onHistory, false);
        listen(view, 'hashchange', onHistory, false);
      }
    }
    if (o.captureFormInteractions) {
      listen(view, 'submit', (event) => {
        const element = this.eventElement(event);
        if (element) {
          const description = describe(element);
          this.record('form_submit', description.target, description);
        }
      });
      listen(view, 'change', (event) => this.recordField('form_change', event));
    }
    if (o.captureInputChanges) {
      listen(
        view,
        'input',
        this.throttle((event: Event) => this.recordField('input_change', event)),
      );
    }
    if (o.captureHover) {
      listen(
        view,
        'mouseover',
        this.throttle((event: Event) => {
          const element = this.eventElement(event, INTERACTIVE);
          if (element) {
            const description = describe(element);
            this.record('hover', description.target, description);
          }
        }),
      );
    }
    if (o.captureScroll) {
      listen(
        view,
        'scroll',
        this.throttle(() => this.record('scroll', 'window', { scrollPosition: Math.round(view.scrollY || view.document?.documentElement?.scrollTop || 0) })),
        false,
      );
    }
    if (o.captureKeyboard) {
      listen(view, 'keydown', (event) => this.recordKey(event as KeyboardEvent), false);
    }
    if (o.captureErrors) {
      listen(
        view,
        'error',
        (event) => {
          const error = event as ErrorEvent;
          if (error.message || error.error) {
            this.recordError(error.error instanceof Error ? error.error.message : error.message, error.filename);
          }
        },
        false,
      );
      listen(view, 'unhandledrejection', (event) => this.recordError(reasonMessage((event as PromiseRejectionEvent).reason)), false);
    }
    if (o.captureModalEvents) {
      this.observeDialogs(view);
    }
  }

  /** Remove every listener and pending throttle timer. */
  uninstall(): void {
    while (this.cleanups.length) {
      this.cleanups.pop()?.();
    }
    this.view = null;
    this.lastUrl = null;
  }

  /** Record an interaction (also for custom events of the app); ignored while the journey is disabled. */
  record(type: LtUserInteractionType, target: string, metadata?: LtUserInteractionMetadata): void {
    if (!this.options.enabled) {
      return;
    }
    this.buffer.push({ metadata, target: truncateLt(redactLtText(target), 200), timestamp: new Date().toISOString(), type });
  }

  /** Record a navigation to `url` (skipped when it equals the last recorded URL). */
  recordNavigation(url: string): void {
    if (!this.options.captureNavigation || !url || url === this.lastUrl) {
      return;
    }
    const fromUrl = this.lastUrl;
    this.lastUrl = url;
    const toUrl = redactLtUrl(url);
    this.record('navigation', toUrl, { ...(fromUrl ? { fromUrl: redactLtUrl(fromUrl) } : {}), toUrl, url: toUrl });
  }

  /** Record an error (the same message within a second is recorded once). */
  recordError(message: string, source?: string): void {
    if (!this.options.captureErrors) {
      return;
    }
    const at = Date.now();
    if (this.lastError && this.lastError.message === message && at - this.lastError.at < ERROR_DEDUPE_MS) {
      return;
    }
    this.lastError = { at, message };
    this.record('error', 'window', { errorMessage: truncateLt(redactLtText(message || 'Error'), 500), ...(source ? { url: redactLtUrl(source) } : {}) });
  }

  /** The newest `limit` events, oldest first. */
  entries(limit?: number): LtUserInteractionEvent[] {
    return this.buffer.toArray(limit);
  }

  /** Number of stored events. */
  get size(): number {
    return this.buffer.size;
  }

  /** Remove every event. */
  clear(): void {
    this.buffer.clear();
  }

  private recordField(type: 'form_change' | 'input_change', event: Event): void {
    const element = this.eventElement(event);
    if (!element || !['input', 'select', 'textarea'].includes(element.tagName.toLowerCase())) {
      return;
    }
    if (type === 'input_change' && element.tagName.toLowerCase() === 'select') {
      return;
    }
    const description = describe(element);
    let value: string | undefined;
    if (this.options.captureInputValues && !isLtSensitiveField(element)) {
      const raw = (element as HTMLInputElement).value;
      value = typeof raw === 'string' && raw ? truncateLt(redactLtText(raw.slice(0, 200)), 50) : undefined;
    }
    this.record(type, description.target, { ...description, ...(value ? { value } : {}) });
  }

  private recordKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey || event.altKey) || MODIFIER_KEYS.has(event.key)) {
      return;
    }
    // Option (macOS) and AltGr (Windows: Ctrl+Alt) produce typed characters ('@', '€', '{' …): never record those.
    if (event.altKey && event.key.length === 1) {
      return;
    }
    const target = event.target as Element | null;
    if (target && typeof target.closest === 'function') {
      if (target.closest(`[${LT_BUG_UI_ATTRIBUTE}]`)) {
        return;
      }
      const editable = isEditable(target);
      if (editable && (isLtSensitiveField(target) || event.altKey || !(event.ctrlKey || event.metaKey))) {
        return;
      }
    }
    this.record('keyboard', event.key, { altKey: event.altKey, ctrlKey: event.ctrlKey, key: event.key, metaKey: event.metaKey, shiftKey: event.shiftKey });
  }

  /** The element an event refers to (optionally the closest match of `selector`), `null` inside the reporter's UI. */
  private eventElement(event: Event, selector?: string): Element | null {
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== 'function' || target.closest(`[${LT_BUG_UI_ATTRIBUTE}]`)) {
      return null;
    }
    return (selector ? target.closest(selector) : null) ?? target;
  }

  private observeDialogs(view: LtJourneyCaptureWindow): void {
    const Observer = view.MutationObserver;
    const body = view.document?.body;
    if (!Observer || !body) {
      return;
    }
    const open = new Set<Element>();
    const dialogsIn = (node: Node): Element[] => {
      if (node.nodeType !== 1) {
        return [];
      }
      const element = node as Element;
      const found = element.matches(DIALOG) ? [element] : [];
      return [...found, ...Array.from(element.querySelectorAll(DIALOG))].filter((dialog) => !dialog.closest(`[${LT_BUG_UI_ATTRIBUTE}]`));
    };
    const observer = new Observer((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) =>
          dialogsIn(node).forEach((dialog) => {
            if (!open.has(dialog)) {
              open.add(dialog);
              this.record('modal_open', dialogLabel(dialog), { tag: dialog.tagName.toLowerCase() });
            }
          }),
        );
        mutation.removedNodes.forEach((node) =>
          dialogsIn(node).forEach((dialog) => {
            if (open.delete(dialog)) {
              this.record('modal_close', dialogLabel(dialog), { tag: dialog.tagName.toLowerCase() });
            }
          }),
        );
      }
    });
    observer.observe(body, { childList: true, subtree: true });
    this.cleanups.push(() => observer.disconnect());
  }

  /** Leading and trailing throttle of high-frequency events (`throttleRate`). */
  private throttle(handler: (event: Event) => void): EventListener {
    const delay = this.options.throttleRate;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: Event | null = null;
    this.cleanups.push(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    return (event: Event) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        handler(event);
        return;
      }
      pending = event;
      timer ??= setTimeout(
        () => {
          timer = null;
          last = Date.now();
          if (pending) {
            handler(pending);
            pending = null;
          }
        },
        delay - (now - last),
      );
    };
  }
}

function describe(element: Element): LtUserInteractionMetadata & { target: string } {
  const tag = element.tagName.toLowerCase();
  const id = element.id || undefined;
  const classes = element.classList?.length ? Array.from(element.classList).slice(0, 10) : undefined;
  const ownText = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const label = element.getAttribute('aria-label') ?? element.getAttribute('title') ?? '';
  const text = ownText || label ? redactLtText(ownText || label) : undefined;
  let target = tag;
  if (id) {
    target += `#${id}`;
  }
  if (classes?.length) {
    target += `.${classes.slice(0, 3).join('.')}`;
  }
  target = truncateLt(target, 120);
  return { classes, element: target, id, tag, target, text };
}

function dialogLabel(dialog: Element): string {
  const labelledBy = dialog.getAttribute('aria-labelledby');
  const labelled = labelledBy ? dialog.ownerDocument?.getElementById(labelledBy.split(/\s+/)[0] ?? '')?.textContent : null;
  const label = (dialog.getAttribute('aria-label') ?? labelled ?? dialog.querySelector('h1,h2,h3')?.textContent ?? dialog.tagName.toLowerCase()).replace(/\s+/g, ' ').trim();
  return truncateLt(redactLtText(label), 80);
}

function isEditable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!(element as HTMLElement).isContentEditable;
}

function reasonMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : String(reason);
}
