import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Loader service for loading indication
 */
@Injectable({
  providedIn: 'root',
})
export class LoaderService {
  public isLoading = new BehaviorSubject(false);

  public start(): void {
    this.isLoading.next(true);
  }

  public stop(): void {
    this.isLoading.next(false);
  }

  public getAsObservable(): Observable<boolean> {
    return this.isLoading.asObservable();
  }
}
