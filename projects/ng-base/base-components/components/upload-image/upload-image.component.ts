import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AuthService,
  CompressOptions,
  CroppingOptions,
  FileService,
  ToastService,
  ToastType,
} from '@lenne.tech/ng-base/shared';
import { ImageCroppedEvent } from 'ngx-image-cropper';

@Component({
  selector: 'base-upload-image',
  templateUrl: './upload-image.component.html',
  styleUrls: ['./upload-image.component.scss'],
})
export class UploadImageComponent implements OnInit {
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
  @Input() croppingImage = false;
  @Input() croppingOptions: CroppingOptions;
  @Input() objectPath: string;
  @Input() mode: 'file' | 'base64' = 'file';

  @Output() imageUploaded = new EventEmitter();
  @Output() imageDeleted = new EventEmitter();
  @Output() fileChanged = new EventEmitter<{ field: string; file: File | null; base64: string | null }>();

  dragActive = false;
  dragText = 'Drag & Drop';
  selectedFile: File;
  croppedFile: File;
  fileUrl: string;
  loading = false;
  croppedInProgress = false;
  fileEvent: any;
  cOptions: CroppingOptions;

  constructor(
    private httpClient: HttpClient,
    private authService: AuthService,
    private fileService: FileService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Set default options for cropping
    this.cOptions = {
      maintainAspectRatio: true,
      aspectRatio: 4 / 3,
      onlyScaleDown: false,
      imageQuality: 92,
      autoCrop: true,
      alignImage: 'center',
      format: 'jpeg',
      ...this.croppingOptions,
    };
  }

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
    if (!this.checkFile(event.dataTransfer.files[0])) {
      return;
    }

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
    const fileReader = new FileReader();
    fileReader.onload = (result) => {
      this.loading = true;
      this.fileUrl = fileReader.result as string;
      this.selectedFile = file;
      this.upload();
    };
    fileReader.readAsDataURL(file);
  }

  checkFile(file: File) {
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
      return false;
    } else {
      if (this.validExtensions.includes(file?.type)) {
        return true;
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
        return false;
      }
    }
  }

  /**
   * The function takes an event as an argument, and then sets the url of the file to the first file in the event's
   * target's files array
   *
   * @param event - any - The event that is triggered when the user selects a file.
   */
  selectFile(event: any) {
    if (!this.checkFile(event.target.files[0])) {
      return;
    }

    if (this.croppingImage) {
      this.croppedInProgress = true;
      this.fileEvent = event;
    } else {
      this.setUrl(event.target.files[0]);
    }
  }

  /**
   * We create a new FormData object, append the selected file to it, and then send it to the server
   */
  async upload() {
    // Prepare file data
    let file = this.selectedFile;
    if (this.compressOptions) {
      file = await this.fileService.compress(file, this.compressOptions);
    }
    const fileData = {
      field: this.objectPath ? this.objectPath + '.' + this.id : this.id,
      file,
      base64: await this.getBase64(file),
    };

    // Emit file data
    this.fileChanged.emit(fileData);

    // Set control value and upload directly if required
    if (this.uploadDirectly) {
      const result = await this.fileService.upload(this.url, this.uploadPath, this.selectedFile);
      if (result?.id) {
        this.control.setValue(result.id);
        this.imageUploaded.emit(result.id);
      }
    } else {
      this.control.setValue(this.mode === 'base64' ? fileData.base64 : this.selectedFile);
    }

    // Final processes
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
      this.fileChanged.emit({
        field: this.objectPath ? this.objectPath + '.' + this.id : this.id,
        file: null,
        base64: null,
      });
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

  /**
   * Convert a file into a BASE64 encoded string
   */
  protected getBase64(file): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!file) {
        return resolve(null);
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (!reader.result) {
          return reject(new Error('Conversion failed'));
        }
        resolve(reader.result.toString());
      };
      reader.onerror = (error) => {
        reject(error);
      };
    });
  }

  base64ToFile(base64: string, fileName: string, fileType: string): Promise<File> {
    return new Promise<File>((resolve, reject) => {
      fetch(base64)
        .then((res) => res.blob())
        .then(
          (blob) => {
            resolve(new File([blob], fileName, { type: fileType }));
          },
          (err) => {
            reject(err);
          }
        );
    });
  }

  async imageCropped($event: ImageCroppedEvent, fileEvent: any) {
    const file = fileEvent.target.files[0];
    this.croppedFile = await this.base64ToFile($event.base64, file.name, file.type);
  }

  finishedCropping() {
    this.fileEvent = null;
    this.setUrl(this.croppedFile);
    this.croppedInProgress = false;
    this.croppedFile = null;
  }

  loadImageFailed() {
    this.toastService.show(
      {
        id: 'image-invalid-cropped',
        type: ToastType.ERROR,
        title: 'Fehlgeschlagen',
        description:
          'Es ist ein Fehler aufgetreten. Bitte probieren Sie es später erneut oder wenden Sie sich an den Support.',
      },
      3500
    );
  }
}
