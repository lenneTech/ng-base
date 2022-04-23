import { Component, Input } from '@angular/core';

@Component({
  selector: 'base-textarea',
  templateUrl: './textarea.component.html',
  styleUrls: ['./textarea.component.scss'],
})
export class TextareaComponent {
  @Input() id: string;
  @Input() name: string;
  @Input() label?: string = '';
  @Input() placeholder?: string = '';
  @Input() control: any;
  @Input() rows = 5;
  @Input() required = false;
  @Input() tabIndex?: number;
}
