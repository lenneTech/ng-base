import { Component, EventEmitter, Input, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';

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
  @Input() dragText = 'Drag & Drop';
  @Input() validExtensions = ['image/jpeg', 'image/jpg', 'image/png'];
  @Input() control: any;
  @Input() url = 'http://localhost:3000';
  @Input() uploadPath = '/files/upload';
  @Input() deletePath = '/files/';
  @Input() path = '/files/';

  @Output() imageUploaded = new EventEmitter();
  @Output() imageDeleted = new EventEmitter();

  dragActive = false;
  selectedFile: File;
  fileUrl: string;
  loading = false;

  constructor(private httpClient: HttpClient) {}

  /**
   * The dragOver function is called when the user drags a file over the dropzone. It prevents the default action of the
   * event, and sets the dragText to 'Release to Upload' and the dragActive to true
   *
   * @param event - any - This is the event that is triggered when the user drags a file over the dropzone.
   */
  dragOver(event: any) {
    event.preventDefault();
    this.dragText = 'Release to Upload';
    this.dragActive = true;
  }

  /**
   * When the user drags a file over the drop zone, the dragActive variable is set to true, which will change the color of
   * the drop zone to green
   *
   * @param event - The event object that is passed to the dragLeave event.
   */
  dragLeave(event: any) {
    this.dragText = 'Drag & Drop';
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
  setUrl(file: any) {
    if (this.validExtensions.includes(file.type)) {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        this.loading = true;
        this.fileUrl = fileReader.result as string;
        this.selectedFile = file;
        this.upload();
      };
      fileReader.readAsDataURL(file);
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
  upload() {
    const data = new FormData();
    data.append('file', this.selectedFile);
    this.httpClient.post(this.url + this.uploadPath, data).subscribe((result: any) => {
      if (result?.id) {
        this.control.setValue(result.id);
        this.imageUploaded.emit(result.id);
      }
      this.loading = false;
    });
  }

  /**
   * It deletes the file from the server and sets the selectedFile and fileUrl to null
   *
   * @param [id] - The id of the file to delete.
   */
  deleteFile(id?: string) {
    this.loading = true;
    this.selectedFile = null;
    this.fileUrl = null;

    if (id) {
      this.httpClient.delete(this.url + this.deletePath + id).subscribe((result) => {
        this.selectedFile = null;
        this.fileUrl = null;
        this.control.setValue('');
        this.imageDeleted.emit();
        this.loading = false;
      });
    }
  }
}
