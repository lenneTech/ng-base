import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LT_RUNTIME_CONFIG, LT_RUNTIME_CONFIG_DEFAULTS, LtI18nService, mergeLtRuntimeConfig } from '@lenne.tech/ng-base';
import { LtAuthStateService } from '@lenne.tech/ng-base/auth/provide';

import { LT_TUS_CLIENT_LOADER, type LtTusClientUpload, type LtTusClientUploadOptions, type LtTusPreviousUpload, type LtUploadItem } from '@lenne.tech/ng-base/files';
import { LtTusUploadComponent, matchesLtAccept } from './tus-upload-component';

class FakeUpload implements LtTusClientUpload {
  static created: FakeUpload[] = [];
  url: null | string = null;
  started = 0;
  aborted = 0;

  constructor(
    readonly file: File,
    readonly options: LtTusClientUploadOptions,
  ) {
    FakeUpload.created.push(this);
  }

  abort(): Promise<void> {
    this.aborted++;
    return Promise.resolve();
  }

  findPreviousUploads(): Promise<LtTusPreviousUpload[]> {
    return Promise.resolve([]);
  }

  resumeFromPreviousUpload(): void {}

  start(): void {
    this.started++;
  }

  finish(fileId?: string): void {
    this.options.onAfterResponse?.(
      { getUnderlyingObject: () => null, setHeader: () => undefined },
      { getHeader: (name) => (name === 'X-File-Id' ? (fileId ?? null) : null), getStatus: () => 204 },
    );
    this.options.onSuccess?.();
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const file = (name = 'a.txt', size = 100, type = 'text/plain'): File => new File(['x'.repeat(size)], name, { type });

describe('LtTusUploadComponent', () => {
  let fixture: ComponentFixture<LtTusUploadComponent>;
  let host: HTMLElement;

  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        { provide: LT_RUNTIME_CONFIG, useValue: mergeLtRuntimeConfig(LT_RUNTIME_CONFIG_DEFAULTS, { apiProxy: false, apiUrl: 'https://api.test' }) },
        { provide: LT_TUS_CLIENT_LOADER, useValue: () => Promise.resolve({ Upload: FakeUpload }) },
        { provide: LtAuthStateService, useValue: { getAuthMode: () => 'cookie', getJwtToken: () => null } },
      ],
    });
    TestBed.inject(LtI18nService).setLocale('en');
    fixture = TestBed.createComponent(LtTusUploadComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    host = fixture.nativeElement as HTMLElement;
    await settle();
  }

  async function settle(): Promise<void> {
    await flush();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const fileInput = (): HTMLInputElement => host.querySelector('input[type=file]') as HTMLInputElement;
  const selectButton = (): HTMLButtonElement => host.querySelector('[data-slot=dropzone] button') as HTMLButtonElement;
  const rows = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>('[data-slot=file]'));
  const action = (row: HTMLElement, name: string): HTMLButtonElement | null => row.querySelector(`button[data-action=${name}]`);
  const rejections = (): string[] => Array.from(host.querySelectorAll('[data-slot=rejections] li')).map((li) => li.textContent?.trim() ?? '');

  async function select(...files: File[]): Promise<void> {
    const input = fileInput();
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
    await settle();
    await settle();
  }

  async function drop(...files: File[]): Promise<void> {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    host.querySelector('[data-slot=dropzone]')!.dispatchEvent(event);
    await settle();
    await settle();
  }

  beforeEach(() => {
    FakeUpload.created = [];
  });

