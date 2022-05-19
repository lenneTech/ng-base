import { Component, Input } from '@angular/core';

interface Option {
  text: string;
  value: string | number;
}

@Component({
  selector: 'base-select',
  templateUrl: './select.component.html',
  styleUrls: ['./select.component.scss'],
})
export class SelectComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() placeholder?: string = '';
  @Input() control: any;
  @Input() tabIndex?: number;
  @Input() required = false;
  @Input() multiple = false;
  @Input() search = false;
  @Input() options: Option[] = [];
}
