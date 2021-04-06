import { Observable } from 'rxjs';

/**
 * Interface for "can deactivate" handling of the corresponding guard
 */
export interface ICanComponentDeactivate {
  canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
}
