import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { Tooltip } from 'bootstrap';

interface Option {
  text: string;
  value: string | number;
}

@Component({
  selector: 'base-select',
  templateUrl: './select.component.html',
  styleUrls: ['./select.component.scss'],
})
export class SelectComponent implements OnInit, AfterViewInit {
  @ViewChild('select') select: ElementRef;
  @ViewChild('tooltip') toolTipElement: ElementRef;

  @Input() id: string;
  @Input() name: string;
  @Input() infoText: string;
  @Input() label?: string;
  @Input() placeholder?: string = '';
  @Input() objectPath = '';
  @Input() control: any;
  @Input() tabIndex?: number;
  @Input() required = false;
  @Input() multiple = false;
  @Input() search = false;
  @Input() options: Option[] = [];

  ngOnInit() {
    if (this.multiple) {
      this.select.nativeElement.setAttribute('multiple', true);
    }
  }

  ngAfterViewInit() {
    if (this.toolTipElement && this.infoText) {
      new Tooltip(this.toolTipElement.nativeElement);
    }
  }
}
