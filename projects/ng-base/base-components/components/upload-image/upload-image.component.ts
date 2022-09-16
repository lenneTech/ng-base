import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService, CompressOptions, FileService, ToastService, ToastType } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-upload-image',
  templateUrl: './upload-image.component.html',
  styleUrls: ['./upload-image.component.scss'],
})
export class UploadImageComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() supportText = 'Supports: JPEG, JPG, PNG';
  @Input() required = false;
  @Input() defaultDragText = 'Drag & Drop';
  @Input() defaultReleaseText = 'Release to Upload';
  @Input() preButtonText = 'or';
  @Input() buttonText = 'browse';
  @Input() validExtensions = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  @Input() control: any;
  @Input() url = 'http://localhost:3000';
  @Input() uploadPath = '/files/upload';
  @Input() deletePath = '/files/';
  @Input() path = '/files/';
  @Input() compressOptions: CompressOptions;
  @Input() maxSize: number;
  @Input() uploadDirectly = false;

  @Output() imageUploaded = new EventEmitter();
  @Output() imageDeleted = new EventEmitter();
  @Output() fileChanged = new EventEmitter<{ field: string; file: File | null }>();

  dragActive = false;
  dragText = 'Drag & Drop';
  selectedFile: File;
  fileUrl: string;
  loading = false;

  constructor(
    private httpClient: HttpClient,
    private authService: AuthService,
    private fileService: FileService,
    private toastService: ToastService
  ) {}

  /**
   * The dragOver function is called when the user drags a file over the dropzone. It prevents the default action of the
   * event, and sets the dragText to 'Release to Upload' and the dragActive to true
   *
   * @param event - any - This is the event that is triggered when the user drags a file over the dropzone.
   */
  dragOver(event: any) {
    event.preventDefault();
    this.dragText = this.defaultReleaseText;
    this.dragActive = true;
  }

  /**
   * When the user drags a file over the drop zone, the dragActive variable is set to true, which will change the color of
   * the drop zone to green
   *
   * @param event - The event object that is passed to the dragLeave event.
   */
  dragLeave(event: any) {
    this.dragText = this.defaultDragText;
    this.dragActive = false;
  }

  /**
   * The function takes an event as a parameter, prevents the default action of the event, sets the URL of the image to the
   * file that was dragged and dropped, sets the text of the drag and drop area to the default text, and sets the
   * dragActive variable to false
   *
   * @param event - any - This is the event that is triggered when the user drags and drops a file.
   */
  drop(event: any) {
    event.preventDefault();
    this.setUrl(event.dataTransfer.files[0]);
    this.dragText = 'Drag & Drop';
    this.dragActive = false;
  }

  /**
   * It takes a file as an argument, checks if the file type is valid, and if it is, it creates a new FileReader object,
   * sets the onload function to set the fileUrl to the result of the fileReader, sets the selectedFile to the file, and
   * calls the upload function
   *
   * @param file - any - this is the file that is selected by the user.
   */
  setUrl(file: File) {
    if (this.maxSize && file.size > this.maxSize) {
      this.toastService.show(
        {
          id: 'image-invalid-size',
          type: ToastType.ERROR,
          title: 'Fehlgeschlagen',
          description:
            'Die Datei ist zu groß. Die Datei darf nicht größer als ' +
            (this.maxSize / (1024 * 1024)).toFixed(2) +
            'MB sein.',
        },
        3500
      );
      return;
    }

    if (this.validExtensions.includes(file.type)) {
      const fileReader = new FileReader();
      fileReader.onload = (result) => {
        this.loading = true;
        this.fileUrl = fileReader.result as string;
        this.selectedFile = file;
        this.upload();
      };
      fileReader.readAsDataURL(file);
    } else {
      this.toastService.show(
        {
          id: 'image-invalid-format',
          type: ToastType.ERROR,
          title: 'Fehlgeschlagen',
          description: 'Das Format der Datei wird nicht unterstützt.',
        },
        3500
      );
    }
  }

  /**
   * The function takes an event as an argument, and then sets the url of the file to the first file in the event's
   * target's files array
   *
   * @param event - any - The event that is triggered when the user selects a file.
   */
  selectFile(event: any) {
    this.setUrl(event.target.files[0]);
  }

  /**
   * We create a new FormData object, append the selected file to it, and then send it to the server
   */
  async upload() {
    let result;
    if (this.uploadDirectly) {
      result = await this.fileService.upload(this.url, this.uploadPath, this.selectedFile, this.compressOptions);
    } else {
      this.control.markAsTouched();
      this.fileChanged.emit({ field: this.id, file: this.selectedFile });
      this.loading = false;
      return;
    }

    if (result?.id) {
      this.control.setValue(result.id);
      this.imageUploaded.emit(result.id);
    }

    this.control.markAsTouched();
    this.loading = false;
  }

  /**
   * It deletes the file from the server and sets the selectedFile and fileUrl to null
   *
   * @param [id] - The id of the file to delete.
   */
  async deleteFile(id?: string) {
    if (!this.uploadDirectly) {
      this.selectedFile = null;
      this.fileUrl = null;
      this.control.setValue('');
      this.control.markAsTouched();
      this.fileChanged.emit({ field: this.id, file: null });
      return;
    }

    this.loading = true;
    this.selectedFile = null;
    this.fileUrl = null;

    if (id) {
      const result = await this.fileService.delete(this.url, this.deletePath, id);
      if (result) {
        this.selectedFile = null;
        this.fileUrl = null;
        this.control.setValue('');
        this.imageDeleted.emit();
        this.loading = false;
      }
    }
  }
}
