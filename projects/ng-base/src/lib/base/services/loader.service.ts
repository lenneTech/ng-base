import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Loader service for loading indication
 */
@Injectable({
  providedIn: 'root',
})
export class LoaderService {
  isLoading = new BehaviorSubject<boolean>(false);
  private lastStartTime!: number;

  /**
   * Start loading manually
   */
  start() {
    if (!this.isLoading.value) {
      this.isLoading.next(true);
      this.lastStartTime = new Date().getTime();
    }
  }

  /**
   * Stop loading manually
   *
   * @param duration
   */
  stop(duration: number = 1800) {
    const diffMs = new Date().getTime() - this.lastStartTime;

    if (diffMs >= duration) {
      this.isLoading.next(false);
      return;
    }

    setTimeout(() => {
      this.isLoading.next(false);
    }, duration - diffMs);
  }

  /**
   * Get loader as observable
   */
  getAsObservable(): Observable<boolean> {
    return this.isLoading.asObservable();
  }

  /**
   * Load until observable done
   *
   * @param observable
   * @param duration
   */
  loadUntilObservable(observable: Observable<unknown>, duration: number = 1800): Observable<unknown> {
    return new Observable<unknown>((subscriber) => {
      const startFrom = new Date().getTime();
      this.isLoading.next(true);
      observable.subscribe({
        next: (value) => {
          const diffMs = new Date().getTime() - startFrom;
          if (diffMs >= duration) {
            subscriber.next(value);
            subscriber.complete();
            this.isLoading.next(false);
            return;
          }

          setTimeout(() => {
            subscriber.next(value);
            subscriber.complete();
            this.isLoading.next(false);
          }, duration - diffMs);
        },
        error: (error) => subscriber.error(error),
      });
    });
  }
}
