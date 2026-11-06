import { Component, computed, inject, signal } from '@angular/core';
import { LtFileService, type LtFileInfo, type LtUploadItem } from '@lenne.tech/ng-base/files';
import { LtTusUploadComponent } from '@lenne.tech/ng-base/files/ui';

interface UploadResult {
  fileId: string;
  filename: string;
  info: LtFileInfo | null;
  size: number;
}

/** `/app/upload`: TUS upload (`<lt-tus-upload>`), the stored file id (`X-File-Id`) and its URLs via `LtFileService`. */
@Component({
  imports: [LtTusUploadComponent],
  selector: 'app-upload-page',
  templateUrl: './upload-page.html',
})
export class UploadPage {
  protected readonly files = inject(LtFileService);

  protected readonly result = signal<UploadResult | null>(null);
  protected readonly downloadUrl = computed(() => {
    const result = this.result();
    return result ? this.files.getDownloadUrl(result.fileId, result.filename) : null;
  });
  protected readonly fileUrl = computed(() => {
    const result = this.result();
    return result ? this.files.getFileUrl(result.fileId) : null;
  });

  protected async onUploaded(item: LtUploadItem): Promise<void> {
    if (!item.fileId) {
      return;
    }
    const info = await this.files.getFileInfo(item.fileId);
    this.result.set({ fileId: item.fileId, filename: item.file.name, info: info && typeof info === 'object' ? info : null, size: item.file.size });
  }
}