  describe('drop zone', () => {
    it('offers a real, described button and a hidden file input', async () => {
      await render({ accept: 'image/*', maxFileSize: 1024 });
      const button = selectButton();
      expect(button.type).toBe('button');
      expect(button.textContent?.trim()).toBe('Select file');
      const hint = host.querySelector(`#${button.getAttribute('aria-describedby')}`);
      expect(hint?.textContent).toContain('Drop a file here or browse');
      expect(hint?.textContent).toContain('At most 1 KB per file');
      expect(fileInput().getAttribute('tabindex')).toBe('-1');
      expect(fileInput().getAttribute('aria-hidden')).toBe('true');
      expect(fileInput().accept).toBe('image/*');
      expect(fileInput().multiple).toBe(false);
    });

    it('uses the plural texts with multiple', async () => {
      await render({ multiple: true });
      expect(selectButton().textContent?.trim()).toBe('Select files');
      expect(fileInput().multiple).toBe(true);
    });

    it('opens the file dialog from the button', async () => {
      await render();
      const click = vi.spyOn(fileInput(), 'click').mockImplementation(() => undefined);
      selectButton().click();
      expect(click).toHaveBeenCalledTimes(1);
    });

    it('disables button and input and ignores drops while disabled', async () => {
      await render({ disabled: true });
      expect(selectButton().disabled).toBe(true);
      expect(fileInput().disabled).toBe(true);
      expect(host.getAttribute('data-disabled')).toBe('true');
      await drop(file());
      expect(rows()).toHaveLength(0);
    });

    it('shows the dragging state while files are dragged over it', async () => {
      await render();
      const zone = host.querySelector('[data-slot=dropzone]')!;
      zone.dispatchEvent(new Event('dragenter', { cancelable: true }));
      fixture.detectChanges();
      expect(zone.getAttribute('data-dragging')).toBe('true');
      zone.dispatchEvent(new Event('dragleave', { cancelable: true }));
      fixture.detectChanges();
      expect(zone.getAttribute('data-dragging')).toBeNull();
    });
  });

