import { ChangeDetectorRef, Component, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { LoaderService } from '@lenne.tech/ng-base/shared';
import { Subscription } from 'rxjs';

@Component({
  selector: 'base-loading-bar',
  templateUrl: './loading-bar.component.html',
  styleUrls: ['./loading-bar.component.scss'],
})
export class LoadingBarComponent implements OnInit, OnDestroy {
  @Input() manuallyLoading = false;
  loading = false;
  subscription = new Subscription();

  constructor(
    private ngZone: NgZone,
    private changeDetectorRef: ChangeDetectorRef,
    private loaderService: LoaderService
  ) {}

  ngOnInit() {
    this.ngZone.runOutsideAngular(() => {
      this.subscription.add(
        this.loaderService.isLoading.subscribe((value) => {
          this.loading = value;
          this.changeDetectorRef.detectChanges();
        })
      );
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
