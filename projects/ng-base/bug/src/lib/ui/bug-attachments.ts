import { Component, inject, input, output, signal } from '@angular/core';
import { LtI18nService } from '@lenne.tech/ng-base';
import { HlmBadgeImports, HlmButtonImports } from '@lenne.tech/ng-base/ui';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileText, lucidePaperclip, lucideUpload, lucideX } from '@ng-icons/lucide';

import type { LtBugAttachment } from '../bug-types';
import { formatLtBugFileSize } from '../report';

let nextId = 0;

/**
 * Attachments of a bug report (the counterpart of `AttachmentsList.vue`): drop zone with a file button, list with
 * thumbnail, name, size, screenshot badge and a labelled remove button. Files are read as data URLs; files above
 * `maxFileSize` MB or beyond `maxFiles` are rejected with a message (`role="alert"`).
 */
@Component({
  selector: 'lt-bug-attachments',
  imports: [HlmBadgeImports, HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideFileText, lucidePaperclip, lucideUpload, lucideX })],
  templateUrl: './bug-attachments.html',
  host: { class: 'flex flex-col gap-3' },
})
export class LtBugAttachments {
  /** `accept` of the file input (default as `@lenne.tech/bug.lt`). */
  readonly accept = input('image/*,.pdf,.doc,.docx,.txt,.log');
  readonly attachments = input.required<readonly LtBugAttachment[]>();
  readonly disabled = input(false);
  /** Maximum number of attachments including the screenshot (default 10, the server limit). */
  readonly maxFiles = input(10);
  /** Maximum file size in MB (default 10). */
  readonly maxFileSize = input(10);

  /** Files were read and accepted. */
  readonly added = output<LtBugAttachment[]>();
  /** The user removed an attachment (its id). */
  readonly removed = output<string>();

  protected readonly i18n = inject(LtI18nService);
  protected readonly hintId = `lt-bug-attachments-${nextId++}-hint`;
  protected readonly dragging = signal(false);
  protected readonly rejections = signal<string[]>([]);
  protected readonly formatSize = formatLtBugFileSize;
  private dragDepth = 0;

  protected openFileDialog(fileInput: HTMLInputElement): void {
    if (!this.disabled()) {
      fileInput.click();
    }
  }

  protected onInputChange(fileInput: HTMLInputElement): void {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    void this.addFiles(files);
  }

  protected onDragEnter(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.dragDepth++;
      this.dragging.set(true);
    }
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
    if (!this.disabled()) {
      void this.addFiles(Array.from(event.dataTransfer?.files ?? []));
    }
  }

  /** Read, validate and emit files; returns the accepted attachments. */
  async addFiles(files: File[]): Promise<LtBugAttachment[]> {
    if (!files.length) {
      return [];
    }
    const messages: string[] = [];
    const accepted: LtBugAttachment[] = [];
    const maxBytes = this.maxFileSize() * 1024 * 1024;
    let count = this.attachments().length;
    for (const file of files) {
      if (file.size > maxBytes) {
        messages.push(this.i18n.t('lt.bug.fileTooLarge', { max: this.maxFileSize(), name: file.name }));
        continue;
      }
      if (count >= this.maxFiles()) {
        messages.push(this.i18n.t('lt.bug.tooManyFiles', { max: this.maxFiles(), name: file.name }));
        continue;
      }
      try {
        const data = await readAsDataUrl(file);
        accepted.push({
          data,
          id: `attachment-${Date.now()}-${nextId++}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          ...(file.type.startsWith('image/') ? { preview: data } : {}),
        });
        count++;
      } catch {
        messages.push(this.i18n.t('lt.bug.fileReadFailed', { name: file.name }));
      }
    }
    this.rejections.set(messages);
    if (accepted.length) {
      this.added.emit(accepted);
    }
    return accepted;
  }

  protected removeLabel(attachment: LtBugAttachment): string {
    return this.i18n.t('lt.bug.removeAttachment', { name: attachment.name });
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unexpected FileReader result')));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.onabort = () => reject(new Error('FileReader aborted'));
    reader.readAsDataURL(file);
  });
}