  describe('file list', () => {
    it('lists a selected file with size, status, progress bar and labelled actions', async () => {
      await render();
      const added = vi.fn();
      fixture.componentInstance.filesAdded.subscribe(added);

      await select(file('report.pdf', 2048, 'application/pdf'));

      expect(added).toHaveBeenCalledWith([expect.objectContaining({ name: 'report.pdf' })]);
      const [row] = rows();
      expect(row?.textContent).toContain('report.pdf');
      expect(row?.textContent).toContain('2 KB');
      expect(row?.querySelector('[data-slot=status]')?.textContent?.trim()).toBe('Uploading');
      const progressbar = row?.querySelector('[role=progressbar]');
      expect(progressbar?.getAttribute('aria-valuenow')).toBe('0');
      expect(progressbar?.getAttribute('aria-labelledby')).toBe(row?.querySelector('p')?.id);
      expect(action(row!, 'pause')?.getAttribute('aria-label')).toBe('Pause: report.pdf');
      expect(action(row!, 'cancel')?.getAttribute('aria-label')).toBe('Cancel: report.pdf');
    });

    it('shows progress details while uploading', async () => {
      await render();
      await select(file('a.txt', 1000));
      FakeUpload.created[0]!.options.onProgress?.(500, 1000);
      await settle();
      expect(rows()[0]?.querySelector('[data-slot=progress-label]')?.textContent).toContain('50 %');
      expect(rows()[0]?.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('50');
    });

    it('emits uploaded with the file id and announces it', async () => {
      await render();
      const uploaded = vi.fn<(item: LtUploadItem) => void>();
      fixture.componentInstance.uploaded.subscribe(uploaded);
      await select(file('a.txt'));

      FakeUpload.created[0]!.finish('6650a1b2c3d4e5f6a7b8c9d0');
      await settle();

      expect(uploaded).toHaveBeenCalledWith(expect.objectContaining({ fileId: '6650a1b2c3d4e5f6a7b8c9d0', status: 'completed' }));
      expect(host.querySelector('[aria-live=polite]')?.textContent).toBe('a.txt: Uploaded');
      const [row] = rows();
      expect(row?.querySelector('[data-slot=status]')?.textContent?.trim()).toBe('Uploaded');
      expect(row?.querySelector('[role=progressbar]')).toBeNull();
      expect(action(row!, 'remove')?.getAttribute('aria-label')).toBe('Remove: a.txt');

      action(row!, 'remove')!.click();
      await settle();
      expect(rows()).toHaveLength(0);
    });

    it('emits failed, announces it and retries from the retry button', async () => {
      await render();
      const failed = vi.fn();
      fixture.componentInstance.failed.subscribe(failed);
      await select(file('a.txt'));

      FakeUpload.created[0]!.options.onError?.(new Error('tus: boom'));
      await settle();

      expect(failed).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
      expect(host.querySelector('[aria-live=polite]')?.textContent).toBe('a.txt: Failed');
      action(rows()[0]!, 'retry')!.click();
      await settle();
      expect(rows()[0]?.getAttribute('data-status')).toBe('uploading');
      expect(FakeUpload.created[0]!.started).toBe(2);
    });

    it('pauses, resumes and cancels from the row buttons', async () => {
      await render();
      await select(file('a.txt'));

      action(rows()[0]!, 'pause')!.click();
      await settle();
      expect(rows()[0]?.getAttribute('data-status')).toBe('paused');
      expect(action(rows()[0]!, 'resume')?.getAttribute('aria-label')).toBe('Resume: a.txt');

      action(rows()[0]!, 'resume')!.click();
      await settle();
      expect(rows()[0]?.getAttribute('data-status')).toBe('uploading');

      action(rows()[0]!, 'cancel')!.click();
      await settle();
      expect(rows()).toHaveLength(0);
      expect(FakeUpload.created[0]!.aborted).toBe(2);
    });

    it('offers a start button without autoStart', async () => {
      await render({ autoStart: false });
      await select(file('a.txt'));
      expect(rows()[0]?.getAttribute('data-status')).toBe('idle');
      action(rows()[0]!, 'start')!.click();
      await settle();
      expect(rows()[0]?.getAttribute('data-status')).toBe('uploading');
    });

    it('passes endpoint and metadata inputs to the upload', async () => {
      await render({ endpoint: '/custom-tus', metadata: { folder: 'avatars' } });
      await select(file('a.txt'));
      expect(FakeUpload.created[0]!.options.endpoint).toBe('https://api.test/custom-tus');
      expect(FakeUpload.created[0]!.options.metadata).toMatchObject({ filename: 'a.txt', folder: 'avatars' });
    });
  });

  describe('validation', () => {
    it('rejects files over maxFileSize with a message', async () => {
      await render({ maxFileSize: 1024, multiple: true });
      await select(file('big.bin', 2048), file('small.txt', 10));
      expect(rejections()).toEqual(['big.bin is too large (at most 1 KB)']);
      expect(host.querySelector('[data-slot=rejections]')?.getAttribute('role')).toBe('alert');
      expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining('small.txt')]);
    });

    it('rejects files beyond maxFiles, counting the listed ones', async () => {
      await render({ maxFiles: 2, multiple: true });
      await select(file('1.txt'));
      await select(file('2.txt'), file('3.txt'));
      expect(rows()).toHaveLength(2);
      expect(rejections()).toEqual(['3.txt was not added: at most 2 files']);
    });

    it('replaces the file without multiple and takes only the first of several', async () => {
      await render();
      await select(file('first.txt'));
      await drop(file('second.txt'), file('third.txt'));
      expect(rows()).toHaveLength(1);
      expect(rows()[0]?.textContent).toContain('second.txt');
      expect(rejections()).toEqual(['third.txt was not added: at most 1 files']);
      expect(FakeUpload.created[0]!.aborted).toBe(1);
    });

    it('checks dropped files against accept', async () => {
      await render({ accept: 'image/*,.pdf', multiple: true });
      await drop(file('photo.png', 10, 'image/png'), file('notes.txt'), file('doc.PDF', 10, ''));
      expect(rows()).toHaveLength(2);
      expect(rejections()).toEqual(['notes.txt has a file type that is not allowed']);
    });

    it('shows the install hint when tus-js-client is missing', async () => {
      TestBed.overrideProvider(LT_TUS_CLIENT_LOADER, { useValue: () => Promise.reject(new Error('tus-js-client is not installed')) });
      await render();
      await select(file('a.txt'));
      expect(rejections()).toEqual(['tus-js-client is not installed']);
    });
  });
});

describe('matchesLtAccept', () => {
  const png = new File([''], 'Photo.PNG', { type: 'image/png' });

  it('accepts everything for an empty value or wildcards', () => {
    expect(matchesLtAccept(png, '')).toBe(true);
    expect(matchesLtAccept(png, '*')).toBe(true);
    expect(matchesLtAccept(png, '*/*')).toBe(true);
  });

  it('matches MIME types, MIME wildcards and extensions case-insensitively', () => {
    expect(matchesLtAccept(png, 'image/png')).toBe(true);
    expect(matchesLtAccept(png, 'image/*')).toBe(true);
    expect(matchesLtAccept(png, '.png')).toBe(true);
    expect(matchesLtAccept(png, 'application/pdf, .jpg')).toBe(false);
    expect(matchesLtAccept(png, 'video/*')).toBe(false);
  });
});
