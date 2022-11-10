import { Injectable } from '@angular/core';
import Compressor from 'compressorjs';
import { CompressOptions } from '../interfaces/compress-options.interface';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class FileService {
  constructor(private authService: AuthService, private httpClient: HttpClient) {}

  /**
   * Compress file with options and return file
   */
  compress(file: File, options?: CompressOptions): Promise<File> {
    const config = {
      quality: 0.6,
      checkOrientation: false,
      ...options,
    };

    return new Promise((resolve, reject) => {
      new Compressor(file, {
        success(result: Blob | File) {
          // Check if result is blob for convert to file
          if (result instanceof Blob) {
            resolve(new File([result], (result as any).name));
          } else {
            resolve(result);
          }
        },
        error(err) {
          reject(err.message);
        },
        ...config,
      });
    });
  }

  /**
   * Upload file to server
   */
  async upload(url: string, path: string, file: File, compressOptions?: CompressOptions): Promise<{ id: string }> {
    return new Promise(async (resolve, reject) => {
      if (compressOptions) {
        file = await this.compress(file, compressOptions);
      }

      const data = new FormData();
      data.append('file', file);

      const httpOptions = {
        headers: new HttpHeaders({
          Authorization: 'Bearer ' + this.authService.token,
        }),
      };

      this.httpClient.post(url + path, data, httpOptions).subscribe(
        (result: any) => {
          resolve(result);
        },
        (err) => {
          reject(err);
        }
      );
    });
  }

  delete(url: string, path: string, id: string) {
    return new Promise(async (resolve, reject) => {
      const httpOptions = {
        headers: new HttpHeaders({
          Authorization: 'Bearer ' + this.authService.token,
        }),
      };

      this.httpClient.delete(url + path + id, httpOptions).subscribe(
        (result) => {
          resolve(result);
        },
        (err) => {
          reject(err);
        }
      );
    });
  }
}
