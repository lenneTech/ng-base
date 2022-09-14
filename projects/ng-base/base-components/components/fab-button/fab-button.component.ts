import { Component, EventEmitter, Input } from '@angular/core';

export interface Button {
  icon: string;
  color: string;
  routerLink?: string;
  event?: EventEmitter<boolean>;
  method?: string;
}

@Component({
  selector: 'base-fab-button',
  templateUrl: './fab-button.component.html',
  styleUrls: ['./fab-button.component.scss'],
})
export class FabButtonComponent {
  @Input() fabIcon = 'bi-three-dots';
  @Input() buttons: Button[];
  toggle = false;
}
