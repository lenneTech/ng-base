import { Component, Input } from '@angular/core';
import { SkeletonType } from '@lenne.tech/ng-base/shared';

@Component({
  selector: 'lt-skeleton-loader',
  templateUrl: './skeleton-loader.component.html',
  styleUrls: ['./skeleton-loader.component.scss'],
})
export class SkeletonLoaderComponent {
  @Input() type: SkeletonType = SkeletonType.LINE;
  @Input() count = 1;
  @Input() size: number;
  SkeletonType = SkeletonType;
}
