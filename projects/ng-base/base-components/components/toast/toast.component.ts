import { Component, OnDestroy, OnInit } from '@angular/core';
import { animate, query, style, transition, trigger } from '@angular/animations';
import { Subscription } from 'rxjs';
import { Toast, ToastService, ToastType } from '@lenne.tech/ng-base/shared';

const toastAnimation = trigger('toastAnimation', [
  transition('* <=> *', [
    query(
      ':enter',
      [style({ transform: 'translateX(100%)' }), animate('200ms ease-in', style({ transform: 'translateX(0%)' }))],
      { optional: true }
    ),
    query(':leave', animate('200ms ease-in', style({ transform: 'translateX(100%)' })), { optional: true }),
  ]),
]);

@Component({
  selector: 'base-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
  animations: [toastAnimation],
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  ToastType = ToastType;
  subscriptions = new Subscription();

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.subscriptions.add(
      this.toastService.toastsAsObservable.subscribe({
        next: (value) => {
          this.toasts = value;
        },
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  getDefaultTitle(toast: Toast): string {
    switch (toast.type) {
      case ToastType.ERROR:
        return 'Irgendetwas ist schiefgelaufen';
      case ToastType.INFO:
        return 'Info';
      case ToastType.WARNING:
        return 'Achtung';
    }
  }

  getDefaultDescription(toast: Toast): string {
    switch (toast.type) {
      case ToastType.ERROR:
        return 'Sollte das Problem länger bestehen bleiben, dann wenden Sie sich bitte\n' + '        an den Support.';
      case ToastType.INFO:
        return 'Info';
      case ToastType.WARNING:
        return 'Warning';
    }
  }

  reload() {
    location.reload();
  }
}
