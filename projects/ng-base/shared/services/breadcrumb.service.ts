import { Injectable } from '@angular/core';
import { BehaviorSubject, filter } from 'rxjs';
import { ActivatedRouteSnapshot, Data, NavigationEnd, Router } from '@angular/router';
import { Breadcrumb } from '../interfaces/breadcrumb.interface';

@Injectable({
  providedIn: 'root',
})
export class BreadcrumbService {
  private readonly _breadcrumbs = new BehaviorSubject<Breadcrumb[]>([]);

  set breadcrumbs(value: Breadcrumb[]) {
    this._breadcrumbs.next(value);
  }

  get breadcrumbsObservable() {
    return this._breadcrumbs.asObservable();
  }

  constructor(private router: Router) {
    this.subscribeToRouteChanges();
  }

  /**
   * Subscribe to route changes and add element to breadcrumb
   */
  subscribeToRouteChanges() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const root = this.router.routerState.snapshot.root;
      const breadcrumbs: Breadcrumb[] = [];
      this.addBreadcrumb(root, [], breadcrumbs);
      this.breadcrumbs = breadcrumbs;
    });
  }

  /**
   * Add element to breadcrumb
   *
   * @param route
   * @param parentUrl
   * @param breadcrumbs
   * @private
   */
  private addBreadcrumb(route: ActivatedRouteSnapshot, parentUrl: string[], breadcrumbs: Breadcrumb[]) {
    if (route) {
      const routeUrl = parentUrl.concat(route.url.map((url) => url.path));

      if (route.data?.breadcrumb) {
        const breadcrumb = {
          label: this.getLabel(route.data),
          url: '/' + routeUrl.join('/'),
        };
        breadcrumbs.push(breadcrumb);
      }

      this.addBreadcrumb(route.firstChild, routeUrl, breadcrumbs);
    }
  }

  /**
   * Get label for breadcrumb
   *
   * @param data
   * @private
   */
  private getLabel(data: Data) {
    return typeof data.breadcrumb === 'function' ? data.breadcrumb(data) : data.breadcrumb;
  }
}
