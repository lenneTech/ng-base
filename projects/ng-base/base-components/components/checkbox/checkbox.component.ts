import { Component, Input } from '@angular/core';

@Component({
  selector: 'base-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrls: ['./checkbox.component.scss'],
})
export class CheckboxComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string;
  @Input() value: string | number;
  @Input() control: any;
  @Input() required = false;
  @Input() objectPath = '';
}
