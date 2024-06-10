import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { NgClass } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

interface Option {
  text: string;
  value: string | number;
}

@Component({
  selector: 'base-select',
  templateUrl: './select.component.html',
  styleUrls: ['./select.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    ReactiveFormsModule,
  ]
})
export class SelectComponent implements OnInit {
  @ViewChild('select') select: ElementRef;

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
}
