import { Component, Input } from '@angular/core';
import { SkeletonType } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'base-skeleton-loader',
  templateUrl: './skeleton-loader.component.html',
  styleUrls: ['./skeleton-loader.component.scss'],
})
export class SkeletonLoaderComponent {
  @Input() type!: SkeletonType;
  @Input() count = 1;
  @Input() size = 18;

  convertToArray(value): any {
    if (!value) {
      return [];
    }
    const res = [];

    for (let i = 0; i < value; i++) {
      res.push(i);
    }
    console.log(res);

    return res;
  }
}
