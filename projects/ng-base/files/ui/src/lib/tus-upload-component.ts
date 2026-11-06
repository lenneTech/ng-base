import { Component, computed, input, output, signal } from '@angular/core';
import { HlmButtonImports, HlmProgressImports } from '@lenne.tech/ng-base/ui';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFile, lucidePause, lucidePlay, lucideRefreshCw, lucideTrash2, lucideUpload, lucideX } from '@ng-icons/lucide';

import { formatLtDuration, formatLtFileSize, injectLtTusUpload, type LtUploadItem, type LtUploadOptions, type LtUploadStatus } from '@lenne.tech/ng-base/files';
import { injectLtFilesI18n } from './i18n';

let nextComponentId = 0;

/**
 * Upload UI (drop zone, file list with progress, pause/resume/cancel/retry), the counterpart of the Nuxt starter's
 * `TusFileUpload.vue`. Built on `injectLtTusUpload()` and the `/ui` helm components.
 *
 * Keyboard: the drop zone holds a real button that opens the file dialog; every row action is a labelled button.
 * Validation (`accept` for dropped files, `maxFileSize`, `maxFiles`, single file without `multiple`) rejects files with a
 * message (`role="alert"`); finished and failed uploads are announced in a polite live region. With `multiple` off a new
 * file replaces the previous one. Inputs are read when a file is added or started, so changing them takes effect for
 * the next file.
 *
 * @example <lt-tus-upload accept="image/*" [multiple]="true" (uploaded)="onUploaded($event)" />
 */
@Component({
  selector: 'lt-tus-upload',
  imports: [HlmButtonImports, HlmProgressImports, NgIcon],
  providers: [provideIcons({ lucideFile, lucidePause, lucidePlay, lucideRefreshCw, lucideTrash2, lucideUpload, lucideX })],
  templateUrl: './tus-upload-component.html',
  host: {
    class: 'block',
    '[attr.data-disabled]': 'disabled() || null',
  },
})
export class LtTusUploadComponent {
  /** `accept` attribute of the file input; dropped files are checked against it as well. */
  readonly accept = input<string>('');
  /** Start uploads right after selection (default `true`). */
  readonly autoStart = input(true);
  /** Disable the drop zone. */
  readonly disabled = input(false);
  /** TUS endpoint (default from `provideLtFiles()`). */
  readonly endpoint = input<string | undefined>(undefined);
  /** Maximum file size in bytes (`0` = unlimited); larger files are rejected with a message. */
  readonly maxFileSize = input(0);
  /** Maximum number of files (`0` = unlimited). */
  readonly maxFiles = input(0);
  /** Extra TUS metadata for every file. */
  readonly metadata = input<Record<string, string>>({});
  /** Allow several files. */
  readonly multiple = input(false);

  /** A file finished uploading (`fileId` from `X-File-Id`). */
  readonly uploaded = output<LtUploadItem>();
  /** A file failed. */
  readonly failed = output<LtUploadItem>();
  /** Files were selected or dropped (the ones that passed validation and were added to the queue). */
  readonly filesAdded = output<File[]>();

  protected readonly i18n = injectLtFilesI18n();
  protected readonly upload = injectLtTusUpload(this.uploadOptions());
  protected readonly hintId = `lt-tus-upload-${nextComponentId++}-hint`;
  protected readonly dragging = signal(false);
  protected readonly rejections = signal<string[]>([]);
  protected readonly announcement = signal('');
  protected readonly formatSize = formatLtFileSize;
  protected readonly hint = computed(() => {
    const max = this.maxFileSize();
    return max > 0 ? this.i18n.t('lt.files.maxFileSize', { max: formatLtFileSize(max) }) : '';
  });
  private dragDepth = 0;

  /** Status text of an item. */
  protected statusLabel(status: LtUploadStatus): string {
    const keys: Record<LtUploadStatus, string> = {
      completed: 'lt.files.completed',
      error: 'lt.files.failed',
      idle: 'lt.files.waiting',
      paused: 'lt.files.paused',
      uploading: 'lt.files.uploading',
    };
    return this.i18n.t(keys[status]);
  }

