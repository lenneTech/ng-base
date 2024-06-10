import { Component, EventEmitter, Input } from '@angular/core';
import { NgClass, NgStyle } from '@angular/common';
import { RouterLink } from '@angular/router';

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
  standalone: true,
  imports: [
    NgClass,
    NgStyle,
    RouterLink
  ]
})
export class FabButtonComponent {
  @Input() fabIcon = 'bi-list';
  @Input() buttons: Button[];
  toggle = false;
}
