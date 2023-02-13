import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Tooltip } from 'bootstrap';

@Component({
  selector: 'base-input',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
})
export class InputComponent implements AfterViewInit {
  @ViewChild('tooltip') toolTipElement: ElementRef;

  @Input() id: string;
  @Input() name: string;
  @Input() infoText: string;
  @Input() label?: string;
  @Input() placeholder?: string = '';
  @Input() autocomplete?: string;
  @Input() tabIndex?: number;
  @Input() control: any;
  @Input() type = 'text';
  @Input() required = false;
  @Input() eyeButton = false;
  @Input() objectPath = '';

  @Output() enter = new EventEmitter();

  ngAfterViewInit() {
    if (this.toolTipElement && this.infoText) {
      new Tooltip(this.toolTipElement.nativeElement);
    }
  }

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