  /** Progress details of an uploading item (`42 % · 1.2 MB/s · noch 5s`). */
  protected progressLabel(item: LtUploadItem): string {
    const parts = [`${item.progress.percentage} %`];
    if (item.progress.speed > 0) {
      parts.push(`${formatLtFileSize(item.progress.speed)}/s`);
    }
    if (item.progress.remainingTime > 0) {
      parts.push(this.i18n.t('lt.files.remaining', { time: formatLtDuration(item.progress.remainingTime) }));
    }
    return parts.join(' · ');
  }

  /** Accessible label of a row action, naming the file. */
  protected actionLabel(key: string, item: LtUploadItem): string {
    return `${this.i18n.t(key)}: ${item.file.name}`;
  }

  /** Progress value clamped into the range the progress bar accepts. */
  protected progressValue(item: LtUploadItem): number {
    return Math.min(100, Math.max(0, item.progress.percentage || 0));
  }

  protected openFileDialog(input: HTMLInputElement): void {
    if (!this.disabled()) {
      input.click();
    }
  }

  protected onInputChange(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    // Reset, so selecting the same file again fires `change` again.
    input.value = '';
    void this.handleFiles(files, false);
  }

  protected onDragEnter(event: DragEvent): void {
    event.preventDefault();
    if (this.disabled()) {
      return;
    }
    this.dragDepth++;
    this.dragging.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.disabled() ? 'none' : 'copy';
    }
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    if (this.disabled()) {
      return;
    }
    void this.handleFiles(Array.from(event.dataTransfer?.files ?? []), true);
  }

  /** Validate and queue files; returns the accepted ones. */
  private async handleFiles(files: File[], dropped: boolean): Promise<File[]> {
    if (files.length === 0) {
      return [];
    }
    const messages: string[] = [];
    const multiple = this.multiple();
    const maxFiles = multiple ? this.maxFiles() : 1;
    const maxFileSize = this.maxFileSize();
    const existing = multiple ? this.upload.uploads().length : 0;
    const accepted: File[] = [];

    for (const file of files) {
      if (dropped && !matchesLtAccept(file, this.accept())) {
        messages.push(this.i18n.t('lt.files.invalidType', { name: file.name }));
      } else if (maxFileSize > 0 && file.size > maxFileSize) {
        messages.push(this.i18n.t('lt.files.tooLarge', { max: formatLtFileSize(maxFileSize), name: file.name }));
      } else if (maxFiles > 0 && existing + accepted.length >= maxFiles) {
        messages.push(this.i18n.t('lt.files.tooMany', { max: maxFiles, name: file.name }));
      } else {
        accepted.push(file);
      }
    }
    this.rejections.set(messages);
    if (accepted.length === 0) {
      return [];
    }
    if (!multiple) {
      this.upload.cancelAll();
    }
    this.filesAdded.emit(accepted);
    try {
      await this.upload.addFiles(accepted);
    } catch (error) {
      this.rejections.update((current) => [...current, error instanceof Error ? error.message : String(error)]);
      return [];
    }
    return accepted;
  }

  private uploadOptions(): LtUploadOptions {
    const options: LtUploadOptions = {
      onError: (item) => {
        this.announcement.set(`${item.file.name}: ${this.i18n.t('lt.files.failed')}`);
        this.failed.emit(item);
      },
      onSuccess: (item) => {
        this.announcement.set(`${item.file.name}: ${this.i18n.t('lt.files.completed')}`);
        this.uploaded.emit(item);
      },
    };
    // Getters over the inputs: the upload queue reads its options whenever a file is added or started.
    Object.defineProperties(options, {
      autoStart: { enumerable: true, get: () => this.autoStart() },
      endpoint: { enumerable: true, get: () => this.endpoint() || undefined },
      metadata: { enumerable: true, get: () => this.metadata() },
    });
    return options;
  }
}

/**
 * Whether `file` matches an `accept` attribute value (`image/*`, `application/pdf`, `.png`, comma separated). An empty
 * value and `*` / `*\/*` accept everything.
 */
export function matchesLtAccept(file: File, accept: string): boolean {
  const tokens = (accept || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some((token) => {
    if (token === '*' || token === '*/*') {
      return true;
    }
    if (token.startsWith('.')) {
      return name.endsWith(token);
    }
    if (token.endsWith('/*')) {
      return type.startsWith(token.slice(0, -1));
    }
    return type === token;
  });
}
