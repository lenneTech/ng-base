import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Fullscreen service
 */
@Injectable({
  providedIn: 'root',
})
export class FullscreenService {
  private _isFullscreenActive: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  constructor() {
    this.listenToFullscreenEvent();
  }

  get fullscreenState(): boolean {
    return this._isFullscreenActive.value;
  }

  get fullscreenStateAsObservable(): Observable<boolean> {
    return this._isFullscreenActive.asObservable();
  }

  public toggleFullscreen() {
    const elem = document.documentElement;
    if (!this._isFullscreenActive.value) {
      elem.requestFullscreen();
      this._isFullscreenActive.next(true);
    } else {
      document.exitFullscreen();
      this._isFullscreenActive.next(false);
    }
  }

  /**
   * Event Listener for fullscreen toggle
   */
  private listenToFullscreenEvent() {
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        this._isFullscreenActive.next(true);
      } else {
        this._isFullscreenActive.next(false);
      }
    });
  }
}
