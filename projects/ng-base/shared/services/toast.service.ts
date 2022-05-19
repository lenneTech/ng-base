import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Toast } from '../interfaces/toast.interface';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private toastsObservables = new BehaviorSubject<Toast[]>([]);

  get toastsAsObservable() {
    return this.toastsObservables.asObservable();
  }

  /**
   * Show new toast
   *
   * @param toast
   * @param duration
   */
  show(toast: Toast, duration?: number) {
    const value = this.toastsObservables.value;
    value.push(toast);
    this.toastsObservables.next(value);

    if (duration) {
      setTimeout(() => {
        const currentToasts = this.toastsObservables.value;
        const foundIndex = currentToasts.findIndex((e) => e.id === toast.id);

        if (foundIndex > -1) {
          currentToasts.splice(foundIndex, 1);
          this.toastsObservables.next(currentToasts);
        }
      }, duration);
    }
  }
}
