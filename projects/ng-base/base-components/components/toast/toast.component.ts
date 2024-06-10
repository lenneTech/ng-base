import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { animate, query, style, transition, trigger } from '@angular/animations';
import { Subscription } from 'rxjs';
import { Toast, ToastService, ToastType } from '@lenne.tech/ng-base/shared';
import { NgClass } from '@angular/common';

const toastAnimation = trigger('toastAnimation', [
  transition('* <=> *', [
    query(
      ':enter',
      [style({ transform: 'translateX({{ x }})' }), animate('200ms ease-in', style({ transform: 'translateX(0%)' }))],
      { optional: true }
    ),
    query(':leave', animate('200ms ease-in', style({ transform: 'translateX({{ x }})' })), { optional: true }),
  ]),
]);

@Component({
  selector: 'base-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
  animations: [toastAnimation],
  standalone: true,
  imports: [
    NgClass
  ]
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: Toast[] = [];
  ToastType = ToastType;
  subscriptions = new Subscription();
  @Input() position: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left' = 'bottom-right';

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
      case ToastType.SUCCESS:
        return 'Erfolgreich';
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
      case ToastType.SUCCESS:
        return 'Die Änderungen wurden erfolgreich gespeichert.';
    }
  }

  reload() {
    location.reload();
  }
}
