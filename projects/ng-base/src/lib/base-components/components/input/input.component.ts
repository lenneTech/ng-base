import { Component, Input } from '@angular/core';

@Component({
  selector: 'base-input',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
})
export class InputComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: any;
  @Input() type = 'text';
  @Input() required = false;
}
