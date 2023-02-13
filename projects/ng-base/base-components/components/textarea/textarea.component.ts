import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { Tooltip } from 'bootstrap';

@Component({
  selector: 'base-textarea',
  templateUrl: './textarea.component.html',
  styleUrls: ['./textarea.component.scss'],
})
export class TextareaComponent implements AfterViewInit {
  @ViewChild('tooltip') toolTipElement: ElementRef;

  @Input() id: string;
  @Input() name: string;
  @Input() infoText: string;
  @Input() label?: string = '';
  @Input() placeholder?: string = '';
  @Input() control: any;
  @Input() rows = 5;
  @Input() required = false;
  @Input() tabIndex?: number;
  @Input() objectPath = '';

  ngAfterViewInit() {
    if (this.toolTipElement && this.infoText) {
      new Tooltip(this.toolTipElement.nativeElement);
    }
  }
}
