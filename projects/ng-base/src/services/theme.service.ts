import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StorageService } from '@lenne.tech/ng-base/shared';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  _theme = new BehaviorSubject<string>('light');

  get theme(): string {
    return this._theme.value;
  }

  set theme(theme: string) {
    this._theme.next(theme);
    this.storageService.save('theme', theme);
  }

  get themeObservable(): Observable<string> {
    return this._theme.asObservable();
  }

  constructor(private storageService: StorageService) {
    // Load from storage
    this.theme = this.storageService.load('theme') as string;

    // Use system theme if no theme is set
    if (!this.theme) {
      this.checkSystemTheme();
    }
  }

  /**
   * Check theme from system
   */
  checkSystemTheme() {
    if (window?.matchMedia) {
      this.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }
}
