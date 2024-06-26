import { Component, Input } from '@angular/core';
import { SkeletonType } from '@lenne.tech/ng-base/shared';
import { NgStyle } from '@angular/common';

@Component({
  selector: 'base-skeleton-loader',
  templateUrl: './skeleton-loader.component.html',
  styleUrls: ['./skeleton-loader.component.scss'],
  standalone: true,
  imports: [
    NgStyle
  ]
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

    return res;
  }
}
