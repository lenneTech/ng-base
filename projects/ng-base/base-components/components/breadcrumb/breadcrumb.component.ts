import { Component } from '@angular/core';
import { Breadcrumb, BreadcrumbService } from '@lenne.tech/ng-base/shared';

import { Observable } from 'rxjs';

@Component({
  selector: 'base-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
})
export class BreadcrumbComponent {
  breadcrumbs$: Observable<Breadcrumb[]>;

  constructor(private readonly breadcrumbService: BreadcrumbService) {
    this.breadcrumbs$ = breadcrumbService.breadcrumbsObservable;
  }
}
