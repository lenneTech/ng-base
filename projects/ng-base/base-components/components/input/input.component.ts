import { Component, EventEmitter, Input, Output } from '@angular/core';

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
  @Input() eyeButton = false;

  @Output() enter = new EventEmitter();

  /**
   * If the control has a value, emit the enter event
   */
  enterEvent() {
    if (this.control?.value) {
      this.enter.emit();
    }
  }

  /**
   * Switch input type
   */
  togglePasswordType() {
    if (this.type === 'password') {
      this.type = 'text';
    } else {
      this.type = 'password';
    }
  }
}
